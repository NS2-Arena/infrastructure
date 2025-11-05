import { ITable, Table } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { SSMParameters } from "../ssm-parameter-management/ssm-parameters";
import { Stack } from "aws-cdk-lib";
import { SSMParameterReader } from "../ssm-parameter-management/ssm-parameter-reader";
import { Variable } from "aws-cdk-lib/aws-codepipeline";
import { Variables } from "../../../bin/variables";

interface DynamoTables {
  ServerTable: ITable;
}

export class DynamoTableFetcher {
  private static instance: DynamoTableFetcher;
  private static stackLogicalId: string;
  private tables: DynamoTables;

  public static getInstance(scope: Construct): DynamoTableFetcher {
    const stackId = Stack.of(scope).node.id;
    if (
      DynamoTableFetcher.instance === undefined ||
      stackId !== DynamoTableFetcher.stackLogicalId
    ) {
      DynamoTableFetcher.instance = new DynamoTableFetcher(scope);
      DynamoTableFetcher.stackLogicalId = stackId;
    }

    return DynamoTableFetcher.instance;
  }

  constructor(scope: Construct) {
    // Fetch all tables from SSM Paramters
    const mainRegion = Variables.getMainRegion();
    const serverTableArn = SSMParameterReader.readStringParameter(
      scope,
      "ServerTableArn",
      {
        parameterName: SSMParameters.Tables.Servers.Arn,
        region: mainRegion,
      }
    );
    const serverTable = Table.fromTableArn(
      scope,
      "ServerTable",
      serverTableArn
    );

    this.tables = {
      ServerTable: serverTable,
    };
  }

  public getTables(): DynamoTables {
    return this.tables;
  }
}
