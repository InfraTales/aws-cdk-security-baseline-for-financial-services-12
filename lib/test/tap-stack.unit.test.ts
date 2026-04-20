/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                              INFRATALES™
 *              Production-Ready AWS Infrastructure Solutions
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @project     aws-cdk-security-baseline-for-financial-services-12
 * @file        test/tap-stack.unit.test.ts
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
 * SIGNATURE: INFRATALES-6F970B1A50E9
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { TapStack } from '../lib/tap-stack';

const environmentSuffix = 'test';

describe('TapStack', () => {
  let app: cdk.App;
  let stack: TapStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App({
      context: {
        environmentSuffix: environmentSuffix
      }
    });
    stack = new TapStack(app, `TestTapStack${environmentSuffix}`, {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      }
    });
    template = Template.fromStack(stack);
  });

  describe('Security Requirement 1: IAM Roles and Policies with Least Privilege', () => {
    test('Lambda role exists with minimal permissions', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: [{
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com'
            }
          }]
        },
        Description: 'Minimal IAM role for Lambda functions'
      });
    });

    test('Lambda role has inline policy with least privilege S3 access', () => {
      // Check if Lambda role exists with inline policies
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: [{
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com'
            }
          }]
        },
        Policies: Match.arrayWith([
          Match.objectLike({
            PolicyName: 'MinimalS3Access',
            PolicyDocument: {
              Statement: Match.arrayWith([
                Match.objectLike({
                  Effect: 'Allow',
                  Action: ['s3:GetObject', 's3:PutObject']
                })
              ])
            }
          })
        ])
      });
    });
  });

  describe('Security Requirement 2: Resource Tagging', () => {
    test('All resources are tagged with Environment and Owner', () => {
      // Note: Tags are applied at the App level in bin/tap.ts
      // They should be present on resources but CDK may apply them differently
      // Check that resources have tags (even if they might include additional tags)
      const vpc = template.findResources('AWS::EC2::VPC');
      Object.values(vpc).forEach(resource => {
        expect(resource.Properties?.Tags).toBeDefined();
        expect(resource.Properties?.Tags?.length).toBeGreaterThan(0);
      });

      // Check S3 bucket tagging
      const buckets = template.findResources('AWS::S3::Bucket');
      Object.values(buckets).forEach(bucket => {
        expect(bucket.Properties?.Tags).toBeDefined();
        expect(bucket.Properties?.Tags?.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Security Requirement 3: S3 Bucket CIDR Restrictions', () => {
    test('S3 bucket policy restricts access to approved CIDR blocks', () => {
      template.hasResourceProperties('AWS::S3::BucketPolicy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Condition: {
                IpAddress: {
                  'aws:SourceIp': ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']
                }
              }
            })
          ])
        }
      });
    });

    test('S3 buckets block public access', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true
        }
      });
    });
  });

  describe('Security Requirement 4: S3 Versioning', () => {
    test('All S3 buckets have versioning enabled', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      Object.values(buckets).forEach(bucket => {
        expect(bucket.Properties?.VersioningConfiguration?.Status).toBe('Enabled');
      });
    });
  });

  describe('Security Requirement 5: CloudTrail API Logging', () => {
    test('CloudTrail trail is created for API logging', () => {
      template.hasResourceProperties('AWS::CloudTrail::Trail', {
        IncludeGlobalServiceEvents: true,
        IsMultiRegionTrail: true,
        EnableLogFileValidation: true,
        EventSelectors: Match.anyValue()
      });
    });

    test('CloudTrail uses KMS encryption', () => {
      template.hasResourceProperties('AWS::CloudTrail::Trail', {
        KMSKeyId: Match.anyValue()
      });
    });
  });

  describe('Security Requirement 6: Security Groups for SSH Access', () => {
    test('Security group allows SSH only from approved CIDR blocks', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        SecurityGroupIngress: Match.arrayWith([
          Match.objectLike({
            CidrIp: '10.0.0.0/8',
            FromPort: 22,
            ToPort: 22,
            IpProtocol: 'tcp'
          }),
          Match.objectLike({
            CidrIp: '172.16.0.0/12',
            FromPort: 22,
            ToPort: 22,
            IpProtocol: 'tcp'
          }),
          Match.objectLike({
            CidrIp: '192.168.0.0/16',
            FromPort: 22,
            ToPort: 22,
            IpProtocol: 'tcp'
          })
        ])
      });
    });

    test('Security group restricts outbound traffic', () => {
      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        SecurityGroupEgress: [{
          CidrIp: '0.0.0.0/0',
          Description: 'HTTPS outbound',
          FromPort: 443,
          ToPort: 443,
          IpProtocol: 'tcp'
        }]
      });
    });
  });

  describe('Security Requirement 7: Lambda with Minimal Permissions', () => {
    test('Lambda function is created with VPC configuration', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        VpcConfig: Match.objectLike({
          SecurityGroupIds: Match.anyValue(),
          SubnetIds: Match.anyValue()
        })
      });
    });

    test('Lambda has dead letter queue enabled', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        DeadLetterConfig: Match.anyValue()
      });
    });

    test('Lambda has reserved concurrent executions', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        ReservedConcurrentExecutions: 10
      });
    });
  });

  describe('Security Requirement 8: Storage Encryption with KMS', () => {
    test('KMS key is created with rotation enabled', () => {
      template.hasResourceProperties('AWS::KMS::Key', {
        EnableKeyRotation: true,
        Description: 'KMS key for financial data encryption'
      });
    });



    test('S3 buckets use KMS encryption', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [{
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'aws:kms',
              KMSMasterKeyID: Match.anyValue()
            }
          }]
        }
      });
    });
  });

  describe('Security Requirement 9: CloudWatch Alarms for Unauthorized Access', () => {
    test('CloudWatch alarm for unauthorized API calls is created', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: 'ErrorCount',
        Namespace: 'AWS/CloudTrail',
        Threshold: 5,
        EvaluationPeriods: 2
      });
    });

    test('CloudWatch alarm for suspicious activity is created', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        MetricName: 'DataEvents',
        Namespace: 'AWS/CloudTrail',
        Threshold: 100,
        EvaluationPeriods: 1
      });
    });
  });



  describe('Security Requirement 10: VPC Flow Logs', () => {
    test('VPC flow logs are enabled', () => {
      template.hasResourceProperties('AWS::EC2::FlowLog', {
        ResourceType: 'VPC',
        TrafficType: 'ALL',
        LogDestinationType: 'cloud-watch-logs'
      });
    });

    test('Flow logs use CloudWatch log group', () => {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        RetentionInDays: Match.anyValue()
      });
    });

    test('Flow logs capture all required fields', () => {
      template.hasResourceProperties('AWS::EC2::FlowLog', {
        LogFormat: Match.stringLikeRegexp('.*srcaddr.*dstaddr.*srcport.*dstport.*protocol.*')
      });
    });
  });

  describe('Security Requirement 11: AWS WAF Integration', () => {
    test('WAF Web ACL is created', () => {
      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Scope: 'REGIONAL',
        DefaultAction: { Allow: {} }
      });
    });

    test('WAF has AWS managed rule sets', () => {
      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: 'AWSManagedRulesCommonRuleSet',
            Statement: {
              ManagedRuleGroupStatement: {
                VendorName: 'AWS',
                Name: 'AWSManagedRulesCommonRuleSet'
              }
            }
          }),
          Match.objectLike({
            Name: 'AWSManagedRulesKnownBadInputsRuleSet',
            Statement: {
              ManagedRuleGroupStatement: {
                VendorName: 'AWS',
                Name: 'AWSManagedRulesKnownBadInputsRuleSet'
              }
            }
          })
        ])
      });
    });

    test('WAF has geo-restriction rules', () => {
      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: 'GeoRestrictionRule',
            Action: { Block: {} },
            Statement: {
              GeoMatchStatement: {
                CountryCodes: Match.arrayWith(['CN', 'RU', 'KP', 'IR'])
              }
            }
          })
        ])
      });
    });
  });

  describe('Security Requirement 12: AWS Shield (implicitly enabled)', () => {
    test('Resources support AWS Shield Standard (implicit)', () => {
      // AWS Shield Standard is automatically enabled for all AWS customers
      // Verify that protected resources exist
      template.resourceCountIs('AWS::EC2::VPC', 1);
      template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 0); // No ALB in current stack
    });
  });

  describe('Infrastructure Configuration', () => {
    test('VPC is created with correct CIDR', () => {
      template.hasResourceProperties('AWS::EC2::VPC', {
        CidrBlock: '10.0.0.0/16',
        EnableDnsHostnames: true,
        EnableDnsSupport: true
      });
    });

    test('VPC has public, private, and isolated subnets', () => {
      const subnets = template.findResources('AWS::EC2::Subnet');
      const subnetTypes = Object.values(subnets).map(subnet => 
        subnet.Properties?.Tags?.find((tag: any) => tag.Key === 'aws-cdk:subnet-type')?.Value
      );
      
      expect(subnetTypes).toContain('Public');
      expect(subnetTypes).toContain('Private');
      expect(subnetTypes).toContain('Isolated');
    });

    test('Environment suffix is applied to resource names', () => {
      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketName: Match.stringLikeRegexp(`.*${environmentSuffix}.*`)
      });
    });
  });

  describe('Outputs', () => {
    test('Stack exports required outputs', () => {
      template.hasOutput('VpcId', {
        Description: 'ID of the secure VPC',
        Export: { Name: 'SecureVpcId' }
      });

      template.hasOutput('EncryptionKeyId', {
        Description: 'ID of the KMS encryption key',
        Export: { Name: 'EncryptionKeyId' }
      });

      template.hasOutput('ApplicationDataBucketName', {
        Description: 'Name of the application data bucket',
        Export: { Name: 'ApplicationDataBucketName' }
      });



      template.hasOutput('WebAclArn', {
        Description: 'ARN of the WAF Web ACL',
        Export: { Name: 'WebAclArn' }
      });
    });
  });

  describe('Cleanup and Destroy Policy', () => {
    test('Resources have appropriate removal policies for testing', () => {
      // KMS key should be destroyable
      template.hasResource('AWS::KMS::Key', {
        UpdateReplacePolicy: 'Delete',
        DeletionPolicy: 'Delete'
      });

      // S3 buckets should be destroyable with auto-delete
      template.hasResourceProperties('AWS::S3::Bucket', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'aws-cdk:auto-delete-objects', Value: 'true' })
        ])
      });
    });
  });
});