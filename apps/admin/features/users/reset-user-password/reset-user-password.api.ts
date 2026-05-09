import { adminRequest } from '@/lib/api-client';

export interface ResetUserPasswordCommand {
  userId: string;
}

export function resetUserPassword(cmd: ResetUserPasswordCommand): Promise<void> {
  return adminRequest<void>(`/users/${cmd.userId}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
