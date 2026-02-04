import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateSchedule } from '@/lib/labor-law-validation';

interface NursePreference {
  nurseId: string;
  leaveDates: number[];
  preferredShifts: string[];
}

interface NurseConstraint {
  nurseId: string;
  nurse: any;
  leaveDates: Set<number>;
  preferredShifts: string[];
  maxPossibleDays: number; // 考慮休假後最多可排的天數
  targetDays: number; // 應該排的目標天數
  minDays: number; // 最低應排天數
  specialConstraints: string[]; // 特殊限制（如孕婦不能大夜班）
}

interface DailyRequirement {
  date: number;
  shiftCode: string;
  targetCount: number;
  assignedNurses: string[];
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

    // 使用 try-catch 來處理可能的資料庫結構問題
    let ward: any;
    try {
      ward = await prisma.ward.findFirst();
    } catch (dbError) {
      console.error('Database error fetching ward:', dbError);
      return NextResponse.json(
        { success: false, error: 'Database schema error. Please contact administrator.' },
        { status: 500 }
      );
    }
    
    if (!ward) {
      return NextResponse.json(
        { success: false, error: 'No ward found' },
        { status: 400 }
      );
    }

    // 從設定讀取工作天數限制（使用可選鏈運算符處理可能的缺少欄位）
    const minWorkingDays = ward?.minWorkingDays ?? 20;
    const maxWorkingDays = ward?.maxWorkingDays ?? 26;
    const targetWorkingDays = ward?.targetWorkingDays ?? 22;

    // Get shift-specific requirements from ward settings
    const shiftRequirements: Record<string, number> = {
      'D': ward?.minNursesDay ?? 6,
      'E': ward?.minNursesEvening ?? 6,
      'N': ward?.minNursesNight ?? 5,
    };

    const daysInMonth = new Date(year, month + 1, 0).getDate();

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

    // 步驟1: 收集所有護理師的限制條件
    const nurseConstraints: Map<string, NurseConstraint> = new Map();
    
    for (const nurse of allNurses) {
      const pref = nursePreferences?.find((p: NursePreference) => p.nurseId === nurse.id);
      const leaveDates = new Set<number>(pref?.leaveDates || []);
      
      // 計算特殊限制
      const specialConstraints: string[] = [];
      if (nurse.specialStatus === 'pregnant' || nurse.specialStatus === 'nursing') {
        specialConstraints.push('no_night_shift');
      }
      
      // 計算最大可能工作天數（總天數 - 休假天數）
      const maxPossibleDays = daysInMonth - leaveDates.size;
      
      // 計算應該排的目標天數（取 min(maxPossibleDays, targetWorkingDays)）
      const targetDays = Math.min(maxPossibleDays, targetWorkingDays);
      
      // 計算最低應排天數
      const minDays = Math.min(maxPossibleDays, minWorkingDays);
      
      nurseConstraints.set(nurse.id, {
        nurseId: nurse.id,
        nurse,
        leaveDates,
        preferredShifts: pref?.preferredShifts || ['D', 'E', 'N'],
        maxPossibleDays,
        targetDays,
        minDays,
        specialConstraints,
      });
    }

    // 追蹤變數
    let totalScheduled = 0;
    const nurseShiftCounts: Record<string, number> = {};
    const nurseShiftDetails: Record<string, { day: number; shiftCode: string }[]> = {};
    const shiftDistribution: Record<string, number> = { D: 0, E: 0, N: 0 };
    const dailyStatus: any[] = [];
    
    // 初始化追蹤
    allNurses.forEach(nurse => {
      nurseShiftCounts[nurse.id] = 0;
      nurseShiftDetails[nurse.id] = [];
    });

    // Helper: 檢查是否可以排班
    function canTakeShift(constraint: NurseConstraint, shiftCode: string): boolean {
      if (constraint.specialConstraints.includes('no_night_shift') && shiftCode === 'N') {
        return false;
      }
      return true;
    }

    // Helper: 檢查24小時間隔
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

    // 步驟2: 計算每日需求
    const dailyRequirements: DailyRequirement[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      for (const shiftCode of ['D', 'E', 'N'] as const) {
        dailyRequirements.push({
          date: day,
          shiftCode,
          targetCount: shiftRequirements[shiftCode],
          assignedNurses: [],
        });
      }
    }

