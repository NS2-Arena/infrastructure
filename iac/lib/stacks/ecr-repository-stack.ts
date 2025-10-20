import { RemovalPolicy } from "aws-cdk-lib";
import {
  CfnReplicationConfiguration,
  Repository,
  TagMutability,
  TagStatus,
} from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { BaseStack, BaseStackProps } from "./base-stack";
import { StringParameter } from "aws-cdk-lib/aws-ssm";

interface EcrRegistryStackProps extends BaseStackProps {
  readonly replicationRegions: string[];
}

export class EcrReRepositoryStack extends BaseStack {
  public readonly repository: Repository;

  constructor(scope: Construct, id: string, props: EcrRegistryStackProps) {
    super(scope, id, props);

    this.repository = new Repository(this, "NS2ServerRepository", {
      imageTagMutability: TagMutability.MUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      imageScanOnPush: true,
      repositoryName: "ns2arena/ns2-server",
      lifecycleRules: [
        {
          rulePriority: 1,
          tagStatus: TagStatus.UNTAGGED,
          maxImageCount: 1,
        },
      ],
    });

    new StringParameter(this, "RegistryParameter", {
      stringValue: this.repository.repositoryName,
      parameterName: "/NS2Arena/ImageRepositories/ns2-server",
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
