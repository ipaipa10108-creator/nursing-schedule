---
description: Sync latest changes from GitHub to local environment
---

# Sync from GitHub

This workflow pulls the latest code from the remote repository and updates local dependencies and database schema.

1.  **Pull Code**
    // turbo
    Run `git pull origin main`

2.  **Install Dependencies**
    // turbo
    Run `npm install`

3.  **Update Database Schema**
    // turbo
    Run `npx prisma generate`
    Run `npm run db:migrate` (Updates local SQLite if schema changed)

4.  **Restart Development Server**
    Notify the user: "Sync complete. If the development server is running, please restart it to apply changes."
