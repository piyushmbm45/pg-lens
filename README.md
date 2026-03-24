# pg-lens

> A CLI + API toolkit to analyze and optimize PostgreSQL performance.

Find slow queries, missing indexes, table bloat, and unused indexes — with actionable fix suggestions.

---

## Features

| Command           | What it does                                                |
| ----------------- | ----------------------------------------------------------- |
| `slow-queries`    | Top N slowest queries from `pg_stat_statements`             |
| `missing-indexes` | Tables with high sequential scans _(Week 2)_                |
| `bloat`           | Table and index bloat analysis _(Week 2)_                   |
| `unused-indexes`  | Indexes that are never used _(Week 2)_                      |
| `explain`         | Run and parse `EXPLAIN ANALYZE` with suggestions _(Week 3)_ |
| `benchmark`       | Before/after query performance comparison _(Week 5)_        |

---

## Installation

```bash
npm install -g pg-lens
```

Or run directly with npx:

```bash
npx pg-lens slow-queries --host localhost --db mydb --user postgres
```

---

## Quick Start

**1. Set up environment variables:**

```bash
cp .env.example .env
# Edit .env with your database credentials
```

**2. Run your first analysis:**

```bash
# Find the 10 slowest queries
pg-lens slow-queries

# Find top 20, minimum 5 calls, output as JSON
pg-lens slow-queries --limit 20 --min-calls 5 --format json

# Sort by total time (most expensive overall)
pg-lens slow-queries --sort-total

# Export to CSV
pg-lens slow-queries --format csv > slow_queries.csv
```

**3. Connect with flags instead of .env:**

```bash
pg-lens slow-queries \
  --host localhost \
  --port 5432 \
  --db mydb \
  --user postgres \
  --password secret
```

---

## Development Setup

```bash
git clone https://github.com/yourusername/pg-lens
cd pg-lens
npm install

# Start a test PostgreSQL database (with sample data)
docker-compose up -d

# Copy env and point to test DB
cp .env.example .env
# PG_DATABASE=pg_lens_test, PG_USER=pguser, PG_PASSWORD=pgpassword

# Run CLI in dev mode
npm run dev -- slow-queries
npm run dev -- slow-queries --limit 5 --format json
```

---

## Requirements

- Node.js 18+
- PostgreSQL 12+
- `pg_stat_statements` extension enabled

**Enabling pg_stat_statements:**

```sql
-- Run as superuser
CREATE EXTENSION pg_stat_statements;
```

Add to `postgresql.conf`:

```
shared_preload_libraries = 'pg_stat_statements'
```

Then restart PostgreSQL.

---

## Output Example

```
  ┌─────────────────────────────┐
  │       pg-lens v0.1.0     │
  │  PostgreSQL Performance CLI  │
  └─────────────────────────────┘

  ✔ Connected to PostgreSQL

  Top 10 Slowest Queries (avg ms)
  ────────────────────────────────
┌──────────────────────────┬───────┬─────────────┬──────────────┬───────────────┐
│ query                    │ calls │ avg_time_ms │ total_tim... │ cache_hit_... │
├──────────────────────────┼───────┼─────────────┼──────────────┼───────────────┤
│ SELECT * FROM trans...   │  1240 │      245.30 │   304,172.00 │         72.3% │
│ SELECT u.*, t.amount...  │   890 │      187.50 │   166,875.00 │         95.1% │
└──────────────────────────┴───────┴─────────────┴──────────────┴───────────────┘

  Tips:
  • Low cache_hit_ratio (<90%) = add more shared_buffers or check index usage
  • High avg_time_ms with low calls = optimize the query itself
  • Run  pg-lens explain "<query>"  for a detailed query plan
```

---

## Roadmap

- [x] `slow-queries` — pg_stat_statements analysis
- [ ] `missing-indexes` — sequential scan detection
- [ ] `bloat` — table and index bloat
- [ ] `unused-indexes` — dead index finder
- [ ] `explain` — EXPLAIN ANALYZE parser with suggestions
- [ ] `benchmark` — before/after query comparison
- [ ] REST API mode
- [ ] HTML report export

---

## Author

**Piyush Jain** — [linkedin.com/in/piyush-jain-mbm](https://linkedin.com/in/piyush-jain-mbm)

Built from real-world experience optimizing PostgreSQL systems handling 500K+ daily transactions and 24M+ record datasets.

---

## License

MIT
