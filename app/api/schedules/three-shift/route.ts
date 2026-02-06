import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateSchedule } from '@/lib/labor-law-validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nurseId, year, month, leaveDates, shiftCodes } = body;

    if (!nurseId || !year || !month || !shiftCodes || shiftCodes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get nurse and ward info
    const nurse = await prisma.nurse.findUnique({ where: { id: nurseId } });
    if (!nurse) {
      return NextResponse.json(
        { success: false, error: 'Nurse not found' },
        { status: 404 }
      );
    }

    const ward = await prisma.ward.findFirst();
    if (!ward) {
      return NextResponse.json(
        { success: false, error: 'No ward found' },
        { status: 400 }
      );
    }

    // Get shift types for selected codes
    const shiftTypes = await prisma.shiftType.findMany({
      where: { code: { in: shiftCodes } },
    });

    if (shiftTypes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid shift types found' },
        { status: 400 }
      );
    }

    // Get days in month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leaveDateSet = new Set(leaveDates || []);

    // Track results
    const created = [];
    const errors = [];
    const warnings = [];
    const shiftCount: Record<string, number> = { D: 0, E: 0, N: 0 };

    // Strategy: Try to evenly distribute selected shifts across the month
    // Skip leave days and weekends (optional, but focus on weekdays first)
    const availableDates = [];
    for (let day = 1; day <= daysInMonth; day++) {
      if (!leaveDateSet.has(day)) {
        const date = new Date(year, month, day, 12, 0, 0);
        const dayOfWeek = date.getDay();
        // Prioritize weekdays (1-5), but include weekends if needed
        availableDates.push({ day, date, isWeekend: dayOfWeek === 0 || dayOfWeek === 6 });
      }
    }

    // Sort: weekdays first, then weekends
    availableDates.sort((a, b) => {
      if (a.isWeekend && !b.isWeekend) return 1;
      if (!a.isWeekend && b.isWeekend) return -1;
      return a.day - b.day;
    });

    // For each shift type, try to schedule on available dates
    for (const shiftType of shiftTypes) {
      // Skip night shift for pregnant/nursing nurses
      if (shiftType.code === 'N' &&
        (nurse.specialStatus === 'pregnant' || nurse.specialStatus === 'nursing')) {
        continue;
      }

      let scheduledForThisShift = 0;

      for (const { day, date } of availableDates) {
        // Check if already scheduled for this day
        const existing = await prisma.schedule.findFirst({
          where: {
            nurseId,
            date,
          },
        });

        if (existing) continue;

        // Check 24-hour interval from previous schedule
        const prevDate = new Date(date);
        prevDate.setDate(date.getDate() - 1);
        const nextDate = new Date(date);
        nextDate.setDate(date.getDate() + 1);

        const nearbySchedules = await prisma.schedule.findMany({
          where: {
            nurseId,
            date: {
              gte: prevDate,
              lte: nextDate,
            },
          },
          include: {
            shiftType: true,
          },
        });

        // Check if any nearby schedule is within 24 hours
        let within24Hours = false;
        for (const nearby of nearbySchedules) {
          const nearbyDate = new Date(nearby.date);
          const nearbyEnd = new Date(nearbyDate);
          // Set end time based on shift
          const [endHour, endMin] = nearby.shiftType.endTime.split(':').map(Number);
          nearbyEnd.setHours(endHour, endMin);

          const newStart = new Date(date);
          const [startHour, startMin] = shiftType.startTime.split(':').map(Number);
          newStart.setHours(startHour, startMin);

          // Calculate hours between end of previous and start of new
          const hoursDiff = (newStart.getTime() - nearbyEnd.getTime()) / (1000 * 60 * 60);

          if (hoursDiff < 24 && hoursDiff > -24) {
            within24Hours = true;
            break;
          }
        }

        if (within24Hours) {
          continue; // Skip this date due to 24-hour rule
        }

        // Validate labor law
        const validation = await validateSchedule(nurseId, date, shiftType.id);

        if (validation.valid) {
          try {
            const schedule = await prisma.schedule.create({
              data: {
                date,
                nurseId,
                shiftTypeId: shiftType.id,
                wardId: ward.id,
                status: 'scheduled',
                violations: JSON.stringify(validation.violations),
              },
            });
            created.push(schedule);
            scheduledForThisShift++;
            shiftCount[shiftType.code]++;

            // Count warnings
            const dayWarnings = validation.violations.filter(v => v.type === 'warning');
            warnings.push(...dayWarnings);

            // Limit to reasonable number per shift type (e.g., max 8-10 per month per shift)
            if (scheduledForThisShift >= 10) {
              break;
            }
          } catch (err) {
            console.error('Error creating schedule:', err);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      errors: errors.length,
      warnings: warnings.length,
      details: shiftCount,
    });

  } catch (error) {
    console.error('Error in three-shift scheduling:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Three-shift scheduling failed', details: String(error) },
      { status: 500 }
    );
  }
}
