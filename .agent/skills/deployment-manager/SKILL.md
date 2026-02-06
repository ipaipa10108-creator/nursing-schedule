---
name: deployment-manager
description: Manage production deployment to Render with Turso database integration
---

# Deployment Manager Skill

This skill handles the specialized deployment process for the Nursing Schedule application, which uses a "Dual-Mode" database architecture.

## Architecture Overview

### Database Modes
1.  **Local Mode**: Uses SQLite (`file:./dev.db`)
    *   Triggered when `TURSO_DATABASE_URL` is NOT set.
    *   Uses standard `prisma-client-js`.
2.  **Production Mode**: Uses Turso (`libsql://...`)
    *   Triggered when `TURSO_DATABASE_URL` IS set.
    *   Uses `@prisma/adapter-libsql` for edge compatibility.

### Migration Logic
*   The application uses a custom startup script: `start-with-migrate.js`.
*   On boot, it checks for `TURSO_DATABASE_URL`.
*   **If found**: It injects the `TURSO_AUTH_TOKEN` into the connection string and runs `npx prisma migrate deploy` to sync the schema.
*   **If not found**: It runs standard SQLite migrations.

## Critical Environment Variables (Render)

| Variable | Description |
| :--- | :--- |
| `TURSO_DATABASE_URL` | The LibSQL connection URL from Turso |
| `TURSO_AUTH_TOKEN` | The authentication token from Turso |
| `NEXT_PUBLIC_APP_URL` | The public URL of the deployed app |
| `NODE_ENV` | Must be `production` |

## Deployment Checklist

1.  **Build Check**: Always run `npm run build` locally before pushing.
2.  **Push**: `git push origin main` triggers the Render Blueprint/Auto-Deploy.
3.  **Logs**: Check Render logs for "✅ Turso migrations completed" to verify schema sync.
