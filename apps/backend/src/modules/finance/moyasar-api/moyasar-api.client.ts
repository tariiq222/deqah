import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { MoyasarCredentialsService } from '../../../infrastructure/payments/moyasar-credentials.service';

export const MOYASAR_API_CLIENT = Symbol('MOYASAR_API_CLIENT');

export interface MoyasarCreatePaymentParams {
  amountHalalas: number;
  currency: string;
  description: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}

export interface MoyasarPayment {
  id: string;
  amount: number;
  currency: string;
  status: 'initiated' | 'paid' | 'failed' | 'refunded';
  description: string | null;
  metadata: Record<string, string>;
  redirectUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MoyasarRefundStatus = 'paid' | 'failed' | 'pending';

export interface MoyasarRefund {
  id: string;
  amount: number;
  currency: string;
  status: 'refunded';
  paymentId: string;
  createdAt: string;
}

export interface MoyasarRefundStatusResult {
  id: string;
  status: MoyasarRefundStatus;
}

interface MoyasarApiResponse {
  id: string;
  object: string;
  amount: number;
  currency: string;
  status: MoyasarPayment['status'];
  description: string | null;
  metadata: Record<string, string>;
  redirect_url: string | null;
  created_at: string;
  updated_at: string;
}

interface MoyasarErrorResponse {
  type: string;
  message: string;
  status: number;
}

const KEY_CACHE_TTL_MS = 300_000; // 5 minutes

interface KeyCacheEntry {
  key: string;
  expiresAt: number;
}

@Injectable()
export class MoyasarApiClient {
  private readonly baseUrl = 'https://api.moyasar.com/v1';
  private readonly keyCache = new Map<string, KeyCacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly creds: MoyasarCredentialsService,
  ) {}

  /**
   * Invalidates the cached decrypted API key for one organization.
   * Call this after updating `OrganizationPaymentConfig.secretKeyEnc`.
   */
  invalidate(organizationId: string): void {
    this.keyCache.delete(organizationId);
  }

  /**
   * Resolves the tenant's Moyasar secret key from `OrganizationPaymentConfig`.
   * Result is cached in-process for 5 minutes to avoid a DB + decrypt round-trip
   * on every payment request.
   * Throws BadRequest (not InternalServerError) — missing config is a tenant
   * configuration problem, not a platform bug; the dashboard surfaces it.
   */
  private async getApiKeyForOrg(organizationId: string): Promise<string> {
    const cached = this.keyCache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.key;
    }

    const cfg = await this.prisma.organizationPaymentConfig.findUnique({
      where: { organizationId },
    });
    if (!cfg) {
      throw new BadRequestException(
        `Moyasar is not configured for organization ${organizationId}. ` +
          `Configure tenant credentials in Dashboard → Settings → Payments.`,
      );
    }
    const decrypted = this.creds.decrypt<{ secretKey: string }>(
      cfg.secretKeyEnc,
      organizationId,
    );
    const key = decrypted.secretKey;
    this.keyCache.set(organizationId, { key, expiresAt: Date.now() + KEY_CACHE_TTL_MS });
    return key;
  }

  private async request<T>(
    organizationId: string,
    path: string,
    options: RequestInit,
  ): Promise<T> {
    const apiKey = await this.getApiKeyForOrg(organizationId);
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ message: response.statusText }))) as MoyasarErrorResponse;
      throw new InternalServerErrorException(
        `Moyasar API error: ${error.message} (status: ${response.status})`,
      );
    }

    return response.json() as Promise<T>;
  }

  async createPayment(
    organizationId: string,
    params: MoyasarCreatePaymentParams,
  ): Promise<MoyasarPayment> {
    const body = {
      amount: params.amountHalalas,
      currency: params.currency,
      description: params.description,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
      source: { type: 'card' },
    };

    const data = await this.request<MoyasarApiResponse>(organizationId, '/payments', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      description: data.description,
      metadata: data.metadata,
      redirectUrl: data.redirect_url,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  toPaymentStatus(moyasarStatus: MoyasarPayment['status']): PaymentStatus {
    switch (moyasarStatus) {
      case 'paid':
        return PaymentStatus.COMPLETED;
      case 'failed':
        return PaymentStatus.FAILED;
      case 'refunded':
        return PaymentStatus.REFUNDED;
      case 'initiated':
      default:
        return PaymentStatus.PENDING;
    }
  }

  toPaymentMethod(): PaymentMethod {
    return PaymentMethod.ONLINE_CARD;
  }

  async createRefund(
    organizationId: string,
    params: { paymentId: string; amount: number; idempotencyKey: string },
  ): Promise<MoyasarRefund> {
    const body = {
      payment_id: params.paymentId,
      amount: params.amount,
    };

    const data = await this.request<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      payment_id: string;
      created_at: string;
    }>(organizationId, '/refunds', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Idempotency-Key': params.idempotencyKey },
    });

    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      status: 'refunded',
      paymentId: data.payment_id,
      createdAt: data.created_at,
    };
  }

  /**
   * Fetches the status of a previously issued refund from Moyasar.
   * Used by the reconcile-refunds cron to finalize PROCESSING rows that
   * stalled after the gateway round-trip succeeded but our DB write failed.
   *
   * GET /v1/refunds/:id → { status: 'paid' | 'failed' | 'pending' }
   */
  async getRefundStatus(
    organizationId: string,
    moyasarRefundId: string,
  ): Promise<MoyasarRefundStatusResult> {
    const data = await this.request<{ id: string; status: string }>(
      organizationId,
      `/refunds/${moyasarRefundId}`,
      { method: 'GET' },
    );
    const raw = data.status;
    const status: MoyasarRefundStatus =
      raw === 'paid' || raw === 'failed' || raw === 'pending' ? raw : 'pending';
    return { id: data.id, status };
  }
}
