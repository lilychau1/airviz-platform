import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as triggers from 'aws-cdk-lib/triggers';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as iam from 'aws-cdk-lib/aws-iam';

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

interface ApiComputeStackProps extends cdk.StackProps {
    dbSecret: Secret;
    databaseName: string;
    bucket: s3.IBucket;
    tileCoordsKey: string;
    boroughCoordsKey: string;
}
export class ApiComputeStack extends cdk.Stack {
    constructor(scope: cdk.App, id:string, props?: ApiComputeStackProps) {
        super(scope, id, props); 


        // Lambda Layers
        const aqiLayer = new lambda.LayerVersion(this, 'AqiLayer', {
            code: lambda.Code.fromAsset('../backend/lambda/layer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
            description: 'Shared AQI benchmarks and helper functions',
            layerVersionName: 'AqiBenchmarksLayer',
        });

        const utilsLayer = new lambda.LayerVersion(this, 'utilsLayer', {
            code: lambda.Code.fromAsset('../backend/lambda/layer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
            description: 'Shared utility functions',
            layerVersionName: 'UtilsLayer',
        });
         
        // Add Lambda function resources

        // (0) Create Database Schema on RDS
        const CreateDbSchemaFunction = new lambdaNodejs.NodejsFunction(
            this, 
            'CreateDbSchemaFunction', {
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                entry: '../backend/lambda/createDbSchema/index.ts',
                timeout: cdk.Duration.minutes(5), 
                memorySize: 512, 
                bundling: {},
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    // DB_ENDPOINT: props!.dbEndpoint,
                    DB_NAME: props!.databaseName, 
                    BUCKET: props!.bucket.bucketName, 
                    BOROUGH_COORDS_FILENAME: props!.boroughCoordsKey,
                    TILE_COORDS_FILENAME: props!.tileCoordsKey,
                },
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
            }
        );

        props!.dbSecret.grantRead(CreateDbSchemaFunction);
        props!.bucket.grantRead(CreateDbSchemaFunction);

        // // Create trigger to run the CreateDbSchemaFunction Lambda after stack deployment
        // new triggers.Trigger(this, 'DeployRunCreateDbSchemaTrigger', {
        //     handler: CreateDbSchemaFunction,
        //     timeout: cdk.Duration.minutes(10),
        //     invocationType: triggers.InvocationType.EVENT, 
        // });

        // Google API key secret
        const googleAqApiKeySecret = new Secret(this, 'GoogleApiAqKeySecret', {
            secretStringValue: cdk.SecretValue.unsafePlainText(process.env.GOOGLE_AIR_QUALITY_API!),
        });


        // Aggregate regional metrics
        const aggregateRegionalMetricsFunction = new lambdaNodejs.NodejsFunction(
            this, 
            'aggregateRegionalMetricsFunction', {
                entry: '../backend/lambda/aggregateRegionalMetrics/index.ts',
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                timeout: cdk.Duration.minutes(10),
                memorySize: 512,
                bundling: {},
                layers: [aqiLayer, utilsLayer],
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    DB_NAME: props!.databaseName
                },
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
            }
        );
        props!.dbSecret.grantRead(aggregateRegionalMetricsFunction);

        // Initialise API Gateway
        const httpApi = new apigatewayv2.HttpApi(
            this, 
            'HttpApi', {
                apiName: 'AirVizApi', 
                createDefaultStage: true, 
                corsPreflight: {
                    allowOrigins: ['*'], 
                    allowMethods: [
                        apigatewayv2.CorsHttpMethod.GET, 
                        apigatewayv2.CorsHttpMethod.POST, 
                        apigatewayv2.CorsHttpMethod.OPTIONS
                    ],
                    allowHeaders: ['Content-Type', 'Authorization'], 
                }, 
            }
        ); 

        // Ingest AQ data
        const ingestAqDataFunction = new lambdaNodejs.NodejsFunction(
            this, 
            'ingestAqDataFunction', {
                entry: '../backend/lambda/ingestAqData/index.ts',
                handler: 'handler',
                runtime: lambda.Runtime.NODEJS_18_X,
                bundling: {},
                timeout: cdk.Duration.minutes(10),
                memorySize: 512,
                layers: [aqiLayer, utilsLayer],
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    DB_NAME: props!.databaseName,
                    GOOGLE_API_SECRET_ARN: googleAqApiKeySecret.secretArn,
                    TILE_COORDS_BUCKET: props!.bucket.bucketName,
                    TILE_COORDS_FILENAME: props!.tileCoordsKey,
                    API_BASE_URL: httpApi.apiEndpoint,
                },
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
            }
        );
        props!.dbSecret.grantRead(ingestAqDataFunction);
        googleAqApiKeySecret.grantRead(ingestAqDataFunction);
        
