import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito'; 

export class AuthStack extends cdk.Stack {
    public readonly userPool: cognito.UserPool; 
    public readonly userPoolClient: cognito.UserPoolClient;

    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props); 

        this.userPool = new cognito.UserPool(
            this, 
            'AirvizAdminUserPool', 
            {
                selfSignUpEnabled: true, 
                signInAliases: { email: true }, 
                autoVerify: { email: true }, 
            }
        );
    
        this.userPoolClient = new cognito.UserPoolClient(
            this, 
            'AirvizAdminUserPooClient', 
            {
                userPool: this.userPool, 
                generateSecret: false, 
            }
        );
    }

}
