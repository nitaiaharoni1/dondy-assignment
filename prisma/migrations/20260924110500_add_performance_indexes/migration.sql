-- CreateIndex
CREATE INDEX "Order_shop_currency_isCod_totalMinor_idx"
ON "Order"("shop", "currency", "isCod", "totalMinor");

-- SQLite expression index for case-insensitive offline-session lookups.
CREATE INDEX "Session_lower_shop_isOnline_idx"
ON "Session"(lower("shop"), "isOnline");
