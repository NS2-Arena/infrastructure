import { Construct } from "constructs";
import { BaseLambdaFunction } from "../../base-lambda/base-lambda";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { DynamoTableFetcher } from "../../dynamo-table/dynamo-tables-fetcher";
import { NagSuppressions } from "cdk-nag";

export class CreateServerRecord extends BaseLambdaFunction {
  constructor(scope: Construct, id: string) {
    const dynamoTables = DynamoTableFetcher.getInstance(scope).getTables();

    super(scope, id, {
      entry: "lib/features/server-management/create-server-record/src/index.ts",
      policyStatements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ["dynamodb:PutItem"],
          resources: [dynamoTables.ServerTable.tableArn],
        }),
      ],
    });

    NagSuppressions.addResourceSuppressions(this.function, [
      {
        id: "Serverless-LambdaDLQ",
        reason: "DLQ is not required",
      },
      {
        id: "NIST.800.53.R5-LambdaDLQ",
        reason: "DLQ is not required",
      },
    ]);
  }
}
