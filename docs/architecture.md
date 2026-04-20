# Architecture Notes

## Overview

The stack wires together a dense set of security controls using CDK TypeScript: a VPC with Flow Logs enabled, S3 buckets restricted to RFC-1918 CIDR ranges via bucket policies, CloudTrail with a KMS-encrypted S3 trail for account-wide API logging, RDS deployed in private subnets with public accessibility disabled, and Lambda with scoped-down IAM roles. KMS key rotation is enabled with a custom key policy granting least-privilege access to specific AWS service principals — S3, RDS, CloudTrail, and EC2. WAFv2 managed rule groups and CloudWatch metric alarms for unauthorized API calls layer on top, giving the team both preventive and detective controls in a single deployable unit.

## Key Decisions

- Shield Advanced costs a flat $3,000/month minimum — for most financial workloads below enterprise scale, Shield Standard plus WAF managed rules gives 80% of the protection at near-zero incremental cost [inferred]
- KMS RemovalPolicy.DESTROY on a financial encryption key means a cdk destroy wipes the key and permanently loses access to any data encrypted with it — this is a data destruction risk in production, not just a cleanup convenience [from-code]
- Hardcoding Environment='production' in bin/tap.ts while also accepting an environmentSuffix context variable creates a tag inconsistency — the resource tag says 'production' even when deploying to dev, breaking any cost allocation or compliance query that filters on the Environment tag [from-code]
- S3 CIDR restriction via bucket policy blocks access from Lambda functions running in public subnets or from services that don't egress through the private CIDR ranges — this silently denies access and is hard to debug without Flow Logs already working [inferred]
- Single-stack design puts all 12+ security constructs in one CloudFormation stack — at scale this will hit the 500-resource limit and deployments will time out or fail partial rollbacks with no clean recovery path [inferred]