// Shared types for the organizations feature cluster. Each slice imports
// only what it needs.

export type OrganizationStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'ARCHIVED';

export interface OrganizationRow {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  status: OrganizationStatus;
  verticalId: string | null;
  trialEndsAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  subscription: {
    status: string;
    plan: { slug: string; nameEn: string };
  } | null;
  owner: { name: string | null; email: string } | null;
}

export interface OrganizationDetail extends OrganizationRow {
  stats: {
    memberCount: number;
    bookingCount30d: number;
    totalRevenue: number | string;
  };
  vertical: { id: string; nameAr: string; nameEn: string } | null;
  owner: { name: string | null; email: string; phone: string | null } | null;
}
