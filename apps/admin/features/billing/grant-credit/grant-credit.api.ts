import { adminRequest } from '@/lib/api-client';
import type { CreditRow } from '../types';

export interface GrantCreditCommand {
  organizationId: string;
  amount: number;
  currency?: string;
}

export function grantCredit(cmd: GrantCreditCommand): Promise<CreditRow> {
  return adminRequest<CreditRow>('/billing/credits', {
    method: 'POST',
    body: JSON.stringify(cmd),
  });
}
