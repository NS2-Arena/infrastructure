import { Repository } from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import NS2ServerTaskDefinition from "../features/serverless-ns2-server/task-definition";
import NS2ArenaCluster from "../features/serverless-ns2-server/cluster";
import NS2ServerSecurityGroup from "../features/serverless-ns2-server/security-group";
import { BaseStack, BaseStackProps } from "./base-stack";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { SSMParameterReader } from "../features/ssm-parameter-management/ssm-parameter-reader";

export class NS2ArenaCompute extends BaseStack {
  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    const vpc = Vpc.fromLookup(this, "DefaultVPC", { isDefault: true });

    const ns2ServerRepo = Repository.fromRepositoryName(
      this,
      "NS2ServerRepo",
      "ns2arena/ns2-server"
    );

    const configBucketArn = SSMParameterReader.readStringParameter(
      this,
      "ConfigBucketParameter",
      "/NS2Arena/ConfigBucket/Arn"
    );

    const configBucket = Bucket.fromBucketArn(
      this,
      "ConfigBucket",
      configBucketArn
    );

    new NS2ServerTaskDefinition(this, "NS2ServerTaskDefinition", {
      ns2ServerRepo,
      configBucket,
    });
    new NS2ArenaCluster(this, "NS2ServerCluster", { vpc });
    new NS2ServerSecurityGroup(this, "NS2ServerSecurityGroup", { vpc });
  }
}
