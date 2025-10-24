import { App } from "aws-cdk-lib";
import { BaseStack, BaseStackProps } from "./base-stack";
import { NS2ArenaDynamoTable } from "../features/dynamo-table/dynamo-table";

export class DatabaseStack extends BaseStack {
  constructor(scope: App, id: string, props: BaseStackProps) {
    super(scope, id, props);

    new NS2ArenaDynamoTable(this, "ServersTable", {
      tableName: "Servers",
    });
  }
}
