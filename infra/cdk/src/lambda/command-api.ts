import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

type CommandStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

type CreateCommandRequest = {
  commandType: string;
  payload: Record<string, unknown>;
};

const allowedCommandTypes = new Set([
  'meeting.join.now',
  'meeting.share_screen.start',
  'note.capture',
  'note.export',
  'devtask.submit',
]);

const forbiddenPayloadAliases: Record<string, string[]> = {
  'devtask.submit': ['repo'],
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

type CommandRecord = {
  command_id: string;
  command_type: string;
  payload: Record<string, unknown>;
  status: CommandStatus;
  created_at: string;
  updated_at: string;
  audit_id: string;
};

const json = (
  statusCode: number,
  body: Record<string, unknown>,
  auditId?: string,
): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    'content-type': 'application/json',
    ...(auditId ? { 'x-audit-id': auditId } : {}),
  },
  body: JSON.stringify(body),
});

const getAuditId = (event: APIGatewayProxyEvent): string =>
  event.headers['x-audit-id'] ?? event.headers['X-Audit-Id'] ?? randomUUID();

const hasAuthenticatedPrincipal = (event: APIGatewayProxyEvent): boolean => {
  const authorizer = event.requestContext.authorizer;
  const jwtClaims = (authorizer as { jwt?: { claims?: Record<string, unknown> } } | undefined)?.jwt?.claims;
  const cognitoClaims = (authorizer as { claims?: Record<string, unknown> } | undefined)?.claims;

  return Boolean((jwtClaims && Object.keys(jwtClaims).length > 0) || (cognitoClaims && Object.keys(cognitoClaims).length > 0));
};

function validatePayloadSchema(commandType: string, payload: Record<string, unknown>): void {
  if (commandType === 'meeting.join.now') {
    if (typeof payload.url !== 'string' || payload.url.length === 0) {
      throw new Error('payload.url is required');
    }

    return;
  }

  if (commandType === 'meeting.share_screen.start') {
    if (typeof payload.source !== 'string' || payload.source.length === 0) {
      throw new Error('payload.source is required');
    }

    return;
  }

  if (commandType === 'note.capture') {
    if (typeof payload.content !== 'string' || payload.content.length === 0) {
      throw new Error('payload.content is required');
    }

    return;
  }

  if (commandType === 'note.export') {
    if (typeof payload.repo !== 'string' || payload.repo.length === 0) {
      throw new Error('payload.repo is required');
    }

    return;
  }

  if (commandType === 'devtask.submit') {
    if (typeof payload.repository !== 'string' || payload.repository.length === 0) {
      throw new Error('payload.repository is required');
    }
    if (typeof payload.task !== 'string' || payload.task.length === 0) {
      throw new Error('payload.task is required');
    }
  }
}

function validateForbiddenAliases(commandType: string, payload: Record<string, unknown>): void {
  const aliases = forbiddenPayloadAliases[commandType] ?? [];
  for (const alias of aliases) {
    if (alias in payload) {
      throw new Error(`payload.${alias} is forbidden; use canonical keys only`);
    }
  }
}

export const validateCreateCommand = (body: string | null): CreateCommandRequest => {
  if (!body) {
    throw new Error('request body is required');
  }

  const parsed = JSON.parse(body) as Partial<CreateCommandRequest>;
  if (!parsed.commandType || typeof parsed.commandType !== 'string') {
    throw new Error('commandType is required');
  }
  if (!allowedCommandTypes.has(parsed.commandType)) {
    throw new Error('commandType is unsupported');
  }
  if (!isPlainObject(parsed.payload)) {
    throw new Error('payload is required');
  }

  validateForbiddenAliases(parsed.commandType, parsed.payload);
  validatePayloadSchema(parsed.commandType, parsed.payload);

  return {
    commandType: parsed.commandType,
    payload: parsed.payload as Record<string, unknown>,
  };
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const auditId = getAuditId(event);
  const commandTableName = process.env.COMMAND_TABLE_NAME ?? '';
  const stateTableName = process.env.STATE_TABLE_NAME ?? '';

  if (!commandTableName || !stateTableName) {
    return json(500, { message: 'table names are not configured' }, auditId);
  }

  if (!hasAuthenticatedPrincipal(event)) {
    return json(401, { message: 'authentication is required', auditId }, auditId);
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
        updated_at: now,
        audit_id: auditId,
      };

      await ddb.send(
        new PutCommand({
          TableName: commandTableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(command_id)',
        }),
      );

      await ddb.send(
        new PutCommand({
          TableName: stateTableName,
          Item: {
            command_id: commandId,
            updated_at: now,
            status: item.status,
            audit_id: auditId,
          },
        }),
      );

      return json(201, { commandId, status: item.status, auditId }, auditId);
    }

    if (event.httpMethod === 'GET' && event.resource === '/v1/commands/{id}') {
      const commandId = event.pathParameters?.id;
      if (!commandId) {
        return json(400, { message: 'id is required', auditId }, auditId);
      }

      const result = await ddb.send(
        new GetCommand({
          TableName: commandTableName,
          Key: { command_id: commandId },
        }),
      );

      if (!result.Item) {
        return json(404, { message: 'command not found', auditId }, auditId);
      }

      return json(200, { command: result.Item, auditId }, auditId);
    }

    if (event.httpMethod === 'POST' && event.resource === '/v1/commands/{id}/cancel') {
      const commandId = event.pathParameters?.id;
      if (!commandId) {
        return json(400, { message: 'id is required', auditId }, auditId);
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
            ':updatedAt': now,
          },
          ReturnValues: 'ALL_NEW',
        }),
      );

      await ddb.send(
        new PutCommand({
          TableName: stateTableName,
          Item: {
            command_id: commandId,
            updated_at: now,
            status: 'cancelled',
            audit_id: auditId,
          },
        }),
      );

      return json(200, { command: updateResult.Attributes, auditId }, auditId);
    }

    return json(404, { message: 'not found', auditId }, auditId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal server error';
    if (
      message.includes('is required') ||
      message.includes('unsupported') ||
      message.includes('forbidden')
    ) {
      return json(400, { message, auditId }, auditId);
    }

    return json(500, { message: 'internal server error', auditId }, auditId);
  }
};
