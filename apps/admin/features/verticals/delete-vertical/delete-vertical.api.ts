import { adminRequest } from '@/lib/api-client';

export interface DeleteVerticalCommand {
  verticalId: string;
}

export function deleteVertical({ verticalId }: DeleteVerticalCommand): Promise<void> {
  return adminRequest<void>(`/verticals/${verticalId}`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}
