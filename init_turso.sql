-- CreateTable
CREATE TABLE "Nurse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "level" TEXT NOT NULL,
    "seniority" REAL NOT NULL,
    "specialStatus" TEXT NOT NULL DEFAULT 'none',
    "joinDate" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "annualLeave" REAL NOT NULL DEFAULT 0,
    "sickLeave" REAL NOT NULL DEFAULT 0,
    "personalLeave" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Ward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "totalBeds" INTEGER NOT NULL DEFAULT 50,
    "nursePatientRatio" REAL NOT NULL DEFAULT 8.0,
    "dayShiftRatio" REAL NOT NULL DEFAULT 1.0,
    "eveningShiftRatio" REAL NOT NULL DEFAULT 1.0,
    "nightShiftRatio" REAL NOT NULL DEFAULT 1.0,
    "minNursesDay" INTEGER NOT NULL DEFAULT 7,
    "minNursesEvening" INTEGER NOT NULL DEFAULT 7,
    "minNursesNight" INTEGER NOT NULL DEFAULT 4,
    "minWorkingDays" INTEGER NOT NULL DEFAULT 20,
    "maxWorkingDays" INTEGER NOT NULL DEFAULT 26,
    "targetWorkingDays" INTEGER NOT NULL DEFAULT 22,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShiftType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "nurseId" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "shiftTypeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "violations" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Schedule_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "Nurse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Schedule_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Schedule_shiftTypeId_fkey" FOREIGN KEY ("shiftTypeId") REFERENCES "ShiftType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nurseId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "days" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeaveRequest_nurseId_fkey" FOREIGN KEY ("nurseId") REFERENCES "Nurse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SchedulePeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "wardId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" DATETIME,
    "publishedBy" TEXT,
    "totalShifts" INTEGER NOT NULL DEFAULT 0,
    "violations" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Nurse_employeeId_key" ON "Nurse"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Nurse_email_key" ON "Nurse"("email");

-- CreateIndex
CREATE INDEX "Nurse_isActive_idx" ON "Nurse"("isActive");

-- CreateIndex
CREATE INDEX "Nurse_level_idx" ON "Nurse"("level");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftType_code_key" ON "ShiftType"("code");

-- CreateIndex
CREATE INDEX "Schedule_date_idx" ON "Schedule"("date");

-- CreateIndex
CREATE INDEX "Schedule_nurseId_date_idx" ON "Schedule"("nurseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_nurseId_date_shiftTypeId_key" ON "Schedule"("nurseId", "date", "shiftTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "SchedulePeriod_year_month_wardId_key" ON "SchedulePeriod"("year", "month", "wardId");

