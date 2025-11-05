import { Arn, Stack } from "aws-cdk-lib";
import { IRepository } from "aws-cdk-lib/aws-ecr";
import {
  ContainerImage,
  Ec2TaskDefinition,
  LogDriver,
  NetworkMode,
  PlacementConstraint,
  Protocol,
} from "aws-cdk-lib/aws-ecs";
import {
  Effect,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

type NS2ServerTaskDefinitionProps = {
  ns2ServerRepo: IRepository;
  configBucket: IBucket;
};

export default class NS2ServerTaskDefinition extends Ec2TaskDefinition {
  constructor(
    scope: Construct,
    id: string,
    props: NS2ServerTaskDefinitionProps
  ) {
    const { ns2ServerRepo, configBucket } = props;

    const execRolePolicy = new ManagedPolicy(scope, "ExecutionRolePolicy", {
      statements: [
        new PolicyStatement({
          actions: [
            "ecr:BatchCheckLayerAvailability",
            "ecr:BatchGetImage",
            "ecr:GetDownloadUrlForLayer",
          ],
          effect: Effect.ALLOW,
          resources: [ns2ServerRepo.repositoryArn],
        }),
        new PolicyStatement({
          actions: ["ecr:GetAuthorizationToken"],
          effect: Effect.ALLOW,
          resources: ["*"],
        }),
        new PolicyStatement({
          actions: ["logs:PutLogEvents", "logs:CreateLogStream"],
          effect: Effect.ALLOW,
          resources: ["*"], // TODO: Lock down
        }),
      ],
    });

    NagSuppressions.addResourceSuppressions(execRolePolicy, [
      {
        id: "AwsSolutions-IAM5",
        reason: "Required for ecr:GetAuthorizationToken",
        appliesTo: ["Resource::*"],
      },
    ]);

    const ns2ServerTDExecutionRole = new Role(scope, "ExecutionRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [execRolePolicy],
    });

    const taskRolePolicy = new ManagedPolicy(scope, "TaskRolePolicy", {
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["ssm:GetParameter"],
          resources: [
            Arn.format(
              {
                service: "ssm",
                resource: "parameter",
                resourceName: "NS2Arena/ConfigBucket/Name",
              },
              Stack.of(scope)
            ),
          ],
        }),
        new PolicyStatement({
          actions: ["states:SendTaskSuccess"],
          effect: Effect.ALLOW,
          resources: ["*"], // TODO: Lock down
        }),
      ],
    });

    NagSuppressions.addResourceSuppressions(taskRolePolicy, [
      {
        id: "AwsSolutions-IAM5",
        reason: "Required for ecr:GetAuthorizationToken",
        appliesTo: ["Resource::*"],
      },
    ]);

    configBucket.grantRead(taskRolePolicy);

    NagSuppressions.addResourceSuppressions(taskRolePolicy, [
      {
        id: "AwsSolutions-IAM5",
        appliesTo: [
          "Action::s3:GetBucket*",
          "Action::s3:GetObject*",
          "Action::s3:List*",
          "Resource::<NS2ArenaConfigBucketArnParameterC9112435.Parameter.Value>/*",
          "Resource::<ConfigBucketParameterParameter>/*",
        ],
        reason: "Wildcards used for actions and access to all bucket objects",
      },
    ]);

    const ns2ServerTaskRole = new Role(scope, "TaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [taskRolePolicy],
    });

    super(scope, "TaskDefinition", {
      executionRole: ns2ServerTDExecutionRole.withoutPolicyUpdates(),
      taskRole: ns2ServerTaskRole.withoutPolicyUpdates(),
      networkMode: NetworkMode.HOST,
      placementConstraints: [
        PlacementConstraint.memberOf("runningTasksCount == 0"),
      ],
    });

    this.addContainer("ns2-server", {
      image: ContainerImage.fromEcrRepository(ns2ServerRepo),
      portMappings: [
        { containerPort: 27015, hostPort: 27015, protocol: Protocol.TCP },
        { containerPort: 27016, hostPort: 27016, protocol: Protocol.TCP },
        { containerPort: 27017, hostPort: 27017, protocol: Protocol.TCP },
        { containerPort: 27015, hostPort: 27015, protocol: Protocol.UDP },
        { containerPort: 27016, hostPort: 27016, protocol: Protocol.UDP },
        { containerPort: 27017, hostPort: 27017, protocol: Protocol.UDP },
      ],
      cpu: 1024,
      memoryLimitMiB: 1536,
      logging: LogDriver.awsLogs({
        streamPrefix: "/NS2Arena/NS2-Servers",
        logRetention: RetentionDays.ONE_WEEK,
      }),
      essential: true,
      privileged: true,
      user: "steam",
    });

    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: "NIST.800.53.R5-CloudWatchLogGroupEncrypted",
          reason: "Not using KMS keys yet",
        },
      ],
      true
    );
  }
}
