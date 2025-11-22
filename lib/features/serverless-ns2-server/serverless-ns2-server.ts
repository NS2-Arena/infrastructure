import { Cluster, ContainerInsights } from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";
import {
  BlockDeviceVolume,
  EbsDeviceVolumeType,
  InstanceClass,
  InstanceSize,
  InstanceType,
  IVpc,
  LaunchTemplate,
  MachineImage,
  UserData,
} from "aws-cdk-lib/aws-ec2";
import {
  Effect,
  InstanceProfile,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import NS2ServerSecurityGroup from "./ns2-server-security-group";
import { NagSuppressions } from "cdk-nag";

type ServerlessNS2ServerProps = {
  vpc: IVpc;
};

export default class ServerlessNS2Server extends Construct {
  public readonly cluster: Cluster;
  public readonly launchTemplate: LaunchTemplate;
  public readonly instanceProfile: InstanceProfile;
  public readonly securityGroup: NS2ServerSecurityGroup;

  constructor(scope: Construct, id: string, props: ServerlessNS2ServerProps) {
    super(scope, id);

    const { vpc } = props;

    this.cluster = new Cluster(scope, "Cluster", {
      enableFargateCapacityProviders: false,
      vpc: vpc,
      containerInsightsV2: ContainerInsights.ENABLED,
    });

    // Workaround for over-enthusiastic CDK validation
    Object.defineProperty(this.cluster, "hasEc2Capacity", {
      value: true,
      writable: true,
    });

    this.securityGroup = new NS2ServerSecurityGroup(
      this,
      "NS2ServerSecurityGroup",
      {
        vpc,
      }
    );

    const instanceProfilePolicy = new ManagedPolicy(
      this,
      "InstanceProfilePolicy",
      {
        statements: [
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [
              "ec2:DescribeTags",
              "ecs:CreateCluster",
              "ecs:DeregisterContainerInstance",
              "ecs:DiscoverPollEndpoint",
              "ecs:Poll",
              "ecs:RegisterContainerInstance",
              "ecs:StartTelemetrySession",
              "ecs:UpdateContainerInstancesState",
              "ecs:Submit*",
              "ecr:GetAuthorizationToken",
              "ecr:BatchCheckLayerAvailability",
              "ecr:GetDownloadUrlForLayer",
              "ecr:BatchGetImage",
              "logs:CreateLogStream",
              "logs:PutLogEvents",
            ],
            resources: ["*"],
          }),
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["ecs:TagResource"],
            resources: ["*"],
            conditions: {
              StringEquals: {
                "ecs:CreateAction": [
                  "CreateCluster",
                  "RegisterContainerInstance",
                ],
              },
            },
          }),
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ["ecs:ListTagsForResource"],
            resources: [
              "arn:aws:ecs:*:*:task/*/*",
              "arn:aws:ecs:*:*:container-instance/*/*",
            ],
          }),
        ],
      }
    );
    const instanceProfileRole = new Role(this, "InstanceProfileRole", {
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [instanceProfilePolicy],
    });

    const userData = UserData.forLinux();
    userData.addCommands(
      `echo "ECS_CLUSTER=${this.cluster.clusterName}" >> /etc/ecs/ecs.config`
    );
    this.instanceProfile = new InstanceProfile(this, "InstanceProfile", {
      role: instanceProfileRole,
    });

    this.launchTemplate = new LaunchTemplate(this, "LaunchTemplate", {
      machineImage: MachineImage.fromSsmParameter(
        "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
      ),
      instanceType: InstanceType.of(InstanceClass.C7A, InstanceSize.MEDIUM),
      instanceProfile: this.instanceProfile,
      associatePublicIpAddress: true,
      securityGroup: this.securityGroup,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: BlockDeviceVolume.ebs(30, {
            volumeType: EbsDeviceVolumeType.GP3,
            encrypted: true,
          }),
        },
      ],
      userData,
      requireImdsv2: true,
    });
  }
}
