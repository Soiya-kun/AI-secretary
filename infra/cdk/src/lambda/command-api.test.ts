import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCreateCommand } from './command-api';

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
