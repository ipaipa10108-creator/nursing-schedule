import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    // Get the first ward (assuming single ward for now)
    let ward = await prisma.ward.findFirst();
    
    // If no ward exists, create default one
    if (!ward) {
      ward = await prisma.ward.create({
        data: {
          name: '婦癌病房',
          totalBeds: 50,
          nursePatientRatio: 8,
          minNursesDay: 7,
          minNursesEvening: 7,
          minNursesNight: 4,
        },
      });
    }
    
    return NextResponse.json({
      success: true,
      ward: {
        id: ward.id,
        name: ward.name,
        totalBeds: ward.totalBeds,
        nursePatientRatio: ward.nursePatientRatio,
        minNursesDay: ward.minNursesDay,
        minNursesEvening: ward.minNursesEvening,
        minNursesNight: ward.minNursesNight,
      },
    });
  } catch (error) {
    console.error('Error fetching ward settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, totalBeds, nursePatientRatio, minNursesDay, minNursesEvening, minNursesNight } = body;
    
    // Validation
    if (!name || !totalBeds || !nursePatientRatio) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    if (totalBeds < 1 || totalBeds > 200) {
      return NextResponse.json(
        { success: false, error: '病床數必須在 1-200 之間' },
        { status: 400 }
      );
    }
    
    if (nursePatientRatio < 1 || nursePatientRatio > 20) {
      return NextResponse.json(
        { success: false, error: '護病比必須在 1-20 之間' },
        { status: 400 }
      );
    }
    
    // Validate shift-specific nurse requirements
    if (minNursesDay !== undefined && (minNursesDay < 1 || minNursesDay > 50)) {
      return NextResponse.json(
        { success: false, error: '日班護理師數必須在 1-50 之間' },
        { status: 400 }
      );
    }
    
    if (minNursesEvening !== undefined && (minNursesEvening < 1 || minNursesEvening > 50)) {
      return NextResponse.json(
        { success: false, error: '小夜班護理師數必須在 1-50 之間' },
        { status: 400 }
      );
    }
    
    if (minNursesNight !== undefined && (minNursesNight < 1 || minNursesNight > 50)) {
      return NextResponse.json(
        { success: false, error: '大夜班護理師數必須在 1-50 之間' },
        { status: 400 }
      );
    }
    
    // Get or create ward
    let ward = await prisma.ward.findFirst();
    
    const updateData: any = {
      name,
      totalBeds,
      nursePatientRatio,
    };
    
    // Only update shift-specific fields if provided
    if (minNursesDay !== undefined) updateData.minNursesDay = minNursesDay;
    if (minNursesEvening !== undefined) updateData.minNursesEvening = minNursesEvening;
    if (minNursesNight !== undefined) updateData.minNursesNight = minNursesNight;
    
    if (ward) {
      // Update existing ward
      ward = await prisma.ward.update({
        where: { id: ward.id },
        data: updateData,
      });
    } else {
      // Create new ward with defaults
      ward = await prisma.ward.create({
        data: {
          ...updateData,
          minNursesDay: minNursesDay || 7,
          minNursesEvening: minNursesEvening || 7,
          minNursesNight: minNursesNight || 4,
        },
      });
    }
    
    return NextResponse.json({
      success: true,
      ward: {
        id: ward.id,
        name: ward.name,
        totalBeds: ward.totalBeds,
        nursePatientRatio: ward.nursePatientRatio,
        minNursesDay: ward.minNursesDay,
        minNursesEvening: ward.minNursesEvening,
        minNursesNight: ward.minNursesNight,
      },
    });
  } catch (error) {
    console.error('Error saving ward settings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}
