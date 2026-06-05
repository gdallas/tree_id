#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SproutStack } from '../lib/sprout-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { SproutCertStack } from '../lib/sprout-cert-stack';

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

// Custom-domain config for which-plant.com. The ACM cert MUST live in
// us-east-1 for CloudFront, so it gets its own stack with an explicit region.
const domainName = 'which-plant.com';
const wwwName = 'www.which-plant.com';
const hostedZoneId = 'Z06213093R8Q646BBFDCP';

const certStack = new SproutCertStack(app, 'SproutCert', {
  env: { account: '833090513890', region: 'us-east-1' }, // explicit; cert must be here
  crossRegionReferences: true,
  domainName,
  wwwName,
  hostedZoneId,
});

// SproutDev is the staging stack — no custom domain.
new SproutStack(app, 'SproutDev', {
  env,
  envName: 'dev',
  googleClientId,
  googleClientSecret,
});

// SproutProd serves which-plant.com over HTTPS (cert referenced cross-region).
new SproutStack(app, 'SproutProd', {
  env,
  envName: 'prod',
  googleClientId,
  googleClientSecret,
  crossRegionReferences: true,
  certificate: certStack.certificate,
  domainName,
  wwwName,
  hostedZoneId,
});
