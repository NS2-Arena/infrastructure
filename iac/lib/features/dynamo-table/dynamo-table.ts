import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { NagSuppressions } from "cdk-nag";
import { Construct } from "constructs";

interface NS2ArenaDynamoTableProps {
  name: string;
}

export class NS2ArenaDynamoTable extends Construct {
  constructor(scope: Construct, id: string, props: NS2ArenaDynamoTableProps) {
    super(scope, id);

    // TODO: Use Tablev2
    const table = new Table(this, "Table", {
      partitionKey: { name: "id", type: AttributeType.STRING },
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
        recoveryPeriodInDays: 35,
      },
      deletionProtection: true,
      billingMode: BillingMode.PAY_PER_REQUEST,
    });

    new StringParameter(this, "TableNameParameter", {
      stringValue: table.tableName,
      parameterName: `/NS2Arena/Tables/${props.name}/Name`,
    });

    new StringParameter(this, "TableArnParameter", {
      stringValue: table.tableArn,
      parameterName: `/NS2Arena/Tables/${props.name}/Arn`,
    });

    NagSuppressions.addResourceSuppressions(table, [
      {
        id: "NIST.800.53.R5-DynamoDBInBackupPlan",
        reason: "Not using AWS Backup",
      },
    ]);
  }
}
