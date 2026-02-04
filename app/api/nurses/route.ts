import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/nurses - List all nurses
export async function GET() {
  try {
    const nurses = await prisma.nurse.findMany({
      orderBy: { employeeId: 'asc' },
    });
    
    return NextResponse.json({ success: true, data: nurses });
  } catch (error) {
    console.error('Error fetching nurses:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch nurses' },
      { status: 500 }
    );
  }
}

// POST /api/nurses - Create new nurse
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      employeeId, 
      name, 
      email, 
      phone, 
      level, 
      seniority, 
      specialStatus,
      annualLeave,
      sickLeave,
      personalLeave
    } = body;

    // Validation
    if (!employeeId || !name || !email || !level) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check for duplicate employeeId
    const existing = await prisma.nurse.findUnique({
      where: { employeeId },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Employee ID already exists' },
        { status: 409 }
      );
    }

    // Check for duplicate email
    const existingEmail = await prisma.nurse.findUnique({
      where: { email },
    });

    if (existingEmail) {
      return NextResponse.json(
        { success: false, error: 'Email already exists' },
        { status: 409 }
      );
    }

    const nurse = await prisma.nurse.create({
      data: {
        employeeId,
        name,
        email,
        phone: phone || null,
        level,
        seniority: seniority || 0,
        specialStatus: specialStatus || 'none',
        annualLeave: annualLeave || 0,
        sickLeave: sickLeave || 30,
        personalLeave: personalLeave || 14,
        joinDate: new Date(),
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, data: nurse });
  } catch (error) {
    console.error('Error creating nurse:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create nurse' },
      { status: 500 }
    );
  }
}

// PUT /api/nurses - Update nurse
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Nurse ID is required' },
        { status: 400 }
      );
    }

    const nurse = await prisma.nurse.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: nurse });
  } catch (error) {
    console.error('Error updating nurse:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update nurse' },
      { status: 500 }
    );
  }
}

// DELETE /api/nurses?id=xxx - Delete nurse
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Nurse ID is required' },
        { status: 400 }
      );
    }

    // Soft delete - set isActive to false instead of actually deleting
    const nurse = await prisma.nurse.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Nurse deactivated successfully',
      data: nurse 
    });
  } catch (error) {
    console.error('Error deleting nurse:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete nurse' },
      { status: 500 }
    );
  }
}
