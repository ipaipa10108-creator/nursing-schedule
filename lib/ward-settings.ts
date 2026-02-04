// 輔助函數：安全地獲取病房設定
// 處理資料庫欄位可能不存在的情況

export async function getWardSettings(prisma: any) {
  try {
    // 嘗試查詢病房資訊
    const ward = await prisma.ward.findFirst();
    
    if (!ward) {
      return null;
    }
    
    // 使用 try-catch 來處理可能的欄位缺失
    return {
      id: ward.id,
      name: ward.name,
      totalBeds: ward.totalBeds ?? 50,
      nursePatientRatio: ward.nursePatientRatio ?? 8,
      minNursesDay: safeGet(ward, 'minNursesDay', 7),
      minNursesEvening: safeGet(ward, 'minNursesEvening', 7),
      minNursesNight: safeGet(ward, 'minNursesNight', 4),
      minWorkingDays: safeGet(ward, 'minWorkingDays', 20),
      maxWorkingDays: safeGet(ward, 'maxWorkingDays', 26),
      targetWorkingDays: safeGet(ward, 'targetWorkingDays', 22),
    };
  } catch (error) {
    console.error('Error getting ward settings:', error);
    // 返回預設值
    return {
      id: 'default',
      name: 'Default Ward',
      totalBeds: 50,
      nursePatientRatio: 8,
      minNursesDay: 7,
      minNursesEvening: 7,
      minNursesNight: 4,
      minWorkingDays: 20,
      maxWorkingDays: 26,
      targetWorkingDays: 22,
    };
  }
}

function safeGet(obj: any, key: string, defaultValue: any) {
  try {
    return obj[key] ?? defaultValue;
  } catch {
    return defaultValue;
  }
}
