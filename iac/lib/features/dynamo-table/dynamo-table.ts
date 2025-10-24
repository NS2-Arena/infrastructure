import {
  AttributeType,
  BillingMode,
  Table,
  TableProps,
} from "aws-cdk-lib/aws-dynamodb";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";
import { SSMParameterWriter } from "../ssm-parameter-management/ssm-parameter-writer";

interface NS2ArenaDynamoTableProps {
  readonly tableName: string;
  readonly tableProps?: TableProps;
}

export class NS2ArenaDynamoTable extends Construct {
  constructor(scope: Construct, id: string, props: NS2ArenaDynamoTableProps) {
    super(scope, id);

    const { tableName, tableProps } = props;

    // TODO: Use Tablev2
    const table = new Table(this, "Table", {
      ...tableProps,
      partitionKey: { name: "id", type: AttributeType.STRING },
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
        recoveryPeriodInDays: 35,
      },
      deletionProtection: true,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    SSMParameterWriter.writeStringParameter(this, "TableNameParameter", {
      stringValue: table.tableName,
      parameterName: `/NS2Arena/Tables/${tableName}/Name`,
    });

    SSMParameterWriter.writeStringParameter(this, "TableArnParameter", {
      stringValue: table.tableArn,
      parameterName: `/NS2Arena/Tables/${tableName}/Arn`,
    });

    NagSuppressions.addResourceSuppressions(table, [
      {
        id: "NIST.800.53.R5-DynamoDBInBackupPlan",
        reason: "Not using AWS Backup",
      },
    ]);
  }
}