        props!.bucket.grantRead(ingestAqDataFunction);

        // Fetch all regions
        const fetchAllRegionsFunction = new lambdaNodejs.NodejsFunction(
            this, 
            'fetchAllRegionsFunction', {
                entry: '../backend/lambda/fetchAllRegions/index.ts',
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                timeout: cdk.Duration.minutes(10),
                memorySize: 512,
                bundling: {},
                layers: [aqiLayer, utilsLayer],
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    DB_NAME: props!.databaseName
                },
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
            }
        );
        props!.dbSecret.grantRead(fetchAllRegionsFunction);
        
        props!.bucket.grantRead(fetchAllRegionsFunction);

        // Fetch popup information
        const fetchPopupInformationFunction = new lambdaNodejs.NodejsFunction(
            this, 
            'fetchPopupInformationFunction', {
                entry: '../backend/lambda/fetchPopupInformation/index.ts',
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                timeout: cdk.Duration.minutes(10),
                memorySize: 512,
                layers: [aqiLayer, utilsLayer],
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    DB_NAME: props!.databaseName
                },
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
            }
        );
        props!.dbSecret.grantRead(fetchPopupInformationFunction);

        // Fetch pollutant data
        const fetchPollutantDataFunction = new lambdaNodejs.NodejsFunction(
            this, 
            'fetchPollutantDataFunction', {
                entry: '../backend/lambda/fetchPollutantData/index.ts',
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                timeout: cdk.Duration.minutes(10),
                memorySize: 512,
                layers: [aqiLayer, utilsLayer],
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    DB_NAME: props!.databaseName
                },
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
            }
        );
        props!.dbSecret.grantRead(fetchPollutantDataFunction);

        // Fetch AQI data
        const fetchAqiDataFunction = new lambdaNodejs.NodejsFunction(
            this, 
            'fetchAqiDataFunction', {
                entry: '../backend/lambda/fetchAqiData/index.ts',
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                timeout: cdk.Duration.minutes(10),
                memorySize: 512,
                layers: [aqiLayer, utilsLayer],
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    DB_NAME: props!.databaseName
                },
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
            }
        );
        props!.dbSecret.grantRead(fetchAqiDataFunction);

        // Fetch Air Quality information
        const fetchCurrentAirQualityInfoFunction = new lambdaNodejs.NodejsFunction(
            this, 
            'fetchCurrentAirQualityInfoFunction', {
                entry: '../backend/lambda/fetchCurrentAirQualityInfo/index.ts',
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                timeout: cdk.Duration.minutes(10),
                memorySize: 512,
                layers: [aqiLayer, utilsLayer],
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    DB_NAME: props!.databaseName
                },
                insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
            }
        );
        props!.dbSecret.grantRead(fetchCurrentAirQualityInfoFunction);

        // Fetch Air Quality information
        const fetchTileHealthRecommendationsFunction = new lambdaNodejs.NodejsFunction(
            this, 
            'fetchTileHealthRecommendationsFunction', {
                entry: '../backend/lambda/fetchTileHealthRecommendations/index.ts',
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                timeout: cdk.Duration.minutes(10),
                memorySize: 512,
                layers: [aqiLayer, utilsLayer],
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    DB_NAME: props!.databaseName
                },
            }
        );
        props!.dbSecret.grantRead(fetchTileHealthRecommendationsFunction);

        // Fetch Details
        const fetchDetailsFunction = new lambdaNodejs.NodejsFunction(
            this, 
            'fetchDetailsFunction', {
                entry: '../backend/lambda/fetchDetails/index.ts',
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                timeout: cdk.Duration.minutes(10),
                memorySize: 512,
                layers: [aqiLayer, utilsLayer],
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    DB_NAME: props!.databaseName
                },
            }
        );
        props!.dbSecret.grantRead(fetchDetailsFunction);
        
        // API Gateway route for CreateDbSchema
        httpApi.addRoutes({
            path: '/createDbSchema', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'CreateDbSchemaFunction', 
                CreateDbSchemaFunction, 
            ), 
        });

        // API Gateway route for ingestAqData
        httpApi.addRoutes({
            path: '/ingestAqData', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'ingestAqDataFunction', 
                ingestAqDataFunction, 
            ), 
        });

        // API Gateway route for aggregateRegionalMetrics
        httpApi.addRoutes({
            path: '/aggregateRegionalMetrics', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'aggregateRegionalMetricsFunction', 
                aggregateRegionalMetricsFunction, 
            ), 
        });


        // API Gateway route for fetchAllRegions
        httpApi.addRoutes({
            path: '/fetchAllRegions', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'fetchAllRegionsFunction', 
                fetchAllRegionsFunction, 
            ), 
        });

        // API Gateway route for fetchPopupInformation
        httpApi.addRoutes({
            path: '/fetchPopupInformation', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'fetchPopupInformationFunction', 
                fetchPopupInformationFunction, 
            ), 
        });

        // API Gateway route for fetchPollutantData
        httpApi.addRoutes({
            path: '/fetchPollutantData', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'fetchPollutantDataFunction', 
                fetchPollutantDataFunction, 
            ), 
        });

        // API Gateway route for fetchAqiData
        httpApi.addRoutes({
            path: '/fetchAqiData', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'fetchAqiDataFunction', 
                fetchAqiDataFunction, 
            ), 
        });

        // API Gateway route for fetchCurrentAirQualityInfo
        httpApi.addRoutes({
            path: '/fetchCurrentAirQualityInfo', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'fetchCurrentAirQualityInfoFunction', 
                fetchCurrentAirQualityInfoFunction, 
            ), 
        });

        // API Gateway route for fetchTileHealthRecommendations
        httpApi.addRoutes({
            path: '/fetchTileHealthRecommendations', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'fetchTileHealthRecommendationsFunction', 
                fetchTileHealthRecommendationsFunction, 
            ), 
        });

        // API Gateway route for fetchDetails
        httpApi.addRoutes({
            path: '/fetchDetails', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'fetchDetailsFunction', 
                fetchDetailsFunction, 
            ), 
        });

        // Schedule hourly ingestion of AQ data by invoking the Lambda function directly
        const lambdaInvokeRole = new iam.Role(this, 'LambdaInvokeRole', {
            assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
        });

        lambdaInvokeRole.addToPolicy(new iam.PolicyStatement({
            actions: ['lambda:InvokeFunction'],
            resources: [ingestAqDataFunction.functionArn],
        }));

        new scheduler.CfnSchedule(this, 'IngestAqDataSchedule', {
            flexibleTimeWindow: { mode: 'OFF' },
            // Scheduled to run every hour at minute 1 (e.g.: 1:01, 2:01, etc)
            scheduleExpression: 'cron(1 * * * ? *)', 
            target: {
                arn: ingestAqDataFunction.functionArn,
                roleArn: lambdaInvokeRole.roleArn,
                input: JSON.stringify({}), // Empty JSON payload
            },
        });
    }
}

