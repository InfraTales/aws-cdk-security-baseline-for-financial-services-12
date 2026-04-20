/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                              INFRATALES™
 *              Production-Ready AWS Infrastructure Solutions
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @project     aws-cdk-security-baseline-for-financial-services-12
 * @file        lib/tap-stack.ts
 * @author      Rahul Ladumor <rahul.ladumor@infratales.com>
 * @copyright   Copyright (c) 2024-2026 Rahul Ladumor / InfraTales
 * @license     InfraTales Open Source License (see LICENSE file)
 *
 * @website     https://infratales.com
 * @github      https://github.com/InfraTales
 * @portfolio   https://www.rahulladumor.in
 *
 * ───────────────────────────────────────────────────────────────────────────
 * This file is part of InfraTales open-source infrastructure projects.
 * Unauthorized removal of this header violates the license terms.
 *
 * SIGNATURE: INFRATALES-2DC8CD81344E
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as cdk from 'aws-cdk-lib';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';

import * as s3 from 'aws-cdk-lib/aws-s3';
import * as waf from 'aws-cdk-lib/aws-wafv2';
// import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export class TapStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get environment suffix from context or environment variable
    const environmentSuffix =
      this.node.tryGetContext('environmentSuffix') ||
      process.env.ENVIRONMENT_SUFFIX ||
      'dev';

    // Get region suffix for resource naming
    const regionSuffix = cdk.Stack.of(this)
      .region.toLowerCase()
      .replace(/-/g, '');

    // Create KMS key for encryption
    const encryptionKey = new kms.Key(this, 'FinancialDataKey', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      description: 'KMS key for financial data encryption',
      enableKeyRotation: true,
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            sid: 'EnableRootPermissions',
            principals: [new iam.AccountRootPrincipal()],
            actions: ['kms:*'],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'AllowServiceAccess',
            principals: [
              new iam.ServicePrincipal('s3.amazonaws.com'),
              new iam.ServicePrincipal('ec2.amazonaws.com'),
              new iam.ServicePrincipal('cloudtrail.amazonaws.com'),
            ],
            actions: [
              'kms:Decrypt',
              'kms:GenerateDataKey',
              'kms:ReEncrypt*',
              'kms:CreateGrant',
              'kms:DescribeKey',
            ],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'AllowCloudTrailS3Access',
            principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
            actions: [
              'kms:Decrypt',
              'kms:GenerateDataKey',
              'kms:DescribeKey',
              'kms:CreateGrant',
              'kms:ListGrants',
              'kms:RetireGrant',
            ],
            resources: ['*'],
            conditions: {
              StringEquals: {
                'kms:ViaService': 's3.amazonaws.com',
              },
            },
          }),
          new iam.PolicyStatement({
            sid: 'AllowCloudTrailAccess',
            principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
            actions: [
              'kms:Decrypt',
              'kms:GenerateDataKey',
              'kms:DescribeKey',
              'kms:CreateGrant',
            ],
            resources: ['*'],
          }),
          new iam.PolicyStatement({
            sid: 'AllowCloudWatchLogsAccess',
            principals: [new iam.ServicePrincipal('logs.amazonaws.com')],
            actions: [
              'kms:Decrypt',
              'kms:GenerateDataKey',
              'kms:DescribeKey',
              'kms:CreateGrant',
            ],
            resources: ['*'],
          }),
        ],
      }),
    });

    // Create VPC with security-focused configuration
    const vpc = new ec2.Vpc(this, 'SecureVPC', {
      vpcName: `tap-${environmentSuffix}-vpc-${regionSuffix}`,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 3,
      enableDnsSupport: true,
      enableDnsHostnames: true,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      flowLogs: {
        cloudWatchLogs: {
          destination: ec2.FlowLogDestination.toCloudWatchLogs(),
          trafficType: ec2.FlowLogTrafficType.ALL,
          logFormat: [
            ec2.LogFormat.SRC_ADDR,
            ec2.LogFormat.DST_ADDR,
            ec2.LogFormat.SRC_PORT,
            ec2.LogFormat.DST_PORT,
            ec2.LogFormat.PROTOCOL,
            ec2.LogFormat.PACKETS,
            ec2.LogFormat.BYTES,
            ec2.LogFormat.START_TIMESTAMP,
            ec2.LogFormat.END_TIMESTAMP,
            ec2.LogFormat.ACTION,
            ec2.LogFormat.LOG_STATUS,
          ],
        },
      },
    });

    // Create restricted security group for SSH access
    const sshSecurityGroup = new ec2.SecurityGroup(this, 'SSHSecurityGroup', {
      vpc,
      description: 'Security group for SSH access from approved IPs',
      allowAllOutbound: false,
    });

    // Add SSH access rules for approved CIDR blocks
    const approvedCidrs = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];
    approvedCidrs.forEach(cidr => {
      sshSecurityGroup.addIngressRule(
        ec2.Peer.ipv4(cidr),
        ec2.Port.tcp(22),
        `SSH access from approved CIDR ${cidr}`
      );
    });

    sshSecurityGroup.addEgressRule(
      ec2.Peer.ipv4('0.0.0.0/0'),
      ec2.Port.tcp(443),
      'HTTPS outbound'
    );

    // Create S3 buckets with security features
    const dataLogsBucket = new s3.Bucket(this, 'DataLogsBucket', {
      bucketName: `tap-${environmentSuffix}-data-logs-${cdk.Stack.of(this).account}-${regionSuffix}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      serverAccessLogsPrefix: 'access-logs/',
      enforceSSL: true,
      lifecycleRules: [
        {
          id: 'DataRetention',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.DEEP_ARCHIVE,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
        },
      ],
    });

    // Add bucket policy to allow CloudTrail to write logs
    dataLogsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
        actions: ['s3:GetBucketAcl', 's3:PutObject'],
        resources: [dataLogsBucket.bucketArn, `${dataLogsBucket.bucketArn}/*`],
      })
    );

    const applicationDataBucket = new s3.Bucket(this, 'ApplicationDataBucket', {
      bucketName: `tap-${environmentSuffix}-app-data-${cdk.Stack.of(this).account}-${regionSuffix}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      versioned: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // Add bucket policies to restrict access to approved CIDR blocks
    applicationDataBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.AccountRootPrincipal()],
        actions: ['s3:*'],
        resources: [
          applicationDataBucket.bucketArn,
          `${applicationDataBucket.bucketArn}/*`,
        ],
        conditions: {
          IpAddress: {
            'aws:SourceIp': approvedCidrs,
          },
        },
      })
    );

    // Create CloudTrail for API logging
    new cloudtrail.Trail(this, 'FinancialInstitutionTrail', {
      trailName: `tap-${environmentSuffix}-trail`,
      bucket: dataLogsBucket,
      s3KeyPrefix: 'cloudtrail-logs/',
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: true,
      enableFileValidation: true,
      encryptionKey,
      sendToCloudWatchLogs: false,
    });

    // Create IAM role for Lambda with minimal permissions
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Minimal IAM role for Lambda functions',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaVPCAccessExecutionRole'
        ),
      ],
      inlinePolicies: {
        MinimalS3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:GetObject', 's3:PutObject'],
              resources: [`${applicationDataBucket.bucketArn}/*`],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
              resources: [encryptionKey.keyArn],
            }),
          ],
        }),
      },
    });

    // Create Lambda function with security best practices
    new lambda.Function(this, 'SecureFunction', {
      functionName: `tap-${environmentSuffix}-secure-function`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      role: lambdaRole,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [sshSecurityGroup],
      environment: {
        BUCKET_NAME: applicationDataBucket.bucketName,
        KMS_KEY_ID: encryptionKey.keyId,
      },
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const s3 = new AWS.S3();
        
        exports.handler = async (event) => {
          console.log('Processing secure financial operation');
          
          try {
            // Example secure operation
            const params = {
              Bucket: process.env.BUCKET_NAME,
              Key: 'secure-data/transaction.json',
              Body: JSON.stringify({ 
                timestamp: Date.now(), 
                operation: 'secure-process',
                data: event 
              }),
              ServerSideEncryption: 'aws:kms',
              SSEKMSKeyId: process.env.KMS_KEY_ID
            };
            
            await s3.putObject(params).promise();
            
            return {
              statusCode: 200,
              body: JSON.stringify({ message: 'Operation completed securely' })
            };
          } catch (error) {
            console.error('Error:', error);
            return {
              statusCode: 500,
              body: JSON.stringify({ error: 'Internal server error' })
            };
          }
        };
      `),
      deadLetterQueueEnabled: true,
      reservedConcurrentExecutions: 10,
    });

    // Create CloudWatch alarms for security monitoring
    new cloudwatch.Alarm(this, 'UnauthorizedApiCallsAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/CloudTrail',
        metricName: 'ErrorCount',
        dimensionsMap: {
          EventName: 'ConsoleLogin',
        },
        statistic: 'Sum',
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alarm for detecting potential unauthorized API calls',
    });

    new cloudwatch.Alarm(this, 'SuspiciousActivityAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/CloudTrail',
        metricName: 'DataEvents',
        dimensionsMap: {
          EventName: 'GetObject',
        },
        statistic: 'Sum',
      }),
      threshold: 100,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'Alarm for detecting suspicious data access patterns',
    });

    // Create WAF Web ACL with managed rules
    const webAcl = new waf.CfnWebACL(this, 'FinancialWebAcl', {
      name: `tap-${environmentSuffix}-web-acl`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      description: 'WAF rules for financial institution applications',
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSetMetric',
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'KnownBadInputsMetric',
          },
        },
        {
          name: 'GeoRestrictionRule',
          priority: 3,
          action: { block: {} },
          statement: {
            geoMatchStatement: {
              countryCodes: ['CN', 'RU', 'KP', 'IR'], // Block high-risk countries
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'GeoRestrictionMetric',
          },
        },
        {
          name: 'IPRestrictionRule',
          priority: 4,
          action: { allow: {} },
          statement: {
            ipSetReferenceStatement: {
              arn: new waf.CfnIPSet(this, 'AllowedIPs', {
                name: `tap-${environmentSuffix}-allowed-ips`,
                scope: 'REGIONAL',
                ipAddressVersion: 'IPV4',
                addresses: approvedCidrs,
                description: 'Approved IP addresses for financial institution',
              }).attrArn,
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'IPRestrictionMetric',
          },
        },
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'FinancialWebAclMetric',
      },
    });

    // Output important resources
    new cdk.CfnOutput(this, 'VpcId', {
      value: vpc.vpcId,
      description: 'ID of the secure VPC',
      exportName: 'SecureVpcId',
    });

    new cdk.CfnOutput(this, 'EncryptionKeyId', {
      value: encryptionKey.keyId,
      description: 'ID of the KMS encryption key',
      exportName: 'EncryptionKeyId',
    });

    new cdk.CfnOutput(this, 'ApplicationDataBucketName', {
      value: applicationDataBucket.bucketName,
      description: 'Name of the application data bucket',
      exportName: 'ApplicationDataBucketName',
    });

    new cdk.CfnOutput(this, 'WebAclArn', {
      value: webAcl.attrArn,
      description: 'ARN of the WAF Web ACL',
      exportName: 'WebAclArn',
    });
  }
}
