import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';

interface SproutCertProps extends cdk.StackProps {
  domainName: string;
  wwwName: string;
  hostedZoneId: string;
}

export class SproutCertStack extends cdk.Stack {
  public readonly certificate: acm.ICertificate;
  constructor(scope: Construct, id: string, props: SproutCertProps) {
    super(scope, id, props);
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.domainName,
    });
    this.certificate = new acm.Certificate(this, 'Cert', {
      domainName: props.domainName,
      subjectAlternativeNames: [props.wwwName],
      validation: acm.CertificateValidation.fromDns(zone),
    });
  }
}
