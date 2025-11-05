import { Duration } from "aws-cdk-lib";
import { Architecture } from "aws-cdk-lib/aws-lambda";
import {
  NodejsFunction,
  NodejsFunctionProps,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { DynamoTableFetcher } from "../dynamo-table/dynamo-tables-fetcher";
import {
  Effect,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { NagSuppressions } from "cdk-nag";

export interface BaseLambdaFunctionProps {
  entry: string;
  policyStatements: PolicyStatement[];
}

export class BaseLambdaFunction extends Construct {
  public readonly function: NodejsFunction;

  constructor(scope: Construct, id: string, props: BaseLambdaFunctionProps) {
    super(scope, id);

    const policy = new ManagedPolicy(this, "ExecutionPolicy", {
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
          ],
          resources: ["*"],
        }),
        ...props.policyStatements,
      ],
    });

    const role = new Role(this, "ExecutionRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [policy],
    });

    this.function = new NodejsFunction(this, "Function", {
      architecture: Architecture.ARM_64,
      memorySize: 128,
      timeout: Duration.seconds(15),
      handler: "index.handler",
      role: role,
      entry: props.entry,
    });

    const dynamoTables = DynamoTableFetcher.getInstance(this).getTables();
    this.function.addEnvironment(
      "ServerTableName",
      dynamoTables.ServerTable.tableName
    );

    // Nag Suppressions
    NagSuppressions.addResourceSuppressions(policy, [
      {
        id: "AwsSolutions-IAM5",
        appliesTo: ["Resource::*"],
        reason: "Wildcard required for CloudWatch logging",
      },
    ]);

    NagSuppressions.addResourceSuppressions(this.function, [
      {
        id: "Serverless-LambdaTracing",
        reason: "Not using tracing",
      },
      {
        id: "NIST.800.53.R5-LambdaConcurrency",
        reason: "Not using function level concurrency yet",
      },
      {
        id: "NIST.800.53.R5-LambdaInsideVPC",
        reason: "Not using VPC yet",
      },
    ]);

    NagSuppressions.addResourceSuppressions(this.function.logGroup, [
      {
        id: "NIST.800.53.R5-CloudWatchLogGroupEncrypted",
        reason: "TODO: Add cloudwatch encryption",
      },
    ]);
  }
}
