import { adminRequest } from '@/lib/api-client';
import type { VerticalRow } from '../types';

export interface UpdateVerticalCommand {
  verticalId: string;
  nameAr?: string;
  nameEn?: string;
  templateFamily?: 'MEDICAL' | 'CONSULTING' | 'SALON' | 'FITNESS';
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  iconUrl?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export function updateVertical({ verticalId, ...body }: UpdateVerticalCommand): Promise<VerticalRow> {
  return adminRequest<VerticalRow>(`/verticals/${verticalId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