    // 步驟3: 第一輪排班 - 優先滿足每日人力需求，同時考慮每人目標天數
    async function firstPassScheduling() {
      // 按日期排序需求
      for (let day = 1; day <= daysInMonth; day++) {
        for (const shiftCode of ['D', 'E', 'N'] as const) {
          const date = new Date(year, month, day, 12, 0, 0);
          const targetCount = shiftRequirements[shiftCode];
          
          // 取得已排班的護理師
          const existingSchedules = await prisma.schedule.findMany({
            where: {
              date,
              shiftType: { code: shiftCode },
            },
            include: { nurse: true },
          });
          
          let currentCount = existingSchedules.length;
          const assignedNurseIds = new Set(existingSchedules.map(s => s.nurseId));
          
          // 如果需要更多人
          while (currentCount < targetCount) {
            // 找出所有可排的候選人，優先考慮班次較少的
            const candidates: { constraint: NurseConstraint; priority: number }[] = [];
            
            for (const constraint of nurseConstraints.values()) {
              // 跳過已排班的
              if (assignedNurseIds.has(constraint.nurseId)) continue;
              
              // 跳過休假的
              if (constraint.leaveDates.has(day)) continue;
              
              // 跳過不能排此班別的
              if (!canTakeShift(constraint, shiftCode)) continue;
              
              // 跳過已達最大工作天數的
              if (nurseShiftCounts[constraint.nurseId] >= maxWorkingDays) continue;
              
              // 跳過已達目標天數的（但如果其他人更少，還是可以排）
              const currentDays = nurseShiftCounts[constraint.nurseId];
              const isBelowTarget = currentDays < constraint.targetDays;
              
              // 計算優先級：班次越少優先級越高，未達目標的優先
              let priority = 1000 - currentDays * 10;
              if (isBelowTarget) priority += 100;
              if (currentDays < constraint.minDays) priority += 200; // 未達最低天數的優先
              
              candidates.push({ constraint, priority });
            }
            
            // 按優先級排序
            candidates.sort((a, b) => b.priority - a.priority);
            
            let scheduled = false;
            
            for (const { constraint } of candidates) {
              // 檢查24小時間隔
              const has24HourGap = await check24HourInterval(constraint.nurseId, date, shiftCode);
              if (!has24HourGap) continue;
              
              // 驗證勞基法
              const shiftType = shiftTypeMap.get(shiftCode);
              if (!shiftType) continue;
              
              const validation = await validateSchedule(constraint.nurseId, date, shiftType.id);
              if (!validation.valid) continue;
              
              // 建立班表
              try {
                await prisma.schedule.create({
                  data: {
                    date,
                    nurseId: constraint.nurseId,
                    shiftTypeId: shiftType.id,
                    wardId: ward!.id,
                    status: 'scheduled',
                    violations: JSON.stringify(validation.violations),
                  },
                });
                
                nurseShiftCounts[constraint.nurseId]++;
                nurseShiftDetails[constraint.nurseId].push({ day, shiftCode });
                totalScheduled++;
                shiftDistribution[shiftCode]++;
                assignedNurseIds.add(constraint.nurseId);
                currentCount++;
                scheduled = true;
                break;
              } catch (error) {
                console.error(`Error creating schedule:`, error);
              }
            }
            
            // 如果沒人能排，跳出
            if (!scheduled) break;
          }
        }
      }
    }

    // 執行第一輪排班
    await firstPassScheduling();

    // 步驟4: 第二輪排班 - 平衡機制，確保每人達到最低天數
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
      
      // 按缺口大小排序，缺口大的優先
      underMinNurses.sort((a, b) => b.deficit - a.deficit);
      
