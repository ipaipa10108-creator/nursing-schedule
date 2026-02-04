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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Ward" ("createdAt", "dayShiftRatio", "eveningShiftRatio", "id", "name", "nightShiftRatio", "totalBeds", "updatedAt") SELECT "createdAt", "dayShiftRatio", "eveningShiftRatio", "id", "name", "nightShiftRatio", "totalBeds", "updatedAt" FROM "Ward";
DROP TABLE "Ward";
ALTER TABLE "new_Ward" RENAME TO "Ward";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
