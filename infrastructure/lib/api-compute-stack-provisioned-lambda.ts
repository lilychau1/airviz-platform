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
export class ApiComputeStackProvisionedLambda extends cdk.Stack {
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
        // Base function
        // const createDbSchemaBaseFunction = new lambdaNodejs.NodejsFunction(
        //     this, 
        //     'CreateDbSchemaProvisionedLambdaFunction', {
        //     runtime: lambda.Runtime.NODEJS_18_X,
        //     handler: 'index.handler',
        //     entry: '../backend/lambda/createDbSchemaProvisionedLambda/index.ts',
        //     timeout: cdk.Duration.minutes(5), 
        //     memorySize: 512, 
        //     bundling: {},
        //     environment: {
        //         DB_SECRET_ARN: props!.dbSecret.secretArn,
        //         DB_NAME: props!.databaseName, 
        //         BUCKET: props!.bucket.bucketName, 
        //         BOROUGH_COORDS_FILENAME: props!.boroughCoordsKey,
        //         TILE_COORDS_FILENAME: props!.tileCoordsKey,
        //     },
        //     insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
        //     }
        // );

        // // Version with provisioned concurrency
        // const createDbSchemaVersion = new lambda.Version(this, 'CreateDbSchemaVersion', {
        //     lambda: createDbSchemaBaseFunction,
        //     provisionedConcurrentExecutions: 1,
        // });

        // // Alias pointing to the version (use alias for integrations)
        // const CreateDbSchemaFunction = new lambda.Alias(this, 'CreateDbSchemaAlias', {
        //     aliasName: 'live',
        //     version: createDbSchemaVersion,
        // });

        // props!.dbSecret.grantRead(CreateDbSchemaFunction);
        // props!.bucket.grantRead(CreateDbSchemaFunction);

        // const googleAqApiKeySecret = new Secret(this, 'GoogleApiAqKeySecret', {
        //     secretStringValue: cdk.SecretValue.unsafePlainText(process.env.GOOGLE_AIR_QUALITY_API!),
        // });


        // // Aggregate regional metrics
        // const aggregateRegionalMetricsFunction = new lambdaNodejs.NodejsFunction(
        //     this, 
        //     'aggregateRegionalMetricsProvisionedLambdaFunction', {
        //         entry: '../backend/lambda/aggregateRegionalMetricsProvisionedLambda/index.ts',
        //         runtime: lambda.Runtime.NODEJS_18_X,
        //         handler: 'index.handler',
        //         timeout: cdk.Duration.minutes(10),
        //         memorySize: 512,
        //         bundling: {},
        //         layers: [aqiLayer, utilsLayer],
        //         environment: {
        //             DB_SECRET_ARN: props!.dbSecret.secretArn,
        //             DB_NAME: props!.databaseName
        //         },
        //         insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
        //     }
        // );
        // props!.dbSecret.grantRead(aggregateRegionalMetricsFunction);

