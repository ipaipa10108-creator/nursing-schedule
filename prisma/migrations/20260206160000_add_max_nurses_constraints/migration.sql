-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ward" (
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
    "maxNursesDay" INTEGER NOT NULL DEFAULT 15,
    "maxNursesEvening" INTEGER NOT NULL DEFAULT 12,
    "maxNursesNight" INTEGER NOT NULL DEFAULT 10,
    "minWorkingDays" INTEGER NOT NULL DEFAULT 20,
    "maxWorkingDays" INTEGER NOT NULL DEFAULT 26,
    "targetWorkingDays" INTEGER NOT NULL DEFAULT 22,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Ward" ("createdAt", "dayShiftRatio", "eveningShiftRatio", "id", "minNursesDay", "minNursesEvening", "minNursesNight", "minWorkingDays", "maxWorkingDays", "targetWorkingDays", "name", "nightShiftRatio", "nursePatientRatio", "totalBeds", "updatedAt") SELECT "createdAt", "dayShiftRatio", "eveningShiftRatio", "id", "minNursesDay", "minNursesEvening", "minNursesNight", "minWorkingDays", "maxWorkingDays", "targetWorkingDays", "name", "nightShiftRatio", "nursePatientRatio", "totalBeds", "updatedAt" FROM "Ward";
DROP TABLE "Ward";
ALTER TABLE "new_Ward" RENAME TO "Ward";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
