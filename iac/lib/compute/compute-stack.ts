import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Peer, Port, SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";
import { Repository, TagMutability } from "aws-cdk-lib/aws-ecr";
import {
  Cluster,
  ContainerImage,
  ContainerInsights,
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

export class NS2ArenaCompute extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create ECR repo
    // Create ECS Cluster
    // Create ECS task definition for server
    // Create security group that can be used when launching tasks

    const vpc = Vpc.fromLookup(this, "DefaultVPC", { isDefault: true });

    const repo = new Repository(this, "NS2ServerRepository", {
      imageTagMutability: TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    const cluster = new Cluster(this, "Cluster", {
      enableFargateCapacityProviders: true,
      vpc,
      containerInsightsV2: ContainerInsights.DISABLED,
    });

    NagSuppressions.addResourceSuppressions(cluster, [
      {
        id: "AwsSolutions-ECS4",
        reason: "Not using Container Insights currently",
      },
    ]);

    const policy = new ManagedPolicy(
      this,
      "TaskDefinitionExecutionRolePolicy",
      {
        statements: [
          new PolicyStatement({
            actions: [
              "ecr:BatchCheckLayerAvailability",
              "ecr:BatchGetImage",
              "ecr:GetDownloadUrlForLayer",
            ],
            effect: Effect.ALLOW,
            resources: [repo.repositoryArn],
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
      }
    );

    NagSuppressions.addResourceSuppressions(policy, [
      {
        id: "AwsSolutions-IAM5",
        reason: "Required for ecr:GetAuthorizationToken",
        appliesTo: ["Resource::*"],
      },
    ]);

    const ns2ServerTDExecutionRole = new Role(
      this,
      "TaskDefinitionExecutionRole",
      {
        assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
        managedPolicies: [policy],
      }
    );

    const ns2ServerTD = new FargateTaskDefinition(this, "TaskDefinition", {
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.X86_64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
      cpu: 2048,
      memoryLimitMiB: 4096,
      executionRole: ns2ServerTDExecutionRole.withoutPolicyUpdates(),
    });

    ns2ServerTD.addContainer("ns2-server", {
      image: ContainerImage.fromEcrRepository(repo),
      portMappings: [
        { containerPort: 27015, hostPort: 27015, protocol: Protocol.TCP },
        { containerPort: 27016, hostPort: 27016, protocol: Protocol.TCP },
        { containerPort: 27015, hostPort: 27015, protocol: Protocol.UDP },
        { containerPort: 27016, hostPort: 27016, protocol: Protocol.UDP },
      ],
    });

    NagSuppressions.addResourceSuppressions(ns2ServerTD!, [
      { id: "AwsSolutions-ECS7", reason: "Not using container logging" },
    ]);

    const sg = new SecurityGroup(this, "NS2ServerSG", {
      vpc,
    });

    sg.addIngressRule(
      Peer.anyIpv4(),
      Port.tcpRange(27015, 27017),
      "Allow TCP access"
    );

    sg.addIngressRule(
      Peer.anyIpv4(),
      Port.udpRange(27015, 27017),
      "Allow UDP access"
    );

    NagSuppressions.addResourceSuppressions(sg, [
      {
        id: "AwsSolutions-EC23",
        reason: "Open inbound access required for these ports",
      },
    ]);
  }
}
