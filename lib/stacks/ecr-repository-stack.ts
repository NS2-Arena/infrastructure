import { RemovalPolicy } from "aws-cdk-lib";
import {
  CfnReplicationConfiguration,
  Repository,
  TagMutability,
  TagStatus,
} from "aws-cdk-lib/aws-ecr";
import { Construct } from "constructs";
import { BaseStack, BaseStackProps } from "./base-stack";
import { SSMParameterWriter } from "../features/ssm-parameter-management/ssm-parameter-writer";
import { SSMParameters } from "../features/ssm-parameter-management/ssm-parameters";

interface EcrRegistryStackProps extends BaseStackProps {
  readonly replicationRegions: string[];
}

export class EcrReRepositoryStack extends BaseStack {
  public readonly repository: Repository;

  constructor(scope: Construct, id: string, props: EcrRegistryStackProps) {
    super(scope, id, props);

    const { replicationRegions } = props;

    this.repository = new Repository(this, "NS2ServerRepository", {
      imageTagMutability: TagMutability.MUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      imageScanOnPush: true,
      repositoryName: "ns2arena/ns2-server",
      lifecycleRules: [
        {
          rulePriority: 1,
          tagStatus: TagStatus.ANY,
          maxImageCount: 1,
        },
      ],
    });

    SSMParameterWriter.writeStringParameter(this, "RegistryParameter", {
      stringValue: this.repository.repositoryName,
      parameterName: SSMParameters.ImageRepositories.NS2Server.Name,
    });

    if (replicationRegions.length > 0) {
      new CfnReplicationConfiguration(this, "ReplicationConfig", {
        replicationConfiguration: {
          rules: [
            {
              destinations: replicationRegions.map((region) => ({
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
}