      for (const { constraint, deficit } of underMinNurses) {
        let daysToAdd = deficit;
        
        // 嘗試在未排班的日期中找機會
        for (let day = 1; day <= daysInMonth && daysToAdd > 0; day++) {
          // 跳過休假
          if (constraint.leaveDates.has(day)) continue;
          
          // 檢查是否已排班
          const alreadyScheduled = nurseShiftDetails[constraint.nurseId].some(d => d.day === day);
          if (alreadyScheduled) continue;
          
          const date = new Date(year, month, day, 12, 0, 0);
          
          // 嘗試每個班別
          for (const shiftCode of constraint.preferredShifts) {
            if (!canTakeShift(constraint, shiftCode)) continue;
            
            // 檢查該班別是否已達需求
            const existingCount = await prisma.schedule.count({
              where: {
                date,
                shiftType: { code: shiftCode },
              },
            });
            
            // 即使已達需求，為了平衡也可以額外增加（但優先排未達需求的）
            const canAddExtra = existingCount >= shiftRequirements[shiftCode];
            
            // 檢查24小時間隔
            const has24HourGap = await check24HourInterval(constraint.nurseId, date, shiftCode);
            if (!has24HourGap) continue;
            
            // 驗證勞基法
            const shiftType = shiftTypeMap.get(shiftCode);
            if (!shiftType) continue;
            
            const validation = await validateSchedule(constraint.nurseId, date, shiftType.id);
            if (!validation.valid) continue;
            
            // 建立班表
            try {
              await prisma.schedule.create({
                data: {
                  date,
                  nurseId: constraint.nurseId,
                  shiftTypeId: shiftType.id,
                  wardId: ward!.id,
                  status: 'scheduled',
                  violations: JSON.stringify(validation.violations),
                  notes: canAddExtra ? 'BALANCE_EXTRA' : undefined,
                },
              });
              
              nurseShiftCounts[constraint.nurseId]++;
              nurseShiftDetails[constraint.nurseId].push({ day, shiftCode });
              totalScheduled++;
              shiftDistribution[shiftCode]++;
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

    // 步驟5: 第三輪 - 從過多的人調整到過少的人
    async function redistributeScheduling() {
      // 找出超過目標天數和未達目標天數的護理師
      const overTarget: { constraint: NurseConstraint; excess: number }[] = [];
      const underTarget: { constraint: NurseConstraint; deficit: number }[] = [];
      
      for (const constraint of nurseConstraints.values()) {
        const currentDays = nurseShiftCounts[constraint.nurseId];
        if (currentDays > constraint.targetDays) {
          overTarget.push({ constraint, excess: currentDays - constraint.targetDays });
        } else if (currentDays < constraint.targetDays) {
          underTarget.push({ constraint, deficit: constraint.targetDays - currentDays });
        }
      }
      
      // 按差距排序
      overTarget.sort((a, b) => b.excess - a.excess);
      underTarget.sort((a, b) => b.deficit - a.deficit);
      
      // 嘗試從 overTarget 轉移班次到 underTarget
      for (const over of overTarget) {
        const overDetails = nurseShiftDetails[over.constraint.nurseId];
        
        for (let i = overDetails.length - 1; i >= 0 && over.excess > 0; i--) {
          const { day, shiftCode } = overDetails[i];
          
          // 嘗試找一個 underTarget 的護理師來替換
          for (const under of underTarget) {
            if (under.deficit <= 0) continue;
            
            const underConstraint = under.constraint;
            
            // 檢查 under 是否可以在這天這個班別工作
            if (underConstraint.leaveDates.has(day)) continue;
            if (!canTakeShift(underConstraint, shiftCode)) continue;
            
            const alreadyScheduled = nurseShiftDetails[underConstraint.nurseId].some(d => d.day === day);
            if (alreadyScheduled) continue;
            
            const date = new Date(year, month, day, 12, 0, 0);
            
            // 檢查24小時間隔
            const has24HourGap = await check24HourInterval(underConstraint.nurseId, date, shiftCode);
            if (!has24HourGap) continue;
            
            // 驗證勞基法
            const shiftType = shiftTypeMap.get(shiftCode);
            if (!shiftType) continue;
            
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
              nurseShiftDetails[over.constraint.nurseId] = overDetails.filter(
                d => !(d.day === day && d.shiftCode === shiftCode)
              );
              nurseShiftDetails[underConstraint.nurseId].push({ day, shiftCode });
              
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

    // 生成統計報告
    const finalStats: any[] = [];
    for (const constraint of nurseConstraints.values()) {
      const currentDays = nurseShiftCounts[constraint.nurseId];
      const details = nurseShiftDetails[constraint.nurseId];
      
      finalStats.push({
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
        shiftDetails: details,
      });
    }

    // 按工作天數排序
    finalStats.sort((a, b) => a.currentDays - b.currentDays);

    // 計算整體統計
    const totalNurses = allNurses.length;
    const nursesBelowMin = finalStats.filter(s => s.status === 'BELOW_MIN').length;
    const nursesOverTarget = finalStats.filter(s => s.status === 'OVER_TARGET').length;
    const avgDays = totalNurses > 0 ? finalStats.reduce((sum, s) => sum + s.currentDays, 0) / totalNurses : 0;

    // 生成每日狀態
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day, 12, 0, 0);
      
      for (const shiftCode of ['D', 'E', 'N'] as const) {
        const schedules = await prisma.schedule.findMany({
          where: {
            date,
            shiftType: { code: shiftCode },
          },
          include: { nurse: true },
        });
        
        const hasSenior = schedules.some(s => 
          s.nurse.level === 'N2' || s.nurse.level === 'N3' || s.nurse.level === 'N4'
        );
        
        dailyStatus.push({
          date: day,
          shiftCode,
          targetCount: shiftRequirements[shiftCode],
          actualCount: schedules.length,
          hasSenior,
          nurses: schedules.map(s => s.nurse.name),
          gap: Math.max(0, shiftRequirements[shiftCode] - schedules.length),
        });
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalScheduled,
        totalNurses,
        avgDaysPerNurse: Math.round(avgDays * 10) / 10,
        nursesBelowMin,
        nursesOverTarget,
        shiftDistribution,
        settings: {
          minWorkingDays,
          maxWorkingDays,
          targetWorkingDays,
          daysInMonth,
        },
      },
      nurseStats: finalStats,
      dailyStatus,
      daysWithGaps: dailyStatus.filter(d => d.gap > 0).length,
      shiftsWithoutSenior: dailyStatus.filter(d => !d.hasSenior && d.actualCount > 0).length,
    });

  } catch (error) {
    console.error('Error in leave priority scheduling:', error);
    return NextResponse.json(
      { success: false, error: 'Leave priority scheduling failed' },
      { status: 500 }
    );
  }
}
