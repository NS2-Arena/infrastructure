import { RemovalPolicy, Stack } from "aws-cdk-lib";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  BucketProps,
} from "aws-cdk-lib/aws-s3";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

export class ConfigBucket extends Bucket {
  constructor(scope: Construct, id: string, props?: BucketProps) {
    const stack = Stack.of(scope);

    super(scope, id, {
      bucketName: `ns2server-configs-${stack.account}-${stack.region}`,
      versioned: true,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      enforceSSL: true,
      ...props,
    });

    new StringParameter(this, "BucketArnParameter", {
      stringValue: this.bucketArn,
      parameterName: "/NS2Arena/ConfigBucket/Arn",
    });

    new StringParameter(this, "BucketNameParameter", {
      stringValue: this.bucketName,
      parameterName: "/NS2Arena/ConfigBucket/Name",
    });

    NagSuppressions.addResourceSuppressions(
      this,
      ["AwsSolutions-S1", "NIST.800.53.R5-S3BucketLoggingEnabled"].map(
        (id) => ({
          id,
          reason:
            "Server access logs are not required for this bucket as it does not store sensitive data",
        })
      )
    );

    NagSuppressions.addResourceSuppressions(this, [
      {
        id: "NIST.800.53.R5-S3DefaultEncryptionKMS",
        reason: "Not using KMS",
      },
    ]);
  }
}
