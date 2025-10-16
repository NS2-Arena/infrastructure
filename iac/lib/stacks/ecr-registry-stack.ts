import { RemovalPolicy } from "aws-cdk-lib";
import {
  CfnReplicationConfiguration,
  Repository,
  TagMutability,
} from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { BaseStack, BaseStackProps } from "./base-stack";

interface EcrRegistryStackProps extends BaseStackProps {
  readonly replicationRegions: string[];
}

export class EcrRegistryStack extends BaseStack {
  public readonly repository: Repository;

  constructor(scope: Construct, id: string, props: EcrRegistryStackProps) {
    super(scope, id, props);

    this.repository = new Repository(this, "NS2ServerRepository", {
      imageTagMutability: TagMutability.IMMUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      imageScanOnPush: true,
      repositoryName: "ns2arena/ns2-server",
    });

    new CfnReplicationConfiguration(this, "ReplicationConfig", {
      replicationConfiguration: {
        rules: [
          {
            destinations: props.replicationRegions.map((region) => ({
              region: region,
              registryId: this.account,
            })),
            repositoryFilters: [
              {
                filter: "ns2arena/",
                filterType: "PREFIX_MATCH",
              },
            ],
          },
        ],
      },
    });
  }
}
