import { Duration } from "aws-cdk-lib";
import {
  Chain,
  Choice,
  Condition,
  CustomState,
  InputType,
  IntegrationPattern,
  Wait,
  WaitTime,
} from "aws-cdk-lib/aws-stepfunctions";
import {
  DynamoAttributeValue,
  DynamoDeleteItem,
  EcsEc2LaunchTarget,
  EcsRunTask,
  LambdaInvoke,
} from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import NS2ServerTaskDefinition from "../serverless-ns2-server/task-definition";
import ServerlessNS2Server from "../serverless-ns2-server/serverless-ns2-server";
import { CreateServerRecord } from "./create-server-record/create-server-record";
import { UpdateStateActive } from "./update-state-active/update-state-active";
import { UpdateStatePending } from "./update-state-pending/update-state-pending";
import { PlacementConstraint, PropagatedTagSource } from "aws-cdk-lib/aws-ecs";
import { UpdateStateDeprovisioning } from "./update-state-deprovisioning/update-state-deprovisioning";
import { DynamoTableFetcher } from "../dynamo-table/dynamo-tables-fetcher";
import { EcrRepoInfo } from "../serverless-ns2-server/ecr-repo-info";

interface ServerManagementStagesProps {
  serverlessNs2Server: ServerlessNS2Server;
  taskDefinition: NS2ServerTaskDefinition;
  createServerRecord: CreateServerRecord;
  updateStatePending: UpdateStatePending;
  updateStateActive: UpdateStateActive;
  updateStateDeprovisioning: UpdateStateDeprovisioning;
}

export class ServerManagementStages extends Construct {
  public readonly chain: Chain;

  constructor(
    scope: Construct,
    id: string,
    props: ServerManagementStagesProps
  ) {
    super(scope, id);

    const {
      taskDefinition: { taskDefinition, taskRole },
      serverlessNs2Server,
      createServerRecord,
      updateStateActive,
      updateStatePending,
      updateStateDeprovisioning,
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
      time: WaitTime.duration(Duration.seconds(3)),
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

    const runTask = new EcsRunTask(this, "RunServer", {
      integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      cluster: serverlessNs2Server.cluster,
      taskDefinition: taskDefinition,
      launchTarget: new EcsEc2LaunchTarget({
        placementConstraints: [
          PlacementConstraint.memberOf(
            "{% 'ec2InstanceId ==' & $InstanceId %}"
          ),
        ],
      }),
      propagatedTagSource: PropagatedTagSource.TASK_DEFINITION,
      containerOverrides: [
        {
          containerDefinition: taskDefinition.findContainer(
            EcrRepoInfo.Containers.Ns2Server
          )!,
          environment: [
            { name: "NAME", value: "A Test Server" },
            { name: "PASSWORD", value: "itsabigtest" },
            { name: "LAUNCH_CONFIG", value: "TestConfig" },
            {
              name: "TASK_TOKEN",
              value: "{% $states.context.Task.Token %}",
            },
          ],
        },
      ],
      assign: {
        TaskArn: "{% $states.result.TaskARN %}",
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

    const updateStateDeprovisioningStage = new LambdaInvoke(
      this,
      "UpdateStateDeprovisioning",
      {
        lambdaFunction: updateStateDeprovisioning.function,
        payload: {
          type: InputType.OBJECT,
          value: {
            serverUuid: "{% $serverUuid %}",
          },
        },
      }
    );

    const stopTask = new CustomState(this, "StopTask", {
      stateJson: {
        Type: "Task",
        Arguments: {
          Task: "{% $TaskArn %}",
          Cluster: serverlessNs2Server.cluster.clusterArn,
        },
        Resource: "arn:aws:states:::aws-sdk:ecs:stopTask",
      },
    });

    const describeTask = new CustomState(this, "DescribeTask", {
      stateJson: {
        Type: "Task",
        Arguments: {
          Tasks: ["{% $TaskArn %}"],
          Cluster: serverlessNs2Server.cluster.clusterArn,
        },
        Resource: "arn:aws:states:::aws-sdk:ecs:describeTasks",
        Output: {
          TaskState: "{% $states.result.Tasks[0].LastStatus %}",
        },
      },
    });

    const waitForTaskToStop = new Wait(this, "WaitForTaskToStop", {
      time: WaitTime.duration(Duration.seconds(3)),
    });

    const terminateInstance = new CustomState(this, "TerminateInstance", {
      stateJson: {
        Type: "Task",
        Arguments: {
          InstanceIds: ["{% $InstanceId %}"],
        },
        Resource: "arn:aws:states:::aws-sdk:ec2:terminateInstances",
      },
    });

    const serversTable =
      DynamoTableFetcher.getInstance(this).getTables().ServerTable;
    const deleteServerRecord = new DynamoDeleteItem(
      this,
      "DeleteServerRecord",
      {
        table: serversTable,
        key: {
          id: DynamoAttributeValue.fromString("{% $serverUuid %}"),
        },
      }
    );

    const continueDeprovisioningChain =
      Chain.start(terminateInstance).next(deleteServerRecord);

    const waitForDeprovisioningLoop = Chain.start(describeTask).next(
      new Choice(this, "HasTaskStopped")
        .when(
          Condition.jsonata("{% $states.input.TaskState = 'STOPPED' %}"),
          continueDeprovisioningChain
        )
        .otherwise(Chain.start(waitForTaskToStop).next(describeTask))
    );

    const runServerChain = Chain.start(updateStatePendingStage)
      .next(runTask)
      .next(updateStateActiveStage)
      .next(updateStateDeprovisioningStage)
      .next(stopTask)
      .next(waitForDeprovisioningLoop);

    const waitForProvisioningLoop = Chain.start(waitForInstance)
      .next(listContainerInstances)
      .next(
        new Choice(this, "IsInstanceRunning")
          .when(
            Condition.jsonata(
              "{% $count($states.input.ContainerInstanceArns) = 1 %}"
            ),
            runServerChain
          )
          .otherwise(waitForInstance)
      );

    this.chain = Chain.start(createServerRecordStage)
      .next(createInstance)
      .next(waitForProvisioningLoop);
  }
}
