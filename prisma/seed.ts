import 'dotenv/config';
console.log('Current directory:', process.cwd());
console.log('TURSO_DATABASE_URL:', process.env.TURSO_DATABASE_URL ? 'Set' : 'Unset');
import { prisma } from '../lib/db';

const NurseLevel = {
  N0: 'N0',
  N1: 'N1',
  N2: 'N2',
  N3: 'N3',
  N4: 'N4'
} as const;

const SpecialStatus = {
  none: 'none',
  pregnant: 'pregnant',
  nursing: 'nursing',
  restricted: 'restricted'
} as const;

type NurseLevelType = typeof NurseLevel[keyof typeof NurseLevel];
type SpecialStatusType = typeof SpecialStatus[keyof typeof SpecialStatus];

interface NurseData {
  name: string;
  level: NurseLevelType;
  seniority: number;
  annualLeave: number;
  specialStatus?: SpecialStatusType;
}

async function main() {
  console.log('開始建立 dummy 資料...');

  // 1. 建立婦癌病房
  const ward = await prisma.ward.create({
    data: {
      name: '婦癌病房',
      totalBeds: 50,
      nursePatientRatio: 8.0,
      dayShiftRatio: 1.0,
      eveningShiftRatio: 1.0,
      nightShiftRatio: 1.0,
      minNursesDay: 7,
      minNursesEvening: 7,
      minNursesNight: 4,
      minWorkingDays: 20,
      maxWorkingDays: 26,
      targetWorkingDays: 22,
    },
  });
  console.log('✓ 建立病房:', ward.name);

  // 2. 建立班別
  await prisma.shiftType.createMany({
    data: [
      { name: '日班', code: 'D', startTime: '07:00', endTime: '15:00' },
      { name: '小夜班', code: 'E', startTime: '15:00', endTime: '23:00' },
      { name: '大夜班', code: 'N', startTime: '23:00', endTime: '07:00' },
    ],
  });
  console.log('✓ 建立班別: 日班、小夜班、大夜班');

  // 3. 建立 20 位護理人員
  const nursesData: NurseData[] = [
    { name: '陳雅婷', level: NurseLevel.N0, seniority: 0.5, annualLeave: 3 },
    { name: '林小雯', level: NurseLevel.N0, seniority: 0.8, annualLeave: 3, specialStatus: SpecialStatus.pregnant },
    { name: '王美琪', level: NurseLevel.N0, seniority: 0.3, annualLeave: 3 },
    { name: '張怡君', level: NurseLevel.N0, seniority: 0.6, annualLeave: 3 },
    { name: '李思穎', level: NurseLevel.N0, seniority: 0.4, annualLeave: 3 },
    { name: '黃曉玲', level: NurseLevel.N1, seniority: 1.2, annualLeave: 7 },
    { name: '吳佩珊', level: NurseLevel.N1, seniority: 1.5, annualLeave: 7 },
    { name: '劉佳慧', level: NurseLevel.N1, seniority: 1.8, annualLeave: 7 },
    { name: '周雅芳', level: NurseLevel.N1, seniority: 1.1, annualLeave: 7, specialStatus: SpecialStatus.nursing },
    { name: '趙靜怡', level: NurseLevel.N1, seniority: 1.6, annualLeave: 7 },
    { name: '孫嘉玲', level: NurseLevel.N2, seniority: 2.3, annualLeave: 10 },
    { name: '馬玉玲', level: NurseLevel.N2, seniority: 2.8, annualLeave: 10 },
    { name: '朱婉婷', level: NurseLevel.N2, seniority: 2.1, annualLeave: 10 },
    { name: '郭思琪', level: NurseLevel.N2, seniority: 2.6, annualLeave: 10 },
    { name: '許美鳳', level: NurseLevel.N3, seniority: 3.5, annualLeave: 14 },
    { name: '何麗華', level: NurseLevel.N3, seniority: 4.2, annualLeave: 14 },
    { name: '鄭怡萱', level: NurseLevel.N3, seniority: 3.8, annualLeave: 14 },
    { name: '謝淑芬', level: NurseLevel.N4, seniority: 6.5, annualLeave: 14 },
    { name: '羅美惠', level: NurseLevel.N4, seniority: 8.2, annualLeave: 14 },
    { name: '林雅琴', level: NurseLevel.N2, seniority: 2.5, annualLeave: 10 },
  ];

  const nurses = [];
  for (let i = 0; i < nursesData.length; i++) {
    const data = nursesData[i];
    const nurse = await prisma.nurse.create({
      data: {
        employeeId: `NUR${String(i + 1).padStart(3, '0')}`,
        name: data.name,
        email: `nurse${i + 1}@hospital.test`,
        phone: `0912-${String(345000 + i + 1)}`,
        level: data.level,
        seniority: data.seniority,
        specialStatus: data.specialStatus || SpecialStatus.none,
        joinDate: new Date(Date.now() - data.seniority * 365 * 24 * 60 * 60 * 1000),
        annualLeave: data.annualLeave,
        sickLeave: 30,
        personalLeave: 14,
        isActive: true,
      },
    });
    nurses.push(nurse);
    console.log(`✓ 建立護理師: ${nurse.name} (${nurse.level}, ${nurse.seniority}年)`);
  }

  console.log('\n✅ Dummy 資料建立完成！');
  console.log(`- 病房: ${ward.name} (${ward.totalBeds}床)`);
  console.log(`- 護理人員: ${nurses.length}人`);
  console.log(`  - N0: ${nurses.filter(n => n.level === 'N0').length}人`);
  console.log(`  - N1: ${nurses.filter(n => n.level === 'N1').length}人`);
  console.log(`  - N2: ${nurses.filter(n => n.level === 'N2').length}人`);
  console.log(`  - N3: ${nurses.filter(n => n.level === 'N3').length}人`);
  console.log(`  - N4: ${nurses.filter(n => n.level === 'N4').length}人`);
  console.log(`  - 孕婦/哺乳期: ${nurses.filter(n => n.specialStatus !== 'none').length}人 (自動排除大夜班)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
