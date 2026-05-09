import { adminRequest } from '@/lib/api-client';
import type { VerticalRow } from '../types';

export interface CreateVerticalCommand {
  slug: string;
  nameAr: string;
  nameEn: string;
  templateFamily: 'MEDICAL' | 'CONSULTING' | 'SALON' | 'FITNESS';
  descriptionAr?: string;
  descriptionEn?: string;
  iconUrl?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export function createVertical(cmd: CreateVerticalCommand): Promise<VerticalRow> {
  return adminRequest<VerticalRow>('/verticals', {
    method: 'POST',
    body: JSON.stringify(cmd),
  });
}
