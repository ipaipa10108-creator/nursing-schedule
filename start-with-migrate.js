const { execSync } = require('child_process');

console.log('🔄 Running database migrations...');

try {
  // 執行資料庫遷移
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('✅ Database migrations completed');
} catch (error) {
  console.error('⚠️ Migration warning:', error.message);
  console.log('Continuing to start the app...');
}

console.log('🚀 Starting Next.js application...');

// 啟動 Next.js
try {
  execSync('next start', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Failed to start application:', error.message);
  process.exit(1);
}
