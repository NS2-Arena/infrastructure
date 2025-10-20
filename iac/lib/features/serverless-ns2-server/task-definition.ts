import { Arn, Stack } from "aws-cdk-lib";
import { IRepository } from "aws-cdk-lib/aws-ecr";
import {
  ContainerImage,
  CpuArchitecture,
  FargateTaskDefinition,
  LogDriver,
  OperatingSystemFamily,
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

export default class NS2ServerTaskDefinition extends Construct {
  public taskDefinition: FargateTaskDefinition;

  constructor(
    scope: Construct,
    id: string,
    props: NS2ServerTaskDefinitionProps
  ) {
    const { ns2ServerRepo, configBucket } = props;

    super(scope, id);

    const execRolePolicy = new ManagedPolicy(this, "ExecutionRolePolicy", {
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

    const ns2ServerTDExecutionRole = new Role(this, "ExecutionRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [execRolePolicy],
    });

    const taskRolePolicy = new ManagedPolicy(this, "TaskRolePolicy", {
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
              Stack.of(this)
            ),
          ],
        }),
      ],
    });
    configBucket.grantRead(taskRolePolicy);

    NagSuppressions.addResourceSuppressions(taskRolePolicy, [
      {
        id: "AwsSolutions-IAM5",
        appliesTo: [
          "Action::s3:GetBucket*",
          "Action::s3:GetObject*",
          "Action::s3:List*",
          "Resource::<ConfigBucketParameterParameter>/*",
        ],
        reason: "Wildcards used for actions and access to all bucket objects",
      },
    ]);

    const ns2ServerTaskRole = new Role(this, "TaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [taskRolePolicy],
    });

    this.taskDefinition = new FargateTaskDefinition(this, "TaskDefinition", {
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.X86_64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
      cpu: 1024,
      memoryLimitMiB: 4096,
      executionRole: ns2ServerTDExecutionRole.withoutPolicyUpdates(),
      taskRole: ns2ServerTaskRole.withoutPolicyUpdates(),
    });

    this.taskDefinition.addContainer("ns2-server", {
      image: ContainerImage.fromEcrRepository(ns2ServerRepo),
      portMappings: [
        { containerPort: 27015, hostPort: 27015, protocol: Protocol.TCP },
        { containerPort: 27016, hostPort: 27016, protocol: Protocol.TCP },
        { containerPort: 27015, hostPort: 27015, protocol: Protocol.UDP },
        { containerPort: 27016, hostPort: 27016, protocol: Protocol.UDP },
      ],
      cpu: 1024,
      memoryLimitMiB: 4096,
      logging: LogDriver.awsLogs({
        streamPrefix: "/NS2Arena/Jobs",
        logRetention: RetentionDays.ONE_WEEK,
      }),
    });

    NagSuppressions.addResourceSuppressions(
      this.taskDefinition,
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
