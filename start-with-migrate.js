const { execSync } = require('child_process');

// Main async function to handle migration and startup
(async () => {
  console.log('🔄 Application starting...');

  try {
    // 檢查是否使用 Turso
    if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
      console.log('⚡ Turso configuration detected.');

      try {
        console.log('📦 Running custom Turso migrations...');
        const { migrateTurso } = require('./scripts/turso-migrate');
        await migrateTurso();
        console.log('✅ Turso migrations completed successfully.');
      } catch (err) {
        console.error('❌ Turso migration failed:', err);
        // Only explicitly fatal errors should stop boot, but DB sync is critical
        console.error('🛑 Stopping startup due to critical database migration failure.');
        process.exit(1);
      }

    } else {
      // 本地開發: 使用標準 Prisma CLI 與 SQLite
      console.log('🏠 Local environment detected (SQLite).');
      console.log('🔍 Checking migration status...');
      execSync('npx prisma migrate status', { stdio: 'inherit' });

      console.log('📦 Deploying local migrations...');
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      console.log('✅ Local migrations completed.');
    }

    console.log('🚀 Starting Next.js application...');
    execSync('next start', { stdio: 'inherit' });

  } catch (error) {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  }
})();
