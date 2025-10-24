import { IVpc, Peer, Port, SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import { NagSuppressions } from "cdk-nag";
import { StringParameter } from "aws-cdk-lib/aws-ssm";

type NS2ServerSecurityGroupProps = {
  vpc: IVpc;
};

export default class NS2ServerSecurityGroup extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: NS2ServerSecurityGroupProps
  ) {
    super(scope, id);

    const securityGroup = new SecurityGroup(scope, "NS2ServerSG", {
      vpc: props.vpc,
    });

    securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcpRange(27015, 27017),
      "Allow TCP access"
    );

    securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.udpRange(27015, 27017),
      "Allow UDP access"
    );

    new StringParameter(this, "SecurityGroupArn", {
      stringValue: securityGroup.securityGroupId,
      parameterName: "/NS2Arena/TaskDefinition/SecurityGroup/Id",
    });

    NagSuppressions.addResourceSuppressions(securityGroup, [
      {
        id: "AwsSolutions-EC23",
        reason: "Open inbound access required for these ports",
      },
    ]);
  }
}
