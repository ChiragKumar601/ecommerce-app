-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "houseFlat" TEXT NOT NULL,
    "building" TEXT,
    "streetArea" TEXT NOT NULL,
    "landmark" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "labelType" TEXT NOT NULL,
    "labelText" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Address_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Address_accountId_createdAt_idx" ON "Address"("accountId", "createdAt");

-- Hand-written (plan §6.1): exactly one default address per account (ADDR-006).
CREATE UNIQUE INDEX "Address_one_default" ON "Address"("accountId") WHERE "isDefault" = 1;
