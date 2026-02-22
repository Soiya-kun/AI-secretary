import test from 'node:test';
import assert from 'node:assert/strict';
import { handler, validateCreateCommand } from './command-api';

test('validateCreateCommand parses valid payload', () => {
  const request = validateCreateCommand(
    JSON.stringify({
      commandType: 'devtask.submit',
      payload: { title: 'Add tests' }
    })
  );

  assert.equal(request.commandType, 'devtask.submit');
  assert.deepEqual(request.payload, { title: 'Add tests' });
});

test('validateCreateCommand rejects missing body', () => {
  assert.throws(() => validateCreateCommand(null), /request body is required/);
});

test('validateCreateCommand rejects missing commandType', () => {
  assert.throws(
    () => validateCreateCommand(JSON.stringify({ payload: { title: 'x' } })),
    /commandType is required/
  );
});


test('validateCreateCommand rejects unsupported commandType', () => {
  assert.throws(
    () =>
      validateCreateCommand(
        JSON.stringify({
          commandType: 'assistant.ask',
          payload: { title: 'x' }
        })
      ),
    /commandType is unsupported/
  );
});

test('validateCreateCommand rejects non-object payload', () => {
  assert.throws(
    () =>
      validateCreateCommand(
        JSON.stringify({
          commandType: 'devtask.submit',
          payload: ['invalid']
        })
      ),
    /payload is required/
  );
});

test('handler rejects unauthenticated requests', async () => {
  process.env.COMMAND_TABLE_NAME = 'commands';
  process.env.STATE_TABLE_NAME = 'state';

  const response = await handler({
    httpMethod: 'GET',
    resource: '/v1/commands/{id}',
    body: null,
    headers: {},
    pathParameters: { id: 'cmd-1' },
    requestContext: {}
  } as never);

  assert.equal(response.statusCode, 401);
  const body = JSON.parse(response.body) as { message: string; auditId: string };
  assert.equal(body.message, 'authentication is required');
  assert.ok(body.auditId.length > 0);
  assert.ok(response.headers);
  assert.ok(response.headers['x-audit-id']);
});
