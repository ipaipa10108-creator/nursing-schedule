const { execSync } = require('child_process');

console.log('🔄 Running database migrations...');

try {
  // 檢查是否使用 Turso
  // 檢查是否使用 Turso
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    console.log('⚡ Turso detected. Configuring DATABASE_URL for migration...');

    // 建構包含 Auth Token 的完整連線字串，供 Prisma CLI 使用
    let dbUrl = process.env.TURSO_DATABASE_URL;
    if (!dbUrl.includes('authToken=')) {
      // 確保 URL 格式正確 (libsql:// 需要轉為 wss:// 嗎? 通常 prisma migrate 需要 file: 或特定格式)
      // 但最新版 Prisma 對 libsql 支援較好，直接嘗試注入 URL
      // 若 Turso URL 是 libsql://，Prisma 可能需要改為 wss:// 或 https://
      // 這裡先嘗試直接附加 token，這是最常見的做法
      dbUrl = dbUrl.includes('?') ? `${dbUrl}&authToken=${process.env.TURSO_AUTH_TOKEN}` : `${dbUrl}?authToken=${process.env.TURSO_AUTH_TOKEN}`;
    }

    // 暫時覆蓋 DATABASE_URL 環境變數 (僅影響此 Process)
    process.env.DATABASE_URL = dbUrl;

    console.log('📦 Deploying migrations to Turso...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('✅ Turso migrations completed');
  } else {
    // 檢查資料庫遷移狀態 (僅限本地 SQLite 文件)
    console.log('🔍 Checking local SQLite migration status...');
    execSync('npx prisma migrate status', { stdio: 'inherit' });

    // 執行資料庫遷移
    console.log('📦 Deploying migrations to local SQLite...');
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('✅ Local migrations completed');
  }
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  // 在生產環境中，遷移失敗應該停止啟動，避免資料不一致
  console.error('🛑 Stopping application startup due to migration failure.');
  process.exit(1);
}

console.log('🚀 Starting Next.js application...');

// 啟動 Next.js
try {
  execSync('next start', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Failed to start application:', error.message);
  process.exit(1);
}
