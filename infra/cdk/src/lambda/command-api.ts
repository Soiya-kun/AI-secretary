import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const commandTableName = process.env.COMMAND_TABLE_NAME ?? '';
const stateTableName = process.env.STATE_TABLE_NAME ?? '';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type CommandStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

type CreateCommandRequest = {
  commandType: string;
  payload: Record<string, unknown>;
};

type CommandRecord = {
  command_id: string;
  command_type: string;
  payload: Record<string, unknown>;
  status: CommandStatus;
  created_at: string;
  updated_at: string;
};

const json = (statusCode: number, body: Record<string, unknown>): APIGatewayProxyResult => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

export const validateCreateCommand = (body: string | null): CreateCommandRequest => {
  if (!body) {
    throw new Error('request body is required');
  }

  const parsed = JSON.parse(body) as Partial<CreateCommandRequest>;
  if (!parsed.commandType || typeof parsed.commandType !== 'string') {
    throw new Error('commandType is required');
  }
  if (!parsed.payload || typeof parsed.payload !== 'object') {
    throw new Error('payload is required');
  }

  return {
    commandType: parsed.commandType,
    payload: parsed.payload as Record<string, unknown>
  };
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!commandTableName || !stateTableName) {
    return json(500, { message: 'table names are not configured' });
  }

  try {
    if (event.httpMethod === 'POST' && event.resource === '/v1/commands') {
      const request = validateCreateCommand(event.body);
      const now = new Date().toISOString();
      const commandId = randomUUID();
      const item: CommandRecord = {
        command_id: commandId,
        command_type: request.commandType,
        payload: request.payload,
        status: 'queued',
        created_at: now,
        updated_at: now
      };

      await ddb.send(
        new PutCommand({
          TableName: commandTableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(command_id)'
        })
      );

      await ddb.send(
        new PutCommand({
          TableName: stateTableName,
          Item: {
            command_id: commandId,
            updated_at: now,
            status: item.status
          }
        })
      );

      return json(201, { commandId, status: item.status });
    }

    if (event.httpMethod === 'GET' && event.resource === '/v1/commands/{id}') {
      const commandId = event.pathParameters?.id;
      if (!commandId) {
        return json(400, { message: 'id is required' });
      }

      const result = await ddb.send(
        new GetCommand({
          TableName: commandTableName,
          Key: { command_id: commandId }
        })
      );

      if (!result.Item) {
        return json(404, { message: 'command not found' });
      }

      return json(200, { command: result.Item });
    }

    if (event.httpMethod === 'POST' && event.resource === '/v1/commands/{id}/cancel') {
      const commandId = event.pathParameters?.id;
      if (!commandId) {
        return json(400, { message: 'id is required' });
      }

      const now = new Date().toISOString();
      const updateResult = await ddb.send(
        new UpdateCommand({
          TableName: commandTableName,
          Key: { command_id: commandId },
          UpdateExpression: 'SET #status = :cancelled, updated_at = :updatedAt',
          ConditionExpression: '#status IN (:queued, :running)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':cancelled': 'cancelled',
            ':queued': 'queued',
            ':running': 'running',
            ':updatedAt': now
          },
          ReturnValues: 'ALL_NEW'
        })
      );

      await ddb.send(
        new PutCommand({
          TableName: stateTableName,
          Item: {
            command_id: commandId,
            updated_at: now,
            status: 'cancelled'
          }
        })
      );

      return json(200, { command: updateResult.Attributes });
    }

    return json(404, { message: 'route not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    if (message.includes('ConditionalCheckFailedException')) {
      return json(409, { message: 'command cannot transition to cancelled' });
    }

    if (message.includes('Unexpected token') || message.includes('is required')) {
      return json(400, { message });
    }

    return json(500, { message });
  }
};
