#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                              INFRATALES™
 *              Production-Ready AWS Infrastructure Solutions
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @project     aws-cdk-security-baseline-for-financial-services-12
 * @file        bin/tap.ts
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
 * SIGNATURE: INFRATALES-999042554B93
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as cdk from 'aws-cdk-lib';
import 'source-map-support/register';
import { TapStack } from '../lib/tap-stack';

const app = new cdk.App();

const environmentSuffix =
  app.node.tryGetContext('environmentSuffix') ||
  process.env.ENVIRONMENT_SUFFIX ||
  'dev';

const region = process.env.AWS_REGION || 'us-east-1';
const regionSuffix = region.toLowerCase().replace(/-/g, '');

new TapStack(app, `TapStack${environmentSuffix}${regionSuffix}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: region,
  },
  description: 'Secure Financial Institution Infrastructure Stack',
});

// Apply default tags to all resources
cdk.Tags.of(app).add('Environment', environmentSuffix);
cdk.Tags.of(app).add('Owner', 'FinanceIT');
