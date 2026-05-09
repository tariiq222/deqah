import {
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ZohoOAuthService } from './zoho-oauth.service';
import { ZohoAuditService } from './zoho-audit.service';
import { zohoApiBaseUrl, type ZohoDataCenter } from './zoho-dc';
import type {
  ZohoContact,
  ZohoCreditNote,
  ZohoCustomerPayment,
  ZohoInvoice,
  ZohoLineItem,
  ZohoOrganizationListResponse,
} from './types';

/**
 * Per-tenant credentials needed for any Zoho REST call. Resolved by the
 * caller (handler) and passed in — this client is stateless apart from
 * retry/backoff and OAuth-token retrieval (which is delegated to
 * {@link ZohoOAuthService}).
 */
export interface ZohoTenantContext {
  organizationId: string;
  zohoOrganizationId: string;
  refreshToken: string;
  dataCenter: ZohoDataCenter;
}

interface FetchOpts extends Omit<RequestInit, 'body'> {
  query?: Record<string, string | number | boolean | undefined>;
  jsonBody?: Record<string, unknown>;
  /**
   * Skip injecting the `X-com-zoho-invoice-organizationid` header — only
   * the `/organizations` listing endpoint allows this.
   */
  withoutOrgId?: boolean;
  /**
   * Zoho API supports X-Idempotency-Key for POST/PUT/DELETE requests.
   * When provided, Zoho returns the same response for duplicate requests
   * within 24 hours, preventing duplicate invoice/payment creation on retries.
   */
  idempotencyKey?: string;
}

@Injectable()
export class ZohoApiClient {
  private readonly logger = new Logger(ZohoApiClient.name);

  constructor(
    private readonly oauth: ZohoOAuthService,
    @Optional() private readonly audit?: ZohoAuditService,
  ) {}

  // ───────── Organizations ─────────

  /**
   * List Zoho organizations the connected user can access.
   * Used during Connect to (a) auto-pick the org if there's only one and
   * (b) verify the chosen org's currency.
   */
  async listOrganizations(
    ctx: Omit<ZohoTenantContext, 'zohoOrganizationId'>,
  ): Promise<ZohoOrganizationListResponse> {
    return this.request<ZohoOrganizationListResponse>(
      { ...ctx, zohoOrganizationId: '' },
      'GET',
      '/invoice/v3/organizations',
      { withoutOrgId: true },
    );
  }

  // ───────── Contacts ─────────

  async createContact(
    ctx: ZohoTenantContext,
    body: {
      contact_name: string;
      contact_persons?: Array<{
        first_name?: string;
        last_name?: string;
        email?: string;
        phone?: string;
        mobile?: string;
        is_primary_contact?: boolean;
      }>;
      email?: string;
      phone?: string;
      mobile?: string;
      notes?: string;
    },
  ): Promise<{ contact: ZohoContact }> {
    return this.request(ctx, 'POST', '/invoice/v3/contacts', { jsonBody: body });
  }

  async getContact(ctx: ZohoTenantContext, contactId: string): Promise<{ contact: ZohoContact }> {
    return this.request(ctx, 'GET', `/invoice/v3/contacts/${contactId}`);
  }

  async updateContact(
    ctx: ZohoTenantContext,
    contactId: string,
    body: Record<string, unknown>,
  ): Promise<{ contact: ZohoContact }> {
    return this.request(ctx, 'PUT', `/invoice/v3/contacts/${contactId}`, { jsonBody: body });
  }

  // ───────── Invoices ─────────

  async createInvoice(
    ctx: ZohoTenantContext,
    body: {
      customer_id: string;
      line_items: ZohoLineItem[];
      date?: string;
      due_date?: string;
      reference_number?: string;
      notes?: string;
      payment_terms?: number;
      payment_terms_label?: string;
      branch_id?: string;
    },
    opts: { send?: boolean; idempotencyKey?: string } = {},
  ): Promise<{ invoice: ZohoInvoice }> {
    return this.request(ctx, 'POST', '/invoice/v3/invoices', {
      jsonBody: body,
      query: { send: opts.send ? 'true' : undefined },
      idempotencyKey: opts.idempotencyKey,
    });
  }

  async listInvoices(
    ctx: ZohoTenantContext,
    query: Record<string, string | number | boolean | undefined> = {},
  ): Promise<{ invoices: ZohoInvoice[]; page_context?: Record<string, unknown> }> {
    return this.request(ctx, 'GET', '/invoice/v3/invoices', { query });
  }

  async getInvoice(
    ctx: ZohoTenantContext,
    invoiceId: string,
  ): Promise<{ invoice: ZohoInvoice }> {
    return this.request(ctx, 'GET', `/invoice/v3/invoices/${invoiceId}`);
  }

  async sendInvoiceEmail(
    ctx: ZohoTenantContext,
    invoiceId: string,
    body: {
      to_mail_ids?: string[];
      subject?: string;
      body?: string;
      send_from_org_email_id?: boolean;
    } = {},
  ): Promise<{ message: string }> {
    return this.request(ctx, 'POST', `/invoice/v3/invoices/${invoiceId}/email`, {
      jsonBody: body,
    });
  }

  async voidInvoice(
    ctx: ZohoTenantContext,
    invoiceId: string,
  ): Promise<{ message: string }> {
    return this.request(ctx, 'POST', `/invoice/v3/invoices/${invoiceId}/status/void`);
  }

