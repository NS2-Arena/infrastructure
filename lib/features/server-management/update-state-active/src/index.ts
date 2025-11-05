import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ServerRecordState } from "@ns2-arena/entities";

type LambdaHandler<T> = (event: UpdateStateActiveEvent) => Promise<T>;

interface UpdateStateActiveEvent {
  serverUuid: string;
}

export const handler: LambdaHandler<void> = async (
  event: UpdateStateActiveEvent
) => {
  const serverUuid = event.serverUuid;

  const client = new DynamoDBClient();
  const docClient = DynamoDBDocumentClient.from(client);

  const input = new UpdateCommand({
    TableName: process.env.ServerTableName!,
    Key: { id: serverUuid },
    UpdateExpression: "SET #state = :state",
    ExpressionAttributeNames: {
      "#state": "state",
    },
    ExpressionAttributeValues: {
      ":state": "ACTIVE" as ServerRecordState,
    },
    ConditionExpression: "attribute_exists(id)",
  });
  await docClient.send(input);
};
