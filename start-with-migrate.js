const { execSync } = require('child_process');

console.log('🔄 Running database migrations...');

try {
  // 檢查資料庫遷移狀態
  console.log('🔍 Checking migration status...');
  execSync('npx prisma migrate status', { stdio: 'inherit' });

  // 執行資料庫遷移
  console.log('📦 Deploying migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('✅ Database migrations completed');
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
