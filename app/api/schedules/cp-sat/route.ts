
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
import { spawn } from 'child_process';
import path from 'path';

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
        const scriptPath = path.join(process.cwd(), 'solver', 'schedule_optimizer.py');

        const runSolver = async () => {
            // 雲端環境優先使用外部 SOLVER_API_URL (例如部署在 Hugging Face 或 Render 的 API)
            const solverApiUrl = process.env.SOLVER_API_URL;
            if (solverApiUrl) {
                console.log(`Forwarding solving task to external solver: ${solverApiUrl}`);
                try {
                    const res = await fetch(solverApiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(inputData),
                    });
                    if (!res.ok) {
                        const errText = await res.text();
                        throw new Error(`External Solver API failed (${res.status}): ${errText.substring(0, 150)}`);
                    }
                    return await res.json();
                } catch (externalErr: any) {
                    console.error('External Solver Error:', externalErr);
                    throw new Error(`外部 Solver 呼叫失敗: ${externalErr.message}`);
                }
            }

            // 降級使用本地 uv 執行 (本地開發環境)
            return new Promise<any>((resolve, reject) => {
                // 使用 uv run 確保環境正確
                const pythonProcess = spawn('uv', ['run', 'python', scriptPath], {
                    cwd: process.cwd(),
                    env: process.env
                });

                let stdoutData = '';
                let stderrData = '';

                pythonProcess.stdout.on('data', (data: Buffer) => {
                    stdoutData += data.toString();
                });

                pythonProcess.stderr.on('data', (data: Buffer) => {
                    stderrData += data.toString();
                });

                // 新增錯誤處理，避免因缺少 uv 導致 Node.js process crash (發生於 Vercel)
                pythonProcess.on('error', (err: NodeJS.ErrnoException) => {
                    console.error('Failed to spawn python/uv:', err);
                    reject(new Error(`無法啟動本地 Python solver (您的伺服器缺少 'uv' 工具，請設定 SOLVER_API_URL 變數): ${err.message}`));
                });

                pythonProcess.on('close', (code: number) => {
                    if (code !== 0) {
                        reject(new Error(`Solver failed with code ${code}: ${stderrData}`));
                    } else {
                        try {
                            const result = JSON.parse(stdoutData.trim());
                            resolve(result);
                        } catch (e) {
                            console.error('Solver output parsing failed. Raw output:', stdoutData);
                            reject(new Error(`Invalid JSON output from solver. Raw output length: ${stdoutData.length}. Check server logs for details.`));
                        }
                    }
                });

                pythonProcess.stdin.write(JSON.stringify(inputData));
                pythonProcess.stdin.end();
            });
        };

        const result = await runSolver();

        if (!result.success) {
            return NextResponse.json(result, { status: 422 });
        }

        // 5. 儲存結果與資料庫
        if (result.success && Array.isArray(result.schedules) && result.schedules.length > 0) {
            await prisma.$transaction(async (tx: TxClient) => {
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
