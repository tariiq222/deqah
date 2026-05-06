-- CreateTable
CREATE TABLE "IntegrationAuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "requestBody" JSONB,
    "responseBody" JSONB,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationAuditLog_organizationId_provider_idx" ON "IntegrationAuditLog"("organizationId", "provider");

-- CreateIndex
CREATE INDEX "IntegrationAuditLog_organizationId_createdAt_idx" ON "IntegrationAuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationAuditLog_provider_method_idx" ON "IntegrationAuditLog"("provider", "method");
