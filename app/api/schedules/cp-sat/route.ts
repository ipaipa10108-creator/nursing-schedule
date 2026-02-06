import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { year: rawYear, month: rawMonth, vacationRequests } = body;
        const year = Number(rawYear);
        const month = Number(rawMonth); // 0-indexed

        if (isNaN(year) || isNaN(month)) {
            return NextResponse.json(
                { success: false, error: 'Missing or invalid year/month' },
                { status: 400 }
            );
        }

        // 1. 取得必要資料 (Ward, Nurses, ShiftTypes)
        const ward = await prisma.ward.findFirst();
        if (!ward) {
            return NextResponse.json({ success: false, error: 'Ward config not found' }, { status: 400 });
        }

        const nurses = await prisma.nurse.findMany({
            where: { isActive: true },
            select: { id: true, name: true, level: true, specialStatus: true }
        });

        const shiftTypes = await prisma.shiftType.findMany();

        // 2. 轉換 Vacation Requests 為 Pre-assigned
        const preAssigned: any[] = [];

        // (A) 來自 body.preAssigned (如果前端直接傳)
        if (Array.isArray(body.preAssigned)) {
            preAssigned.push(...body.preAssigned);
        }

        // (B) 來自 vacationRequests (舊格式或簡化格式)
        if (Array.isArray(vacationRequests)) {
            vacationRequests.forEach((req: any) => {
                if (req.nurseId && Array.isArray(req.dates)) {
                    req.dates.forEach((day: number) => {
                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        // 避免重複加入
                        if (!preAssigned.some(p => p.nurseId === req.nurseId && p.date === dateStr)) {
                            preAssigned.push({
                                nurseId: req.nurseId,
                                date: dateStr,
                                shiftCode: 'O'
                            });
                        }
                    });
                }
            });
        }

        // 3. 建構 Python 輸入資料
        const inputData = {
            year,
            month,
            nurses,
            shiftTypes,
            wardConfig: {
                minNursesDay: ward.minNursesDay,
                minNursesEvening: ward.minNursesEvening,
                minNursesNight: ward.minNursesNight,
                minWorkingDays: ward.minWorkingDays,
                maxWorkingDays: ward.maxWorkingDays
            },
            constraints: {
                minShiftInterval11h: body.constraints?.minShiftInterval11h ?? true,
                avoidFlowerPattern: body.constraints?.avoidFlowerPattern ?? true,
                minSeniorCount: body.constraints?.minSeniorCount ?? 1,
                maxWeeklyShiftChanges: body.constraints?.maxWeeklyShiftChanges ?? 2,
                equalShiftDistribution: body.constraints?.equalShiftDistribution ?? true,
            },
            nurseForbiddenShifts: body.nurseForbiddenShifts || {},
            preAssigned
        };

        // 4. 呼叫 Python Solver
        // 4. 呼叫 Python Solver (Vercel Serverless Function)
        // 在 Vercel 環境中，我們不能使用 spawn，而是透過 HTTP 呼叫 api/optimize_schedule.py

        let solverUrl: string;
        if (process.env.VERCEL_URL) {
            solverUrl = `https://${process.env.VERCEL_URL}/api/optimize_schedule`;
        } else if (process.env.NEXT_PUBLIC_APP_URL) {
            solverUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/optimize_schedule`;
        } else {
            // Fallback for local dev
            solverUrl = 'http://localhost:3000/api/optimize_schedule';
        }

        console.log(`🚀 Sending optimization request to: ${solverUrl}`);

        const response = await fetch(solverUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(inputData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Solver API failed with status ${response.status}: ${errorText}`);
            throw new Error(`Solver API failed: ${errorText} (Status ${response.status})`);
        }

        const result = await response.json();

        // 5. 儲存結果與資料庫
        if (result.success && Array.isArray(result.schedules) && result.schedules.length > 0) {
            await prisma.$transaction(async (tx) => {
                // (A) 清除該月份已存在的排班
                const startDate = new Date(year, month, 1);
                const endDate = new Date(year, month + 1, 0, 23, 59, 59);

                await tx.schedule.deleteMany({
                    where: {
                        wardId: ward.id,
                        date: {
                            gte: startDate,
                            lte: endDate
                        }
                    }
                });

                // (B) 寫入新班表
                const schedulesToCreate = result.schedules.map((s: any) => ({
                    date: new Date(s.date),
                    nurseId: s.nurseId,
                    shiftTypeId: s.shiftTypeId,
                    wardId: ward.id,
                    status: 'scheduled',
                    notes: 'CP-SAT Optimized'
                }));

                if (schedulesToCreate.length > 0) {
                    await tx.schedule.createMany({
                        data: schedulesToCreate
                    });
                }
            });
        }

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('CP-SAT Scheduling Error:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
