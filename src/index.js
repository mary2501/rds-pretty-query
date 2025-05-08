#!/usr/bin/env node

import { spawn as originalSpawn } from 'child_process';
import { fileURLToPath } from 'url'; // Needed to get the script's file path in ESM

// Get the equivalent of __filename in ES Modules
const __filename = fileURLToPath(import.meta.url);

/**
 * Executes an AWS RDS Data API execute-statement command using the AWS CLI.
 * This function is designed to be testable by accepting the spawn function as a dependency.
 *
 * @param {function} spawnFunc - The function to use for spawning the child process (e.g., require('child_process').spawn or a mock).
 * @param {string[]} args - An array of arguments to pass to the AWS CLI command (e.g., ['--resource-arn', '...', '--sql', '...']).
 * @returns {Promise<{success: boolean, results?: object, message?: string, error?: Error}>} A promise that resolves with the parsed results or a success message, or rejects with an error.
 */
export async function executeAwsStatement(spawnFunc, args) {
    // Validate minimum required arguments (simplified check for demonstration)
    // A more robust check might use a library or check for specific flags like --resource-arn, --secret-arn, --sql
    if (!args || args.length === 0 || !args.some(arg => arg.startsWith('--sql'))) {
        // Throw an error instead of calling process.exit directly
        throw new Error("Missing required arguments for AWS CLI command.");
    }

    // Build the command arguments for AWS CLI
    const awsCommandArgs = [
        'rds-data',
        'execute-statement',
        '--include-result-metadata', // Ensure this flag is always present
        ...args // Add all arguments provided by the user
    ];

    // Use the provided spawn function to execute the AWS CLI command
    const awsProcess = spawnFunc('aws', awsCommandArgs);

    let output = ''; // String to accumulate standard output
    let errorOutput = ''; // String to accumulate standard error

    // Listen for data on standard output
    awsProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    // Listen for data on standard error
    awsProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    // Return a Promise that resolves or rejects based on the child process outcome
    return new Promise((resolve, reject) => {
        // Listen for the 'error' event on the child process (e.g., command not found)
        awsProcess.on('error', (err) => {
            // Reject the promise with a specific error indicating spawn failure
            reject(new Error(`Failed to start subprocess: ${err.message}`));
        });

        // Listen for the 'close' event when the child process exits
        awsProcess.on('close', (code) => {
            // If the exit code is non-zero, the AWS command failed
            if (code !== 0) {
                // Reject the promise with an error including the exit code and stderr output
                reject(new Error(`Error executing the command (code ${code}):\n${errorOutput}`));
            } else {
                // If the exit code is 0, try to process the output
                try {
                    // If there's no output, it might be a successful command with no results (like INSERT/UPDATE)
                    if (!output.trim()) {
                        resolve({success: true, message: 'Command run successfully. No results to display.'});
                        return;
                    }

                    // Attempt to parse the output as JSON
                    const result = JSON.parse(output);

                    // Check if 'records' array exists and is an array (typical for SELECT)
                    if (Array.isArray(result.records)) {
                        // Resolve with the parsed results object
                        resolve({success: true, results: result});
                    } else {
                        // Otherwise, assume it's a successful command without a standard result set
                        resolve({success: true, message: 'Command run successfully. No results to display.'});
                    }

                } catch (e) {
                    // If JSON parsing fails, reject the promise with a parsing error
                    reject(new Error(`Error during the parsing of the output or invalid JSON:\n${e.message}\nOutput not valid JSON:\n${output}`));
                }
            }
        });
    });
}

// --- Entry Point for Command Line Execution ---
// This block runs only when the script is executed directly (e.g., node src/index.js)
// It handles command line arguments, calls the core logic, and manages process exit/output.
// Get the arguments passed from the command line
const commandLineArgs = process.argv.slice(2);

// Call the core logic function, injecting the real spawn function
executeAwsStatement(originalSpawn, commandLineArgs)
    .then(output => {
        // Handle successful execution output
        if (output.results) {
            // --- Output Formatting Logic (can be extracted to a helper if complex) ---
            // This part is primarily for presenting results to the user via CLI
            const result = output.results;
            const columnNames = result.columnMetadata ? result.columnMetadata.map(col => col.name) : [];
            const rows = result.records.map(row =>
                row.map(cell => {
                    const value = Object.values(cell)[0];
                    return value === null ? null : value;
                })
            );

            // Print the number of records (rows)
            console.log(`\n📊 Results (${rows.length}):\n`);

            const colWidths = [];
            const dataToMeasure = columnNames.length > 0 ? [columnNames, ...rows] : rows;

            for (const row of dataToMeasure) {
                row.forEach((val, i) => {
                    const len = String(val ?? '').length;
                    colWidths[i] = Math.max(colWidths[i] || 0, len);
                });
            }

            if (columnNames.length > 0) {
                const headerLine = columnNames
                    .map((name, i) => String(name ?? '').padEnd(colWidths[i]))
                    .join(' | ');
                console.log('  ', headerLine);

                console.log('  ', colWidths.map(w => '-'.repeat(w)).join(' | '));
            }

            rows.forEach(row => {
                const line = row
                    .map((val, i) => String(val ?? '').padEnd(colWidths[i]))
                    .join(' | ');
                console.log('•', line);
            });
            // --- End Output Formatting Logic ---

        } else {
            // Print success message for commands without standard results
            console.log(output.message);
        }
        process.exit(0); // Exit with success code
    })
    .catch(error => {
        // Handle errors by printing to console.error and exiting with a non-zero code
        console.error(`❌ ${error.message}`);
        process.exit(1); // Exit with a generic error code for simplicity
        // Could parse error.message to determine a more specific exit code if needed
    });

