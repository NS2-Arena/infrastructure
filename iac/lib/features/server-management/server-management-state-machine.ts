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

interface ServerManagementStateMachineProps {
  vpc: IVpc;
  serverTable: ITable;
  serverlessNs2Server: ServerlessNS2Server;
  taskDefinition: NS2ServerTaskDefinition;
}

export class ServerManagementStateMachine extends StateMachine {
  constructor(
    scope: Construct,
    id: string,
    props: ServerManagementStateMachineProps
  ) {
    const { vpc, serverTable, serverlessNs2Server, taskDefinition } = props;

    const region = Stack.of(scope).region;
    const account = Stack.of(scope).account;

    const stages = new ServerManagementStages(scope, "Stages", {
      serverTable,
      serverlessNs2Server,
      taskDefinition,
    });

    const policy = new ManagedPolicy(scope, "Policy", {
      statements: [
        new PolicyStatement({
          actions: ["dynamodb:PutItem", "dynamodb:UpdateItem"],
          effect: Effect.ALLOW,
          resources: [serverTable.tableArn],
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

    const role = new Role(scope, "Role", {
      managedPolicies: [policy],
      assumedBy: new ServicePrincipal("states.amazonaws.com"),
    });

    super(scope, id, {
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
  }
}
