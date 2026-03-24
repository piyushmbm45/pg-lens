import { Command } from 'commander';
import chalk from 'chalk';
import {
  getSlowQueries,
  getMostExpensiveQueries,
  resetStats,
} from '../../analyzers/slow-query.analyzer';
import {
  formatOutput,
  printInfo,
  printSuccess,
  printError,
  printWarning,
  OutputFormat,
} from '../../utils/formatter';
import { closePool } from '../../db/connection';

export function slowQueriesCommand(program: Command): void {
  const cmd = program
    .command('slow-queries')
    .alias('sq')
    .description('Find slowest queries using pg_stat_statements')
    .option('-l, --limit <number>', 'Number of queries to show', '10')
    .option(
      '-c, --min-calls <number>',
      'Minimum number of calls to include',
      '1',
    )
    .option(
      '-m, --min-avg-ms <number>',
      'Minimum average execution time in ms',
      '0',
    )
    .option('-t, --sort-total', 'Sort by total time instead of avg time')
    .option('-f, --format <format>', 'Output format: table, json, csv', 'table')
    .option('--reset', 'Reset pg_stat_statements counters (requires superuser)')
    .action(async (opts) => {
      try {
        // Handle reset
        if (opts.reset) {
          printWarning('Resetting pg_stat_statements counters...');
          await resetStats();
          printSuccess('Stats reset successfully.');
          await closePool();
          return;
        }

        const limit = parseInt(opts.limit);
        const minCalls = parseInt(opts.minCalls);
        const minAvgMs = parseFloat(opts.minAvgMs);
        const format = opts.format as OutputFormat;

        if (opts.sortTotal) {
          printInfo(`Fetching top ${limit} queries by total execution time...`);
          const rows: any[] = await getMostExpensiveQueries(limit);
          formatOutput(
            rows,
            format,
            `Top ${limit} Queries by Total Execution Time`,
          );
        } else {
          printInfo(`Fetching top ${limit} slowest queries (avg exec time)...`);
          const rows: any[] = await getSlowQueries({ limit, minCalls, minAvgMs });
          formatOutput(rows, format, `Top ${limit} Slowest Queries (avg ms)`);
        }

        // Print quick tips
        if (format === 'table') {
          console.log(chalk.gray('  Tips:'));
          console.log(
            chalk.gray(
              '  • Low cache_hit_ratio (<90%) = add more shared_buffers or check index usage',
            ),
          );
          console.log(
            chalk.gray(
              '  • High avg_time_ms with low calls = optimize the query itself',
            ),
          );
          console.log(
            chalk.gray(
              '  • High total_time_ms with many calls = high-frequency query, worth caching',
            ),
          );
          console.log(
            chalk.gray(
              '  • Run  pg-lens explain "<query>"  for a detailed query plan\n',
            ),
          );
        }

        await closePool();
      } catch (err) {
        printError((err as Error).message);
        await closePool();
        process.exit(1);
      }
    });

  return;
}
