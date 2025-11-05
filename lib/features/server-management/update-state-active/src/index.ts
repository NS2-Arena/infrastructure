import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ServerRecordState } from "@ns2-arena/entities";

type LambdaHandler<T> = (event: UpdateStateActiveEvent) => Promise<T>;

interface UpdateStateActiveEvent {
  serverUuid: string;
  resumeToken: string;
}

export const handler: LambdaHandler<void> = async (
  event: UpdateStateActiveEvent
) => {
  const { serverUuid, resumeToken } = event;

  const client = new DynamoDBClient();
  const docClient = DynamoDBDocumentClient.from(client);

  const input = new UpdateCommand({
    TableName: process.env.ServerTableName!,
    Key: { id: serverUuid },
    UpdateExpression: "SET #state = :state, #resumeToken = :resumeToken",
    ExpressionAttributeNames: {
      "#state": "state",
      "#resumeToken": "resumeToken",
    },
    ExpressionAttributeValues: {
      ":state": "ACTIVE" as ServerRecordState,
      ":resumeToken": resumeToken,
    },
    ConditionExpression: "attribute_exists(id)",
  });
  await docClient.send(input);
};
