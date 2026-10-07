-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" JSONB NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HeroSlide" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imageUrl" TEXT NOT NULL,
    "imageAlt" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "subheadline" TEXT,
    "ctaLabel" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ShopByCategoryCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageAlt" TEXT NOT NULL,
    "discountText" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "PopularSearch" (
    "term" TEXT NOT NULL PRIMARY KEY,
    "order" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "ContentPage" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "FaqEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "order" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "SecurityQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "StateRef" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "zone" TEXT NOT NULL PRIMARY KEY,
    "deliveryDays" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "ServiceablePincode" (
    "pincode" TEXT NOT NULL PRIMARY KEY,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    CONSTRAINT "ServiceablePincode_zone_fkey" FOREIGN KEY ("zone") REFERENCES "DeliveryZone" ("zone") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "nodeId" TEXT NOT NULL PRIMARY KEY,
    "ratePercent" INTEGER NOT NULL,
    CONSTRAINT "TaxRate_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "CatalogueNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReturnPolicyNode" (
    "nodeId" TEXT NOT NULL PRIMARY KEY,
    CONSTRAINT "ReturnPolicyNode_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "CatalogueNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Coupon" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "maxDiscount" INTEGER,
    "minEligibleValue" INTEGER NOT NULL,
    "eligibleNodeIds" JSONB NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "perCustomerLimit" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "BankOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankName" TEXT NOT NULL,
    "cardTypes" JSONB NOT NULL,
    "percent" INTEGER NOT NULL,
    "maxDiscount" INTEGER NOT NULL,
    "minEligibleValue" INTEGER NOT NULL,
    "validFrom" DATETIME NOT NULL,
    "validTo" DATETIME NOT NULL,
    "summary" TEXT NOT NULL,
    "termsText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "TestCard" (
    "number" TEXT NOT NULL PRIMARY KEY,
    "last4" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "issuingBank" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "forcedOutcome" TEXT,
    "label" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TestUpi" (
    "upiId" TEXT NOT NULL PRIMARY KEY,
    "forcedOutcome" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "GiftCardCode" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "faceValue" INTEGER NOT NULL,
    "validityDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "BlockedWord" (
    "word" TEXT NOT NULL PRIMARY KEY
);

-- CreateTable
CREATE TABLE "CatalogueNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "parentId" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "CatalogueNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CatalogueNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "SizeGuide" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "table" JSONB NOT NULL,
    "notes" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "materialCare" TEXT NOT NULL,
    "specifications" JSONB NOT NULL,
    "primarySectionId" TEXT NOT NULL,
    "primaryNodeId" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "styleGroupId" TEXT NOT NULL,
    "listingDate" DATETIME NOT NULL,
    "bestSeller" BOOLEAN NOT NULL DEFAULT false,
    "bankOfferEligible" BOOLEAN NOT NULL DEFAULT false,
    "returnable" BOOLEAN NOT NULL DEFAULT true,
    "inclusiveSizing" BOOLEAN NOT NULL DEFAULT false,
    "sizeGuideId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Product_sizeGuideId_fkey" FOREIGN KEY ("sizeGuideId") REFERENCES "SizeGuide" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductNode" (
    "productId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,

    PRIMARY KEY ("productId", "nodeId"),
    CONSTRAINT "ProductNode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductNode_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "CatalogueNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Variant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "sizeLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "mrp" INTEGER NOT NULL,
    "sellingPrice" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Hand-written (plan §6.1, spec §4.1): selling price is positive and never above MRP.
    CONSTRAINT "Variant_price_check" CHECK ("sellingPrice" > 0 AND "sellingPrice" <= "mrp")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "variantId" TEXT NOT NULL PRIMARY KEY,
    "onHand" INTEGER NOT NULL,
    "held" INTEGER NOT NULL DEFAULT 0,
    "baselineOnHand" INTEGER NOT NULL,
    CONSTRAINT "Inventory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Hand-written (plan §6.1, INV-006): stock is never negative and holds never exceed stock on hand.
    CONSTRAINT "Inventory_held_check" CHECK ("held" >= 0 AND "held" <= "onHand"),
    CONSTRAINT "Inventory_onHand_check" CHECK ("onHand" >= 0 AND "baselineOnHand" >= 0)
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "sourcePageUrl" TEXT NOT NULL,
    "photographer" TEXT NOT NULL,
    "photographerUrl" TEXT,
    "licence" TEXT NOT NULL,
    CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProductCuratedRec" (
    "productId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    PRIMARY KEY ("productId", "kind", "targetId"),
    CONSTRAINT "ProductCuratedRec_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductCuratedRec_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "authorAccountId" TEXT,
    "authorDisplayName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
    "text" TEXT,
    "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'visible',
    "seeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    CONSTRAINT "ReviewImage_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewReport" (
    "reviewId" TEXT NOT NULL,
    "reporterAccountId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("reviewId", "reporterAccountId"),
    CONSTRAINT "ReviewReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RatingAggregate" (
    "productId" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "sumRatings" INTEGER NOT NULL,
    "c1" INTEGER NOT NULL,
    "c2" INTEGER NOT NULL,
    "c3" INTEGER NOT NULL,
    "c4" INTEGER NOT NULL,
    "c5" INTEGER NOT NULL,
    CONSTRAINT "RatingAggregate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StateRef_name_key" ON "StateRef"("name");

-- CreateIndex
CREATE INDEX "ServiceablePincode_zone_idx" ON "ServiceablePincode"("zone");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueNode_path_key" ON "CatalogueNode"("path");

-- CreateIndex
CREATE INDEX "CatalogueNode_type_idx" ON "CatalogueNode"("type");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogueNode_parentId_slug_key" ON "CatalogueNode"("parentId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "Brand"("slug");

-- CreateIndex
CREATE INDEX "Product_active_listingDate_idx" ON "Product"("active", "listingDate");

-- CreateIndex
CREATE INDEX "Product_styleGroupId_idx" ON "Product"("styleGroupId");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE INDEX "ProductNode_nodeId_idx" ON "ProductNode"("nodeId");

-- CreateIndex
CREATE INDEX "Variant_productId_idx" ON "Variant"("productId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_idx" ON "ProductImage"("productId");

-- CreateIndex
CREATE INDEX "Review_productId_status_createdAt_idx" ON "Review"("productId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_authorAccountId_productId_key" ON "Review"("authorAccountId", "productId");
