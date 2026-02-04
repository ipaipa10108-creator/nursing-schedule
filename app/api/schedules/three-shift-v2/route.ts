import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateSchedule } from '@/lib/labor-law-validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { year, month, shiftAssignments, vacationRequests } = body;

    if (!year || !month || !shiftAssignments) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const ward = await prisma.ward.findFirst();
    if (!ward) {
      return NextResponse.json(
        { success: false, error: 'No ward found' },
        { status: 400 }
      );
    }

    // Get shift types
    const shiftTypes = await prisma.shiftType.findMany();
    const shiftTypeMap = new Map(shiftTypes.map(st => [st.code, st]));

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Build vacation map
    const vacationMap = new Map<string, Set<number>>();
    if (Array.isArray(vacationRequests)) {
      vacationRequests.forEach((req: any) => {
        if (req.nurseId && Array.isArray(req.dates)) {
          vacationMap.set(req.nurseId, new Set(req.dates));
        }
      });
    }

    // Track results
    let scheduledCount = 0;
    const shiftBreakdown: Record<string, number> = { D: 0, E: 0, N: 0 };
    const dailyStats: Record<string, { D: number, E: number, N: number }> = {};
    const nurseShiftCounts: Record<string, number> = {};

    // Initialize nurse shift counters
    Object.values(shiftAssignments as Record<string, string[]>).forEach(nurseIds => {
      nurseIds.forEach(id => {
        if (!nurseShiftCounts[id]) nurseShiftCounts[id] = 0;
      });
    });

    // Get all available nurses for each shift
    const shiftNurses: Record<string, string[]> = {};
    ['D', 'E', 'N'].forEach(code => {
      const nurses = shiftAssignments[code] || [];
      shiftNurses[code] = nurses;
    });

    // Track nurse rotation index for each shift (round-robin)
    const rotationIndex: Record<string, number> = { D: 0, E: 0, N: 0 };

    // Process each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day, 12, 0, 0);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      dailyStats[dateStr] = { D: 0, E: 0, N: 0 };

      // For each shift, try to schedule at least one nurse
      for (const shiftCode of ['D', 'E', 'N'] as const) {
        const shiftType = shiftTypeMap.get(shiftCode);
        const availableNurses = shiftNurses[shiftCode];
        
        if (!shiftType || !availableNurses || availableNurses.length === 0) {
          continue;
        }

        // Try to find an available nurse using round-robin
        let scheduledForThisShift = false;
        let attempts = 0;
        const maxAttempts = availableNurses.length;

        while (!scheduledForThisShift && attempts < maxAttempts) {
          // Get next nurse in rotation
          const nurseIndex = rotationIndex[shiftCode] % availableNurses.length;
          const nurseId = availableNurses[nurseIndex];
          
          // Move to next nurse for next time
          rotationIndex[shiftCode]++;
          attempts++;

          try {
            // Check if nurse exists and is active
            const nurse = await prisma.nurse.findUnique({ where: { id: nurseId } });
            if (!nurse || !nurse.isActive) continue;

            // Skip night shift for pregnant/nursing nurses
            if (shiftCode === 'N' && 
                (nurse.specialStatus === 'pregnant' || nurse.specialStatus === 'nursing')) {
              continue;
            }

            // Check if this is a vacation date for this nurse
            const nurseVacationDates = vacationMap.get(nurseId);
            if (nurseVacationDates && nurseVacationDates.has(day)) {
              continue; // Skip this nurse, they requested vacation
            }

            // Check if nurse already has a schedule for this day
            const existing = await prisma.schedule.findFirst({
              where: { nurseId, date },
            });
            if (existing) continue;

            // Check if nurse has reached max shifts (8 per month to leave room for other shifts)
            if (nurseShiftCounts[nurseId] >= 8) {
              continue;
            }

            // Check 24-hour interval with nearby schedules
            const prevDate = new Date(date);
            prevDate.setDate(date.getDate() - 1);
            const nextDate = new Date(date);
            nextDate.setDate(date.getDate() + 1);

            const nearbySchedules = await prisma.schedule.findMany({
              where: {
                nurseId,
                date: { gte: prevDate, lte: nextDate },
              },
              include: { shiftType: true },
            });

            let within24Hours = false;
            for (const nearby of nearbySchedules) {
              const nearbyDate = new Date(nearby.date);
              const nearbyEnd = new Date(nearbyDate);
              const [endHour, endMin] = nearby.shiftType.endTime.split(':').map(Number);
              nearbyEnd.setHours(endHour, endMin);
              
              const newStart = new Date(date);
              const [startHour, startMin] = shiftType.startTime.split(':').map(Number);
              newStart.setHours(startHour, startMin);
              
              const hoursDiff = (newStart.getTime() - nearbyEnd.getTime()) / (1000 * 60 * 60);
              const reverseDiff = (nearbyEnd.getTime() - newStart.getTime()) / (1000 * 60 * 60);
              
              // Check both directions
              if (hoursDiff < 24 && hoursDiff > -24 && Math.abs(hoursDiff) < 24) {
                within24Hours = true;
                break;
              }
            }

            if (within24Hours) continue;

            // Validate labor law
            const validation = await validateSchedule(nurseId, date, shiftType.id);
            if (!validation.valid) {
              console.log(`Labor law validation failed for nurse ${nurseId} on ${dateStr}:`, validation.violations);
              continue;
            }

            // Create schedule
            await prisma.schedule.create({
              data: {
                date,
                nurseId,
                shiftTypeId: shiftType.id,
                wardId: ward.id,
                status: 'scheduled',
                violations: JSON.stringify(validation.violations),
              },
            });

            // Update counters
            scheduledCount++;
            shiftBreakdown[shiftCode]++;
            dailyStats[dateStr][shiftCode]++;
            nurseShiftCounts[nurseId]++;
            
            scheduledForThisShift = true;

          } catch (error) {
            console.error(`Error scheduling nurse ${nurseId}:`, error);
          }
        }

        // If no nurse was scheduled for this shift on this day, log it
        if (!scheduledForThisShift && availableNurses.length > 0) {
          console.log(`Warning: Could not schedule any nurse for ${shiftCode} shift on ${dateStr}`);
        }
      }
    }

    // Calculate summary statistics
    const totalNursesUsed = Object.values(nurseShiftCounts).filter(count => count > 0).length;
    const avgShiftsPerNurse = totalNursesUsed > 0 ? Math.round(scheduledCount / totalNursesUsed) : 0;

    // Check for days with missing shifts
    const daysWithMissingShifts: string[] = [];
    Object.entries(dailyStats).forEach(([date, stats]) => {
      const totalForDay = stats.D + stats.E + stats.N;
      if (totalForDay === 0 && (shiftNurses.D.length > 0 || shiftNurses.E.length > 0 || shiftNurses.N.length > 0)) {
        daysWithMissingShifts.push(date);
      }
    });

    return NextResponse.json({
      success: true,
      scheduledCount,
      shiftBreakdown,
      dailyStats,
      nurseShiftCounts,
      avgShiftsPerNurse,
      totalNursesUsed,
      daysWithMissingShifts: daysWithMissingShifts.length > 0 ? daysWithMissingShifts : undefined,
    });

  } catch (error) {
    console.error('Error in three-shift v2 scheduling:', error);
    return NextResponse.json(
      { success: false, error: 'Three-shift scheduling failed' },
      { status: 500 }
    );
  }
}
