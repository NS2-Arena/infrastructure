import { Cluster, ContainerInsights } from "aws-cdk-lib/aws-ecs";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";
import { IVpc } from "aws-cdk-lib/aws-ec2";

type NS2ArenaClusterProps = {
  vpc: IVpc;
};

export default class NS2ArenaCluster extends Construct {
  public cluster: Cluster;

  constructor(scope: Construct, id: string, props: NS2ArenaClusterProps) {
    super(scope, id);
    this.cluster = new Cluster(scope, "Cluster", {
      enableFargateCapacityProviders: true,
      vpc: props.vpc,
      containerInsightsV2: ContainerInsights.DISABLED,
    });

    NagSuppressions.addResourceSuppressions(this.cluster, [
      {
        id: "AwsSolutions-ECS4",
        reason: "Not using Container Insights currently",
      },
    ]);
  }
}
