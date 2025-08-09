import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Test placeholder, no data pushed yet
    const placeholderMetric = new cloudwatch.Metric({
      namespace: 'Airviz/testMetrics',
      metricName: 'NoDataYetMetric',
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });

    // Alarm on the metric that currently has no data
    new cloudwatch.Alarm(this, 'NoDataYetAlarm', {
      metric: placeholderMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alarm for metric that currently has no data',
    });
  }
}
