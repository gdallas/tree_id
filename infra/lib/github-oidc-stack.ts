import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface GithubOidcStackProps extends cdk.StackProps {
  githubOwner: string; // e.g. "gdallas"
  githubRepo: string;  // e.g. "tree_id"
}

/**
 * Creates the trust that lets GitHub Actions deploy into this AWS account
 * WITHOUT any stored AWS keys. GitHub presents a short-lived OIDC token;
 * AWS exchanges it for temporary credentials by assuming the role below,
 * but only for workflows running in your specific repo.
 */
export class GithubOidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const role = new iam.Role(this, 'GitHubDeployRole', {
      roleName: 'sprout-github-deploy',
      description: 'Assumed by GitHub Actions to deploy Sprout via CDK',
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
        StringLike: {
          // Any branch/workflow in THIS repo only.
          'token.actions.githubusercontent.com:sub': `repo:${props.githubOwner}/${props.githubRepo}:*`,
        },
      }),
    });

    // Broad for a personal learning project; scoped to this one account.
    // Can be tightened to just the CDK bootstrap roles later.
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

    new cdk.CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
