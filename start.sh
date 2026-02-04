#!/bin/bash

# 啟動腳本：先執行資料庫遷移，再啟動 Next.js

echo "🔄 Running database migrations..."
npx prisma migrate deploy

if [ $? -eq 0 ]; then
    echo "✅ Database migrations completed"
else
    echo "⚠️ Migration failed, but continuing to start the app..."
fi

echo "🚀 Starting Next.js application..."
exec next start
