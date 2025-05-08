# rds-pretty-query

A command-line tool to execute queries against the RDS Data API via AWS CLI and format the output for readability.

## Description

`rds-pretty-query` is a simple Node.js script that acts as a wrapper around the `aws rds-data execute-statement` command. It runs the AWS CLI command with the provided parameters and processes the JSON output, transforming it into a formatted, easy-to-read table directly in your terminal. It is particularly useful for quickly running `SELECT` queries and visualizing the results without having to handle raw JSON.

## Prerequisites

Before using `rds-pretty-query`, ensure you have the following installed:

* **Node.js:** Version 14 or higher.
* **AWS CLI:** Configured with the correct credentials and region to access your RDS database.

## Installation

### Global Installation (Recommended for General Use)

If the package is published on npm (replace `rds-pretty-query` with the actual package name if different):

```bash
npm install -g rds-pretty-query
```

If you use Yarn:

```bash
yarn global add rds-pretty-query
```

### Local Installation (For Development or Testing)

If you are working directly on the source code or want to test it locally before publishing:

1.  Clone the repository (if applicable).
2.  Navigate to the project's root directory where `package.json` is located.
3.  Run the `npm link` command to create a global symbolic link to your local package:

```bash
npm link
```

After global installation or linking, the `rds-pretty-query` command will be available anywhere in your terminal.

## Usage

The `rds-pretty-query` command accepts the same arguments as the `aws rds-data execute-statement` command, with the guarantee that the `--include-result-metadata` flag is always included to enable output formatting.

The minimum required arguments are generally:

* `--resource-arn <your-database-arn>`: The Amazon Resource Name (ARN) of your RDS database cluster or instance.
* `--secret-arn <your-secret-arn>`: The ARN of the Secrets Manager secret containing the credentials to connect to the database.
* `--sql <your-sql-query>`: The SQL query to execute.

Other common arguments include:

* `--database <database-name>`: The name of the database to connect to within the cluster/instance.

**General Syntax:**

```bash
rds-pretty-query --resource-arn <arn> --secret-arn <secret-arn> --sql "<your-sql-query>" [other-aws-cli-arguments]
```

**Example:**

```bash
rds-pretty-query \
  --resource-arn arn:aws:rds:us-east-1:123456789012:cluster:my-database-cluster \
  --secret-arn arn:aws:secretsmanager:us-east-1:123456789012:secret:my-db-credentials-AbCdEf \
  --database mydatabase \
  --sql "SELECT id, name, created_at FROM users LIMIT 5;"
```

**Example Output (Formatted):**

```
📊 Results (5):

  id | name  | created_at
  ---|-------|------------
  • 1 | Alice | 2023-10-27
  • 2 | Bob   | 2023-10-27
  • 3 | Charlie | 2023-10-28
  • 4 | David | 2023-10-28
  • 5 | Eve   | 2023-10-29
```

If the command executes successfully but returns no records (e.g., `INSERT`, `UPDATE`, `DELETE` without `RETURNING`, or a `SELECT` with no matching rows), you will see a success message:

```bash
✅ Command run successfully. No results to display.
```

In case of errors (e.g., invalid SQL syntax, AWS authentication issues, `aws` command not found), the script will print the error message and exit with a non-zero code:

```bash
❌ Error executing the command (code 255):
An error occurred (BadRequestException) when calling the ExecuteStatement operation: syntax error at or near "SELECTT"
```

## Testing

To run the unit tests for the script (requires Node.js v14+):

```bash
npm test
```

This will execute the tests configured in your `package.json` using Node.js's built-in test runner (`node:test`).

## Contributing

Contributions are welcome! If you find a bug or have a suggestion for improving the script, feel free to open an issue or submit a pull request on the project repository.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


[![npm version](https://img.shields.io/npm/v/rds-pretty-query.svg)](https://www.npmjs.com/package/rds-pretty-query)

---
