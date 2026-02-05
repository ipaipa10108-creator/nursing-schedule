
import { prisma } from './lib/db';
import { validateSchedule } from './lib/labor-law-validation';

// Mock Request Body
const payload = {
    year: 2026,
    month: 1, // February
    mode: 'fixed',
    nursePreferences: [],
    allowOvertime: true
};

async function check24HourInterval(nurseId: string, date: Date, shiftCode: string, shiftTypeMap: any) {
    // simplified for debug
    return true;
}

// Helper: 檢查是否可以排班
function canTakeShift(constraint: any, shiftCode: string): boolean {
    if (constraint.specialConstraints.includes('no_night_shift') && shiftCode === 'N') {
        return false;
    }
    return true;
}

async function runSimulation() {
    console.log('--- simulation start ---');
    const { year, month } = payload;
    const ward = await prisma.ward.findFirst();
    if (!ward) { console.log('No ward'); return; }
    console.log('Ward found:', ward.name);

    const shiftRequirements: Record<string, number> = {
        'D': ward?.minNursesDay ?? 6,
        'E': ward?.minNursesEvening ?? 6,
        'N': ward?.minNursesNight ?? 5,
    };
    console.log('Requirements:', shiftRequirements);

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const allNurses = await prisma.nurse.findMany({ where: { isActive: true } });
    console.log('Active Nurses:', allNurses.length);

    const shiftTypes = await prisma.shiftType.findMany();
    const shiftTypeMap = new Map(shiftTypes.map(st => [st.code, st]));

    // Build Constraints
    const nurseConstraints: Map<string, any> = new Map();
    for (const nurse of allNurses) {
        nurseConstraints.set(nurse.id, {
            nurseId: nurse.id,
            nurse,
            leaveDates: new Set(), // assume no leave for now
            preferredShifts: ['D', 'E', 'N'],
            maxPossibleDays: daysInMonth,
            targetDays: 22,
            minDays: 20,
            specialConstraints: [],
        });
    }

    let totalScheduled = 0;
    const nurseShiftCounts: Record<string, number> = {};
    const nurseShiftDetails: Record<string, any[]> = {};
    allNurses.forEach(n => {
        nurseShiftCounts[n.id] = 0;
        nurseShiftDetails[n.id] = [];
    });

    // First Pass
    for (let day = 1; day <= daysInMonth; day++) {
        for (const shiftCode of ['D', 'E', 'N'] as const) {
            const targetCount = shiftRequirements[shiftCode];
            let currentCount = 0; // assume empty DB for simulation
            const assignedNurseIds = new Set(); // assume empty

            while (currentCount < targetCount) {
                const candidates: any[] = [];
                for (const constraint of nurseConstraints.values()) {
                    if (assignedNurseIds.has(constraint.nurseId)) continue;
                    if (!canTakeShift(constraint, shiftCode)) continue;
                    if (nurseShiftCounts[constraint.nurseId] >= 26) continue;

                    const currentDays = nurseShiftCounts[constraint.nurseId];
                    const isBelowTarget = currentDays < constraint.targetDays;
                    let priority = 1000 - currentDays * 10;
                    if (isBelowTarget) priority += 100;
                    if (currentDays < constraint.minDays) priority += 200;

                    candidates.push({ constraint, priority });
                }

                candidates.sort((a, b) => b.priority - a.priority);

                let scheduled = false;
                for (const { constraint } of candidates) {
                    // Skip actual DB write, just simulate increment
                    // Assuming validations pass
                    nurseShiftCounts[constraint.nurseId]++;
                    nurseShiftDetails[constraint.nurseId].push({ day, shiftCode });
                    totalScheduled++;
                    assignedNurseIds.add(constraint.nurseId);
                    currentCount++;
                    scheduled = true;
                    // console.log(`Scheduled ${constraint.nurse.name} on Day ${day} Shift ${shiftCode}`);
                    break;
                }
                if (!scheduled) {
                    // console.log(`Failed to schedule D${day} S${shiftCode}. Count: ${currentCount}/${targetCount}`);
                    break;
                }
            }
        }
    }

    console.log('Total Scheduled:', totalScheduled);
    console.log('First pass done.');
}

runSimulation()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
