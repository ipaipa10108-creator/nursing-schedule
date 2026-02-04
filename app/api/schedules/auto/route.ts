import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateSchedule } from '@/lib/labor-law-validation';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nurseId, year, month, leaveDates, preferredShifts } = body;

    if (!nurseId || !year || !month) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get nurse and ward info
    const nurse = await prisma.nurse.findUnique({ where: { id: nurseId } });
    if (!nurse) {
      return NextResponse.json(
        { success: false, error: 'Nurse not found' },
        { status: 404 }
      );
    }

    const ward = await prisma.ward.findFirst();
    if (!ward) {
      return NextResponse.json(
        { success: false, error: 'No ward found' },
        { status: 400 }
      );
    }

    // Get shift types
    const shiftTypes = await prisma.shiftType.findMany();
    const availableShifts = shiftTypes.filter(st => preferredShifts?.includes(st.code));

    if (availableShifts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No preferred shifts available' },
        { status: 400 }
      );
    }

    // Get days in month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leaveDateSet = new Set(leaveDates || []);

    // Track results
    const created = [];
    const errors = [];
    const warnings = [];

    // Try to schedule for each day
    for (let day = 1; day <= daysInMonth; day++) {
      // Skip leave days
      if (leaveDateSet.has(day)) continue;

      const date = new Date(year, month, day, 12, 0, 0);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // Check if already scheduled for this day
      const existing = await prisma.schedule.findFirst({
        where: {
          nurseId,
          date,
        },
      });

      if (existing) continue;

      // Try each preferred shift
      let scheduled = false;
      for (const shift of availableShifts) {
        // Skip night shift for pregnant/nursing nurses
        if (shift.code === 'N' && 
            (nurse.specialStatus === 'pregnant' || nurse.specialStatus === 'nursing')) {
          continue;
        }

        // Validate labor law
        const validation = await validateSchedule(nurseId, date, shift.id);

        // If no errors, create schedule
        if (validation.valid) {
          try {
            const schedule = await prisma.schedule.create({
              data: {
                date,
                nurseId,
                shiftTypeId: shift.id,
                wardId: ward.id,
                status: 'scheduled',
                violations: JSON.stringify(validation.violations),
              },
            });
            created.push(schedule);
            scheduled = true;

            // Count warnings
            const dayWarnings = validation.violations.filter(v => v.type === 'warning');
            warnings.push(...dayWarnings);

            break; // Successfully scheduled, move to next day
          } catch (err) {
            console.error('Error creating schedule:', err);
          }
        }
      }

      if (!scheduled) {
        errors.push({
          date: dateStr,
          reason: 'No valid shift available (labor law violations or all shifts tried)',
        });
      }
    }

    return NextResponse.json({
      success: true,
      created: created.length,
      errors: errors.length,
      warnings: warnings.length,
      details: {
        created,
        errors,
        warnings,
      },
    });

  } catch (error) {
    console.error('Error in auto scheduling:', error);
    return NextResponse.json(
      { success: false, error: 'Auto scheduling failed' },
      { status: 500 }
    );
  }
}
