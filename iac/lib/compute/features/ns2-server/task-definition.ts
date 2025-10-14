import { IRepository } from "aws-cdk-lib/aws-ecr";
import {
  ContainerImage,
  CpuArchitecture,
  FargateTaskDefinition,
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
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

type NS2ServerTaskDefinitionProps = {
  ns2ServerRepo: IRepository;
};

export default class NS2ServerTaskDefinition extends Construct {
  public taskDefinition: FargateTaskDefinition;

  constructor(
    scope: Construct,
    id: string,
    props: NS2ServerTaskDefinitionProps
  ) {
    super(scope, id);

    const policy = new ManagedPolicy(scope, "ExecutionRolePolicy", {
      statements: [
        new PolicyStatement({
          actions: [
            "ecr:BatchCheckLayerAvailability",
            "ecr:BatchGetImage",
            "ecr:GetDownloadUrlForLayer",
          ],
          effect: Effect.ALLOW,
          resources: [props.ns2ServerRepo.repositoryArn],
        }),
        new PolicyStatement({
          actions: ["ecr:GetAuthorizationToken"],
          effect: Effect.ALLOW,
          resources: ["*"],
        }),
        new PolicyStatement({
          actions: ["logs:CreateLogGroup"],
          effect: Effect.ALLOW,
          resources: ["*"],
        }),
      ],
    });

    NagSuppressions.addResourceSuppressions(policy, [
      {
        id: "AwsSolutions-IAM5",
        reason: "Required for ecr:GetAuthorizationToken",
        appliesTo: ["Resource::*"],
      },
    ]);

    const ns2ServerTDExecutionRole = new Role(scope, "ExecutionRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [policy],
    });

    this.taskDefinition = new FargateTaskDefinition(scope, "TaskDefinition", {
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.X86_64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
      cpu: 2048,
      memoryLimitMiB: 4096,
      executionRole: ns2ServerTDExecutionRole.withoutPolicyUpdates(),
    });

    this.taskDefinition.addContainer("ns2-server", {
      image: ContainerImage.fromEcrRepository(props.ns2ServerRepo),
      portMappings: [
        { containerPort: 27015, hostPort: 27015, protocol: Protocol.TCP },
        { containerPort: 27016, hostPort: 27016, protocol: Protocol.TCP },
        { containerPort: 27015, hostPort: 27015, protocol: Protocol.UDP },
        { containerPort: 27016, hostPort: 27016, protocol: Protocol.UDP },
      ],
    });

    NagSuppressions.addResourceSuppressions(this.taskDefinition, [
      { id: "AwsSolutions-ECS7", reason: "Not using container logging" },
    ]);
  }
}
