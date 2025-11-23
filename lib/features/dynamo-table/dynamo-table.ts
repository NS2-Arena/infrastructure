import {
  AttributeType,
  Billing,
  TablePropsV2,
  TableV2,
} from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { SSMParameterWriter } from "../ssm-parameter-management/ssm-parameter-writer";
import { SSMParameters } from "../ssm-parameter-management/ssm-parameters";

interface NS2ArenaDynamoTableProps {
  readonly tableName: string;
  readonly replicationRegions: string[];
  readonly tableProps?: TablePropsV2;
}

export class NS2ArenaDynamoTable extends Construct {
  constructor(scope: Construct, id: string, props: NS2ArenaDynamoTableProps) {
    super(scope, id);

    const { tableName, tableProps, replicationRegions } = props;

    // TODO: Use Tablev2
    const table = new TableV2(this, "Table", {
      ...tableProps,
      partitionKey: { name: "id", type: AttributeType.STRING },
      // pointInTimeRecoverySpecification: {
      //   pointInTimeRecoveryEnabled: true,
      //   recoveryPeriodInDays: 35,
      // },
      deletionProtection: true,
      replicas: replicationRegions.map((region) => ({ region: region })),
      billing: Billing.onDemand(),
    });

    SSMParameterWriter.writeStringParameter(this, "TableNameParameter", {
      stringValue: table.tableName,
      parameterName: SSMParameters.Tables.Servers.Name,
    });

    SSMParameterWriter.writeStringParameter(this, "TableArnParameter", {
      stringValue: table.tableArn,
      parameterName: SSMParameters.Tables.Servers.Arn,
    });

    replicationRegions.forEach((region) => {
      const replicaTable = table.replica(region);
      SSMParameterWriter.writeStringParameter(this, "TableNameParameter", {
        stringValue: replicaTable.tableName,
        parameterName: SSMParameters.Tables.Servers.Name,
        region,
      });

      SSMParameterWriter.writeStringParameter(this, "TableArnParameter", {
        stringValue: replicaTable.tableArn,
        parameterName: SSMParameters.Tables.Servers.Arn,
        region,
      });
    });
  }
}
