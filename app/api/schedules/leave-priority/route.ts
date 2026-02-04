import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateSchedule } from '@/lib/labor-law-validation';

interface NursePreference {
  nurseId: string;
  leaveDates: number[];
  preferredShifts: string[];
}

interface DailyShiftStatus {
  date: number;
  shiftCode: string;
  targetCount: number;
  actualCount: number;
  hasSenior: boolean;
  nurses: string[];
  gap: number;
  actualRatio: number;
  overtimeNurses: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { year, month, mode, nursePreferences, allowOvertime = true } = body;

    if (!year || !month || !mode) {
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

    // Get shift-specific requirements from ward settings
    const shiftRequirements: Record<string, number> = {
      'D': ward.minNursesDay || 6,
      'E': ward.minNursesEvening || 6,
      'N': ward.minNursesNight || 5,
    };

    // Actual bed occupancy (typically 60% of total beds)
    const actualOccupancy = Math.floor(ward.totalBeds * 0.6); // About 30 people for 50 beds

    // Get all active nurses
    const allNurses = await prisma.nurse.findMany({
      where: { isActive: true },
    });

    if (allNurses.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No active nurses found' },
        { status: 400 }
      );
    }

    // Get shift types
    const shiftTypes = await prisma.shiftType.findMany();
    const shiftTypeMap = new Map(shiftTypes.map(st => [st.code, st]));

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Build nurse preference map
    const preferenceMap = new Map<string, NursePreference>();
    if (nursePreferences && Array.isArray(nursePreferences)) {
      nursePreferences.forEach((pref: NursePreference) => {
        preferenceMap.set(pref.nurseId, pref);
      });
    }

    // Separate nurses by level
    const seniorNurses = allNurses.filter(n => {
      const level = n.level;
      return level === 'N2' || level === 'N3' || level === 'N4';
    });
    const juniorNurses = allNurses.filter(n => {
      const level = n.level;
      return level === 'N0' || level === 'N1';
    });

    // Track results
    let totalScheduled = 0;
    const nurseShiftCounts: Record<string, number> = {};
    const nurseOvertimeCounts: Record<string, number> = {}; // Track overtime shifts
    const shiftDistribution: Record<string, number> = { D: 0, E: 0, N: 0 };
    const dailyStatus: DailyShiftStatus[] = [];
    
    // Initialize tracking
    allNurses.forEach(nurse => {
      nurseShiftCounts[nurse.id] = 0;
      nurseOvertimeCounts[nurse.id] = 0;
    });

    // Helper functions
    function canTakeShift(nurse: typeof allNurses[0], shiftCode: string): boolean {
      if (shiftCode === 'N' && 
          (nurse.specialStatus === 'pregnant' || nurse.specialStatus === 'nursing')) {
        return false;
      }
      return true;
    }

    function hasLeave(nurseId: string, day: number): boolean {
      const pref = preferenceMap.get(nurseId);
      if (pref && pref.leaveDates) {
        return pref.leaveDates.includes(day);
      }
      return false;
    }

    async function check24HourInterval(nurseId: string, date: Date, shiftCode: string): Promise<boolean> {
      const shiftType = shiftTypeMap.get(shiftCode);
      if (!shiftType) return false;

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

      for (const nearby of nearbySchedules) {
        const nearbyDate = new Date(nearby.date);
        const nearbyEnd = new Date(nearbyDate);
        const [endHour, endMin] = nearby.shiftType.endTime.split(':').map(Number);
        nearbyEnd.setHours(endHour, endMin);
        
        const newStart = new Date(date);
        const [startHour, startMin] = shiftType.startTime.split(':').map(Number);
        newStart.setHours(startHour, startMin);
        
        const hoursDiff = (newStart.getTime() - nearbyEnd.getTime()) / (1000 * 60 * 60);
        
        if (Math.abs(hoursDiff) < 24) {
          return false;
        }
      }

      return true;
    }

    async function hasSeniorNurseForShift(day: number, shiftCode: string): Promise<boolean> {
      const date = new Date(year, month, day, 12, 0, 0);
      const existingSchedules = await prisma.schedule.findMany({
        where: {
          date,
          shiftType: { code: shiftCode },
        },
        include: { nurse: true },
      });

      return existingSchedules.some(s => {
        const level = s.nurse.level;
        return level === 'N2' || level === 'N3' || level === 'N4';
      });
    }

    async function getExistingSchedulesForShift(day: number, shiftCode: string) {
      const date = new Date(year, month, day, 12, 0, 0);
      return await prisma.schedule.findMany({
        where: {
          date,
          shiftType: { code: shiftCode },
        },
        include: { nurse: true },
      });
    }

