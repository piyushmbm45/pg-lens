-- Enable pg_stat_statements
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Sample tables that mimic a fintech/POS system (good for testing the toolkit)

CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE transactions (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id),
  amount      NUMERIC(12, 2) NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  price       NUMERIC(10, 2) NOT NULL,
  stock       INT DEFAULT 0
);

-- Seed users
INSERT INTO users (name, email)
SELECT
  'User ' || i,
  'user' || i || '@example.com'
FROM generate_series(1, 50000) AS i;

-- Seed transactions (500K rows — mimics real POS volume)
INSERT INTO transactions (user_id, amount, type, status)
SELECT
  (random() * 49999 + 1)::int,
  ROUND((random() * 10000)::numeric, 2),
  CASE WHEN random() > 0.5 THEN 'credit' ELSE 'debit' END,
  CASE
    WHEN random() > 0.8 THEN 'completed'
    WHEN random() > 0.5 THEN 'pending'
    ELSE 'failed'
  END
FROM generate_series(1, 500000);

-- Seed products
INSERT INTO products (name, price, stock)
SELECT
  'Product ' || i,
  ROUND((random() * 5000 + 10)::numeric, 2),
  (random() * 1000)::int
FROM generate_series(1, 10000) AS i;

-- Note: intentionally NO index on transactions.user_id or transactions.status
-- so pg-lens's missing index analyzer can detect them
