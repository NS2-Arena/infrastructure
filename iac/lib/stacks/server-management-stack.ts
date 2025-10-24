import { App } from "aws-cdk-lib";
import { BaseStack, BaseStackProps } from "./base-stack";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import {
  CustomState,
  DefinitionBody,
  QueryLanguage,
  StateMachine,
} from "aws-cdk-lib/aws-stepfunctions";
import { NagSuppressions } from "cdk-nag";
import {
  DynamoAttributeValue,
  DynamoPutItem,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import {
  Effect,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { RegionalSSMParameterReader } from "../features/ssm-parameter-management/regional-ssm-parameter-reader";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import { SSMParameterReader } from "../features/ssm-parameter-management/ssm-parameter-reader";

interface ServerManagementStackProps extends BaseStackProps {
  readonly mainRegion: string;
}

export class ServerManagementStack extends BaseStack {
  constructor(scope: App, id: string, props: ServerManagementStackProps) {
    super(scope, id, props);

    const { mainRegion } = props;

    const vpc = Vpc.fromLookup(this, "DefaultVpc", {
      isDefault: true,
    });

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

    const clusterArn = SSMParameterReader.readStringParameter(
      this,
      "ClusterArn",
      "/NS2Arena/Cluster/Arn"
    );
    const taskDefinitionArn = SSMParameterReader.readStringParameter(
      this,
      "TaskDefinitionArn",
      "/NS2Arena/TaskDefinition/Arn"
    );
    const taskDefinitionTaskRoleArn = SSMParameterReader.readStringParameter(
      this,
      "TaskDefinitionTaskRoleArn",
      "/NS2Arena/TaskDefinition/TaskRole/Arn"
    );
    const taskDefinitionExecutionRoleArn =
      SSMParameterReader.readStringParameter(
        this,
        "TaskDefinitionExecutionRoleArn",
        "/NS2Arena/TaskDefinition/ExecutionRole/Arn"
      );
    const taskDefinitionSecurityGroupArn =
      SSMParameterReader.readStringParameter(
        this,
        "TaskDefinitionSecurityGroup",
        "/NS2Arena/TaskDefinition/SecurityGroup/Id"
      );

    const serverTable = Table.fromTableArn(this, "ServersTable", tableArn);

    const startState = new DynamoPutItem(this, "CreateServersRecord", {
      table: serverTable,
      item: {
        id: DynamoAttributeValue.fromString("123"),
        state: DynamoAttributeValue.fromString("PROVISIONING"),
        taskId: DynamoAttributeValue.fromNull(true),
      },
      stateName: "Create Servers Record",
    });

    // startState.next(
    //   new EcsRunTask(this, "RunServer", {
    //     cluster: cluster,
    //     taskDefinition: taskDefinition,
    //     launchTarget: new EcsFargateLaunchTarget(),
    //   })
    // );

    startState.next(
      new CustomState(this, "RunServer", {
        stateJson: {
          End: true,
          Type: "Task",
          Resource: "arn:aws:states:::ecs:runTask",
          Arguments: {
            LaunchType: "FARGATE",
            Cluster: clusterArn,
            TaskDefinition: taskDefinitionArn,
            Overrides: {
              ContainerOverrides: [
                {
                  Name: "ns2-server",
                  Environment: [
                    { Name: "NAME", Value: "A Test Server" },
                    { Name: "PASSWORD", Value: "itsabigtest" },
                    { Name: "LAUNCH_CONFIG", Value: "TestConfig" },
                  ],
                },
              ],
            },
            NetworkConfiguration: {
              AwsvpcConfiguration: {
                SecurityGroups: [taskDefinitionSecurityGroupArn],
                Subnets: vpc.publicSubnets.map((subnet) => subnet.subnetId),
                AssignPublicIp: "ENABLED",
              },
            },
          },
        },
      })
    );

    const policy = new ManagedPolicy(this, "ManageServerLifecyclePolicy", {
      statements: [
        new PolicyStatement({
          actions: ["dynamodb:PutItem"],
          effect: Effect.ALLOW,
          resources: [serverTable.tableArn],
        }),
        new PolicyStatement({
          actions: ["ecs:RunTask"],
          effect: Effect.ALLOW,
          resources: [taskDefinitionArn],
        }),
        new PolicyStatement({
          actions: ["iam:PassRole"],
          effect: Effect.ALLOW,
          resources: [
            taskDefinitionTaskRoleArn,
            taskDefinitionExecutionRoleArn,
          ],
        }),
      ],
    });

    const role = new Role(this, "ManageServerLifecycleRole", {
      managedPolicies: [policy],
      assumedBy: new ServicePrincipal("states.amazonaws.com"),
    });

    const stateMachine = new StateMachine(this, "ManageServerLifecycle", {
      definitionBody: DefinitionBody.fromChainable(startState),
      queryLanguage: QueryLanguage.JSONATA,
      role: role.withoutPolicyUpdates(),
    });

    NagSuppressions.addResourceSuppressions(
      stateMachine,
      [
        "AwsSolutions-SF1",
        "AwsSolutions-SF2",
        "Serverless-StepFunctionStateMachineXray",
      ].map((id) => ({
        id,
        reason: "Ignoring for now for testing",
      }))
    );

    NagSuppressions.addResourceSuppressions(policy, [
      {
        id: "AwsSolutions-IAM5",
        reason: "Allowing wildcard temporarily",
        appliesTo: ["Resource::*"],
      },
    ]);
  }
}
