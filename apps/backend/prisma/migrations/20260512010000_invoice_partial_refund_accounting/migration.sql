-- Add PARTIALLY_REFUNDED to InvoiceStatus enum
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';

-- Add refunded principal + VAT tracking on Invoice
ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "refundedVatAmt" DECIMAL(12,2) NOT NULL DEFAULT 0;
