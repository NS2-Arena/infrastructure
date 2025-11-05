import { Construct } from "constructs";
import { BaseStack, BaseStackProps } from "./base-stack";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from "cdk-nag";
import { ConfigBucket } from "../features/config-bucket/config-bucket";
import { RegionInfo } from "../../bin/variables";
import { SSMParameterReader } from "../features/ssm-parameter-management/ssm-parameter-reader";
import { SSMParameters } from "../features/ssm-parameter-management/ssm-parameters";

interface SourceConfigBucketStackProps extends BaseStackProps {
  destinationRegions: RegionInfo[];
}

export class SourceConfigBucketStack extends BaseStack {
  constructor(
    scope: Construct,
    id: string,
    props: SourceConfigBucketStackProps
  ) {
    super(scope, id, props);

    const { destinationRegions } = props;

    if (destinationRegions.length === 0) {
      const bucket = new ConfigBucket(this, "SourceConfigBucket");

      NagSuppressions.addResourceSuppressions(bucket, [
        {
          id: "NIST.800.53.R5-S3BucketReplicationEnabled",
          reason: "No other regions to replicate to",
        },
      ]);
      return;
    }

    const destinationBuckets: IBucket[] = destinationRegions.map(
      (regionInfo) => {
        const arn = SSMParameterReader.readStringParameter(
          this,
          `DestinationBucketParameter${regionInfo.name}`,
          {
            parameterName: SSMParameters.ConfigBucket.Arn,
            region: regionInfo.region,
          }
        );

        return Bucket.fromBucketArn(
          this,
          `DestinationBucket${regionInfo.name}`,
          arn
        );
      }
    );

    const replicationRole = new Role(this, "ReplicationRole", {
      assumedBy: new ServicePrincipal("s3.amazonaws.com"),
    });

    const sourceBucket = new ConfigBucket(this, "SourceConfigBucket", {
      replicationRole,
      replicationRules: destinationBuckets.map((bucket) => ({
        destination: bucket,
        priority: 0,
        deleteMarkerReplication: true,
      })),
    });

    // sourceBucket.grantRead(replicationRole);

    sourceBucket.grantReplicationPermission(replicationRole, {
      destinations: destinationBuckets.map((bucket) => ({ bucket })),
    });

    NagSuppressions.addResourceSuppressions(
      replicationRole,
      [
        {
          id: "AwsSolutions-IAM5",
          appliesTo: [
            "Action::s3:Abort*",
            "Action::s3:DeleteObject*",
            "Action::s3:GetBucket*",
            "Action::s3:GetObject*",
            "Action::s3:List*",
            "Resource::<SourceConfigBucket412D99EC.Arn>/*",
            "Resource::<DestConfigBucketF25B8258.Arn>/*",
            "Resource::<DestinationBucketParameterNVirginiaE645158B.Parameter.Value>/*",
            "Resource::<NS2ArenaConfigBucketArnParameterC9112435.Parameter.Value>/*",
          ],
          reason: "Wildcards are appropriate in this context",
        },
        {
          id: "NIST.800.53.R5-IAMNoInlinePolicy",
          reason: "Using inline policies",
        },
      ],
      true
    );
  }
}
