import { Construct } from "constructs";
import { BaseStack, BaseStackProps } from "./base-stack";
import { Bucket, IBucket } from "aws-cdk-lib/aws-s3";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from "cdk-nag";
import { ConfigBucket } from "../features/config-bucket/config-bucket";
import { SSMParameterReader } from "../features/global-ssm-parameter/read-ssm-parameter";
import { RegionInfo } from "../../bin/variables";

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

    const destinationBuckets: IBucket[] = props.destinationRegions.map(
      (regionInfo) => {
        const arn = new SSMParameterReader(
          this,
          `DestinationBucketParameter${regionInfo.name}`,
          {
            parameterName: "/NS2Arena/ConfigBucket/Arn",
            region: regionInfo.region,
          }
        ).getParameterValue();

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
