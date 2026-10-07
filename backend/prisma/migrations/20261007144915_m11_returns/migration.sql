-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "status" TEXT NOT NULL,
    "pickupAttempt" INTEGER NOT NULL DEFAULT 0,
    "outcomeForcedBy" TEXT,
    "rejectionReason" TEXT,
    "closedReason" TEXT,
    "refundId" TEXT,
    "history" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "nextTransitionAt" DATETIME,
    CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReturnRequest_status_nextTransitionAt_idx" ON "ReturnRequest"("status", "nextTransitionAt");

-- CreateIndex
CREATE INDEX "ReturnRequest_orderLineId_idx" ON "ReturnRequest"("orderLineId");

-- Hand-written: a return covers at least one unit.
CREATE TRIGGER "ReturnRequest_quantity_check" BEFORE INSERT ON "ReturnRequest" WHEN NEW."quantity" < 1 BEGIN SELECT RAISE(ABORT, 'return quantity below 1'); END;
