#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SproutStack } from '../lib/sprout-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Google OAuth creds come from env vars (locally) or GitHub Secrets (in CI).
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

// One-time: lets GitHub Actions deploy. CHANGE these if your repo differs.
new GithubOidcStack(app, 'SproutCI', {
  env,
  githubOwner: 'gdallas',
  githubRepo: 'tree_id',
});

new SproutStack(app, 'SproutDev',  { env, envName: 'dev',  googleClientId, googleClientSecret });
new SproutStack(app, 'SproutProd', { env, envName: 'prod', googleClientId, googleClientSecret });
