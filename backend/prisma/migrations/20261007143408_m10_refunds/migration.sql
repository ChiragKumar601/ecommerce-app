-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "includesDeliveryCharge" BOOLEAN NOT NULL DEFAULT false,
    "orderLineId" TEXT,
    "units" INTEGER,
    "returnRequestId" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "completeAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefundAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refundId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "accountGiftCardId" TEXT,
    "label" TEXT NOT NULL,
    "note" TEXT,
    CONSTRAINT "RefundAllocation_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable (plain column additions; SQLite keeps the existing rows)
ALTER TABLE "OrderLine" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "OrderLine" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "cancelComment" TEXT;
ALTER TABLE "OrderLine" ADD COLUMN "refundedUnits" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Refund_status_completeAt_idx" ON "Refund"("status", "completeAt");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");
