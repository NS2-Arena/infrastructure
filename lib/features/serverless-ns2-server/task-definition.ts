import { IRepository } from "aws-cdk-lib/aws-ecr";
import {
  ContainerImage,
  Ec2TaskDefinition,
  LogDriver,
  NetworkMode,
  PlacementConstraint,
  Protocol,
} from "aws-cdk-lib/aws-ecs";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { IBucket } from "aws-cdk-lib/aws-s3";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";
import { SSMParameters } from "../ssm-parameter-management/ssm-parameters";
import { EcrRepoInfo } from "./ecr-repo-info";

type NS2ServerTaskDefinitionProps = {
  ns2ServerRepo: IRepository;
  configBucket: IBucket;
};

export default class NS2ServerTaskDefinition extends Construct {
  public readonly taskRole: Role;
  public readonly taskDefinition: Ec2TaskDefinition;

  constructor(
    scope: Construct,
    id: string,
    props: NS2ServerTaskDefinitionProps
  ) {
    super(scope, id);

    const { ns2ServerRepo, configBucket } = props;

    const configBucketName = StringParameter.fromStringParameterName(
      scope,
      "ConfigBucketNameParameter",
      SSMParameters.ConfigBucket.Name
    );

    const ns2ServerTaskRole = new Role(scope, "TaskRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    configBucketName.grantRead(ns2ServerTaskRole);
    configBucket.grantRead(ns2ServerTaskRole);

    this.taskDefinition = new Ec2TaskDefinition(this, "TaskDefinition", {
      taskRole: ns2ServerTaskRole,
      networkMode: NetworkMode.HOST,
      placementConstraints: [
        PlacementConstraint.memberOf("runningTasksCount == 0"),
      ],
    });

    this.taskRole = ns2ServerTaskRole;

    this.taskDefinition.addContainer(EcrRepoInfo.Containers.Ns2Server, {
      image: ContainerImage.fromEcrRepository(ns2ServerRepo),
      portMappings: [
        { containerPort: 27015, hostPort: 27015, protocol: Protocol.TCP },
        { containerPort: 27016, hostPort: 27016, protocol: Protocol.TCP },
        { containerPort: 27017, hostPort: 27017, protocol: Protocol.TCP },
        { containerPort: 27015, hostPort: 27015, protocol: Protocol.UDP },
        { containerPort: 27016, hostPort: 27016, protocol: Protocol.UDP },
        { containerPort: 27017, hostPort: 27017, protocol: Protocol.UDP },
      ],
      cpu: 1024,
      memoryLimitMiB: 1536,
      logging: LogDriver.awsLogs({
        streamPrefix: "/NS2Arena/NS2-Servers",
        logRetention: RetentionDays.ONE_WEEK,
      }),
      essential: true,
      privileged: true,
      user: "ns2arena",
    });
  }
}
