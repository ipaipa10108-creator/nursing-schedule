import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');

    if (!month) {
      return NextResponse.json(
        { success: false, error: 'Month parameter is required (format: YYYY-MM)' },
        { status: 400 }
      );
    }

    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const startDate = new Date(year, monthNum - 1, 1, 12, 0, 0);
    const endDate = new Date(year, monthNum, 0, 12, 0, 0);

    // Get all active nurses
    const allNurses = await prisma.nurse.findMany({
      where: { isActive: true },
      orderBy: { employeeId: 'asc' },
    });

    // Get all schedules for the month
    const schedules = await prisma.schedule.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        nurse: true,
        shiftType: true,
      },
    });

    // Calculate off days for each nurse
    const offData = allNurses.map(nurse => {
      // Count scheduled days for this nurse
      const nurseSchedules = schedules.filter(s => s.nurseId === nurse.id);
      const scheduledDays = nurseSchedules.length;
      
      // Calculate off days
      const offDays = daysInMonth - scheduledDays;
      
      // Get scheduled dates
      const scheduledDates = nurseSchedules.map(s => {
        const date = new Date(s.date);
        return {
          day: date.getDate(),
          shiftCode: s.shiftType.code,
          shiftName: s.shiftType.name,
        };
      }).sort((a, b) => a.day - b.day);

      return {
        nurse: {
          id: nurse.id,
          name: nurse.name,
          employeeId: nurse.employeeId,
          level: nurse.level,
          specialStatus: nurse.specialStatus,
        },
        scheduledDays,
        offDays,
        scheduledDates,
      };
    });

    // Sort by off days (descending) - those with most off days first
    offData.sort((a, b) => b.offDays - a.offDays);

    return NextResponse.json({
      success: true,
      data: offData,
      month: `${year}年${monthNum}月`,
      daysInMonth,
    });
  } catch (error) {
    console.error('Error fetching off-duty data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch off-duty data' },
      { status: 500 }
    );
  }
}
