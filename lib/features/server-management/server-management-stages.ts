import { Duration } from "aws-cdk-lib";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import {
  Choice,
  Condition,
  CustomState,
  InputType,
  IntegrationPattern,
  State,
  Wait,
  WaitTime,
} from "aws-cdk-lib/aws-stepfunctions";
import {
  DynamoAttributeValue,
  DynamoUpdateItem,
  LambdaInvoke,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import NS2ServerTaskDefinition from "../serverless-ns2-server/task-definition";
import ServerlessNS2Server from "../serverless-ns2-server/serverless-ns2-server";
import { CreateServerRecord } from "./create-server-record/create-server-record";
import { UpdateStateActive } from "./update-state-active/update-state-active";
import { UpdateStatePending } from "./update-state-pending/update-state-pending";

interface ServerManagementStagesProps {
  serverlessNs2Server: ServerlessNS2Server;
  taskDefinition: NS2ServerTaskDefinition;
  createServerRecord: CreateServerRecord;
  updateStatePending: UpdateStatePending;
  updateStateActive: UpdateStateActive;
}

export class ServerManagementStages extends Construct {
  public readonly startState: State;

  constructor(
    scope: Construct,
    id: string,
    props: ServerManagementStagesProps
  ) {
    super(scope, id);

    const {
      taskDefinition,
      serverlessNs2Server,
      createServerRecord,
      updateStateActive,
      updateStatePending,
    } = props;

    const createServerRecordStage = new LambdaInvoke(
      this,
      "InvokeCreateServerRecordLambda",
      {
        lambdaFunction: createServerRecord.function,
        assign: {
          serverUuid: "{% $states.result.Payload.serverUuid %}",
        },
      }
    );

    const createInstance = new CustomState(this, "CreateInstance", {
      stateJson: {
        Type: "Task",
        Arguments: {
          MaxCount: 1,
          MinCount: 1,
          LaunchTemplate: {
            LaunchTemplateId:
              serverlessNs2Server.launchTemplate.launchTemplateId,
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
          Arguments: {
            Cluster: serverlessNs2Server.cluster.clusterArn,
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

    const updateStatePendingStage = new LambdaInvoke(
      this,
      "UpdateStatePending",
      {
        lambdaFunction: updateStatePending.function,
        payload: {
          type: InputType.OBJECT,
          value: {
            serverUuid: "{% $serverUuid %}",
          },
        },
      }
    );

    const runTask = new CustomState(this, "RunServer", {
      stateJson: {
        Type: "Task",
        Resource: "arn:aws:states:::ecs:runTask.waitForTaskToken",
        Arguments: {
          LaunchType: "EC2",
          Cluster: serverlessNs2Server.cluster.clusterArn,
          TaskDefinition: taskDefinition.taskDefinitionArn,
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

    const updateStateActiveStage = new LambdaInvoke(this, "UpdateStateActive", {
      lambdaFunction: updateStateActive.function,
      integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      payload: {
        type: InputType.OBJECT,
        value: {
          serverUuid: "{% $serverUuid %}",
          resumeToken: "{% $states.context.Task.Token %}",
        },
      },
    });

    createServerRecordStage.next(createInstance);
    createInstance.next(waitForInstance);
    waitForInstance.next(listContainerInstances);
    listContainerInstances.next(isInstanceRunning);
    isInstanceRunning
      .when(
        Condition.jsonata(
          "{% $count($states.input.ContainerInstanceArns) = 1 %}"
        ),
        updateStatePendingStage
      )
      .otherwise(waitForInstance);

    updateStatePendingStage.next(runTask);
    runTask.next(updateStateActiveStage);

    this.startState = createServerRecordStage;
  }
}
