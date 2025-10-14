import { Stack, StackProps } from "aws-cdk-lib";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import NS2ServerTaskDefinition from "../features/serverless-ns2-server/task-definition";
import NS2ArenaCluster from "../features/serverless-ns2-server/cluster";
import NS2ServerSecurityGroup from "../features/serverless-ns2-server/security-group";

export class NS2ArenaCompute extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = Vpc.fromLookup(this, "DefaultVPC", { isDefault: true });

    const ns2ServerRepo = Repository.fromRepositoryName(
      this,
      "NS2ServerRepo",
      "ns2arena/ns2-server"
    );

    new NS2ServerTaskDefinition(this, "NS2Server", {
      ns2ServerRepo,
    });
    new NS2ArenaCluster(this, "Cluster", { vpc });
    new NS2ServerSecurityGroup(this, "NS2ServerSecurityGroup", { vpc });
  }
}
