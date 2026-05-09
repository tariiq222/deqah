import { adminRequest } from '@/lib/api-client';

export interface StartImpersonationCommand {
  organizationId: string;
  targetUserId: string;
}

export interface StartImpersonationResponse {
  sessionId: string;
  shadowAccessToken: string;
  expiresAt: string;
  redirectUrl: string;
}

export function startImpersonation(
  cmd: StartImpersonationCommand,
): Promise<StartImpersonationResponse> {
  return adminRequest<StartImpersonationResponse>('/impersonation', {
    method: 'POST',
    body: JSON.stringify(cmd),
  });
}
