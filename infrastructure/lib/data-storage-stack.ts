import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class DataStorageStack extends cdk.Stack {
    public readonly bucket: s3.Bucket;
    public readonly database: rds.DatabaseInstance;
    public readonly secret: secretsmanager.Secret;
    public readonly vpc: ec2.Vpc;
    public readonly rdsSecurityGroup: ec2.ISecurityGroup;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        this.vpc = new ec2.Vpc(this, 'AirvizRdsVpc', {
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

      // // S3 bucket fully public for test only
      // this.bucket = new s3.Bucket(this, 'AIrVizWebContentBucket', {
      //   removalPolicy: cdk.RemovalPolicy.DESTROY,
      //   autoDeleteObjects: true,
      //   versioned: false,
      //   publicReadAccess: true, // For test only
      //   websiteIndexDocument: 'index.html',
      //   blockPublicAccess: new s3.BlockPublicAccess({
      //     blockPublicPolicy: false,
      //     blockPublicAcls: false,
      //     ignorePublicAcls: false,
      //     restrictPublicBuckets: false,
      //   }),
      // });

      // Secret for RDS credentials
      this.secret = new secretsmanager.Secret(this, 'AirvizRdsSecret', {
          generateSecretString: {
              secretStringTemplate: JSON.stringify({ username: 'airvizAdmin' }),
              generateStringKey: 'password',
              excludePunctuation: true,
          },
      });

      // RDS PostgreSQL instance in the minimal VPC, publicly accessible in public subnets
      this.database = new rds.DatabaseInstance(this, 'AirvizRds', {
          engine: rds.DatabaseInstanceEngine.postgres({
              version: rds.PostgresEngineVersion.VER_17_5,
          }),
          credentials: rds.Credentials.fromSecret(this.secret),
          vpc: this.vpc,
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
      });

      this.rdsSecurityGroup = this.database.connections.securityGroups[0];

      // new cdk.CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
      new cdk.CfnOutput(this, 'DatabaseEndpoint', { value: this.database.dbInstanceEndpointAddress });
      new cdk.CfnOutput(this, 'DatabaseSecretArn', { value: this.secret.secretArn });

  }
}
