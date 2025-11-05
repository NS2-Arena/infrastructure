import { Construct } from "constructs";
import { ServerManagementStages } from "./server-management-stages";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import ServerlessNS2Server from "../serverless-ns2-server/serverless-ns2-server";
import NS2ServerTaskDefinition from "../serverless-ns2-server/task-definition";
import {
  Effect,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Stack } from "aws-cdk-lib";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import {
  DefinitionBody,
  QueryLanguage,
  StateMachine,
} from "aws-cdk-lib/aws-stepfunctions";
import { NagSuppressions } from "cdk-nag";
import { DynamoTableFetcher } from "../dynamo-table/dynamo-tables-fetcher";
import { CreateServerRecord } from "./create-server-record/create-server-record";
import { UpdateStateActive } from "./update-state-active/update-state-active";
import { UpdateStatePending } from "./update-state-pending/update-state-pending";

interface ServerManagementStateMachineProps {
  vpc: IVpc;
  serverlessNs2Server: ServerlessNS2Server;
  taskDefinition: NS2ServerTaskDefinition;
}

export class ServerManagementStateMachine extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: ServerManagementStateMachineProps
  ) {
    super(scope, id);

    const { vpc, serverlessNs2Server, taskDefinition } = props;

    const region = Stack.of(this).region;
    const account = Stack.of(this).account;

    const createServerRecord = new CreateServerRecord(
      this,
      "CreateServerRecord"
    );
    const updateStatePending = new UpdateStatePending(
      this,
      "UpdateStatePending"
    );
    const updateStateActive = new UpdateStateActive(this, "UpdateStateActive");

    const stages = new ServerManagementStages(this, "Stages", {
      serverlessNs2Server,
      taskDefinition,
      createServerRecord,
      updateStatePending,
      updateStateActive,
    });

    const policy = new ManagedPolicy(this, "Policy", {
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["lambda:InvokeFunction"],
          resources: [
            createServerRecord.function.functionArn,
            updateStateActive.function.functionArn,
            updateStatePending.function.functionArn,
          ],
        }),
        new PolicyStatement({
          actions: ["ecs:RunTask"],
          effect: Effect.ALLOW,
          resources: [taskDefinition.taskDefinitionArn],
        }),
        new PolicyStatement({
          actions: ["iam:PassRole"],
          effect: Effect.ALLOW,
          resources: [
            taskDefinition.taskRole.roleArn,
            taskDefinition.executionRole!.roleArn,
            serverlessNs2Server.instanceProfile.role!.roleArn,
          ],
        }),
        new PolicyStatement({
          actions: [
            "ec2:StartInstances",
            "ec2:CreateTags",
            "ec2:DescribeInstances",
          ],
          effect: Effect.ALLOW,
          resources: [`arn:aws:ec2:${region}:${account}:instance/*`],
        }),
        new PolicyStatement({
          actions: ["ec2:RunInstances"],
          effect: Effect.ALLOW,
          resources: [
            `arn:aws:ec2:${region}:${account}:launch-template/${serverlessNs2Server.launchTemplate.launchTemplateId}`,
            `arn:aws:ec2:${region}:${account}:instance/*`,
            `arn:aws:ec2:${region}:${account}:network-interface/*`,
            `arn:aws:ec2:${region}:${account}:security-group/${serverlessNs2Server.securityGroup.securityGroupId}`,
            ...vpc.publicSubnets.map(
              (subnet) =>
                `arn:aws:ec2:${region}:${account}:subnet/${subnet.subnetId}`
            ),
            `arn:aws:ec2:${region}:${account}:volume/*`,
            `arn:aws:ec2:${region}::image/*`,
          ],
        }),
        new PolicyStatement({
          actions: ["ec2:CreateTags"],
          effect: Effect.ALLOW,
          resources: [`arn:aws:ec2:${region}:${account}:volume/*`],
        }),
        new PolicyStatement({
          actions: ["ecs:ListContainerInstances"],
          effect: Effect.ALLOW,
          resources: [serverlessNs2Server.cluster.clusterArn],
        }),
      ],
    });

    const role = new Role(this, "Role", {
      managedPolicies: [policy],
      assumedBy: new ServicePrincipal("states.amazonaws.com"),
    });

    const stateMachine = new StateMachine(this, id, {
      definitionBody: DefinitionBody.fromChainable(stages.startState),
      queryLanguage: QueryLanguage.JSONATA,
      role: role.withoutPolicyUpdates(),
    });

    NagSuppressions.addResourceSuppressions(
      this,
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
        // appliesTo: ["Resource::*"],
      },
    ]);

    NagSuppressions.addResourceSuppressions(stateMachine, [
      { id: "AwsSolutions-SF1", reason: "Not logging to cloudwatch yet" },
      { id: "AwsSolutions-SF2", reason: "Not using X-Ray" },
      {
        id: "Serverless-StepFunctionStateMachineXray",
        reason: "Not using X-Ray",
      },
    ]);
  }
}
