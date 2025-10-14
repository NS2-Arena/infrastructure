import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Repository, TagMutability } from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import NS2ServerTaskDefinition from "./features/ns2-server/task-definition";
import NS2ServerSecurityGroup from "./features/ns2-server/security-group";
import NS2ArenaCluster from "./features/ns2-server/cluster";
import { Vpc } from "aws-cdk-lib/aws-ec2";

export class NS2ArenaCompute extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = Vpc.fromLookup(this, "DefaultVPC", { isDefault: true });

    const ns2ServerRepo = new Repository(this, "NS2ServerRepository", {
      imageTagMutability: TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    new NS2ServerTaskDefinition(this, "NS2ServerTaskDefinition", {
      ns2ServerRepo,
    });
    new NS2ArenaCluster(this, "ServerlessCluster", { vpc });
    new NS2ServerSecurityGroup(this, "NS2ServerSecurityGroup", { vpc });
  }
}
