import { Repository } from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import NS2ServerTaskDefinition from "../features/serverless-ns2-server/task-definition";
import ServerlessNS2Server from "../features/serverless-ns2-server/serverless-ns2-server";
import { BaseStack, BaseStackProps } from "./base-stack";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { SSMParameterReader } from "../features/ssm-parameter-management/ssm-parameter-reader";
import { ServerManagementStateMachine } from "../features/server-management/server-management-state-machine";
import { SSMParameters } from "../features/ssm-parameter-management/ssm-parameters";
import { Variables } from "../../bin/variables";

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
      { parameterName: SSMParameters.ConfigBucket.Arn }
    );

    const configBucket = Bucket.fromBucketArn(
      this,
      "ConfigBucket",
      configBucketArn
    );

    const taskDefinition = new NS2ServerTaskDefinition(
      this,
      "NS2ServerTaskDefinition",
      {
        ns2ServerRepo,
        configBucket,
      }
    );
    const serverlessNs2Server = new ServerlessNS2Server(
      this,
      "NS2ServerCluster",
      { vpc }
    );
    new ServerManagementStateMachine(this, "ServerManagementStateMachine", {
      vpc,
      serverlessNs2Server,
      taskDefinition,
    });
  }
}
