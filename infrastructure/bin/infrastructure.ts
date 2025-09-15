#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ApiComputeStack } from '../lib/api-compute-stack';
import { AuthStack } from '../lib/auth-stack';
import { DataStorageStack } from '../lib/data-storage-stack';
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const dataStorageStack = new DataStorageStack(app, 'DataStorageStack', { env });

new ApiComputeStack(app, 'ApiComputeStack', {
  env,
  dbSecret: dataStorageStack.secret,
  // dbEndpoint: dataStorageStack.database.dbInstanceEndpointAddress,
  databaseName: dataStorageStack.databaseName, 
  tileCoordsBucket: dataStorageStack.airVizBucket, 
  tileCoordsKey: dataStorageStack.tileCoordsKey, 
});


// new InfrastructureStack(app, 'InfrastructureStack', {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
// });