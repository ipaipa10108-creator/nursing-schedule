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

        // Check for ward
        const ward = await prisma.ward.findFirst();
        if (!ward) {
            return NextResponse.json({ success: false, error: 'No ward found, cannot create schedules' }, { status: 400 });
        }

        // Identify range and nurses to clear
        // We assume valid schedules have date and nurseId
        if (schedules.length > 0) {
            const dates = schedules.map((s: any) => new Date(s.date));
            const minDate = new Date(Math.min(...dates.map((d: any) => d.getTime())));
            const maxDate = new Date(Math.max(...dates.map((d: any) => d.getTime())));
            const nurseIds = Array.from(new Set(schedules.map((s: any) => s.nurseId))); // Unique IDs

            // Clean up: Delete existing schedules for these nurses in this date range
            // NOTE: In a real app, you might want to preserve 'confirmed' status.
            // For now, we overwrite everything for these nurses in this range.
            // Normalize dates to ensure we cover the full range
            const startDate = new Date(minDate);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(maxDate);
            endDate.setHours(23, 59, 59, 999);

            // Clean up: Delete existing schedules for these nurses in this date range
            const deleteResult = await prisma.schedule.deleteMany({
                where: {
                    nurseId: { in: nurseIds as string[] },
                    date: {
                        gte: startDate,
                        lte: endDate
                    },
                    wardId: ward.id
                }
            });
            console.log(`Deleted ${deleteResult.count} conflicting schedules.`);
        }

        // Transaction to create multiple schedules
        const created = await prisma.$transaction(
            schedules.map((s: any) =>
                prisma.schedule.create({
                    data: {
                        date: new Date(s.date),
                        nurseId: s.nurseId,
                        shiftTypeId: s.shiftTypeId,
                        wardId: ward.id,
                        status: 'scheduled',
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
