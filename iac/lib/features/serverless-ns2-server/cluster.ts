import { Cluster, ContainerInsights } from "aws-cdk-lib/aws-ecs";
import { Construct } from "constructs";
import { IVpc } from "aws-cdk-lib/aws-ec2";
import { StringParameter } from "aws-cdk-lib/aws-ssm";

type NS2ArenaClusterProps = {
  vpc: IVpc;
};

export default class NS2ArenaCluster extends Construct {
  constructor(scope: Construct, id: string, props: NS2ArenaClusterProps) {
    super(scope, id);
    const cluster = new Cluster(scope, "Cluster", {
      enableFargateCapacityProviders: true,
      vpc: props.vpc,
      containerInsightsV2: ContainerInsights.ENABLED,
    });

    new StringParameter(this, "ClusterArn", {
      stringValue: cluster.clusterArn,
      parameterName: "/NS2Arena/Cluster/Arn",
    });
  }
}
