import { Command } from 'commander';
import chalk from 'chalk';
import {
  formatOutput,
  printInfo,
  printSuccess,
  printError,
  printWarning,
  type OutputFormat,
} from '../../utils/formatter';
import { closePool } from '../../db/connection';
import {
  getDuplicateIndexes,
  getIndexHealthSummary,
  getMissingIndexes,
  getUnusedIndexes,
  IndexHealthSummary,
} from '../../analyzers/index.analyser';

export function indexesCommand(program: Command): void {
  // ── Parent command ───────────────────────────────────────────────────────
  const idx = program 
    .command('indexes')
    .alias('idx')
    .description(
      'Analyze indexes — find missing, unused, and duplicate indexes',
    );

  // ── indexes missing ──────────────────────────────────────────────────────
  idx
    .command('missing')
    .alias('m')
    .description(
      'Find tables with high sequential scans that likely need an index',
    )
    .option('-l, --limit <number>', 'Number of results to show', '20')
    .option(
      '-r, --min-rows <number>',
      'Minimum live row count to include table',
      '10000',
    )
    .option(
      '-s, --min-seq-scans <number>',
      'Minimum sequential scans to include',
      '50',
    )
    .option('-f, --format <format>', 'Output format: table, json, csv', 'table')
    .action(async (opts) => {
      try {
        const limit = parseInt(opts.limit);
        const minRows = parseInt(opts.minRows);
        const minSeqScans = parseInt(opts.minSeqScans);
        const format = opts.format as OutputFormat;

        printInfo(
          `Scanning for tables with missing indexes (min ${minRows.toLocaleString()} rows, min ${minSeqScans} seq scans)...`,
        );

        const rows: any = await getMissingIndexes({
          limit,
          minRows,
          minSeqScans,
        });

        if (rows.length === 0) {
          printSuccess(
            'No missing indexes detected. Your index coverage looks good!\n',
          );
          await closePool();
          return;
        }

        formatOutput(rows, format, `Tables Likely Missing Indexes`);

        if (format === 'table') {
          console.log(chalk.gray('  How to fix:'));
          console.log(
            chalk.gray('  • Use the suggestion column as a starting point'),
          );
          console.log(
            chalk.gray(
              '  • Replace <your_filter_column> with the column used in your WHERE clauses',
            ),
          );
          console.log(
            chalk.gray(
              '  • Use CONCURRENTLY so the index builds without locking the table',
            ),
          );
          console.log(
            chalk.gray(
              '  • Run  pg-insight indexes unused  to also check for dead weight\n',
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

  // ── indexes unused ───────────────────────────────────────────────────────
  idx
    .command('unused')
    .alias('u')
    .description(
      'Find indexes that are never used — safe candidates for removal',
    )
    .option('-l, --limit <number>', 'Number of results to show', '20')
    .option(
      '-s, --min-size <bytes>',
      'Minimum index size in bytes to report',
      '8192',
    )
    .option('-f, --format <format>', 'Output format: table, json, csv', 'table')
    .action(async (opts) => {
      try {
        const limit = parseInt(opts.limit);
        const minSize = parseInt(opts.minSize);
        const format = opts.format as OutputFormat;

        printInfo('Scanning for unused indexes...');
        printWarning(
          'Note: Stats reset after each PostgreSQL restart. Run this on a live system with recent traffic for accurate results.',
        );

        const rows: any = await getUnusedIndexes({ limit, minSize });

        if (rows.length === 0) {
          printSuccess(
            'No unused indexes found. All indexes are being utilized!\n',
          );
          await closePool();
          return;
        }

        formatOutput(rows, format, 'Unused Indexes (Never Scanned)');

        if (format === 'table') {
          console.log(chalk.gray('  How to fix:'));
          console.log(
            chalk.gray('  • Run the suggestion SQL to drop the index'),
          );
          console.log(
            chalk.gray(
              '  • Always use CONCURRENTLY to avoid table locks in production',
            ),
          );
          console.log(
            chalk.gray(
              '  • Double-check: primary keys and unique constraints are excluded automatically',
            ),
          );
          console.log(
            chalk.gray(
              '  • Consider keeping indexes used for ORDER BY even if idx_scan = 0\n',
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

  // ── indexes duplicate ────────────────────────────────────────────────────
  idx
    .command('duplicate')
    .alias('d')
    .description('Find duplicate indexes with identical column definitions')
    .option('-f, --format <format>', 'Output format: table, json, csv', 'table')
    .action(async (opts) => {
      try {
        const format = opts.format as OutputFormat;

        printInfo('Scanning for duplicate indexes...');

        const rows: any = await getDuplicateIndexes();

        if (rows.length === 0) {
          printSuccess('No duplicate indexes found.\n');
          await closePool();
          return;
        }

        formatOutput(rows, format, 'Duplicate Indexes');

        if (format === 'table') {
          console.log(chalk.gray('  How to fix:'));
          console.log(
            chalk.gray(
              '  • Keep the index with the better name or the one used in constraints',
            ),
          );
          console.log(
            chalk.gray('  • Drop the other using the suggestion column\n'),
          );
        }

        await closePool();
      } catch (err) {
        printError((err as Error).message);
        await closePool();
        process.exit(1);
      }
    });

  // ── indexes health ───────────────────────────────────────────────────────
  idx
    .command('health')
    .alias('h')
    .description('Quick index health summary for the entire database')
    .action(async () => {
      try {
        printInfo('Generating index health summary...\n');

        const summary = await getIndexHealthSummary();

        const score = getHealthScore(summary);

        console.log(chalk.bold('  Index Health Report'));
        console.log(chalk.gray('  ' + '─'.repeat(40)));
        console.log(
          `  Total indexes          : ${chalk.white(summary.total_indexes)}`,
        );
        console.log(
          `  Total index size       : ${chalk.white(summary.total_index_size)}`,
        );
        console.log(
          `  Unused indexes         : ${colorize(summary.unused_indexes, 0, 2, 5)}`,
        );
        console.log(
          `  Tables missing indexes : ${colorize(summary.tables_missing_indexes, 0, 3, 10)}`,
        );
        console.log(
          `  Duplicate indexes      : ${colorize(summary.duplicate_indexes, 0, 1, 3)}`,
        );
        console.log(
          `  Wasted index size      : ${chalk.yellow(summary.wasted_index_size)}`,
        );
        console.log(chalk.gray('  ' + '─'.repeat(40)));
        console.log(
          `  Health score           : ${scoreColor(score)}  ${scoreLabel(score)}\n`,
        );

        console.log(chalk.gray('  Run these for details:'));
        console.log(chalk.gray('  pg-insight indexes missing'));
        console.log(chalk.gray('  pg-insight indexes unused'));
        console.log(chalk.gray('  pg-insight indexes duplicate\n'));

        await closePool();
      } catch (err) {
        printError((err as Error).message);
        await closePool();
        process.exit(1);
      }
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function colorize(
  val: number,
  good: number,
  warn: number,
  bad: number,
): string {
  if (val <= good) return chalk.green(val);
  if (val <= warn) return chalk.yellow(val);
  return chalk.red(val);
}

function getHealthScore(s: IndexHealthSummary): number {
  let score = 100;
  score -= Math.min(s.unused_indexes * 5, 30);
  score -= Math.min(s.tables_missing_indexes * 5, 40);
  score -= Math.min(s.duplicate_indexes * 5, 20);
  return Math.max(score, 0);
}

function scoreColor(score: number): string {
  if (score >= 80) return chalk.bold.green(`${score}/100`);
  if (score >= 50) return chalk.bold.yellow(`${score}/100`);
  return chalk.bold.red(`${score}/100`);
}

function scoreLabel(score: number): string {
  if (score >= 80) return chalk.green('Good');
  if (score >= 50) return chalk.yellow('Needs attention');
  return chalk.red('Critical — action required');
}
