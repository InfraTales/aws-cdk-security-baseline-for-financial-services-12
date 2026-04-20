/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                              INFRATALES™
 *              Production-Ready AWS Infrastructure Solutions
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @project     aws-cdk-security-baseline-for-financial-services-12
 * @file        test/tap-stack-env.unit.test.ts
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
 * SIGNATURE: INFRATALES-4ABFB4D4EB44
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { TapStack } from '../lib/tap-stack';

describe('TapStack - Environment Suffix Branch Coverage', () => {
  test('Stack uses environment suffix from context', () => {
    const app = new cdk.App({
      context: {
        environmentSuffix: 'fromcontext'
      }
    });
    
    const stack = new TapStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      }
    });
    
    const template = Template.fromStack(stack);
    
    // Verify environment suffix is used in resource names
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: `tap-fromcontext-data-logs-123456789012-useast1`
    });
  });

  test('Stack uses environment suffix from environment variable when context is not provided', () => {
    // Set environment variable
    const originalEnv = process.env.ENVIRONMENT_SUFFIX;
    process.env.ENVIRONMENT_SUFFIX = 'fromenv';
    
    const app = new cdk.App();
    
    const stack = new TapStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      }
    });
    
    const template = Template.fromStack(stack);
    
    // Verify environment suffix is used in resource names
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: `tap-fromenv-data-logs-123456789012-useast1`
    });
    
    // Restore original environment variable
    if (originalEnv !== undefined) {
      process.env.ENVIRONMENT_SUFFIX = originalEnv;
    } else {
      delete process.env.ENVIRONMENT_SUFFIX;
    }
  });

  test('Stack uses default dev suffix when neither context nor env var is provided', () => {
    // Clear environment variable
    const originalEnv = process.env.ENVIRONMENT_SUFFIX;
    delete process.env.ENVIRONMENT_SUFFIX;
    
    const app = new cdk.App();
    
    const stack = new TapStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      }
    });
    
    const template = Template.fromStack(stack);
    
    // Verify default environment suffix is used in resource names
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: `tap-dev-data-logs-123456789012-useast1`
    });
    
    // Restore original environment variable
    if (originalEnv !== undefined) {
      process.env.ENVIRONMENT_SUFFIX = originalEnv;
    }
  });

  test('Stack properly handles different AWS regions', () => {
    const app = new cdk.App({
      context: {
        environmentSuffix: 'regional'
      }
    });
    
    const stack = new TapStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'eu-west-1',
      }
    });
    
    const template = Template.fromStack(stack);
    
    // Verify region is used in resource names
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: `tap-regional-data-logs-123456789012-euwest1`
    });
  });
});