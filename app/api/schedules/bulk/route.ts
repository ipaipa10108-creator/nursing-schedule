import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { schedules } = body;

        if (!Array.isArray(schedules)) {
            return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
        }

        // Transaction to create multiple schedules
        const created = await prisma.$transaction(
            schedules.map((s: any) =>
                prisma.schedule.create({
                    data: {
                        date: new Date(s.date),
                        nurseId: s.nurseId,
                        shiftTypeId: s.shiftTypeId,
                        status: 'scheduled',
                        // We might want to clear existing schedules for these dates/nurses first?
                        // For now, simple create. Prisma might throw if unique constraint exists.
                        // Assuming (nurseId, date) is unique? Even if not database-enforced, logical constraint.
                        // Let's use upsert or deleteMany first?
                        // Safe approach: just create, let errors happen if duplicates.
                    }
                })
            )
        );

        return NextResponse.json({ success: true, count: created.length });
    } catch (error) {
        console.error('Bulk create error:', error);
        return NextResponse.json({ success: false, error: 'Failed to save schedules' }, { status: 500 });
    }
}