        // Initialise API Gateway
        const httpApi = new apigatewayv2.HttpApi(
            this, 
            'HttpApi', {
                apiName: 'AirVizApiProvisionedLambda', 
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

        // // Ingest AQ data
        // const ingestAqDataFunction = new lambdaNodejs.NodejsFunction(
        //     this, 
        //     'ingestAqDataProvisionedLambdaFunction', {
        //         entry: '../backend/lambda/ingestAqDataProvisionedLambda/index.ts',
        //         handler: 'handler',
        //         runtime: lambda.Runtime.NODEJS_18_X,
        //         bundling: {},
        //         timeout: cdk.Duration.minutes(10),
        //         memorySize: 512,
        //         layers: [aqiLayer, utilsLayer],
        //         environment: {
        //             DB_SECRET_ARN: props!.dbSecret.secretArn,
        //             DB_NAME: props!.databaseName,
        //             GOOGLE_API_SECRET_ARN: googleAqApiKeySecret.secretArn,
        //             TILE_COORDS_BUCKET: props!.bucket.bucketName,
        //             TILE_COORDS_FILENAME: props!.tileCoordsKey,
        //             API_BASE_URL: httpApi.apiEndpoint,
        //         },
        //         insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
        //     }
        // );
        // props!.dbSecret.grantRead(ingestAqDataFunction);
        // googleAqApiKeySecret.grantRead(ingestAqDataFunction);
        
        // props!.bucket.grantRead(ingestAqDataFunction);

        // // Fetch all regions
        // const fetchAllRegionsBaseFunction = new lambdaNodejs.NodejsFunction(
        //     this, 
        //     'fetchAllRegionsFunction', {
        //         entry: '../backend/lambda/fetchAllRegions/index.ts',
        //         runtime: lambda.Runtime.NODEJS_18_X,
        //         handler: 'index.handler',
        //         timeout: cdk.Duration.minutes(10),
        //         memorySize: 512,
        //         bundling: {},
        //         layers: [aqiLayer, utilsLayer],
        //         environment: {
        //             DB_SECRET_ARN: props!.dbSecret.secretArn,
        //             DB_NAME: props!.databaseName
        //         },
        //         insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
        //     }
        // );

        // // Version with provisioned concurrency
        // const fetchAllRegionsVersion = new lambda.Version(this, 'fetchAllRegionsVersion', {
        //     lambda: fetchAllRegionsBaseFunction,
        //     provisionedConcurrentExecutions: 1,
        // });

        // // Alias pointing to the version (use alias for integrations)
        // const fetchAllRegionsFunction = new lambda.Alias(this, 'fetchAllRegionsAlias', {
        //     aliasName: 'live',
        //     version: fetchAllRegionsVersion,
        // });

        // props!.dbSecret.grantRead(fetchAllRegionsFunction);
        
        // props!.bucket.grantRead(fetchAllRegionsFunction);

        // // Fetch popup information
        // const fetchPopupInformationBaseFunction = new lambdaNodejs.NodejsFunction(
        //     this, 
        //     'fetchPopupInformationFunction', {
        //         entry: '../backend/lambda/fetchPopupInformation/index.ts',
        //         runtime: lambda.Runtime.NODEJS_18_X,
        //         handler: 'index.handler',
        //         timeout: cdk.Duration.minutes(10),
        //         memorySize: 512,
        //         layers: [aqiLayer, utilsLayer],
        //         environment: {
        //             DB_SECRET_ARN: props!.dbSecret.secretArn,
        //             DB_NAME: props!.databaseName
        //         },
        //         insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
        //     }
        // );
        // // Version with provisioned concurrency
        // const fetchPopupInformationVersion = new lambda.Version(this, 'fetchPopupInformationVersion', {
        //     lambda: fetchPopupInformationBaseFunction,
        //     provisionedConcurrentExecutions: 1,
        // });

        // // Alias pointing to the version (use alias for integrations)
        // const fetchPopupInformationFunction = new lambda.Alias(this, 'fetchPopupInformationAlias', {
        //     aliasName: 'live',
        //     version: fetchPopupInformationVersion,
        // });
        // props!.dbSecret.grantRead(fetchPopupInformationFunction);

        // // Fetch pollutant data
        // const fetchPollutantDataBaseFunction = new lambdaNodejs.NodejsFunction(
        //     this, 
        //     'fetchPollutantDataFunction', {
        //         entry: '../backend/lambda/fetchPollutantData/index.ts',
        //         runtime: lambda.Runtime.NODEJS_18_X,
        //         handler: 'index.handler',
        //         timeout: cdk.Duration.minutes(10),
        //         memorySize: 512,
        //         layers: [aqiLayer, utilsLayer],
        //         environment: {
        //             DB_SECRET_ARN: props!.dbSecret.secretArn,
        //             DB_NAME: props!.databaseName
        //         },
        //         insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
        //     }
        // );
        // // Version with provisioned concurrency
        // const fetchPollutantDataVersion = new lambda.Version(this, 'fetchPollutantDataVersion', {
        //     lambda: fetchPollutantDataBaseFunction,
        //     provisionedConcurrentExecutions: 1,
        // });

        // // Alias pointing to the version (use alias for integrations)
        // const fetchPollutantDataFunction = new lambda.Alias(this, 'fetchPollutantDataAlias', {
        //     aliasName: 'live',
        //     version: fetchPollutantDataVersion,
        // });
        // props!.dbSecret.grantRead(fetchPollutantDataFunction);

        // // Fetch AQI data
        // const fetchAqiDataBaseFunction = new lambdaNodejs.NodejsFunction(
        //     this, 
        //     'fetchAqiDataFunction', {
        //         entry: '../backend/lambda/fetchAqiData/index.ts',
        //         runtime: lambda.Runtime.NODEJS_18_X,
        //         handler: 'index.handler',
        //         timeout: cdk.Duration.minutes(10),
        //         memorySize: 512,
        //         layers: [aqiLayer, utilsLayer],
        //         environment: {
        //             DB_SECRET_ARN: props!.dbSecret.secretArn,
        //             DB_NAME: props!.databaseName
        //         },
        //         insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
        //     }
        // );
        // // Version with provisioned concurrency
        // const fetchAqiDataVersion = new lambda.Version(this, 'fetchAqiDataVersion', {
        //     lambda: fetchAqiDataBaseFunction,
        //     provisionedConcurrentExecutions: 1,
        // });

        // // Alias pointing to the version (use alias for integrations)
        // const fetchAqiDataFunction = new lambda.Alias(this, 'fetchAqiDataAlias', {
        //     aliasName: 'live',
        //     version: fetchAqiDataVersion,
        // });

        // props!.dbSecret.grantRead(fetchAqiDataFunction);

        // // Fetch Air Quality information
        // const fetchCurrentAirQualityInfoBaseFunction = new lambdaNodejs.NodejsFunction(
        //     this, 
        //     'fetchCurrentAirQualityInfoFunction', {
        //         entry: '../backend/lambda/fetchCurrentAirQualityInfo/index.ts',
        //         runtime: lambda.Runtime.NODEJS_18_X,
        //         handler: 'index.handler',
        //         timeout: cdk.Duration.minutes(10),
        //         memorySize: 512,
        //         layers: [aqiLayer, utilsLayer],
        //         environment: {
        //             DB_SECRET_ARN: props!.dbSecret.secretArn,
        //             DB_NAME: props!.databaseName
        //         },
        //         insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_98_0,
        //     }
        // );
        // // Version with provisioned concurrency
        // const fetchCurrentAirQualityInfoVersion = new lambda.Version(this, 'fetchCurrentAirQualityInfoVersion', {
        //     lambda: fetchCurrentAirQualityInfoBaseFunction,
        //     provisionedConcurrentExecutions: 1,
        // });

        // // Alias pointing to the version (use alias for integrations)
        // const fetchCurrentAirQualityInfoFunction = new lambda.Alias(this, 'fetchCurrentAirQualityInfoAlias', {
        //     aliasName: 'live',
        //     version: fetchCurrentAirQualityInfoVersion,
        // });

        // props!.dbSecret.grantRead(fetchCurrentAirQualityInfoFunction);

        // // Fetch Air Quality information
        // const fetchTileHealthRecommendationsBaseFunction = new lambdaNodejs.NodejsFunction(
        //     this, 
        //     'fetchTileHealthRecommendationsFunction', {
        //         entry: '../backend/lambda/fetchTileHealthRecommendations/index.ts',
        //         runtime: lambda.Runtime.NODEJS_18_X,
        //         handler: 'index.handler',
        //         timeout: cdk.Duration.minutes(10),
        //         memorySize: 512,
        //         layers: [aqiLayer, utilsLayer],
        //         environment: {
        //             DB_SECRET_ARN: props!.dbSecret.secretArn,
        //             DB_NAME: props!.databaseName
        //         },
        //     }
        // );
        // // Version with provisioned concurrency
        // const fetchTileHealthRecommendationsVersion = new lambda.Version(this, 'fetchTileHealthRecommendationsVersion', {
        //     lambda: fetchTileHealthRecommendationsBaseFunction,
        //     provisionedConcurrentExecutions: 1,
        // });

        // // Alias pointing to the version (use alias for integrations)
        // const fetchTileHealthRecommendationsFunction = new lambda.Alias(this, 'fetchTileHealthRecommendationsAlias', {
        //     aliasName: 'live',
        //     version: fetchTileHealthRecommendationsVersion,
        // });

        // props!.dbSecret.grantRead(fetchTileHealthRecommendationsFunction);

        // // Fetch Details
        // const fetchDetailsBaseFunction = new lambdaNodejs.NodejsFunction(
        //     this, 
        //     'fetchDetailsFunction', {
        //         entry: '../backend/lambda/fetchDetails/index.ts',
        //         runtime: lambda.Runtime.NODEJS_18_X,
        //         handler: 'index.handler',
        //         timeout: cdk.Duration.minutes(10),
        //         memorySize: 512,
        //         layers: [aqiLayer, utilsLayer],
        //         environment: {
        //             DB_SECRET_ARN: props!.dbSecret.secretArn,
        //             DB_NAME: props!.databaseName
        //         },
        //     }
        // );
        // // Version with provisioned concurrency
        // const fetchDetailsVersion = new lambda.Version(this, 'fetchDetailsVersion', {
        //     lambda: fetchDetailsBaseFunction,
        //     provisionedConcurrentExecutions: 1,
        // });

        // // Alias pointing to the version (use alias for integrations)
        // const fetchDetailsFunction = new lambda.Alias(this, 'fetchDetailsAlias', {
        //     aliasName: 'live',
        //     version: fetchDetailsVersion,
        // });

        // props!.dbSecret.grantRead(fetchDetailsFunction);
        
        // // API Gateway route for CreateDbSchema
        // httpApi.addRoutes({
        //     path: '/createDbSchema', 
        //     methods: [apigatewayv2.HttpMethod.POST], 
        //     integration: new integrations.HttpLambdaIntegration(
        //         'CreateDbSchemaFunction', 
        //         CreateDbSchemaFunction, 
        //     ), 
        // });

        // // API Gateway route for ingestAqData
        // httpApi.addRoutes({
        //     path: '/ingestAqData', 
        //     methods: [apigatewayv2.HttpMethod.POST], 
        //     integration: new integrations.HttpLambdaIntegration(
        //         'ingestAqDataFunction', 
        //         ingestAqDataFunction, 
        //     ), 
        // });

        // // API Gateway route for aggregateRegionalMetrics
        // httpApi.addRoutes({
        //     path: '/aggregateRegionalMetrics', 
        //     methods: [apigatewayv2.HttpMethod.POST], 
        //     integration: new integrations.HttpLambdaIntegration(
        //         'aggregateRegionalMetricsFunction', 
        //         aggregateRegionalMetricsFunction, 
        //     ), 
        // });


        // // API Gateway route for fetchAllRegions
        // httpApi.addRoutes({
        //     path: '/fetchAllRegions', 
        //     methods: [apigatewayv2.HttpMethod.POST], 
        //     integration: new integrations.HttpLambdaIntegration(
        //         'fetchAllRegionsFunction', 
        //         fetchAllRegionsFunction, 
        //     ), 
        // });

        // // API Gateway route for fetchPopupInformation
        // httpApi.addRoutes({
        //     path: '/fetchPopupInformation', 
        //     methods: [apigatewayv2.HttpMethod.POST], 
        //     integration: new integrations.HttpLambdaIntegration(
        //         'fetchPopupInformationFunction', 
        //         fetchPopupInformationFunction, 
        //     ), 
        // });

        // // API Gateway route for fetchPollutantData
        // httpApi.addRoutes({
        //     path: '/fetchPollutantData', 
        //     methods: [apigatewayv2.HttpMethod.POST], 
        //     integration: new integrations.HttpLambdaIntegration(
        //         'fetchPollutantDataFunction', 
        //         fetchPollutantDataFunction, 
        //     ), 
        // });

        // // API Gateway route for fetchAqiData
        // httpApi.addRoutes({
        //     path: '/fetchAqiData', 
        //     methods: [apigatewayv2.HttpMethod.POST], 
        //     integration: new integrations.HttpLambdaIntegration(
        //         'fetchAqiDataFunction', 
        //         fetchAqiDataFunction, 
        //     ), 
        // });

        // // API Gateway route for fetchCurrentAirQualityInfo
        // httpApi.addRoutes({
        //     path: '/fetchCurrentAirQualityInfo', 
        //     methods: [apigatewayv2.HttpMethod.POST], 
        //     integration: new integrations.HttpLambdaIntegration(
        //         'fetchCurrentAirQualityInfoFunction', 
        //         fetchCurrentAirQualityInfoFunction, 
        //     ), 
        // });

        // // API Gateway route for fetchTileHealthRecommendations
        // httpApi.addRoutes({
        //     path: '/fetchTileHealthRecommendations', 
        //     methods: [apigatewayv2.HttpMethod.POST], 
        //     integration: new integrations.HttpLambdaIntegration(
        //         'fetchTileHealthRecommendationsFunction', 
        //         fetchTileHealthRecommendationsFunction, 
        //     ), 
        // });

        // // API Gateway route for fetchDetails
        // httpApi.addRoutes({
        //     path: '/fetchDetails', 
        //     methods: [apigatewayv2.HttpMethod.POST], 
        //     integration: new integrations.HttpLambdaIntegration(
        //         'fetchDetailsFunction', 
        //         fetchDetailsFunction, 
        //     ), 
        // });

        // // Schedule hourly ingestion of AQ data by invoking the Lambda function directly
        // const lambdaInvokeRole = new iam.Role(this, 'LambdaInvokeRole', {
        //     assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
        // });

        // lambdaInvokeRole.addToPolicy(new iam.PolicyStatement({
        //     actions: ['lambda:InvokeFunction'],
        //     resources: [ingestAqDataFunction.functionArn],
        // }));

    //     new scheduler.CfnSchedule(this, 'IngestAqDataSchedule', {
    //         flexibleTimeWindow: { mode: 'OFF' },
    //         // Scheduled to run every hour at minute 1 (e.g.: 1:01, 2:01, etc)
    //         scheduleExpression: 'cron(1 * * * ? *)', 
    //         target: {
    //             arn: ingestAqDataFunction.functionArn,
    //             roleArn: lambdaInvokeRole.roleArn,
    //             input: JSON.stringify({}), // Empty JSON payload
    //         },
    //     });
    }
}

