import {
  Peer,
  Port,
  SecurityGroup,
  SecurityGroupProps,
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";

export default class NS2ServerSecurityGroup extends SecurityGroup {
  constructor(scope: Construct, id: string, props: SecurityGroupProps) {
    super(scope, id, props);

    this.addIngressRule(
      Peer.anyIpv4(),
      Port.tcpRange(27015, 27017),
      "Allow TCP access"
    );

    this.addIngressRule(
      Peer.anyIpv4(),
      Port.udpRange(27015, 27017),
      "Allow UDP access"
    );

    NagSuppressions.addResourceSuppressions(this, [
      {
        id: "AwsSolutions-EC23",
        reason: "Open inbound access required for these ports",
      },
    ]);
  }
}
