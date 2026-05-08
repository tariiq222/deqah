import { adminRequest } from '@/lib/api-client';
import type { PageMeta } from '@/lib/types';
import type { VerticalRow } from '../types';

export interface ListVerticalsResponse {
  items: VerticalRow[];
  meta: PageMeta;
}

export function listVerticals(page = 1, perPage = 20): Promise<ListVerticalsResponse> {
  return adminRequest<ListVerticalsResponse>(`/verticals?page=${page}&perPage=${perPage}`);
}
