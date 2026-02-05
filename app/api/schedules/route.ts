import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateSchedule, calculateNursePatientRatio } from '@/lib/labor-law-validation';

// GET /api/schedules?month=YYYY-MM
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month');
    const nurseId = searchParams.get('nurseId');

    let where: any = {};

    if (month) {
      const [year, monthNum] = month.split('-').map(Number);
      const startDate = new Date(year, monthNum - 1, 1, 0, 0, 0); // Start of month 00:00
      const endDate = new Date(year, monthNum, 0, 23, 59, 59); // End of month 23:59:59

      where.date = {
        gte: startDate,
        lte: endDate,
      };
    }

    if (nurseId) {
      where.nurseId = nurseId;
    }

    const schedules = await prisma.schedule.findMany({
      where,
      include: {
        nurse: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            level: true,
            specialStatus: true,
          },
        },
        shiftType: true,
      },
      orderBy: {
        date: 'asc',
      },
    });

    return NextResponse.json({ success: true, data: schedules });
  } catch (error) {
    console.error('Error fetching schedules:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch schedules' },
      { status: 500 }
    );
  }
}

// POST /api/schedules
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, nurseId, shiftTypeId, notes } = body;

    // Get the ward (assuming single ward for now)
    const ward = await prisma.ward.findFirst();
    if (!ward) {
      return NextResponse.json(
        { success: false, error: 'No ward found' },
        { status: 400 }
      );
    }

    const actualWardId = ward.id;

    // Validate required fields
    if (!date || !nurseId || !shiftTypeId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Parse date string and create date at noon to avoid timezone issues
    const [year, month, day] = date.split('-').map(Number);
    const scheduleDate = new Date(year, month - 1, day, 12, 0, 0);

    // Check for existing schedule
    const existing = await prisma.schedule.findFirst({
      where: {
        date: scheduleDate,
        nurseId,
        shiftTypeId,
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Schedule already exists for this nurse and shift' },
        { status: 409 }
      );
    }

    // Check nurse's special status
    const nurse = await prisma.nurse.findUnique({
      where: { id: nurseId },
    });

    if (!nurse) {
      return NextResponse.json(
        { success: false, error: 'Nurse not found' },
        { status: 404 }
      );
    }

    const shiftType = await prisma.shiftType.findUnique({
      where: { id: shiftTypeId },
    });

    // Check if pregnant/nursing nurse is assigned to night shift
    if (shiftType?.code === 'N' &&
      (nurse.specialStatus === 'pregnant' || nurse.specialStatus === 'nursing')) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot assign night shift to ${nurse.specialStatus === 'pregnant' ? 'pregnant' : 'nursing'} nurse`,
          violation: 'LABOR_LAW_NIGHT_SHIFT_RESTRICTION'
        },
        { status: 403 }
      );
    }

    // Run labor law validation
    const validation = await validateSchedule(nurseId, scheduleDate, shiftTypeId);

    // Check for errors (not just warnings)
    const errors = validation.violations.filter(v => v.type === 'error');
    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: errors[0].message,
          violations: errors,
        },
        { status: 422 }
      );
    }

    const schedule = await prisma.schedule.create({
      data: {
        date: scheduleDate,
        nurseId,
        shiftTypeId,
        wardId: actualWardId,
        notes,
        status: 'scheduled',
        violations: JSON.stringify(validation.violations),
      },
      include: {
        nurse: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            level: true,
            specialStatus: true,
          },
        },
        shiftType: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: schedule,
      violations: validation.violations,
    });
  } catch (error) {
    console.error('Error creating schedule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create schedule' },
      { status: 500 }
    );
  }
}

// DELETE /api/schedules?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Schedule ID is required' },
        { status: 400 }
      );
    }

    await prisma.schedule.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Schedule deleted' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete schedule' },
      { status: 500 }
    );
  }
}

// PUT /api/schedules - Update schedule status (confirm/unconfirm)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const schedule = await prisma.schedule.update({
      where: { id },
      data: { status },
      include: {
        nurse: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            level: true,
            specialStatus: true,
          },
        },
        shiftType: true,
      },
    });

    return NextResponse.json({ success: true, data: schedule });
  } catch (error) {
    console.error('Error updating schedule:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update schedule' },
      { status: 500 }
    );
  }
}
