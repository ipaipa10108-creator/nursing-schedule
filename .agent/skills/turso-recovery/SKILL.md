---
description: Resolve Turso/Prisma migration failures, including protocol errors, existing table conflicts, and schema drift.
---

# Turso Migration & Recovery Skill

This skill provides a systematic approach to debugging and fixing database migration issues when using **Prisma** with **Turso (LibSQL)**, specifically regarding protocol incompatibilities, partial migration failures, and schema drift.

## 1. Context & Common Errors

### Error: `URL must start with the protocol file:`
*   **Cause:** Prisma CLI's `sqlite` provider does not support `libsql://` URLs for migrations (`prisma migrate deploy`).
*   **Solution:** Do **not** use `prisma migrate deploy` on production. Use a custom Node.js script with `@libsql/client`.

### Error: `table "X" already exists` (Blocking Deployment)
*   **Cause:** The migration script treats the entire `.sql` file as an atomic transaction. If the first table exists (from a previous partial run), the script fails and aborts, leaving subsequent tables uncreated.
*   **Solution:** The migration script must **split SQL statements by semicolon (`;`)** and execute them individually, catching and ignoring "already exists" errors for specific statements.

### Error: `table has no column named X` (During Seeding)
*   **Cause:** "Schema Drift". The `schema.prisma` (used by the client) has fields that exist in the local DB but were never applied to the remote Turso DB because a migration file was missing or failed.
*   **Solution:** Manually create a new migration SQL file to add the missing columns and apply it via the custom script.

## 2. Implementation Strategy

### Step 1: Use Custom Migration Script (`turso-migrate.js`)
Instead of `prisma migrate deploy`, run a script that:
1.  Connects to Turso using `@libsql/client`.
2.  Creates a tracking table `_custom_migrations`.
3.  Reads `prisma/migrations` directory.
4.  **CRITICAL:** Splits SQL content by `;` to handle partial execution.
5.  Records successful migrations.

### Step 2: Handle Schema Drift (Missing Columns)
If `db:seed` fails due to missing columns:
1.  Identify the missing columns from the error message.
2.  Create a new migration folder manually: `mkdir prisma/migrations/YYYYMMDDHHMMSS_fix_missing_columns`.
3.  Create `migration.sql` with `ALTER TABLE` or `DROP/CREATE` statements to sync the schema.
4.  Run the migration script locally to apply changes to Turso immediately.

### Step 3: Seeding Remote Database
To seed Turso from a local environment:
1.  Ensure `prisma/seed.ts` imports `dotenv/config` at the very top.
2.  Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in `.env`.
3.  Run `npm run db:seed` (ensure it uses `tsx` or `ts-node`).

## 3. Automation Scripts

### `scripts/turso-migrate.js` (Resilient Pattern)
```javascript
// Key logic: Split statements to allow partial success
const statements = sqlContent.split(';').map(s => s.trim()).filter(s => s.length > 0);
for (const statement of statements) {
    try {
        await client.execute(statement);
    } catch (e) {
        if (e.message.includes('already exists')) {
            console.warn('⚠️ Object exists, continuing...');
            continue;
        }
        throw e;
    }
}
```

### `scripts/reset-turso-db.js` (Nuclear Option)
If schema is too messy, use a reset script that:
1.  Reads a `reset.sql` (DROP TABLEs in order).
2.  Executes DROP statements.
3.  Executes CREATE statements.
4.  Clears `_custom_migrations`.

## 4. Troubleshooting Checklist
- [ ] **Check Env Vars:** Is `TURSO_DATABASE_URL` loaded? (Log it in `seed.ts` to check).
- [ ] **Check Migration Order:** Are folder names successfully sorted?
- [ ] **Check Tracking Table:** Does `SELECT * FROM _custom_migrations` match the folder structures?
