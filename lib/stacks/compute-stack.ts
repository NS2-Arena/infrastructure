import { Repository } from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import NS2ServerTaskDefinition from "../features/serverless-ns2-server/task-definition";
import ServerlessNS2Server from "../features/serverless-ns2-server/serverless-ns2-server";
import { BaseStack, BaseStackProps } from "./base-stack";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { SSMParameterReader } from "../features/ssm-parameter-management/ssm-parameter-reader";
import { RegionalSSMParameterReader } from "../features/ssm-parameter-management/regional-ssm-parameter-reader";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { ServerManagementStateMachine } from "../features/server-management/server-management-state-machine";

interface NS2ArenaComputeProps extends BaseStackProps {
  readonly mainRegion: string;
}

export class NS2ArenaCompute extends BaseStack {
  constructor(scope: Construct, id: string, props: NS2ArenaComputeProps) {
    super(scope, id, props);

    const { mainRegion } = props;

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

    const tableArnParameter = "/NS2Arena/Tables/Servers/Arn";
    let tableArn: string;

    if (mainRegion !== props.env?.region) {
      tableArn = new RegionalSSMParameterReader(this, "ServerTableArn", {
        parameterName: tableArnParameter,
        region: mainRegion,
      }).getParameterValue();
    } else {
      tableArn = SSMParameterReader.readStringParameter(
        this,
        "ServerTableArn",
        tableArnParameter
      );
    }
    const serverTable = Table.fromTableArn(this, "ServersTable", tableArn);

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
      serverTable,
      serverlessNs2Server,
      taskDefinition,
    });
  }
}
