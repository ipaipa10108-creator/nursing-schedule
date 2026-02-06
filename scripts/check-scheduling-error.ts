
import { PrismaClient } from '@prisma/client';
import { validateSchedule } from '@/lib/labor-law-validation';

const prisma = new PrismaClient();

async function checkSchedulingError() {
    console.log('🔄 Starting scheduling checks...');

    try {
        // 1. Check Ward
        const ward = await prisma.ward.findFirst();
        if (!ward) {
            console.error('❌ No Ward found in database!');
        } else {
            console.log('✅ Ward found:', ward.name);
        }

        // 2. Check Shift Types
        const shiftTypes = await prisma.shiftType.findMany();
        if (shiftTypes.length === 0) {
            console.error('❌ No Shift Types found!');
        } else {
            console.log('✅ Shift Types found:', shiftTypes.map(s => s.code).join(', '));
        }

        // 3. Check Nurses
        const nurses = await prisma.nurse.findMany({ where: { isActive: true } });
        if (nurses.length === 0) {
            console.error('❌ No active nurses found!');
        } else {
            console.log(`✅ Found ${nurses.length} active nurses`);
        }

        // 4. Simulate a simple scheduling request (Dry Run)
        console.log('\n🔄 Simulating request body...');

        // Pick first 3 nurses for D, E, N
        const dNurses = nurses.slice(0, 2).map(n => n.id);
        const eNurses = nurses.slice(2, 4).map(n => n.id);
        const nNurses = nurses.slice(4, 6).map(n => n.id);

        const requestBody = {
            year: new Date().getFullYear(),
            month: new Date().getMonth(),
            shiftAssignments: {
                D: dNurses,
                E: eNurses,
                N: nNurses
            },
            vacationRequests: []
        };

        console.log('Request payload prepared:', JSON.stringify(requestBody, null, 2));

        // 5. Test Validation Logic (CRASH TEST)
        console.log('\n🧪 Testing validateSchedule with INVALID shift ID...');
        try {
            const fakeNurse = nurses[0].id;
            const fakeDate = new Date();
            const invalidShiftId = "non-existent-id";

            const result = await validateSchedule(fakeNurse, fakeDate, invalidShiftId);
            console.log('✅ validateSchedule handled invalid shift correctly (no crash). Result:', JSON.stringify(result));
        } catch (e) {
            console.error('❌ validateSchedule CRASHED:', e);
        }

        // Suggest running this payload against the API
        console.log('\n⚠️ To test the API real logic, verify the server logs when running the web app.');

    } catch (error) {
        console.error('❌ Unexpected error in check script:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkSchedulingError();
