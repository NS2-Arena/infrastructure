import { App, Duration } from "aws-cdk-lib";
import { BaseStack, BaseStackProps } from "./base-stack";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import {
  Choice,
  Condition,
  CustomState,
  DefinitionBody,
  Pass,
  QueryLanguage,
  StateMachine,
  Wait,
  WaitTime,
} from "aws-cdk-lib/aws-stepfunctions";
import { NagSuppressions } from "cdk-nag";
import {
  DynamoAttributeValue,
  DynamoPutItem,
  DynamoReturnValues,
  DynamoUpdateItem,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import {
  Effect,
  InstanceProfile,
  ManagedPolicy,
  Policy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { RegionalSSMParameterReader } from "../features/ssm-parameter-management/regional-ssm-parameter-reader";
import { LaunchTemplate, Vpc } from "aws-cdk-lib/aws-ec2";
import { SSMParameterReader } from "../features/ssm-parameter-management/ssm-parameter-reader";
import { resourceLimits } from "worker_threads";

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
    const launchTemplateId = SSMParameterReader.readStringParameter(
      this,
      "LaunchTemplateId",
      "/NS2Arena/LaunchTemplate/Id"
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
    const instanceProfileRoleArn = SSMParameterReader.readStringParameter(
      this,
      "InstanceProfileArn",
      "/NS2Arena/InstanceProfile/Role/Arn"
    );
    const securityGroupId = SSMParameterReader.readStringParameter(
      this,
      "SecurityGroupId",
      "/NS2Arena/TaskDefinition/SecurityGroup/Id"
    );

    const serverTable = Table.fromTableArn(this, "ServersTable", tableArn);

    const setServerUuid = new Pass(this, "CreateServerUuid", {
      assign: {
        serverUuid: "{% $uuid() %}",
      },
    });

    const createServerRecord = new DynamoPutItem(this, "CreateServersRecord", {
      table: serverTable,
      item: {
        id: DynamoAttributeValue.fromString("{% $serverUuid %}"),
        state: DynamoAttributeValue.fromString("PROVISIONING"), // TODO: Use enum for this
      },
      conditionExpression: "attribute_not_exists(id)",
      stateName: "Create Servers Record",
    });

    const createInstance = new CustomState(this, "CreateInstance", {
      stateJson: {
        Type: "Task",
        Arguments: {
          MaxCount: 1,
          MinCount: 1,
          LaunchTemplate: {
            LaunchTemplateId: launchTemplateId,
            Version: "$Latest",
          },
        },
        Resource: "arn:aws:states:::aws-sdk:ec2:runInstances",
        Assign: {
          InstanceId: "{% $states.result.Instances[0].InstanceId %}",
        },
      },
    });

    const waitForInstance = new Wait(this, "WaitForInstance", {
      time: WaitTime.duration(Duration.seconds(5)),
    });

    const listContainerInstances = new CustomState(
      this,
      "ListContainerInstances",
      {
        stateJson: {
          Type: "Task",
          Resource: "arn:aws:states:::aws-sdk:ecs:listContainerInstances",
          Next: "IsInstanceRunning",
          Arguments: {
            Cluster: clusterArn,
            Filter: "{% 'ec2InstanceId ==' & $InstanceId %}",
          },
          Output: {
            ContainerInstanceArns: "{% $states.result.ContainerInstanceArns %}",
          },
        },
      }
    );

    const isInstanceRunning = new Choice(this, "IsInstanceRunning", {
      outputs: {
        ContainerInstanceArns: "{% $states.input.ContainerInstanceArns %}",
      },
    });

    const updateStatePending = new DynamoUpdateItem(
      this,
      "UpdateStatePending",
      {
        table: serverTable,
        key: { id: DynamoAttributeValue.fromString("{% $serverUuid %}") },
        updateExpression: "SET #state = :state",
        expressionAttributeNames: {
          "#state": "state",
        },
        expressionAttributeValues: {
          ":state": DynamoAttributeValue.fromString("PENDING"),
        },
      }
    );

    const runTask = new CustomState(this, "RunServer", {
      stateJson: {
        Type: "Task",
        Resource: "arn:aws:states:::ecs:runTask.waitForTaskToken",
        Arguments: {
          LaunchType: "EC2",
          Cluster: clusterArn,
          TaskDefinition: taskDefinitionArn,
          EnableECSManagedTags: true,
          EnableExecuteCommand: false,
          Overrides: {
            ContainerOverrides: [
              {
                Name: "ns2-server",
                Environment: [
                  { Name: "NAME", Value: "A Test Server" },
                  { Name: "PASSWORD", Value: "itsabigtest" },
                  { Name: "LAUNCH_CONFIG", Value: "TestConfig" },
                  {
                    Name: "TASK_TOKEN",
                    Value: "{% $states.context.Task.Token %}",
                  },
                ],
              },
            ],
          },
        },
      },
    });

    const updateStateActive = new DynamoUpdateItem(this, "UpdateStateActive", {
      table: serverTable,
      key: { id: DynamoAttributeValue.fromString("{% $serverUuid %}") },
      updateExpression: "SET #state = :state",
      expressionAttributeNames: {
        "#state": "state",
      },
      expressionAttributeValues: {
        ":state": DynamoAttributeValue.fromString("ACTIVE"),
      },
    });

    setServerUuid.next(createServerRecord);
    createServerRecord.next(createInstance);
    createInstance.next(waitForInstance);
    waitForInstance.next(listContainerInstances);
    listContainerInstances.next(isInstanceRunning);
    isInstanceRunning
      .when(
        Condition.jsonata(
          "{% $count($states.input.ContainerInstanceArns) = 1 %}"
        ),
        updateStatePending
      )
      .otherwise(waitForInstance);

    updateStatePending.next(runTask);
    runTask.next(updateStateActive);

    const policy = new ManagedPolicy(this, "ManageServerLifecyclePolicy", {
      statements: [
        new PolicyStatement({
          actions: ["dynamodb:PutItem", "dynamodb:UpdateItem"],
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
            instanceProfileRoleArn,
          ],
        }),
        new PolicyStatement({
          actions: [
            "ec2:StartInstances",
            "ec2:CreateTags",
            "ec2:DescribeInstances",
          ],
          effect: Effect.ALLOW,
          resources: [`arn:aws:ec2:${this.region}:${this.account}:instance/*`],
        }),
        new PolicyStatement({
          actions: ["ec2:RunInstances"],
          effect: Effect.ALLOW,
          resources: [
            `arn:aws:ec2:${this.region}:${this.account}:launch-template/${launchTemplateId}`,
            `arn:aws:ec2:${this.region}:${this.account}:instance/*`,
            `arn:aws:ec2:${this.region}:${this.account}:network-interface/*`,
            `arn:aws:ec2:${this.region}:${this.account}:security-group/${securityGroupId}`,
            ...vpc.publicSubnets.map(
              (subnet) =>
                `arn:aws:ec2:${this.region}:${this.account}:subnet/${subnet.subnetId}`
            ),
            `arn:aws:ec2:${this.region}:${this.account}:volume/*`,
            `arn:aws:ec2:${this.region}::image/*`,
          ],
        }),
        new PolicyStatement({
          actions: ["ec2:CreateTags"],
          effect: Effect.ALLOW,
          resources: [`arn:aws:ec2:${this.region}:${this.account}:volume/*`],
        }),
        new PolicyStatement({
          actions: ["ecs:ListContainerInstances"],
          effect: Effect.ALLOW,
          resources: [clusterArn],
        }),
      ],
    });

    const role = new Role(this, "ManageServerLifecycleRole", {
      managedPolicies: [policy],
      assumedBy: new ServicePrincipal("states.amazonaws.com"),
    });

    const stateMachine = new StateMachine(this, "ManageServerLifecycle", {
      definitionBody: DefinitionBody.fromChainable(setServerUuid),
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
        // appliesTo: ["Resource::*"],
      },
    ]);
  }
}
