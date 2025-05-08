// test/index.test.js

// Import necessary modules from Node.js built-in test runner and assert library
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
// Import EventEmitter to create mock child process streams
import { EventEmitter } from 'events';
// Import path and url for handling file paths in ESM
import path from 'path';
import { fileURLToPath } from 'url';

// Import the refactored function from the main script file
// !!! ENSURE THIS PATH IS CORRECT RELATIVE TO THE LOCATION OF YOUR TEST FILE !!!
// If your script is in the project root and test is in test/, the path might be '../index.js' or '../rds-exec.js'
// If your script is in src/index.js and test is in test/, the path is '../src/index.js'
import { executeAwsStatement } from '../src/index.js'; // <-- ADJUST THIS IF NECESSARY

// Get __dirname equivalent in ES Modules for resolving paths if needed
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// --- Manual Mocking Setup for the injected spawn function ---

// Array to record calls made to the mock spawn function
let mockSpawnCalls = [];

// Mock child_process instance and its streams (created fresh for each test)
let mockChildProcessInstance;


/**
 * Mock implementation of child_process.spawn.
 * Records the call arguments and returns a mock EventEmitter instance.
 * @param {string} command - The command being spawned.
 * @param {string[]} args - Arguments passed to the command.
 * @param {object} [options] - Spawn options.
 * @returns {EventEmitter} A mock EventEmitter instance with stdout and stderr properties.
 */
const mockSpawn = (command, args, options) => {
  // Record the call to our spy array
  mockSpawnCalls.push({ command, args, options });

  // Use the mock instance created in beforeEach
  // Return the mock EventEmitter instance to simulate the child process object
  return mockChildProcessInstance;
};


// --- Setup and Teardown Hooks using node:test ---

beforeEach(() => {
  // Reset call history array for the mock spawn function before each test
  mockSpawnCalls = [];

  // Initialize a fresh mock child process instance and its streams for each test
  // These are EventEmitter instances to simulate stdout/stderr streams and the process itself
  mockChildProcessInstance = new EventEmitter();
  mockChildProcessInstance.stdout = new EventEmitter();
  mockChildProcessInstance.stderr = new EventEmitter();

  // We DO NOT need to mock console.log, console.error, or process.exit here
  // because the function being tested (executeAwsStatement) does not call them directly.
  // It returns a Promise that resolves with results/messages or rejects with errors.
  // The test asserts the Promise's outcome, not side effects like logging or exiting.
});

afterEach(() => {
  // Cleanup is minimal as we are not replacing global functions or manipulating module cache.
});


// --- Test Cases for the executeAwsStatement function ---

