#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import { createPool, testConnection } from '../db/connection';
import { slowQueriesCommand } from './commands/slow-queries';
import { printHeader, printError, printSuccess } from '../utils/formatter';
import { indexesCommand } from './commands/indexes';

dotenv.config();

const program = new Command();

program
  .name('pg-lens')
  .description('PostgreSQL Performance Toolkit')
  .version('0.1.0')
  .option(
    '--host <host>',
    'PostgreSQL host',
    process.env.PG_HOST || 'localhost',
  )
  .option('--port <port>', 'PostgreSQL port', process.env.PG_PORT || '5432')
  .option(
    '--db <database>',
    'Database name',
    process.env.PG_DATABASE || 'postgres',
  )
  .option('--user <user>', 'Database user', process.env.PG_USER || 'postgres')
  .option('--password <password>', 'Database password', process.env.PG_PASSWORD)
  .option('--url <url>', 'Full connection string (overrides other options)')
  .hook('preAction', async (thisCommand) => {
    const opts = thisCommand.opts();

    // Initialize pool from CLI flags or env
    createPool(
      opts.url
        ? { connectionString: opts.url }
        : {
            host: opts.host,
            port: parseInt(opts.port),
            database: opts.db,
            user: opts.user,
            password: opts.password,
          },
    );

    // Test connection before running any command
    const connected = await testConnection();
    if (!connected) {
      printError('Could not connect to PostgreSQL. Check your credentials.');
      printError('Use --host, --db, --user, --password or set PG_* env vars.');
      process.exit(1);
    }

    printSuccess('Connected to PostgreSQL\n');
  });

// Register commands
slowQueriesCommand(program);
indexesCommand(program);

// Connect command — just tests the connection
program
  .command('connect')
  .description('Test database connection')
  .action(async () => {
    printHeader();
    // Connection is already tested in preAction hook
    console.log(chalk.green('  Connection successful!\n'));
  });

// Show header on any command
program.hook('preAction', () => {
  printHeader();
});

program.parse(process.argv);

// Show help if no command given
if (!process.argv.slice(2).length) {
  printHeader();
  program.outputHelp();
}
