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
  mainRegion: string;
  destinationRegions: RegionInfo[];
}

export class ConfigBucketStack extends BaseStack {
  constructor(
    scope: Construct,
    id: string,
    props: SourceConfigBucketStackProps
  ) {
    super(scope, id, props);

    const { mainRegion, destinationRegions } = props;

    if (destinationRegions.length === 0 || mainRegion !== this.region) {
      new ConfigBucket(this, "ConfigBucket");
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

    const sourceBucket = new ConfigBucket(this, "ConfigBucket", {
      replicationRole,
      replicationRules: destinationBuckets.map((bucket) => ({
        destination: bucket,
        priority: 0,
        deleteMarkerReplication: true,
      })),
    });

    sourceBucket.grantReplicationPermission(replicationRole, {
      destinations: destinationBuckets.map((bucket) => ({ bucket })),
    });
  }
}