  // ───────── Customer payments ─────────

  async recordCustomerPayment(
    ctx: ZohoTenantContext,
    body: {
      customer_id: string;
      payment_mode: string; // 'creditcard' | 'banktransfer' | 'cash' | 'check' | ...
      amount: number;
      date: string;
      reference_number?: string;
      description?: string;
      invoices: Array<{ invoice_id: string; amount_applied: number }>;
    },
  ): Promise<{ payment: ZohoCustomerPayment }> {
    return this.request(ctx, 'POST', '/invoice/v3/customerpayments', { jsonBody: body });
  }

  // ───────── Credit notes (refunds) ─────────

  async createCreditNote(
    ctx: ZohoTenantContext,
    body: {
      customer_id: string;
      reference_invoice_id?: string;
      date?: string;
      reason?: string;
      line_items: ZohoLineItem[];
      apply_to_invoices?: Array<{ invoice_id: string; amount_applied: number }>;
    },
  ): Promise<{ creditnote: ZohoCreditNote }> {
    return this.request(ctx, 'POST', '/invoice/v3/creditnotes', { jsonBody: body });
  }

  async refundCreditNote(
    ctx: ZohoTenantContext,
    creditNoteId: string,
    body: {
      date: string;
      refund_mode?: string;
      reference_number?: string;
      amount: number;
      description?: string;
    },
  ): Promise<unknown> {
    return this.request(ctx, 'POST', `/invoice/v3/creditnotes/${creditNoteId}/refunds`, {
      jsonBody: body,
    });
  }

  // ───────── Internal: request + retry ─────────

  private async request<T>(
    ctx: ZohoTenantContext,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    opts: FetchOpts = {},
  ): Promise<T> {
    const accessToken = await this.oauth.getAccessToken({
      organizationId: ctx.organizationId,
      refreshToken: ctx.refreshToken,
      dataCenter: ctx.dataCenter,
    });

    const url = new URL(`${zohoApiBaseUrl(ctx.dataCenter)}${path}`);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      Accept: 'application/json',
    };
    if (!opts.withoutOrgId) {
      if (!ctx.zohoOrganizationId) {
        throw new InternalServerErrorException('Zoho organization id missing for request');
      }
      headers['X-com-zoho-invoice-organizationid'] = ctx.zohoOrganizationId;
    }
    let body: BodyInit | undefined;
    if (opts.jsonBody) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.jsonBody);
    }
    if (opts.idempotencyKey) {
      headers['X-Idempotency-Key'] = opts.idempotencyKey;
    }

    const isMutating = method !== 'GET';
    const startMs = Date.now();
    const res = await this.fetchWithRetry(url.toString(), { method, headers, body });
    const durationMs = Date.now() - startMs;

    if (res.status === 401) {
      this.oauth.invalidateToken(ctx.organizationId);
      if (isMutating) {
        this.audit?.record({
          organizationId: ctx.organizationId, method: method as 'POST' | 'PUT' | 'DELETE',
          path, statusCode: 401, requestBody: opts.jsonBody, durationMs, error: 'access token rejected',
        });
      }
      throw new UnauthorizedException('Zoho rejected the access token — reconnect required');
    }
    const text = await res.text();
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        // Empty/binary body — leave json undefined.
      }
    }
    if (!res.ok) {
      this.logger.error(
        `Zoho ${method} ${path} -> ${res.status} ${typeof json === 'object' ? JSON.stringify(json) : text}`,
      );
      const apiCode = (json as { code?: number } | undefined)?.code;
      const apiMsg = (json as { message?: string } | undefined)?.message ?? res.statusText;
      if (isMutating) {
        this.audit?.record({
          organizationId: ctx.organizationId, method: method as 'POST' | 'PUT' | 'DELETE',
          path, statusCode: res.status, requestBody: opts.jsonBody, responseBody: json,
          durationMs, error: apiMsg,
        });
      }
      if (apiCode === 57) {
        throw new UnauthorizedException('Zoho refresh token revoked — reconnect required');
      }
      throw new InternalServerErrorException(
        `Zoho API error: ${apiMsg}${apiCode ? ` (code ${apiCode})` : ''}`,
      );
    }
    // Audit successful mutations.
    if (isMutating) {
      this.audit?.record({
        organizationId: ctx.organizationId, method: method as 'POST' | 'PUT' | 'DELETE',
        path, statusCode: res.status, requestBody: opts.jsonBody, responseBody: json,
        durationMs,
      });
    }
    return (json ?? {}) as T;
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    retries = 3,
  ): Promise<Response> {
    const backoffs = [250, 750, 1500];
    let lastError: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url, init);
        // Honour Zoho's Retry-After when present, else exponential backoff.
        if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
          if (i < retries) {
            const ra = Number(res.headers.get('retry-after'));
            const delay = Number.isFinite(ra) && ra > 0 ? ra * 1000 : backoffs[i];
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }
        return res;
      } catch (e) {
        lastError = e;
        if (i < retries) {
          await new Promise((resolve) => setTimeout(resolve, backoffs[i]));
          continue;
        }
      }
    }
    throw lastError ?? new Error('Zoho fetch failed after retries');
  }
}
