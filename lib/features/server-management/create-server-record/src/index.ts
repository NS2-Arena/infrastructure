import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { ServerRecord } from "@ns2-arena/entities";

type LambdaHandler<T> = () => Promise<T>;

export const handler: LambdaHandler<{
  serverUuid: string;
}> = async () => {
  const client = new DynamoDBClient();
  const docClient = DynamoDBDocumentClient.from(client);

  const serverUuid = randomUUID();
  const record: ServerRecord = {
    id: serverUuid,
    state: "PROVISIONING",
  };

  const input = new PutCommand({
    TableName: process.env.ServerTableName!,
    Item: record,
    ConditionExpression: "attribute_not_exists(id)",
  });
  await docClient.send(input);

  return {
    serverUuid,
  };
};
