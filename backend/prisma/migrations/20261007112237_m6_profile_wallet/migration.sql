-- AlterTable
ALTER TABLE "Account" ADD COLUMN "deletionRequestedAt" DATETIME;

-- CreateTable
CREATE TABLE "SavedCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "nameOnCard" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "issuingBank" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "expiryMonth" INTEGER NOT NULL,
    "expiryYear" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "testCardRef" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "SavedCard_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountGiftCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialBalance" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "redeemedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "AccountGiftCard_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GiftCardTxn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountGiftCardId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "GiftCardTxn_accountGiftCardId_fkey" FOREIGN KEY ("accountGiftCardId") REFERENCES "AccountGiftCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestNumber" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "orderId" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "SupportRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SavedCard_accountId_createdAt_idx" ON "SavedCard"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountGiftCard_accountId_code_key" ON "AccountGiftCard"("accountId", "code");

-- CreateIndex
CREATE INDEX "GiftCardTxn_accountGiftCardId_createdAt_idx" ON "GiftCardTxn"("accountGiftCardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportRequest_requestNumber_key" ON "SupportRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "SupportRequest_accountId_createdAt_idx" ON "SupportRequest"("accountId", "createdAt");

-- Hand-written (plan §6.1): one default card per account (PRF-005); balances never negative.
CREATE UNIQUE INDEX "SavedCard_one_default" ON "SavedCard"("accountId") WHERE "isDefault" = 1;
CREATE TRIGGER "AccountGiftCard_balance_check_insert" BEFORE INSERT ON "AccountGiftCard" WHEN NEW."balance" < 0 BEGIN SELECT RAISE(ABORT, 'gift card balance below zero'); END;
CREATE TRIGGER "AccountGiftCard_balance_check_update" BEFORE UPDATE OF "balance" ON "AccountGiftCard" WHEN NEW."balance" < 0 BEGIN SELECT RAISE(ABORT, 'gift card balance below zero'); END;