    // Calculate max shifts per nurse (base 8 + annual leave + overtime allowance)
    function getMaxShifts(nurse: typeof allNurses[0], allowOvertime: boolean): number {
      const baseShifts = 8;
      const leaveShifts = nurse.annualLeave || 0;
      const overtimeShifts = allowOvertime ? 10 : 0; // Allow up to 10 overtime shifts
      return baseShifts + leaveShifts + overtimeShifts;
    }

    // Check if nurse is in overtime (exceeded base + leave)
    function isOvertime(nurseId: string): boolean {
      const nurse = allNurses.find(n => n.id === nurseId);
      if (!nurse) return false;
      const baseAndLeave = 8 + (nurse.annualLeave || 0);
      return nurseShiftCounts[nurseId] > baseAndLeave;
    }

    // Try to schedule a nurse
    async function tryScheduleNurse(
      nurse: typeof allNurses[0], 
      day: number, 
      shiftCode: string,
      isOvertimeAllowed: boolean
    ): Promise<{ success: boolean; isOvertime: boolean }> {
      if (!canTakeShift(nurse, shiftCode)) return { success: false, isOvertime: false };
      if (hasLeave(nurse.id, day)) return { success: false, isOvertime: false };

      const maxShifts = getMaxShifts(nurse, isOvertimeAllowed);
      if (nurseShiftCounts[nurse.id] >= maxShifts) return { success: false, isOvertime: false };

      const date = new Date(year, month, day, 12, 0, 0);

      // Check if already scheduled for this day
      const existing = await prisma.schedule.findFirst({
        where: { nurseId: nurse.id, date },
      });
      if (existing) return { success: false, isOvertime: false };

      // Check 24-hour interval
      const has24HourGap = await check24HourInterval(nurse.id, date, shiftCode);
      if (!has24HourGap) return { success: false, isOvertime: false };

      // Validate labor law
      const shiftType = shiftTypeMap.get(shiftCode);
      if (!shiftType) return { success: false, isOvertime: false };

      const validation = await validateSchedule(nurse.id, date, shiftType.id);
      if (!validation.valid) return { success: false, isOvertime: false };

      // Check if this is overtime
      const baseAndLeave = 8 + (nurse.annualLeave || 0);
      const willBeOvertime = nurseShiftCounts[nurse.id] >= baseAndLeave;

      // Create schedule
      try {
        if (!ward) return { success: false, isOvertime: false };
        
        const scheduleData: any = {
          date,
          nurseId: nurse.id,
          shiftTypeId: shiftType.id,
          wardId: ward.id,
          status: 'scheduled',
          violations: JSON.stringify(validation.violations),
        };

        // Mark as overtime if applicable
        if (willBeOvertime) {
          scheduleData.notes = 'OVERTIME';
          nurseOvertimeCounts[nurse.id]++;
        }

        await prisma.schedule.create({
          data: scheduleData,
        });

        nurseShiftCounts[nurse.id]++;
        totalScheduled++;
        shiftDistribution[shiftCode]++;

        return { success: true, isOvertime: willBeOvertime };
      } catch (error) {
        console.error(`Error creating schedule for nurse ${nurse.id}:`, error);
        return { success: false, isOvertime: false };
      }
    }

    // Main scheduling logic - schedule to target count
    async function scheduleToTarget() {
      for (let day = 1; day <= daysInMonth; day++) {
        for (const shiftCode of ['D', 'E', 'N'] as const) {
          const targetCount = shiftRequirements[shiftCode];
          let actualCount = 0;
          let hasSenior = false;
          const nurses: string[] = [];
          const overtimeNurses: string[] = [];

          // Get existing schedules for this shift
          const existing = await getExistingSchedulesForShift(day, shiftCode);
          actualCount = existing.length;
          hasSenior = existing.some(s => {
            const level = s.nurse.level;
            return level === 'N2' || level === 'N3' || level === 'N4';
          });
          existing.forEach(s => {
            nurses.push(s.nurse.name);
            if (isOvertime(s.nurse.id)) {
              overtimeNurses.push(s.nurse.name);
            }
          });

          // If we need more nurses
          if (actualCount < targetCount) {
            const needed = targetCount - actualCount;
            
            // First, try to assign a senior if we don't have one
            if (!hasSenior) {
              const availableSeniors = seniorNurses.filter(n => 
                canTakeShift(n, shiftCode) && 
                !hasLeave(n.id, day) &&
                !nurses.includes(n.name) // Not already scheduled
              );

              for (const senior of availableSeniors) {
                const result = await tryScheduleNurse(senior, day, shiftCode, allowOvertime);
                if (result.success) {
                  actualCount++;
                  hasSenior = true;
                  nurses.push(senior.name);
                  if (result.isOvertime) {
                    overtimeNurses.push(senior.name);
                  }
                  break;
                }
              }
            }

            // Then fill remaining slots
            const remainingNeeded = targetCount - actualCount;
            if (remainingNeeded > 0) {
              // Get all available nurses
              let candidates = allNurses.filter(n => 
                canTakeShift(n, shiftCode) && 
                !hasLeave(n.id, day) &&
                !nurses.includes(n.name)
              );

              // Sort by least scheduled to balance workload
              candidates.sort((a, b) => nurseShiftCounts[a.id] - nurseShiftCounts[b.id]);

              for (const nurse of candidates) {
                if (actualCount >= targetCount) break;

                const result = await tryScheduleNurse(nurse, day, shiftCode, allowOvertime);
                if (result.success) {
                  actualCount++;
                  nurses.push(nurse.name);
                  if (result.isOvertime) {
                    overtimeNurses.push(nurse.name);
                  }
                  
                  // Check if this nurse is senior
                  if (!hasSenior && 
                      (nurse.level === 'N2' || nurse.level === 'N3' || nurse.level === 'N4')) {
                    hasSenior = true;
                  }
                }
              }
            }
          }

          // Calculate actual nurse-patient ratio
          const actualRatio = actualCount > 0 ? actualOccupancy / actualCount : 0;
          const gap = targetCount - actualCount;

          // Record daily status
          dailyStatus.push({
            date: day,
            shiftCode,
            targetCount,
            actualCount,
            hasSenior,
            nurses,
            gap,
            actualRatio,
            overtimeNurses,
          });
        }
      }
    }

