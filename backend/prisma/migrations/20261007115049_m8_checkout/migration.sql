-- CreateTable
CREATE TABLE "CheckoutSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "couponCode" TEXT,
    "addressId" TEXT,
    "contactPhone" TEXT,
    "step" TEXT NOT NULL DEFAULT 'address',
    "pendingChanges" JSONB,
    "paymentSelection" JSONB,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "CheckoutSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "checkoutId" TEXT,
    "orderId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "CheckoutSession_accountId_createdAt_idx" ON "CheckoutSession"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_createdAt_idx" ON "Quote"("createdAt");
