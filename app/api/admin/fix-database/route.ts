import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // 簡單的安全檢查：只能在開發環境或通過特定參數訪問
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');
  
  if (process.env.NODE_ENV === 'production' && secret !== 'fix-db-2024') {
    return NextResponse.json(
      { success: false, error: 'Unauthorized' },
      { status: 403 }
    );
  }

  try {
    console.log('🔧 Starting database repair...');
    
    // 嘗試執行遷移
    try {
      const { execSync } = require('child_process');
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
      console.log('✅ Migration completed');
    } catch (migrateError) {
      console.error('⚠️ Migration error:', migrateError);
    }
    
    // 檢查 ward 表結構
    const ward = await prisma.ward.findFirst();
    
    if (!ward) {
      console.log('Creating default ward...');
      await prisma.ward.create({
        data: {
          name: '婦癌病房',
          totalBeds: 50,
          nursePatientRatio: 8,
          minNursesDay: 7,
          minNursesEvening: 7,
          minNursesNight: 4,
          minWorkingDays: 20,
          maxWorkingDays: 26,
          targetWorkingDays: 22,
        },
      });
      console.log('✅ Default ward created');
    }
    
    // 嘗試讀取 ward 資料（會測試新欄位是否存在）
    try {
      const testWard = await prisma.ward.findFirst();
      const hasNewFields = testWard && 'minWorkingDays' in testWard;
      
      return NextResponse.json({
        success: true,
        message: 'Database repair completed',
        hasNewFields,
        ward: testWard,
        timestamp: new Date().toISOString(),
      });
    } catch (fieldError) {
      return NextResponse.json({
        success: false,
        message: 'Database schema still has issues',
        error: String(fieldError),
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('❌ Database repair failed:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
