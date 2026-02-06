require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

async function resetTursoDb() {
    console.log('🗑️  Starting Turso database reset...');

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
        const sqlPath = path.join(process.cwd(), 'reset_turso.sql');
        if (!fs.existsSync(sqlPath)) {
            throw new Error('reset_turso.sql file not found');
        }

        const sqlContent = fs.readFileSync(sqlPath, 'utf8');

        // Split by semicolon and verify statements
        const statements = sqlContent
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        console.log(`📝 Found ${statements.length} SQL statements to execute.`);

        // Execute DROP statements first
        const dropStatements = statements.filter(s => s.toUpperCase().startsWith('DROP'));
        const otherStatements = statements.filter(s => !s.toUpperCase().startsWith('DROP'));

        console.log('🔥 Dropping existing tables...');
        for (const stmt of dropStatements) {
            try {
                await client.execute(stmt);
                console.log(`   Executed: ${stmt.substring(0, 40)}...`);
            } catch (e) {
                console.warn(`   Warning dropping table: ${e.message}`);
            }
        }

        console.log('✨ Creating new schema from reset file...');
        for (const stmt of otherStatements) {
            try {
                await client.execute(stmt);
            } catch (e) {
                console.error(`❌ Failed to execute: ${stmt.substring(0, 50)}...`);
                throw e;
            }
        }

        // Also clear the migration history so turso-migrate.js runs cleanly if needed
        try {
            await client.execute('DROP TABLE IF EXISTS _custom_migrations');
            console.log('🧹 Cleared migration history.');
        } catch (e) { }

        console.log('✅ Database reset successfully!');

    } catch (error) {
        console.error('❌ Reset failed:', error);
        process.exit(1);
    } finally {
        client.close();
    }
}

resetTursoDb();
