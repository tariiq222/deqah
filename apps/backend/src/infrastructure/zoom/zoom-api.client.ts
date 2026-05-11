import { Injectable, Logger, InternalServerErrorException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'crypto';

export interface ZoomMeetingRequest {
  topic: string;
  startTime: string;
  durationMins: number;
}

export interface ZoomMeetingResponse {
  id: number;
  join_url: string;
  start_url: string;
}

interface ZoomTokenResponse {
  access_token: string;
  expires_in: number;
}

@Injectable()
export class ZoomApiClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZoomApiClient.name);
  private readonly tokenCache = new Map<string, { token: string; expiresAt: number }>();
  private sweepInterval?: NodeJS.Timeout;

  onModuleInit(): void {
    this.sweepInterval = setInterval(() => this.sweep(), 5 * 60_000);
    this.sweepInterval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepInterval) clearInterval(this.sweepInterval);
  }

  private sweep(): void {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.tokenCache) {
      if (entry.expiresAt < now) {
        this.tokenCache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.debug(`Swept ${removed} expired token cache entries (size: ${this.tokenCache.size})`);
    }
  }

  async getAccessToken(
    orgId: string,
    clientId: string,
    clientSecret: string,
    accountId: string,
  ): Promise<string> {
    // Cache key binds orgId AND a credential fingerprint so a one-off "test
    // config" call with arbitrary creds cannot poison the cache for live
    // bookings using the persisted credentials.
    const cacheKey = this.cacheKey(orgId, clientId, accountId);
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await this.fetchWithRetry(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    if (!res.ok) {
      const error = await res.text();
      this.logger.error(`Zoom auth failed for org ${orgId}: ${res.status} ${error}`);
      throw new InternalServerErrorException(`Zoom authentication failed`);
    }

    const data: ZoomTokenResponse = await res.json();
    // Cache with 60s buffer
    this.tokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    });

    return data.access_token;
  }

  /** Drop any cached OAuth tokens for an org. Call after credential rotation. */
  invalidateToken(orgId: string): void {
    const prefix = `${orgId}:`;
    for (const key of this.tokenCache.keys()) {
      if (key.startsWith(prefix)) this.tokenCache.delete(key);
    }
  }

  private cacheKey(orgId: string, clientId: string, accountId: string): string {
    const fingerprint = createHash('sha256')
      .update(`${clientId}|${accountId}`)
      .digest('hex')
      .slice(0, 16);
    return `${orgId}:${fingerprint}`;
  }

  async createMeeting(
    token: string,
    opts: ZoomMeetingRequest,
    timezone: string,
  ): Promise<ZoomMeetingResponse> {
    const res = await this.fetchWithRetry('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: opts.topic,
        type: 2,
        start_time: opts.startTime,
        duration: opts.durationMins,
        timezone,
        settings: {
          join_before_host: true,
          waiting_room: false,
          jbh_time: 0,
        },
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      this.logger.error(`Failed to create Zoom meeting: ${res.status} ${error}`);
      throw new InternalServerErrorException(`Zoom meeting creation failed: ${res.statusText}`);
    }

    return res.json();
  }

  async deleteMeeting(token: string, meetingId: string): Promise<void> {
    const res = await this.fetchWithRetry(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok && res.status !== 404) {
      const error = await res.text();
      this.logger.error(`Failed to delete Zoom meeting ${meetingId}: ${res.status} ${error}`);
    }
  }

  async updateMeeting(
    token: string,
    meetingId: string,
    opts: Partial<ZoomMeetingRequest>,
    timezone: string,
  ): Promise<void> {
    const body: Record<string, string | number> = {};
    if (opts.topic) body.topic = opts.topic;
    if (opts.startTime) body.start_time = opts.startTime;
    if (opts.durationMins) body.duration = opts.durationMins;
    if (timezone) body.timezone = timezone;

    const res = await this.fetchWithRetry(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      this.logger.error(`Failed to update Zoom meeting ${meetingId}: ${res.status} ${error}`);
    }
  }

  private async fetchWithRetry(url: string, init?: RequestInit, retries = 3): Promise<Response> {
    const backoffs = [250, 750, 1500];
    let lastError: unknown;

    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url, init);
        // Retry on 429 or 5xx
        if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
          if (i < retries) {
            await new Promise((resolve) => setTimeout(resolve, backoffs[i]));
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
    throw lastError || new Error('Fetch failed after retries');
  }
}
