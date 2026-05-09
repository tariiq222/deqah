export interface ImpersonationSession {
  id: string;
  superAdminUserId: string;
  targetUserId: string;
  organizationId: string;
  reason?: string | null;
  startedAt: string;
  endedAt: string | null;
  expiresAt: string;
  endedReason: string | null;
}
