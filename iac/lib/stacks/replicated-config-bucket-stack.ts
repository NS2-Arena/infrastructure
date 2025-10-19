import { Construct } from "constructs";
import { BaseStack, BaseStackProps } from "./base-stack";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { ConfigBucket } from "../features/config-bucket/config-bucket";
import { NagSuppressions } from "cdk-nag";
import { StringParameter } from "aws-cdk-lib/aws-ssm";

export class ReplicatedConfigBucketStack extends BaseStack {
  public readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    this.bucket = new ConfigBucket(this, "DestConfigBucket");

    NagSuppressions.addResourceSuppressions(this.bucket, [
      {
        id: "NIST.800.53.R5-S3BucketReplicationEnabled",
        reason:
          "This is a replicating bucket, it doesn't need replication enabled",
      },
    ]);

    new StringParameter(this, "BucketArnParameter", {
      stringValue: this.bucket.bucketArn,
      parameterName: "/NS2Arena/ConfigBucket/Arn",
    });
  }
}