    // Execute scheduling
    await scheduleToTarget();

    // Calculate statistics
    const scheduledNurseIds = Object.entries(nurseShiftCounts)
      .filter(([_, count]) => count > 0)
      .map(([id, _]) => id);
    
    const nurseCount = scheduledNurseIds.length;
    const avgDaysPerNurse = nurseCount > 0 ? totalScheduled / nurseCount : 0;

    // Count overtime nurses
    const overtimeNurseIds = Object.entries(nurseOvertimeCounts)
      .filter(([_, count]) => count > 0)
      .map(([id, _]) => id);

    // Check coverage gaps
    const daysWithGaps = dailyStatus.filter(d => d.gap > 0);
    const totalGaps = daysWithGaps.reduce((sum, d) => sum + d.gap, 0);

    // Check N2+ requirement with detailed info
    const shiftsWithoutSenior = dailyStatus.filter(d => !d.hasSenior && d.actualCount > 0);
    
    // Get detailed missing N2+ information
    const missingN2Details = shiftsWithoutSenior.map(d => {
      const shiftName = d.shiftCode === 'D' ? '日班' : d.shiftCode === 'E' ? '小夜班' : '大夜班';
      const timeRange = d.shiftCode === 'D' ? '07:00-15:00' : d.shiftCode === 'E' ? '15:00-23:00' : '23:00-07:00';
      return {
        date: d.date,
        shiftCode: d.shiftCode,
        shiftName,
        timeRange,
        actualCount: d.actualCount,
      };
    });
    
    // Find available senior nurses who can be assigned (not already scheduled that day)
    const availableSeniors = allNurses.filter(n => 
      (n.level === 'N2' || n.level === 'N3' || n.level === 'N4') &&
      !shiftsWithoutSenior.some(d => d.nurses.includes(n.name))
    ).map(n => ({
      id: n.id,
      name: n.name,
      level: n.level,
    }));

    // Calculate average actual ratios
    const avgActualRatios: Record<string, number> = {
      'D': 0,
      'E': 0,
      'N': 0,
    };
    ['D', 'E', 'N'].forEach(shift => {
      const shiftStatuses = dailyStatus.filter(d => d.shiftCode === shift);
      if (shiftStatuses.length > 0) {
        const totalRatio = shiftStatuses.reduce((sum, d) => sum + d.actualRatio, 0);
        avgActualRatios[shift] = totalRatio / shiftStatuses.length;
      }
    });

    return NextResponse.json({
      success: true,
      totalScheduled,
      nurseCount,
      avgDaysPerNurse,
      overtimeCount: overtimeNurseIds.length,
      overtimeNurseIds,
      shiftDistribution,
      dailyStatus,
      daysWithGaps: daysWithGaps.length,
      totalGaps,
      shiftsWithoutSenior: shiftsWithoutSenior.length,
      missingN2Details, // Detailed info about which shifts lack N2+
      availableSeniors, // Recommended senior nurses to assign
      meetsN2Requirement: shiftsWithoutSenior.length === 0,
      avgActualRatios,
      targetRequirements: shiftRequirements,
      actualOccupancy,
      mode,
    });

  } catch (error) {
    console.error('Error in leave priority scheduling:', error);
    return NextResponse.json(
      { success: false, error: 'Leave priority scheduling failed' },
      { status: 500 }
    );
  }
}
