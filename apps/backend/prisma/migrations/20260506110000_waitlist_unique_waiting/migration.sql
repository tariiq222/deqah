-- Partial unique index: prevents duplicate WAITING entries for the same
-- (organization, client, employee, service) tuple while still allowing
-- the same client to re-enter the waitlist after a previous entry is
-- PROMOTED, CANCELLED, or EXPIRED. Closes a TOCTOU race in
-- AddToWaitlistHandler.findFirst → create.
CREATE UNIQUE INDEX "WaitlistEntry_org_client_employee_service_waiting_unique"
  ON "WaitlistEntry" ("organizationId", "clientId", "employeeId", "serviceId")
  WHERE "status" = 'WAITING';
