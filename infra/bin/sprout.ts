#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SproutStack } from '../lib/sprout-stack';

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Same Google OAuth client can serve both environments (add both redirect URIs to it).
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

new SproutStack(app, 'SproutDev', { env, envName: 'dev', googleClientId, googleClientSecret });
new SproutStack(app, 'SproutProd', { env, envName: 'prod', googleClientId, googleClientSecret });
