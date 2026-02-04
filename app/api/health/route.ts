import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 檢查資料庫連線
    const ward = await prisma.ward.findFirst();
    
    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'nursing-schedule',
      version: '1.0.0',
      database: ward ? 'connected' : 'no_data',
      uptime: process.uptime(),
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
    }, {
      status: 500,
    });
  }
}
