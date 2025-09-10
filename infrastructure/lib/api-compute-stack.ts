import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

interface ApiComputeStackProps extends cdk.StackProps {
    dbSecret: Secret;
    databaseName: string;
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
                },
            }
        );

        props!.dbSecret.grantRead(CreateDbSchemaFunction);
        
        // // (1) Ingest data
        // const ingestBatchDataFunction = new lambda.Function(
        //     this, 
        //     'ingestBatchDataFunction', {
        //         runtime: lambda.Runtime.NODEJS_18_X, 
        //         handler: 'index.handler', 
        //         code: lambda.Code.fromAsset('../backend/lambda/ingestBatchData'), 
        //     }
        // );

        // // (2) Retrieves data
        // const retrieveDataFunction = new lambda.Function(
        //     this, 
        //     'retrieveDataFunction', {
        //         runtime: lambda.Runtime.NODEJS_18_X, 
        //         handler: 'index.handler', 
        //         code: lambda.Code.fromAsset('../backend/lambda/retrieveData'), 
        //     }
        // );

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

        // Add API Gateway route for each lambda function
        httpApi.addRoutes({
            path: '/CreateDbSchema', 
            methods: [apigatewayv2.HttpMethod.POST],  // Allow all HTTP methods (GET, POST, DELETE, ...)
            integration: new integrations.HttpLambdaIntegration(
                'CreateDbSchemaFunction', 
                CreateDbSchemaFunction, 
            ), 
        });

        // httpApi.addRoutes({
        //     path: '/retrieveData', 
        //     methods: [apigatewayv2.HttpMethod.ANY],  // Allow all HTTP methods (GET, POST, DELETE, ...)
        //     integration: new integrations.HttpLambdaIntegration(
        //         'ingestDataFunction', 
        //         ingestBatchDataFunction, 
        //     ), 
        // });
    }
}

