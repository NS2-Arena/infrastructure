import {
  AsgCapacityProvider,
  Cluster,
  ContainerInsights,
} from "aws-cdk-lib/aws-ecs";
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
import { SSMParameterWriter } from "../ssm-parameter-management/ssm-parameter-writer";
import {
  AutoScalingGroup,
  CfnAutoScalingGroup,
} from "aws-cdk-lib/aws-autoscaling";
import { InstanceProfile } from "aws-cdk-lib/aws-iam";
import NS2ServerSecurityGroup from "./security-group";
import { NagSuppressions } from "cdk-nag";
import { Metric } from "aws-cdk-lib/aws-cloudwatch";

type NS2ArenaClusterProps = {
  vpc: IVpc;
};

export default class NS2ArenaCluster extends Construct {
  constructor(scope: Construct, id: string, props: NS2ArenaClusterProps) {
    super(scope, id);

    const { vpc } = props;

    const cluster = new Cluster(scope, "Cluster", {
      enableFargateCapacityProviders: false,
      vpc: vpc,
      containerInsightsV2: ContainerInsights.ENABLED,
    });

    const securityGroup = new NS2ServerSecurityGroup(
      this,
      "NS2ServerSecurityGroup",
      {
        vpc,
      }
    );

    const userData = UserData.forLinux();
    const instanceProfile = new InstanceProfile(this, "InstanceProfile");

    const launchTemplate = new LaunchTemplate(this, "LaunchTemplate", {
      machineImage: MachineImage.fromSsmParameter(
        "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
      ),
      instanceType: InstanceType.of(InstanceClass.C7A, InstanceSize.MEDIUM),
      instanceProfile: instanceProfile,
      associatePublicIpAddress: true,
      securityGroup: securityGroup,
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

    const asg = new AutoScalingGroup(this, "AutoScalingGroup", {
      vpc,
      minCapacity: 0,
      maxCapacity: 5,
      launchTemplate,
    });

    const asgProvider = new AsgCapacityProvider(this, "AcgCapacityProvider", {
      autoScalingGroup: asg,
    });

    cluster.addAsgCapacityProvider(asgProvider);

    cluster.addDefaultCapacityProviderStrategy([
      {
        capacityProvider: asgProvider.capacityProviderName,
        base: 0,
        weight: 1,
      },
    ]);

    // Need to use L1's here as there's no way to disable the default scaling policy...
    // const asg = new CfnAutoScalingGroup(this, "CfnAutoScalingGroup", {
    //   minSize: "0",
    //   maxSize: "5",
    //   launchTemplate: {
    //     launchTemplateId: launchTemplate.launchTemplateId,
    //     version: launchTemplate.latestVersionNumber,
    //   },
    //   vpcZoneIdentifier: vpc.publicSubnets.map((subnet) => subnet.subnetId),
    // });

    SSMParameterWriter.writeStringParameter(this, "ClusterArn", {
      stringValue: cluster.clusterArn,
      parameterName: "/NS2Arena/Cluster/Arn",
    });

    NagSuppressions.addResourceSuppressions(
      instanceProfile,
      [
        {
          id: "AwsSolutions-IAM5",
          appliesTo: ["Action::ecs:Submit*"],
          reason: "Required for ecs",
        },
        {
          id: "AwsSolutions-IAM5",
          appliesTo: ["Resource::*"],
          reason: "Is locked down with a condition statement",
        },
        {
          id: "NIST.800.53.R5-IAMNoInlinePolicy",
          reason: "Inline policies are ok in this instance as it's AWS managed",
        },
      ],
      true
    );
    NagSuppressions.addResourceSuppressions(asg, [
      {
        id: "AwsSolutions-AS3",
        reason: "Not using notifications at the moment",
      },
    ]);
  }
}
