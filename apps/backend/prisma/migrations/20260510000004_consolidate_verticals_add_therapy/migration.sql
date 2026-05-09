-- Add THERAPY to TemplateFamily enum (must run before any usage)
ALTER TYPE "TemplateFamily" ADD VALUE IF NOT EXISTS 'THERAPY';

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;
