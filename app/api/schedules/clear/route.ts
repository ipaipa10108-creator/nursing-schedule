import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const nurseId = searchParams.get('nurseId');

    if (!month) {
      return NextResponse.json(
        { success: false, error: 'Month parameter is required' },
        { status: 400 }
      );
    }

    const [year, monthNum] = month.split('-').map(Number);
    const startDate = new Date(year, monthNum - 1, 1, 12, 0, 0);
    const endDate = new Date(year, monthNum, 0, 12, 0, 0);

    // Build delete condition
    const where: any = {
      date: {
        gte: startDate,
        lte: endDate,
      },
    };

    // If nurseId provided, only delete that nurse's schedules
    if (nurseId) {
      where.nurseId = nurseId;
    }

    // Delete schedules
    const deleted = await prisma.schedule.deleteMany({
      where,
    });

    return NextResponse.json({
      success: true,
      message: `Deleted ${deleted.count} schedules`,
      count: deleted.count,
    });
  } catch (error) {
    console.error('Error clearing schedules:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to clear schedules' },
      { status: 500 }
    );
  }
}
