import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export class ApiComputeStack extends cdk.Stack {
    constructor(scope: cdk.App, id:string, props?: cdk.StackProps) {
        super(scope, id, props); 

        // Add Lambda function resources
        // (1) Ingest data
        const ingestDataFunction = new lambda.Function(
            this, 
            'IngestDataFunction', {
                runtime: lambda.Runtime.NODEJS_18_X, 
                handler: 'index.handler', 
                code: lambda.Code.fromAsset('../backend/lambda/ingestData'), 
            }
        );

        // (2) Retrieves data
        const retrieveDataFunction = new lambda.Function(
            this, 
            'retrieveDataFunction', {
                runtime: lambda.Runtime.NODEJS_18_X, 
                handler: 'index.handler', 
                code: lambda.Code.fromAsset('../backend/lambda/retrieveData'), 
            }
        );

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
            path: '/ingestData', 
            methods: [apigatewayv2.HttpMethod.ANY],  // Allow all HTTP methods (GET, POST, DELETE, ...)
            integration: new integrations.HttpLambdaIntegration(
                'ingestDataFunction', 
                ingestDataFunction, 
            ), 
        });

        httpApi.addRoutes({
            path: '/retrieveData', 
            methods: [apigatewayv2.HttpMethod.ANY],  // Allow all HTTP methods (GET, POST, DELETE, ...)
            integration: new integrations.HttpLambdaIntegration(
                'ingestDataFunction', 
                ingestDataFunction, 
            ), 
        });
    }
}

