const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

async function migrateTurso() {
    console.log('🔄 Starting custom Turso migration...');

    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
        throw new Error('Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN');
    }

    const client = createClient({
        url,
        authToken,
    });

    try {
        // 1. Create migrations tracking table if not exists
        await client.execute(`
      CREATE TABLE IF NOT EXISTS _custom_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

        // 2. Get applied migrations
        const result = await client.execute('SELECT name FROM _custom_migrations');
        const appliedMigrations = new Set(result.rows.map(row => row.name));

        // 3. Read migration files
        const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
        if (!fs.existsSync(migrationsDir)) {
            console.log('⚠️ No prisma/migrations directory found. Skipping.');
            return;
        }

        const items = fs.readdirSync(migrationsDir);
        // Filter for directories that look like migrations (start with numbers)
        // and sort them to ensure order
        const migrationFolders = items
            .filter(item => {
                const fullPath = path.join(migrationsDir, item);
                return fs.statSync(fullPath).isDirectory() && /^\d+_.+/.test(item);
            })
            .sort();

        // 4. Apply new migrations
        let appliedCount = 0;
        for (const folder of migrationFolders) {
            if (appliedMigrations.has(folder)) {
                continue;
            }

            console.log(`🚀 Applying migration: ${folder}`);
            const sqlPath = path.join(migrationsDir, folder, 'migration.sql');

            if (!fs.existsSync(sqlPath)) {
                console.warn(`⚠️ Warning: ${folder} has no migration.sql. Skipping.`);
                continue;
            }

            const sqlContent = fs.readFileSync(sqlPath, 'utf8');

            // Split statements and execute individually to allow partial success
            // This is critical when some tables exist (e.g. Nurse) but others (e.g. Ward) do not
            const statements = sqlContent
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0);

            console.log(`📝 Found ${statements.length} statements in ${folder}`);

            for (const statement of statements) {
                try {
                    await client.execute(statement);
                } catch (e) {
                    const errorMessage = e.message || '';
                    if (errorMessage.includes('already exists')) {
                        console.warn(`⚠️ Warning: Statement failed because object already exists. Continuing...`);
                        continue;
                    }
                    console.error(`❌ Failed to execute statement: ${statement.substring(0, 50)}...`);
                    throw e;
                }
            }

            // Record as applied
            try {
                await client.execute({
                    sql: 'INSERT INTO _custom_migrations (name) VALUES (?)',
                    args: [folder],
                });
                console.log(`✅ Applied: ${folder}`);
                appliedCount++;
            } catch (e) {
                // Optimization: if insert fails (unlikely unique constraint), just warn
                console.warn(`Could not record migration ${folder}:`, e.message);
            }
        }

        if (appliedCount === 0) {
            console.log('✨ No new migrations to apply.');
        } else {
            console.log(`🎉 Successfully applied ${appliedCount} migrations.`);
        }

    } catch (error) {
        console.error('❌ Custom migration error:', error);
        throw error;
    } finally {
        client.close();
    }
}

module.exports = { migrateTurso };

if (require.main === module) {
    migrateTurso().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
