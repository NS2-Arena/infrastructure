import {
  IVpc,
  Peer,
  Port,
  SecurityGroup,
  SecurityGroupProps,
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { SSMParameterWriter } from "../ssm-parameter-management/ssm-parameter-writer";

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

    SSMParameterWriter.writeStringParameter(this, "SecurityGroupId", {
      stringValue: this.securityGroupId,
      parameterName: "/NS2Arena/TaskDefinition/SecurityGroup/Id",
    });

    NagSuppressions.addResourceSuppressions(this, [
      {
        id: "AwsSolutions-EC23",
        reason: "Open inbound access required for these ports",
      },
    ]);
  }
}
