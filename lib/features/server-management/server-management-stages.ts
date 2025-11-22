import { Duration } from "aws-cdk-lib";
import {
  Chain,
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
import { PropagatedTagSource } from "aws-cdk-lib/aws-ecs";

interface ServerManagementStagesProps {
  serverlessNs2Server: ServerlessNS2Server;
  taskDefinition: NS2ServerTaskDefinition;
  createServerRecord: CreateServerRecord;
  updateStatePending: UpdateStatePending;
  updateStateActive: UpdateStateActive;
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

    const runTask = new EcsRunTask(this, "RunServer", {
      integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      cluster: serverlessNs2Server.cluster,
      taskDefinition: taskDefinition,
      launchTarget: new EcsEc2LaunchTarget(),
      propagatedTagSource: PropagatedTagSource.TASK_DEFINITION,
      containerOverrides: [
        {
          containerDefinition: taskDefinition.findContainer("ns2-server")!,
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

    const runServerChain = Chain.start(updateStatePendingStage)
      .next(runTask)
      .next(updateStateActiveStage);

    const waitForProvisioningLoop = Chain.start(waitForInstance)
      .next(listContainerInstances)
      .next(
        isInstanceRunning
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
