import Table from 'cli-table3';
import chalk from 'chalk';

export type OutputFormat = 'table' | 'json' | 'csv';

export function formatOutput<T extends Record<string, unknown>>(
  data: T[],
  format: OutputFormat = 'table',
  title?: string,
): void {
  if (data.length === 0) {
    console.log(chalk.yellow('  No results found.\n'));
    return;
  }

  if (title) {
    console.log('\n' + chalk.bold.cyan(`  ${title}`));
    console.log(chalk.gray('  ' + '─'.repeat(title.length + 2)));
  }

  switch (format) {
    case 'json':
      console.log(JSON.stringify(data, null, 2));
      break;

    case 'csv':
      const headers = Object.keys(data[0]);
      console.log(headers.join(','));
      data.forEach((row) => {
        const values = headers.map((h) => {
          const val = row[h];
          const str = val === null || val === undefined ? '' : String(val);
          return str.includes(',') ? `"${str}"` : str;
        });
        console.log(values.join(','));
      });
      break;

    case 'table':
    default:
      const keys = Object.keys(data[0]);
      const table = new Table({
        head: keys.map((k) => chalk.bold.white(k)),
        style: {
          head: [],
          border: ['gray'],
        },
        wordWrap: true,
        colWidths: keys.map(() => Math.floor(100 / keys.length) + 5),
      });

      data.forEach((row) => {
        table.push(keys.map((k) => formatCell(row[k])));
      });

      console.log(table.toString());
      break;
  }

  console.log(chalk.gray(`\n  ${data.length} row(s) returned.\n`));
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return chalk.gray('NULL');
  if (typeof value === 'number') {
    return chalk.yellow(
      value > 1000 ? value.toLocaleString() : value.toFixed(2),
    );
  }
  if (typeof value === 'boolean')
    return value ? chalk.green('true') : chalk.red('false');
  const str = String(value);
  // Truncate very long queries for display
  return str.length > 80 ? str.substring(0, 77) + chalk.gray('...') : str;
}

export function printHeader(): void {
  console.log(chalk.bold.green('\n  ┌─────────────────────────────┐'));
  console.log(chalk.bold.green('  │       pg-lens v0.1.0     │'));
  console.log(chalk.bold.green('  │  PostgreSQL Performance CLI  │'));
  console.log(chalk.bold.green('  └─────────────────────────────┘\n'));
}

export function printSuccess(msg: string): void {
  console.log(chalk.green(`  ✔ ${msg}`));
}

export function printError(msg: string): void {
  console.log(chalk.red(`  ✖ ${msg}`));
}

export function printWarning(msg: string): void {
  console.log(chalk.yellow(`  ⚠ ${msg}`));
}

export function printInfo(msg: string): void {
  console.log(chalk.cyan(`  ℹ ${msg}`));
}