test('should call spawn with correct arguments including --include-result-metadata', async () => {
  const args = ['--resource-arn', 'arn:aws:rds:us-east-1:123456789012:cluster:my-db', '--secret-arn', 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret', '--database', 'mydatabase', '--sql', 'SELECT 1'];

  // Call the refactored function, injecting the mock spawn function
  // We don't need to wait for a timeout after this call, as the function's logic
  // is synchronous until the 'close' or 'error' event is emitted on the mock instance.
  const executionPromise = executeAwsStatement(mockSpawn, args);


  // Simulate the AWS CLI process closing successfully immediately after spawn is called
  // This will trigger the 'close' event handler inside executeAwsStatement,
  // which will attempt to parse output (which is empty initially) and resolve the promise.
  mockChildProcessInstance.emit('close', 0);

  // Wait for the promise returned by executeAwsStatement to resolve
  await executionPromise;


  // Assert that the mock spawn was called exactly once with the expected command and arguments
  assert.strictEqual(mockSpawnCalls.length, 1, 'spawn should have been called exactly once');
  const call = mockSpawnCalls[0]; // Get the first (and only) call
  assert.strictEqual(call.command, 'aws', `Spawn command mismatch. Expected: 'aws', Got: ${call.command}`);
  assert.deepStrictEqual(call.args, [
    'rds-data',
    'execute-statement',
    '--include-result-metadata',
    ...args // Ensure all user arguments were passed through
  ], `Spawn arguments mismatch.`);

  // No assertions needed for console.log/error or process.exit here, as the tested function doesn't call them.
});

test('should resolve with results for a successful SELECT with records', async () => {
  // Simulate the JSON output from a successful SELECT query
  const jsonOutput = JSON.stringify({
    columnMetadata: [
      { name: 'id', type: 'LONG' },
      { name: 'name', type: 'STRING' }
    ],
    records: [
      [{ longValue: 1 }, { stringValue: 'Alice' }],
      [{ longValue: 2 }, { stringValue: 'Bob' }]
    ]
  });

  // Call the refactored function with some arguments
  const executionPromise = executeAwsStatement(mockSpawn, ['--sql', 'SELECT * FROM users']);

  // Simulate the mock child process emitting the JSON data on stdout
  mockChildProcessInstance.stdout.emit('data', jsonOutput);
  // Simulate the mock child process closing successfully
  mockChildProcessInstance.emit('close', 0);

  // Wait for the promise returned by executeAwsStatement to resolve
  const result = await executionPromise;

  // Assert the structure and content of the resolved result object
  assert.ok(result.success, 'Result should indicate success');
  assert.ok(result.results, 'Result should contain results object');
  assert.deepStrictEqual(result.results.records, [
    [{ longValue: 1 }, { stringValue: 'Alice' }],
    [{ longValue: 2 }, { stringValue: 'Bob' }]
  ], 'Resolved result records should match expected JSON');
  assert.deepStrictEqual(result.results.columnMetadata.map(c => c.name), ['id', 'name'], 'Resolved result column names should match expected JSON');

  // Verify spawn was called correctly (optional, already tested in the first test, but good for isolation)
  assert.strictEqual(mockSpawnCalls.length, 1, 'spawn should have been called once');
});

// Handles successful SELECT with empty records array
test('should resolve with results containing empty records array for successful SELECT with no rows', async () => {
  // Simulate JSON output for a SELECT with no records
  const jsonOutputEmptyRecords = JSON.stringify({
    columnMetadata: [
      { name: 'id', type: 'LONG' },
      { name: 'name', type: 'STRING' }
    ],
    records: [] // No records
  });

  // Test case: SELECT with empty records array
  const executionPromise = executeAwsStatement(mockSpawn, ['--sql', 'SELECT * FROM users WHERE id > 100']);
  mockChildProcessInstance.stdout.emit('data', jsonOutputEmptyRecords);
  mockChildProcessInstance.emit('close', 0);
  const result = await executionPromise;

  // Assert that it resolves with a results object, and that object's records property is an empty array
  assert.ok(result.success, 'Result should indicate success for empty records');
  assert.ok(result.results, 'Result should contain results object');
  assert.deepStrictEqual(result.results.records, [], 'Resolved results.records should be an empty array');
  assert.deepStrictEqual(result.results.columnMetadata.map(c => c.name), ['id', 'name'], 'Resolved result column names should match expected JSON');
  assert.strictEqual(result.message, undefined, 'Result should NOT have a message property for empty results'); // Explicitly check message is undefined

  assert.strictEqual(mockSpawnCalls.length, 1, 'spawn should have been called once');
});

// Handles successful command with JSON output that is not an array (like INSERT/UPDATE/DDL) or empty output
test('should resolve with success message for successful command without records array (e.g., INSERT/UPDATE) or empty output', async () => {
  // Simulate JSON output for a command like INSERT/UPDATE/DDL (no 'records' or 'columnMetadata')
  const jsonOutputUpdate = JSON.stringify({
    numberOfRecordsUpdated: 1
    // No 'records' array and no 'columnMetadata'
  });

  // Test case 1: Command with other success output
  const executionPromiseUpdate = executeAwsStatement(mockSpawn, ['--sql', 'INSERT INTO users (name) VALUES (\'Charlie\')']);
  mockChildProcessInstance.stdout.emit('data', jsonOutputUpdate);
  mockChildProcessInstance.emit('close', 0);
  const resultUpdate = await executionPromiseUpdate;

  // Assert that it resolves with a success message
  assert.ok(resultUpdate.success, 'Result should indicate success for update');
  assert.strictEqual(resultUpdate.message, 'Command run successfully. No results to display.', 'Resolved message should indicate no results for update');
  assert.strictEqual(resultUpdate.results, undefined, 'Result should NOT have a results property for simple success'); // Explicitly check results is undefined
  assert.strictEqual(mockSpawnCalls.length, 1, 'spawn should have been called once for update'); // Check spawn was called again
  mockSpawnCalls = []; // Reset for the next part of this test


  // Test case 2: Empty output (which the script treats as success with no results)
  const executionPromiseEmpty = executeAwsStatement(mockSpawn, ['--sql', 'SELECT 1']); // Use a command that would normally produce output
  mockChildProcessInstance.stdout.emit('data', ''); // Simulate empty output
  mockChildProcessInstance.emit('close', 0);
  const resultEmpty = await executionPromiseEmpty;

  // Assert that it resolves with a success message
  assert.ok(resultEmpty.success, 'Result should indicate success for empty output');
  assert.strictEqual(resultEmpty.message, 'Command run successfully. No results to display.', 'Resolved message should indicate no results for empty output');
  assert.strictEqual(resultEmpty.results, undefined, 'Result should NOT have a results property for empty output'); // Explicitly check results is undefined
  assert.strictEqual(mockSpawnCalls.length, 1, 'spawn should have been called once for empty output'); // Check spawn was called again
});


test('should reject on AWS CLI failure (non-zero exit code)', async () => {
  const errorMessage = 'An error occurred in AWS CLI';
  const errorCode = 255;

  // Call the refactored function
  const executionPromise = executeAwsStatement(mockSpawn, ['--sql', 'SELECT * FROM non_existent_table']);

  // Simulate the mock child process emitting error data on stderr
  mockChildProcessInstance.stderr.emit('data', errorMessage);
  // Simulate the mock child process closing with a non-zero error code
  mockChildProcessInstance.emit('close', errorCode);

  // Assert that the promise returned by executeAwsStatement rejects with the expected error
  await assert.rejects(
      executionPromise,
      // Assert against an Error instance with the expected message
      new Error(`Error executing the command (code ${errorCode}):\n${errorMessage}`),
      'Promise should reject with error message on AWS CLI failure'
  );

  assert.strictEqual(mockSpawnCalls.length, 1, 'spawn should have been called once');
});

test('should reject on invalid JSON output', async () => {
  const invalidJson = 'This is not JSON';

  // Call the refactored function
  const executionPromise = executeAwsStatement(mockSpawn, ['--sql', 'SELECT * FROM users']);

  // Simulate the mock child process emitting invalid data on stdout
  mockChildProcessInstance.stdout.emit('data', invalidJson);
  // Simulate the mock child process closing successfully (the script should still fail on parsing)
  mockChildProcessInstance.emit('close', 0);

  // Assert that the promise rejects with a JSON parsing error
  await assert.rejects(
      executionPromise,
      // Use a regular expression to check for the expected error message part
      /Error during the parsing of the output or invalid JSON/,
      'Promise should reject with parsing error on invalid JSON'
  );

  assert.strictEqual(mockSpawnCalls.length, 1, 'spawn should have been called once');
});


test('should reject if spawn fails to start the process (e.g., command not found)', async () => {
  // Create a mock error object similar to what spawn would emit
  const spawnError = new Error('ENOENT: aws command not found');
  // Add the 'code' property that Node.js errors often have for system issues
  spawnError.code = 'ENOENT';


  // Call the refactored function
  const executionPromise = executeAwsStatement(mockSpawn, ['--sql', '...']);

  // Simulate the 'error' event being emitted on the mock child process instance
  mockChildProcessInstance.emit('error', spawnError);
  // Note: The 'close' event might or might not happen after 'error', depending on the cause.
  // The 'error' handler should be sufficient to reject the promise.

  // Assert that the promise rejects with the error from the 'error' event handler
  await assert.rejects(
      executionPromise,
      // Assert against an Error instance with the expected message
      new Error(`Failed to start subprocess: ${spawnError.message}`),
      'Promise should reject if spawn emits an error'
  );

  assert.strictEqual(mockSpawnCalls.length, 1, 'spawn should have been called once');
});

test('should reject if required arguments are missing', async () => {
  // Test case with missing --sql argument
  const args = ['--resource-arn', '...', '--secret-arn', '...'];
  const executionPromise = executeAwsStatement(mockSpawn, args);

  // Assert that the promise rejects with the expected error message
  await assert.rejects(
      executionPromise,
      // Assert against an Error instance with the expected message
      new Error("Missing required arguments for AWS CLI command."),
      'Promise should reject when missing required arguments'
  );

  // Verify spawn was NOT called in this case
  assert.strictEqual(mockSpawnCalls.length, 0, 'spawn should not have been called when arguments are missing');
});
