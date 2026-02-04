import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const shiftTypes = await prisma.shiftType.findMany({
      orderBy: { startTime: 'asc' },
    });
    
    return NextResponse.json({ success: true, data: shiftTypes });
  } catch (error) {
    console.error('Error fetching shift types:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch shift types' },
      { status: 500 }
    );
  }
}
