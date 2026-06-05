import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { HttpApi, HttpMethod, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as path from 'path';

export interface SproutStackProps extends cdk.StackProps {
  envName: 'dev' | 'prod';
  googleClientId?: string;
  googleClientSecret?: string;
  // Optional custom-domain wiring. When all are provided, the CloudFront
  // distribution serves the domain over HTTPS and Route 53 alias records
  // are created. The certificate must live in us-east-1 (see SproutCertStack).
  certificate?: acm.ICertificate;
  domainName?: string;
  wwwName?: string;
  hostedZoneId?: string;
}

export class SproutStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SproutStackProps) {
    super(scope, id, props);
    const { envName } = props;
    const isProd = envName === 'prod';
    const removal = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // ---------- DATABASE: one DynamoDB table per environment ----------
    const table = new dynamodb.Table(this, 'ProgressTable', {
      tableName: `SproutProgress-${envName}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    // ---------- BACKEND: Lambda that reads/writes the table ----------
    const fn = new lambda.Function(this, 'ProgressFn', {
      functionName: `sprout-progress-${envName}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', '..', 'lambda')),
      environment: {
        TABLE_NAME: table.tableName,
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? '',
      },
      timeout: cdk.Duration.seconds(20),
    });
    table.grantReadWriteData(fn);

    // ---------- HOSTING: private S3 bucket served via CloudFront (HTTPS) ----------
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: removal,
      autoDeleteObjects: !isProd,
    });
    // Custom domain is wired only when the cert + domain + zone are all supplied.
    const hasCustomDomain = Boolean(
      props.certificate && props.domainName && props.wwwName && props.hostedZoneId,
    );
    const distribution = new cloudfront.Distribution(this, 'SiteCDN', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      ...(hasCustomDomain
        ? {
            domainNames: [props.domainName!, props.wwwName!],
            certificate: props.certificate,
          }
        : {}),
    });
    const siteUrl = `https://${distribution.distributionDomainName}`;

    // When a custom domain is configured, the apex becomes the primary URL the
    // frontend redirects to, but the CloudFront URL and the www host must also
    // be trusted by Cognito (callback/logout) and CORS.
    const customApexUrl = hasCustomDomain ? `https://${props.domainName}` : undefined;
    const customWwwUrl = hasCustomDomain ? `https://${props.wwwName}` : undefined;
    const primarySiteUrl = customApexUrl ?? siteUrl;
    const allSiteUrls = [siteUrl, customApexUrl, customWwwUrl].filter(Boolean) as string[];

    // ---------- DNS: Route 53 alias records for the custom domain ----------
    if (hasCustomDomain) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
        hostedZoneId: props.hostedZoneId!,
        zoneName: props.domainName!,
      });
      const alias = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
      new route53.ARecord(this, 'ApexA', { zone, target: alias });
      new route53.AaaaRecord(this, 'ApexAAAA', { zone, target: alias });
      new route53.ARecord(this, 'WwwA', { zone, recordName: 'www', target: alias });
      new route53.AaaaRecord(this, 'WwwAAAA', { zone, recordName: 'www', target: alias });
    }

    // ---------- AUTH: Cognito user pool + managed login + (optional) Google ----------
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `Sprout-${envName}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      removalPolicy: removal,
    });

    const domainPrefix = `sprout-${envName}-${this.account}`;
    userPool.addDomain('Domain', { cognitoDomain: { domainPrefix } });
    const cognitoDomain = `${domainPrefix}.auth.${this.region}.amazoncognito.com`;

    const providers = [cognito.UserPoolClientIdentityProvider.COGNITO];
    let googleProvider: cognito.UserPoolIdentityProviderGoogle | undefined;
    if (props.googleClientId && props.googleClientSecret) {
      googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool,
        clientId: props.googleClientId,
        clientSecretValue: cdk.SecretValue.unsafePlainText(props.googleClientSecret),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      });
      providers.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
    }

    const client = userPool.addClient('WebClient', {
      userPoolClientName: `sprout-web-${envName}`,
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: allSiteUrls.map((u) => `${u}/`),
        logoutUrls: allSiteUrls.map((u) => `${u}/`),
      },
      supportedIdentityProviders: providers,
    });
    if (googleProvider) client.node.addDependency(googleProvider);

    // ---------- API: HTTP API + Cognito JWT authorizer -> Lambda ----------
    const authorizer = new HttpJwtAuthorizer(
      'JwtAuth',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      { jwtAudience: [client.userPoolClientId] },
    );
    const httpApi = new HttpApi(this, 'Api', {
      apiName: `sprout-api-${envName}`,
      corsPreflight: {
        allowOrigins: allSiteUrls,
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.PUT, CorsHttpMethod.OPTIONS],
        allowHeaders: ['authorization', 'content-type'],
      },
    });
    const integration = new HttpLambdaIntegration('LambdaIntegration', fn);
    httpApi.addRoutes({
      path: '/progress',
      methods: [HttpMethod.GET, HttpMethod.PUT],
      integration,
      authorizer,
    });
    httpApi.addRoutes({
      path: '/tips',
      methods: [HttpMethod.GET],
      integration,
      authorizer,
    });

    // ---------- DEPLOY: upload site + auto-generated config.js, invalidate cache ----------
    const configJs = [
      '// Auto-generated by CDK at deploy time. Do not edit by hand.',
      'window.SPROUT_CONFIG = {',
      `  CLIENT_ID: "${client.userPoolClientId}",`,
      `  COGNITO_DOMAIN: "${cognitoDomain}",`,
      `  API_BASE: "${httpApi.apiEndpoint}",`,
      `  REDIRECT_URI: "${primarySiteUrl}/"`,
      '};',
    ].join('\n');

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      destinationBucket: siteBucket,
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '..', '..', 'web')),
        s3deploy.Source.data('config.js', configJs),
      ],
      distribution,
      distributionPaths: ['/*'],
    });

    // ---------- OUTPUTS ----------
    new cdk.CfnOutput(this, 'SiteURL', { value: `${primarySiteUrl}/` });
    new cdk.CfnOutput(this, 'GoogleRedirectURI', {
      value: `https://${cognitoDomain}/oauth2/idpresponse`,
    });
    new cdk.CfnOutput(this, 'CognitoDomain', { value: cognitoDomain });
    new cdk.CfnOutput(this, 'ApiBase', { value: httpApi.apiEndpoint });
  }
}
