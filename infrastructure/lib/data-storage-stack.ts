import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class DataStorageStack extends cdk.Stack {
    public readonly database: rds.DatabaseInstance;
    public readonly secret: secretsmanager.Secret;
    public readonly rdsVpc: ec2.Vpc;
    public readonly rdsSecurityGroup: ec2.ISecurityGroup;
    public readonly databaseName: string;
    public readonly airVizBucket: s3.Bucket;
    public readonly tileCoordsKey: string;
    public readonly boroughCoordsKey: string;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.rdsVpc = new ec2.Vpc(this, 'AirvizRdsVpc', {
            ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/24'),
            maxAzs: 2,
            subnetConfiguration: [
              {
                  name: 'AirvizPublicSubnet',
                  subnetType: ec2.SubnetType.PUBLIC,
                  cidrMask: 26,
                  mapPublicIpOnLaunch: true,
              },
          ],
          natGateways: 0, // No NAT gateway to keep costs low
        });

        // Secret for RDS credentials
        this.secret = new secretsmanager.Secret(this, 'AirvizRdsSecret', {
            generateSecretString: {
                secretStringTemplate: JSON.stringify({ username: 'airvizAdmin' }),
                generateStringKey: 'password',
                excludePunctuation: true,
            },
        });

        this.databaseName = 'airviz'

        // RDS PostgreSQL instance in the minimal VPC, publicly accessible in public subnets
        this.database = new rds.DatabaseInstance(this, 'AirvizRds', {
            engine: rds.DatabaseInstanceEngine.postgres({
                version: rds.PostgresEngineVersion.VER_17_5,
            }),
            credentials: rds.Credentials.fromSecret(this.secret),
            vpc: this.rdsVpc,
            vpcSubnets: {
                subnetType: ec2.SubnetType.PUBLIC,
            },
            publiclyAccessible: true,
            allocatedStorage: 10,
            maxAllocatedStorage: 20,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            deletionProtection: false,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
            backupRetention: cdk.Duration.days(0),
            multiAz: false,
            autoMinorVersionUpgrade: true,
            deleteAutomatedBackups: true,
            databaseName: this.databaseName, 
        });

        this.rdsSecurityGroup = this.database.connections.securityGroups[0];
        // Allow all public access to the database - ONLY FOR TESTING!
        this.rdsSecurityGroup.addIngressRule(
          ec2.Peer.anyIpv4(),
          ec2.Port.tcp(5432),
          'Allow all IPv4 to PostgreSQL'
        );

        // new cdk.CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
        new cdk.CfnOutput(this, 'DatabaseEndpoint', { value: this.database.dbInstanceEndpointAddress });
        new cdk.CfnOutput(this, 'DatabaseSecretArn', { value: this.secret.secretArn });
        
        
        this.airVizBucket = new s3.Bucket(this, 'airvizBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        const tileCoordsFilename = 'tile-coordinates.csv'
        const tileCoordsKeyPrefix = 'data/tile-coordinates/'

        this.tileCoordsKey = tileCoordsKeyPrefix + tileCoordsFilename
        
        new s3deploy.BucketDeployment(this, 'DeployTileCoordinatesCsv', {
            sources: [s3deploy.Source.asset(`../backend/data/tile-coordinates/`)], 
            destinationBucket: this.airVizBucket,
            destinationKeyPrefix: tileCoordsKeyPrefix, 
        });


        const boroughCoordsFilename = 'borough-coordinates.json'
        const boroughCoordsKeyPrefix = 'data/borough-coordinates/'

        this.boroughCoordsKey = boroughCoordsKeyPrefix + boroughCoordsFilename
        
        new s3deploy.BucketDeployment(this, 'DeployBoroughCoordinatesJson', {
            sources: [s3deploy.Source.asset(`../backend/data/borough-coordinates/`)], 
            destinationBucket: this.airVizBucket,
            destinationKeyPrefix: boroughCoordsKeyPrefix, 
        });
  }
}
