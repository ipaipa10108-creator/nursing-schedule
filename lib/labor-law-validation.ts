import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ValidationResult {
  valid: boolean;
  violations: Violation[];
}

export interface Violation {
  code: string;
  type: 'error' | 'warning';
  message: string;
  nurseId: string;
  nurseName: string;
  date: string;
  details?: string;
}

export interface ScheduleCheck {
  nurseId: string;
  date: Date;
  shiftTypeId: string;
  shiftCode: string;
  startTime: string;
  endTime: string;
}

/**
 * 主要驗證函式：檢查排班是否符合勞基法
 */
export async function validateSchedule(
  nurseId: string,
  date: Date,
  shiftTypeId: string
): Promise<ValidationResult> {
  const violations: Violation[] = [];

  // 取得護理師資訊
  const nurse = await prisma.nurse.findUnique({
    where: { id: nurseId },
  });

  if (!nurse) {
    return { valid: false, violations: [] };
  }

  // 取得班別資訊
  const shiftType = await prisma.shiftType.findUnique({
    where: { id: shiftTypeId },
  });

  if (!shiftType) {
    console.warn(`[validateSchedule] Shift type not found: ${shiftTypeId}`);
    return { valid: false, violations: [] };
  }

  const check: ScheduleCheck = {
    nurseId,
    date,
    shiftTypeId,
    shiftCode: shiftType.code,
    startTime: shiftType.startTime,
    endTime: shiftType.endTime,
  };

  // 1. 檢查孕婦/哺乳期大夜班限制
  const pregnancyCheck = await checkPregnancyNightShift(check, nurse);
  if (pregnancyCheck) violations.push(pregnancyCheck);

  // 2. 檢查七休一（每7天2天休息）
  const sevenDayRestCheck = await checkSevenDayRestRule(nurseId, date);
  violations.push(...sevenDayRestCheck);

  // 3. 檢查連續工作不超過6天
  const consecutiveWorkCheck = await checkConsecutiveWorkDays(nurseId, date);
  if (consecutiveWorkCheck) violations.push(consecutiveWorkCheck);

  // 4. 檢查班次間隔11小時
  const restIntervalCheck = await checkRestInterval(nurseId, date, shiftType);
  if (restIntervalCheck) violations.push(restIntervalCheck);

  // 5. 檢查每日工時上限12小時
  const dailyHoursCheck = await checkDailyHoursLimit(nurseId, date, shiftType);
  if (dailyHoursCheck) violations.push(dailyHoursCheck);

  return {
    valid: violations.filter(v => v.type === 'error').length === 0,
    violations,
  };
}

/**
 * 檢查孕婦/哺乳期是否被安排大夜班
 */
async function checkPregnancyNightShift(
  check: ScheduleCheck,
  nurse: any
): Promise<Violation | null> {
  if (check.shiftCode === 'N' &&
    (nurse.specialStatus === 'pregnant' || nurse.specialStatus === 'nursing')) {
    return {
      code: 'LABOR_LAW_NIGHT_SHIFT_RESTRICTION',
      type: 'error',
      message: '孕婦/哺乳期護理師不得安排大夜班',
      nurseId: check.nurseId,
      nurseName: nurse.name,
      date: check.date.toISOString().split('T')[0],
      details: `根據勞動基準法，${nurse.specialStatus === 'pregnant' ? '孕期' : '哺乳期'}間禁止午後10時至翌晨6時工作`,
    };
  }
  return null;
}

/**
 * 檢查七休一（每7天內必須有2天休息）
 */
async function checkSevenDayRestRule(
  nurseId: string,
  date: Date
): Promise<Violation[]> {
  const violations: Violation[] = [];

  // 檢查未來7天
  const startDate = new Date(date);
  startDate.setDate(date.getDate() - 6); // 往前看6天 + 今天 = 7天

  const endDate = new Date(date);
  endDate.setDate(date.getDate() + 6); // 往後看6天

  const schedules = await prisma.schedule.findMany({
    where: {
      nurseId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      nurse: true,
    },
    orderBy: {
      date: 'asc',
    },
  });

  // 檢查每個7天區間
  for (let i = 0; i < 7; i++) {
    const windowStart = new Date(startDate);
    windowStart.setDate(startDate.getDate() + i);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowStart.getDate() + 6);

    const workDaysInWindow = schedules.filter(s => {
      const sDate = new Date(s.date);
      return sDate >= windowStart && sDate <= windowEnd;
    }).length;

    // 如果7天內工作超過5天（即休息少於2天），產生警告
    if (workDaysInWindow > 5) {
      const nurse = schedules[0]?.nurse;
      violations.push({
        code: 'LABOR_LAW_SEVEN_DAY_REST',
        type: 'error',
        message: '違反七休一原則',
        nurseId,
        nurseName: nurse?.name || 'Unknown',
        date: date.toISOString().split('T')[0],
        details: `${windowStart.toISOString().split('T')[0]} 至 ${windowEnd.toISOString().split('T')[0]} 期間，工作 ${workDaysInWindow} 天，違反每7日應有2日休息之規定`,
      });
    }
  }

  return violations;
}

/**
 * 檢查連續工作不超過6天
 */
