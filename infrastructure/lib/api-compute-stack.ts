import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as triggers from 'aws-cdk-lib/triggers';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';

import * as dotenv from 'dotenv';
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

        // Add Lambda function resources
        // (0) Create Database Schema on RDS
        const CreateDbSchemaFunction = new lambda.Function(
            this, 
            'CreateDbSchemaFunction', {
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                code: lambda.Code.fromAsset('../backend/lambda/createDbSchema'),
                timeout: cdk.Duration.minutes(5), 
                memorySize: 512, 
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    // DB_ENDPOINT: props!.dbEndpoint,
                    DB_NAME: props!.databaseName, 
                    BUCKET: props!.bucket.bucketName, 
                    BOROUGH_COORDS_FILENAME: props!.boroughCoordsKey,
                    TILE_COORDS_FILENAME: props!.tileCoordsKey,
                },
            }
        );

        props!.dbSecret.grantRead(CreateDbSchemaFunction);
        props!.bucket.grantRead(CreateDbSchemaFunction);

        // Create trigger to run the CreateDbSchemaFunction Lambda after stack deployment
        new triggers.Trigger(this, 'DeployRunCreateDbSchemaTrigger', {
            handler: CreateDbSchemaFunction,
            timeout: cdk.Duration.minutes(10),
            invocationType: triggers.InvocationType.EVENT, 
        });

        // Google API key secret
        const googleAqApiKeySecret = new Secret(this, 'GoogleApiAqKeySecret', {
            secretStringValue: cdk.SecretValue.unsafePlainText(process.env.GOOGLE_AIR_QUALITY_API!),
        });

        const ingestAqDataFunction = new lambda.Function(
            this, 
            'ingestAqDataFunction', {
                code: lambda.Code.fromAsset('../backend/lambda/ingestAqData'), 
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                timeout: cdk.Duration.minutes(10),
                memorySize: 512,
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    DB_NAME: props!.databaseName,
                    GOOGLE_API_SECRET_ARN: googleAqApiKeySecret.secretArn,
                    TILE_COORDS_BUCKET: props!.bucket.bucketName,
                    TILE_COORDS_FILENAME: props!.tileCoordsKey,
                },
            }
        );
        props!.dbSecret.grantRead(ingestAqDataFunction);
        googleAqApiKeySecret.grantRead(ingestAqDataFunction);
        
        props!.bucket.grantRead(ingestAqDataFunction);

        // Aggregate regional metrics
        const aggregateRegionalMetricsFunction = new lambda.Function(
            this, 
            'aggregateRegionalMetricsFunction', {
                code: lambda.Code.fromAsset('../backend/lambda/aggregateRegionalMetrics'), 
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                timeout: cdk.Duration.minutes(10),
                memorySize: 512,
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    DB_NAME: props!.databaseName
                },
            }
        );
        props!.dbSecret.grantRead(aggregateRegionalMetricsFunction);

        // Fetch all regions
        const fetchAllRegionsFunction = new lambda.Function(
            this, 
            'fetchAllRegionsFunction', {
                code: lambda.Code.fromAsset('../backend/lambda/fetchAllRegions'), 
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                timeout: cdk.Duration.minutes(10),
                memorySize: 512,
                environment: {
                    DB_SECRET_ARN: props!.dbSecret.secretArn,
                    DB_NAME: props!.databaseName
                },
            }
        );
        props!.dbSecret.grantRead(fetchAllRegionsFunction);
        
        props!.bucket.grantRead(fetchAllRegionsFunction);

        // Add API Gateway
        const httpApi = new apigatewayv2.HttpApi(
            this, 
            'HttpApi', {
                apiName: 'AirVizApi', 
                createDefaultStage: true, 
                corsPreflight: {
                    allowOrigins: ['*'],   // or restrict to your frontend domain
                    allowMethods: [
                        apigatewayv2.CorsHttpMethod.GET, 
                        apigatewayv2.CorsHttpMethod.POST
                    ],
                }, 
            }
        ); 

        httpApi.addRoutes({
            path: '/createDbSchema', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'CreateDbSchemaFunction', 
                CreateDbSchemaFunction, 
            ), 
        });

        // ingestAqData
        httpApi.addRoutes({
            path: '/ingestAqData', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'ingestAqDataFunction', 
                ingestAqDataFunction, 
            ), 
        });

        // aggregateRegionalMetrics
        httpApi.addRoutes({
            path: '/aggregateRegionalMetrics', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'aggregateRegionalMetricsFunction', 
                aggregateRegionalMetricsFunction, 
            ), 
        });

        // fetchAllRegions
        httpApi.addRoutes({
            path: '/fetchAllRegions', 
            methods: [apigatewayv2.HttpMethod.POST], 
            integration: new integrations.HttpLambdaIntegration(
                'fetchAllRegionsFunction', 
                fetchAllRegionsFunction, 
            ), 
        });
    }
}

