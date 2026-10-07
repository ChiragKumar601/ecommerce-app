-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "placedAt" DATETIME,
    "deliveredAt" DATETIME,
    "retryEndsAt" DATETIME NOT NULL,
    "addressSnapshot" JSONB NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "priceSnapshot" JSONB NOT NULL,
    "couponCode" TEXT,
    "bankOfferApplied" BOOLEAN NOT NULL DEFAULT false,
    "total" INTEGER NOT NULL,
    "deliveryCharge" INTEGER NOT NULL,
    "zone" TEXT NOT NULL,
    "expectedDeliveryDate" TEXT NOT NULL,
    "deliveryOtp" TEXT,
    "deliveryAttempt" INTEGER NOT NULL DEFAULT 0,
    "otpFailures" INTEGER NOT NULL DEFAULT 0,
    "courierName" TEXT,
    "trackingId" TEXT,
    "nextTransitionAt" DATETIME,
    "hasUnseenUpdate" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitMrp" INTEGER NOT NULL,
    "unitSellingPrice" INTEGER NOT NULL,
    "couponShare" INTEGER NOT NULL,
    "bankOfferShare" INTEGER NOT NULL,
    "lineNetPaid" INTEGER NOT NULL,
    "taxRatePercent" INTEGER NOT NULL,
    "taxPortion" INTEGER NOT NULL,
    "lineState" TEXT NOT NULL DEFAULT 'active',
    "returnable" BOOLEAN NOT NULL,
    "returnWindowEndsAt" DATETIME,
    "position" INTEGER NOT NULL,
    CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "instrumentLabel" TEXT,
    "testCardRef" TEXT,
    "upiId" TEXT,
    "amount" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "decidedOutcome" TEXT NOT NULL,
    "forcedByTestValue" BOOLEAN NOT NULL DEFAULT false,
    "saveCard" JSONB,
    "bankOfferDiscount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL,
    "resolveAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "accountGiftCardId" TEXT,
    "label" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderStatusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "at" DATETIME NOT NULL,
    "actor" TEXT NOT NULL,
    "note" TEXT,
    CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_accountId_createdAt_idx" ON "Order"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_retryEndsAt_idx" ON "Order"("status", "retryEndsAt");

-- CreateIndex
CREATE INDEX "Order_status_nextTransitionAt_idx" ON "Order"("status", "nextTransitionAt");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_outcome_resolveAt_idx" ON "PaymentAttempt"("outcome", "resolveAt");

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_idx" ON "PaymentAttempt"("orderId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_orderId_idx" ON "PaymentAllocation"("orderId");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_orderId_at_idx" ON "OrderStatusEvent"("orderId", "at");

-- Hand-written (plan §6.1): one Awaiting Payment order per account (R-09); one pending attempt per order (PAY-011).
CREATE UNIQUE INDEX "Order_one_awaiting_payment" ON "Order"("accountId") WHERE "status" = 'AWAITING_PAYMENT';
CREATE UNIQUE INDEX "PaymentAttempt_one_pending" ON "PaymentAttempt"("orderId") WHERE "outcome" = 'pending';
