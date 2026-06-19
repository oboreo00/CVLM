# Legacy Supabase SQL migrations (archived)

Schema is owned by **Drizzle** (`shared/schema.ts` → `migrations/` → `npm run db:migrate`).

These files are kept for reference only. They are **not** applied by `supabase start` (`[db.migrations] enabled = false` in `supabase/config.toml`).

The initial Drizzle migration `migrations/0000_init.sql` is idempotent (IF NOT EXISTS tables, DROP POLICY + CREATE POLICY) so existing databases pick up correct RLS on first `db:migrate`.
