-- CreateTable
CREATE TABLE "Shop" (
    "domain" TEXT NOT NULL PRIMARY KEY,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Order" (
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "gateways" JSON NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCod" BOOLEAN NOT NULL,

    PRIMARY KEY ("shop", "orderId"),
    CONSTRAINT "Order_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop" ("domain") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookReceipt" (
    "shop" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("shop", "webhookId"),
    CONSTRAINT "WebhookReceipt_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Shop" ("domain") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Order_shop_createdAt_orderId_idx" ON "Order"("shop", "createdAt", "orderId");
