import { Duration } from "aws-cdk-lib";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import {
  Choice,
  Condition,
  CustomState,
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

interface ServerManagementStagesProps {
  serverTable: ITable;
  serverlessNs2Server: ServerlessNS2Server;
  taskDefinition: NS2ServerTaskDefinition;
  createServerRecord: CreateServerRecord;
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
      serverTable,
      taskDefinition,
      serverlessNs2Server,
      createServerRecord,
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

    createServerRecordStage.next(createInstance);
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

    this.startState = createServerRecordStage;
  }
}