async function checkConsecutiveWorkDays(
  nurseId: string,
  date: Date
): Promise<Violation | null> {
  // 檢查過去6天 + 今天是否有連續7天工作
  const checkStart = new Date(date);
  checkStart.setDate(date.getDate() - 6);

  const checkEnd = new Date(date);

  const schedules = await prisma.schedule.findMany({
    where: {
      nurseId,
      date: {
        gte: checkStart,
        lte: checkEnd,
      },
    },
    include: {
      nurse: true,
    },
    orderBy: {
      date: 'asc',
    },
  });

  // 檢查是否有連續7天
  if (schedules.length >= 7) {
    const nurse = schedules[0].nurse;
    return {
      code: 'LABOR_LAW_CONSECUTIVE_WORK',
      type: 'error',
      message: '連續工作超過6天',
      nurseId,
      nurseName: nurse.name,
      date: date.toISOString().split('T')[0],
      details: `已連續工作 ${schedules.length} 天，違反勞基法不得連續工作超過6日之規定`,
    };
  }

  return null;
}

/**
 * 檢查班次間隔是否至少11小時
 */
async function checkRestInterval(
  nurseId: string,
  date: Date,
  newShiftType: any
): Promise<Violation | null> {
  // 檢查前一天的班表
  const prevDate = new Date(date);
  prevDate.setDate(date.getDate() - 1);

  const prevSchedule = await prisma.schedule.findFirst({
    where: {
      nurseId,
      date: prevDate,
    },
    include: {
      shiftType: true,
      nurse: true,
    },
  });

  if (!prevSchedule) return null;

  // 計算休息時間
  const prevEnd = new Date(`${prevDate.toISOString().split('T')[0]}T${prevSchedule.shiftType.endTime}`);
  const newStart = new Date(`${date.toISOString().split('T')[0]}T${newShiftType.startTime}`);

  // 如果前一天的班次跨越午夜
  if (prevSchedule.shiftType.code === 'N') {
    prevEnd.setDate(prevEnd.getDate() + 1);
  }

  const restHours = (newStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60);

  if (restHours < 11) {
    return {
      code: 'LABOR_LAW_REST_INTERVAL',
      type: 'error',
      message: '班次間隔不足11小時',
      nurseId,
      nurseName: prevSchedule.nurse.name,
      date: date.toISOString().split('T')[0],
      details: `前一班下班時間 ${prevSchedule.shiftType.endTime}，本班上班時間 ${newShiftType.startTime}，休息時間僅 ${restHours.toFixed(1)} 小時，違反至少應有11小時休息之規定`,
    };
  }

  // 如果少於11小時但多於8小時，給予警告（緊急情況例外）
  if (restHours >= 8 && restHours < 11) {
    return {
      code: 'LABOR_LAW_REST_INTERVAL_WARNING',
      type: 'warning',
      message: '班次間隔接近下限',
      nurseId,
      nurseName: prevSchedule.nurse.name,
      date: date.toISOString().split('T')[0],
      details: `休息時間 ${restHours.toFixed(1)} 小時，雖符合緊急情況例外（≥8小時），但建議優先安排11小時以上休息`,
    };
  }

  return null;
}

/**
 * 檢查每日工時是否超過12小時
 */
async function checkDailyHoursLimit(
  nurseId: string,
  date: Date,
  shiftType: any
): Promise<Violation | null> {
  // 計算本次班次的工時
  let hours = 0;

  const start = new Date(`${date.toISOString().split('T')[0]}T${shiftType.startTime}`);
  let end = new Date(`${date.toISOString().split('T')[0]}T${shiftType.endTime}`);

  // 如果跨越午夜
  if (end < start) {
    end.setDate(end.getDate() + 1);
  }

  hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

  // 檢查是否超過12小時
  if (hours > 12) {
    const nurse = await prisma.nurse.findUnique({ where: { id: nurseId } });
    return {
      code: 'LABOR_LAW_DAILY_HOURS',
      type: 'error',
      message: '每日工時超過上限',
      nurseId,
      nurseName: nurse?.name || 'Unknown',
      date: date.toISOString().split('T')[0],
      details: `本班工時 ${hours} 小時，違反每日連同加班不得超過12小時之規定`,
    };
  }

  return null;
}

/**
 * 計算護病比
 */
export async function calculateNursePatientRatio(
  date: Date,
  shiftTypeId: string,
  wardId: string
): Promise<{ ratio: number; required: number; actual: number; status: 'ok' | 'warning' | 'error' }> {
  const ward = await prisma.ward.findUnique({
    where: { id: wardId },
  });

  if (!ward) {
    return { ratio: 0, required: 0, actual: 0, status: 'error' };
  }

  const shiftType = await prisma.shiftType.findUnique({
    where: { id: shiftTypeId },
  });

  if (!shiftType) {
    return { ratio: 0, required: 0, actual: 0, status: 'error' };
  }

  // 取得該班護理師人數
  const nurseCount = await prisma.schedule.count({
    where: {
      date,
      shiftTypeId,
      wardId,
    },
  });

  // 根據班別取得護病比標準
  let requiredRatio = ward.dayShiftRatio;
  if (shiftType.code === 'E') requiredRatio = ward.eveningShiftRatio;
  if (shiftType.code === 'N') requiredRatio = ward.nightShiftRatio;

  // 計算所需護理師數
  const requiredNurses = Math.ceil(ward.totalBeds / requiredRatio);

  // 計算實際護病比
  const actualRatio = nurseCount > 0 ? ward.totalBeds / nurseCount : 0;

  let status: 'ok' | 'warning' | 'error' = 'ok';
  if (nurseCount < requiredNurses) {
    status = 'error';
  } else if (nurseCount === requiredNurses) {
    status = 'warning';
  }

  return {
    ratio: actualRatio,
    required: requiredNurses,
    actual: nurseCount,
    status,
  };
}
