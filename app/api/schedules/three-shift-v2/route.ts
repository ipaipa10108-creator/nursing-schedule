import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateSchedule } from '@/lib/labor-law-validation';

interface NurseConstraint {
  nurseId: string;
  nurse: any;
  leaveDates: Set<number>;
  maxPossibleDays: number;
  targetDays: number;
  minDays: number;
  specialConstraints: string[];
  assignedShifts: { day: number; shiftCode: string }[];
}

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

    // 從設定讀取工作天數限制
    const minWorkingDays = ward.minWorkingDays || 20;
    const maxWorkingDays = ward.maxWorkingDays || 26;
    const targetWorkingDays = ward.targetWorkingDays || 22;

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

    // 步驟1: 收集所有護理師的限制條件
    const nurseConstraints: Map<string, NurseConstraint> = new Map();
    const allNurseIds = new Set<string>();
    
    // 收集所有護理師ID
    Object.values(shiftAssignments as Record<string, string[]>).forEach(nurseIds => {
      nurseIds.forEach(id => allNurseIds.add(id));
    });
    
    // 為每個護理師建立限制資料
    for (const nurseId of allNurseIds) {
      const nurse = await prisma.nurse.findUnique({ where: { id: nurseId } });
      if (!nurse || !nurse.isActive) continue;
      
      const leaveDates = vacationMap.get(nurseId) || new Set<number>();
      
      // 計算特殊限制
      const specialConstraints: string[] = [];
      if (nurse.specialStatus === 'pregnant' || nurse.specialStatus === 'nursing') {
        specialConstraints.push('no_night_shift');
      }
      
      // 計算最大可能工作天數
      const maxPossibleDays = daysInMonth - leaveDates.size;
      
      // 計算應該排的目標天數和最低天數
      const targetDays = Math.min(maxPossibleDays, targetWorkingDays);
      const minDays = Math.min(maxPossibleDays, minWorkingDays);
      
      nurseConstraints.set(nurseId, {
        nurseId,
        nurse,
        leaveDates,
        maxPossibleDays,
        targetDays,
        minDays,
        specialConstraints,
        assignedShifts: [],
      });
    }

    // Track results
    let scheduledCount = 0;
    const nurseShiftCounts: Record<string, number> = {};
    const shiftBreakdown: Record<string, number> = { D: 0, E: 0, N: 0 };
    const dailyStats: Record<string, { D: number, E: number, N: number }> = {};

    // 初始化計數器
    nurseConstraints.forEach((constraint, nurseId) => {
      nurseShiftCounts[nurseId] = 0;
    });

    // Helper: 檢查是否可以排班
    function canTakeShift(constraint: NurseConstraint, shiftCode: string): boolean {
      if (constraint.specialConstraints.includes('no_night_shift') && shiftCode === 'N') {
        return false;
      }
      return true;
    }

    // Helper: 檢查24小時間隔
    async function check24HourInterval(constraint: NurseConstraint, date: Date, shiftCode: string): Promise<boolean> {
      const shiftType = shiftTypeMap.get(shiftCode);
      if (!shiftType) return false;

      // 檢查已分配的班次
      for (const assigned of constraint.assignedShifts) {
        const assignedDate = new Date(year, month, assigned.day);
        const dayDiff = Math.abs(date.getDate() - assigned.day);
        
        if (dayDiff <= 1) {
          // 取得已分配班次的資訊
          const assignedShiftType = shiftTypeMap.get(assigned.shiftCode);
          if (!assignedShiftType) continue;
          
          const assignedDate = new Date(year, month, assigned.day);
          const assignedEnd = new Date(assignedDate);
          const [endHour, endMin] = assignedShiftType.endTime.split(':').map(Number);
          assignedEnd.setHours(endHour, endMin);
          
          const newStart = new Date(date);
          const [startHour, startMin] = shiftType.startTime.split(':').map(Number);
          newStart.setHours(startHour, startMin);
          
          // 如果前一天的班次跨越午夜
          if (assigned.shiftCode === 'N') {
            assignedEnd.setDate(assignedEnd.getDate() + 1);
          }
          
          const hoursDiff = (newStart.getTime() - assignedEnd.getTime()) / (1000 * 60 * 60);
          
          if (Math.abs(hoursDiff) < 24) {
            return false;
          }
        }
      }

      // 檢查資料庫中已存在的班次
      const prevDate = new Date(date);
      prevDate.setDate(date.getDate() - 1);
      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + 1);

      const nearbySchedules = await prisma.schedule.findMany({
        where: {
          nurseId: constraint.nurseId,
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
        
        // 如果前一天的班次跨越午夜
        if (nearby.shiftType.code === 'N') {
          nearbyEnd.setDate(nearbyEnd.getDate() + 1);
        }
        
        const hoursDiff = (newStart.getTime() - nearbyEnd.getTime()) / (1000 * 60 * 60);
        
        if (Math.abs(hoursDiff) < 24) {
          return false;
        }
      }

      return true;
    }

    // 步驟2: 第一輪排班 - 基本輪詢，優先滿足人力需求
    async function firstPassScheduling() {
      // Track nurse rotation index for each shift (round-robin)
      const rotationIndex: Record<string, number> = { D: 0, E: 0, N: 0 };
      
      // Get available nurses for each shift
      const shiftNurses: Record<string, string[]> = {
        D: shiftAssignments.D || [],
        E: shiftAssignments.E || [],
        N: shiftAssignments.N || [],
      };

      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day, 12, 0, 0);
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        dailyStats[dateStr] = { D: 0, E: 0, N: 0 };

        for (const shiftCode of ['D', 'E', 'N'] as const) {
          const shiftType = shiftTypeMap.get(shiftCode);
          const availableNurseIds = shiftNurses[shiftCode];
          
          if (!shiftType || !availableNurseIds || availableNurseIds.length === 0) {
            continue;
          }

          // 嘗試排班，優先考慮班次較少的護理師
          let scheduledForThisShift = false;
          let attempts = 0;
          const maxAttempts = availableNurseIds.length;

          // 建立候選人列表，按班次數量排序
          const candidates: { nurseId: string; constraint: NurseConstraint; priority: number }[] = [];
          
          for (const nurseId of availableNurseIds) {
            const constraint = nurseConstraints.get(nurseId);
            if (!constraint) continue;
            
            // 檢查基本條件
            if (constraint.leaveDates.has(day)) continue;
            if (!canTakeShift(constraint, shiftCode)) continue;
            if (nurseShiftCounts[nurseId] >= maxWorkingDays) continue;
            
            // 檢查是否已排班
            const existing = await prisma.schedule.findFirst({
              where: { nurseId, date },
            });
            if (existing) continue;
            
            // 計算優先級（班次越少優先級越高）
            const currentDays = nurseShiftCounts[nurseId];
            const isBelowTarget = currentDays < constraint.targetDays;
            const isBelowMin = currentDays < constraint.minDays;
            
            let priority = 1000 - currentDays * 10;
            if (isBelowTarget) priority += 100;
            if (isBelowMin) priority += 200;
            
            candidates.push({ nurseId, constraint, priority });
          }
          
          // 按優先級排序
          candidates.sort((a, b) => b.priority - a.priority);

          for (const { nurseId, constraint } of candidates) {
            if (scheduledForThisShift) break;
            if (attempts >= maxAttempts) break;
            attempts++;

            try {
              // Check 24-hour interval
              const has24HourGap = await check24HourInterval(constraint, date, shiftCode);
              if (!has24HourGap) continue;

              // Validate labor law
              const validation = await validateSchedule(nurseId, date, shiftType.id);
              if (!validation.valid) continue;

              // Create schedule
              await prisma.schedule.create({
                data: {
                  date,
                  nurseId,
                  shiftTypeId: shiftType.id,
                  wardId: ward!.id,
                  status: 'scheduled',
                  violations: JSON.stringify(validation.violations),
                },
              });

              // Update counters
              scheduledCount++;
              shiftBreakdown[shiftCode]++;
              dailyStats[dateStr][shiftCode as 'D' | 'E' | 'N']++;
              nurseShiftCounts[nurseId]++;
              constraint.assignedShifts.push({ day, shiftCode });
              
              scheduledForThisShift = true;

            } catch (error) {
              console.error(`Error scheduling nurse ${nurseId}:`, error);
            }
          }
        }
      }
    }

    // 執行第一輪排班
    await firstPassScheduling();

    // 步驟3: 第二輪排班 - 平衡機制，確保每人達到最低天數
    async function balanceScheduling() {
      // 找出未達最低天數的護理師
      const underMinNurses: { constraint: NurseConstraint; deficit: number }[] = [];
      
      for (const constraint of nurseConstraints.values()) {
        const currentDays = nurseShiftCounts[constraint.nurseId];
        if (currentDays < constraint.minDays) {
          underMinNurses.push({
            constraint,
            deficit: constraint.minDays - currentDays,
          });
        }
      }
      
      // 按缺口大小排序
      underMinNurses.sort((a, b) => b.deficit - a.deficit);
      
      // 為每個未達標的護理師嘗試增加班次
      for (const { constraint, deficit } of underMinNurses) {
        let daysToAdd = deficit;
        
        // 找出此護理師可以排的班別
        const availableShiftCodes: string[] = [];
        if (shiftAssignments.D?.includes(constraint.nurseId)) availableShiftCodes.push('D');
        if (shiftAssignments.E?.includes(constraint.nurseId)) availableShiftCodes.push('E');
        if (shiftAssignments.N?.includes(constraint.nurseId) && !constraint.specialConstraints.includes('no_night_shift')) {
          availableShiftCodes.push('N');
        }
        
        for (let day = 1; day <= daysInMonth && daysToAdd > 0; day++) {
          // 跳過休假
          if (constraint.leaveDates.has(day)) continue;
          
          // 檢查是否已排班
          const alreadyScheduled = constraint.assignedShifts.some(s => s.day === day);
          if (alreadyScheduled) continue;
          
          const date = new Date(year, month, day, 12, 0, 0);
          
          // 嘗試每個可用班別
          for (const shiftCode of availableShiftCodes) {
            const shiftType = shiftTypeMap.get(shiftCode);
            if (!shiftType) continue;
            
            // 檢查24小時間隔
            const has24HourGap = await check24HourInterval(constraint, date, shiftCode);
            if (!has24HourGap) continue;
            
            // 驗證勞基法
            const validation = await validateSchedule(constraint.nurseId, date, shiftType.id);
            if (!validation.valid) continue;
            
            try {
              // 建立班表
              await prisma.schedule.create({
                data: {
                  date,
                  nurseId: constraint.nurseId,
                  shiftTypeId: shiftType.id,
                  wardId: ward!.id,
                  status: 'scheduled',
                  violations: JSON.stringify(validation.violations),
                  notes: 'BALANCE_EXTRA',
                },
              });
              
              scheduledCount++;
              shiftBreakdown[shiftCode]++;
              nurseShiftCounts[constraint.nurseId]++;
              constraint.assignedShifts.push({ day, shiftCode });
              
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              if (dailyStats[dateStr]) {
                dailyStats[dateStr][shiftCode as 'D' | 'E' | 'N']++;
              }
              
              daysToAdd--;
              break; // 這天已排，換下一天
            } catch (error) {
              console.error(`Error in balance scheduling:`, error);
            }
          }
        }
      }
    }

    // 執行平衡排班
    await balanceScheduling();

    // 步驟4: 第三輪 - 重新分配，從過多的人調整到過少的人
    async function redistributeScheduling() {
      // 找出超過目標天數和未達目標天數的護理師
      const overTarget: { constraint: NurseConstraint; excess: number }[] = [];
      const underTarget: { constraint: NurseConstraint; deficit: number }[] = [];
      
      for (const constraint of nurseConstraints.values()) {
        const currentDays = nurseShiftCounts[constraint.nurseId];
        if (currentDays > constraint.targetDays) {
          overTarget.push({ constraint, excess: currentDays - constraint.targetDays });
        } else if (currentDays < constraint.targetDays && currentDays < constraint.maxPossibleDays) {
          underTarget.push({ constraint, deficit: constraint.targetDays - currentDays });
        }
      }
      
      // 按差距排序
      overTarget.sort((a, b) => b.excess - a.excess);
      underTarget.sort((a, b) => b.deficit - a.deficit);
      
      // 嘗試轉移班次
      for (const over of overTarget) {
        const overShifts = [...over.constraint.assignedShifts];
        
        for (let i = overShifts.length - 1; i >= 0 && over.excess > 0; i--) {
          const { day, shiftCode } = overShifts[i];
          
          // 嘗試找一個 underTarget 的護理師來替換
          for (const under of underTarget) {
            if (under.deficit <= 0) continue;
            
            const underConstraint = under.constraint;
            
            // 檢查 under 是否可以在這天這個班別工作
            if (underConstraint.leaveDates.has(day)) continue;
            if (!canTakeShift(underConstraint, shiftCode)) continue;
            
            // 檢查 under 是否已排班這天
            const alreadyScheduled = underConstraint.assignedShifts.some(s => s.day === day);
            if (alreadyScheduled) continue;
            
            // 檢查 under 是否在此班別清單中
            const canWorkThisShift = 
              (shiftAssignments.D?.includes(underConstraint.nurseId) && shiftCode === 'D') ||
              (shiftAssignments.E?.includes(underConstraint.nurseId) && shiftCode === 'E') ||
              (shiftAssignments.N?.includes(underConstraint.nurseId) && shiftCode === 'N');
            if (!canWorkThisShift) continue;
            
            const date = new Date(year, month, day, 12, 0, 0);
            const shiftType = shiftTypeMap.get(shiftCode);
            if (!shiftType) continue;
            
            // 檢查24小時間隔
            const has24HourGap = await check24HourInterval(underConstraint, date, shiftCode);
            if (!has24HourGap) continue;
            
            // 驗證勞基法
            const validation = await validateSchedule(underConstraint.nurseId, date, shiftType.id);
            if (!validation.valid) continue;
            
            // 找到要刪除的 over 的班表
            const overSchedule = await prisma.schedule.findFirst({
              where: {
                nurseId: over.constraint.nurseId,
                date,
                shiftType: { code: shiftCode },
              },
            });
            
            if (!overSchedule) continue;
            
            try {
              // 刪除 over 的班表
              await prisma.schedule.delete({
                where: { id: overSchedule.id },
              });
              
              // 建立 under 的班表
              await prisma.schedule.create({
                data: {
                  date,
                  nurseId: underConstraint.nurseId,
                  shiftTypeId: shiftType.id,
                  wardId: ward!.id,
                  status: 'scheduled',
                  violations: JSON.stringify(validation.violations),
                  notes: 'REDISTRIBUTED',
                },
              });
              
              // 更新追蹤
              nurseShiftCounts[over.constraint.nurseId]--;
              nurseShiftCounts[underConstraint.nurseId]++;
              
              // 更新 assignedShifts
              over.constraint.assignedShifts = over.constraint.assignedShifts.filter(
                s => !(s.day === day && s.shiftCode === shiftCode)
              );
              underConstraint.assignedShifts.push({ day, shiftCode });
              
              over.excess--;
              under.deficit--;
              
              break; // 這個班次已轉移，換下一個
            } catch (error) {
              console.error(`Error in redistribution:`, error);
            }
          }
        }
      }
    }

    // 執行重新分配
    await redistributeScheduling();

    // 生成護理師統計
    const nurseStats: any[] = [];
    for (const constraint of nurseConstraints.values()) {
      const currentDays = nurseShiftCounts[constraint.nurseId];
      
      nurseStats.push({
        nurseId: constraint.nurseId,
        nurseName: constraint.nurse.name,
        employeeId: constraint.nurse.employeeId,
        level: constraint.nurse.level,
        currentDays,
        targetDays: constraint.targetDays,
        minDays: constraint.minDays,
        maxPossibleDays: constraint.maxPossibleDays,
        leaveDays: constraint.leaveDates.size,
        status: currentDays < constraint.minDays ? 'BELOW_MIN' : 
                currentDays > constraint.targetDays ? 'OVER_TARGET' : 'OK',
        shiftDetails: constraint.assignedShifts,
      });
    }

    // 按工作天數排序
    nurseStats.sort((a, b) => a.currentDays - b.currentDays);

    // 計算統計
    const totalNursesUsed = Object.values(nurseShiftCounts).filter(count => count > 0).length;
    const avgShiftsPerNurse = totalNursesUsed > 0 ? 
      Object.values(nurseShiftCounts).reduce((sum, count) => sum + count, 0) / totalNursesUsed : 0;

    // 檢查天數不足的護理師
    const nursesBelowMin = nurseStats.filter(s => s.status === 'BELOW_MIN').length;
    const nursesOverTarget = nurseStats.filter(s => s.status === 'OVER_TARGET').length;

    return NextResponse.json({
      success: true,
      summary: {
        scheduledCount,
        shiftBreakdown,
        avgShiftsPerNurse: Math.round(avgShiftsPerNurse * 10) / 10,
        totalNursesUsed,
        nursesBelowMin,
        nursesOverTarget,
        settings: {
          minWorkingDays,
          maxWorkingDays,
          targetWorkingDays,
        },
      },
      nurseStats,
      dailyStats,
      nurseShiftCounts,
    });

  } catch (error) {
    console.error('Error in three-shift v2 scheduling:', error);
    return NextResponse.json(
      { success: false, error: 'Three-shift scheduling failed' },
      { status: 500 }
    );
  }
}
