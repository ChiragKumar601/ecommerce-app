-- CreateTable
CREATE TABLE "Bag" (
    "accountId" TEXT NOT NULL PRIMARY KEY,
    "couponCode" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bag_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BagLine" (
    "accountId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL CHECK ("quantity" BETWEEN 1 AND 10), -- hand-written (BAG-002, T-27)
    "addedAt" DATETIME NOT NULL,
    "lastSeenUnitPrice" INTEGER NOT NULL,

    PRIMARY KEY ("accountId", "variantId"),
    CONSTRAINT "BagLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BagLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WishlistEntry" (
    "accountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "addedAt" DATETIME NOT NULL,

    PRIMARY KEY ("accountId", "productId"),
    CONSTRAINT "WishlistEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WishlistEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WishlistEntry_accountId_addedAt_idx" ON "WishlistEntry"("accountId", "addedAt");
