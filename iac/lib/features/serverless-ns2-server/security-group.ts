import { IVpc, Peer, Port, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";

type NS2ServerSecurityGroupProps = {
  vpc: IVpc;
};

export default class NS2ServerSecurityGroup extends Construct {
  public securityGroup: SecurityGroup;

  constructor(
    scope: Construct,
    id: string,
    props: NS2ServerSecurityGroupProps
  ) {
    super(scope, id);

    this.securityGroup = new SecurityGroup(scope, "NS2ServerSG", {
      vpc: props.vpc,
    });

    this.securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcpRange(27015, 27017),
      "Allow TCP access"
    );

    this.securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.udpRange(27015, 27017),
      "Allow UDP access"
    );

    NagSuppressions.addResourceSuppressions(this.securityGroup, [
      {
        id: "AwsSolutions-EC23",
        reason: "Open inbound access required for these ports",
      },
    ]);
  }
}
