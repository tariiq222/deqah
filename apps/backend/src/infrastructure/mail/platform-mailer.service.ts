import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformMailQueueService } from './platform-mail-queue/platform-mail-queue.service';

const DEFAULT_FROM = 'Deqah <noreply@webvue.pro>';

/**
 * Public façade for platform-level transactional emails (welcome, trial,
 * billing, suspension, etc.). All sends are enqueued via BullMQ —
 * Resend is called by the worker (see PlatformMailProcessor), NOT inline.
 *
 * This service no longer holds a Resend client; queuing-only keeps cron
 * jobs and billing handlers fast and resilient to transient Resend
 * outages — failed sends are retried with exponential backoff and
 * audited in `PlatformMailDeliveryLog`.
 */
@Injectable()
export class PlatformMailerService implements OnModuleInit {
  private readonly logger = new Logger(PlatformMailerService.name);
  private from = DEFAULT_FROM;

  constructor(
    private readonly config: ConfigService,
    private readonly queue: PlatformMailQueueService,
  ) {}

  onModuleInit(): void {
    this.from = this.config.get<string>('RESEND_FROM') ?? DEFAULT_FROM;
    this.logger.log('PlatformMailerService initialized (queue-backed)');
  }

  // ── Public send API ────────────────────────────────────────────────────────

  async sendTenantWelcome(
    to: string,
    vars: import('./templates/tenant-welcome.template').TenantWelcomeVars,
  ): Promise<void> {
    const { tenantWelcomeTemplate } = await import('./templates/tenant-welcome.template');
    const t = tenantWelcomeTemplate(vars);
    await this.dispatch('tenant-welcome', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendOtpLogin(
    to: string,
    vars: import('./templates/otp-login.template').OtpLoginVars,
  ): Promise<void> {
    const { otpLoginTemplate } = await import('./templates/otp-login.template');
    const t = otpLoginTemplate(vars);
    await this.dispatch('otp-login', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendTrialEnding(
    to: string,
    vars: import('./templates/trial-ending.template').TrialEndingVars,
  ): Promise<void> {
    const { trialEndingTemplate } = await import('./templates/trial-ending.template');
    const t = trialEndingTemplate(vars);
    await this.dispatch('trial-ending', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendTrialDay7Reminder(
    to: string,
    vars: import('./templates/trial-ending.template').TrialEndingVars,
  ): Promise<void> {
    await this.sendTrialEnding(to, vars);
  }

  async sendTrialDay3Warning(
    to: string,
    vars: import('./templates/trial-ending.template').TrialEndingVars,
  ): Promise<void> {
    await this.sendTrialEnding(to, vars);
  }

  async sendTrialDay1Final(
    to: string,
    vars: import('./templates/trial-ending.template').TrialEndingVars,
  ): Promise<void> {
    await this.sendTrialEnding(to, vars);
  }

  async sendTrialExpired(
    to: string,
    vars: import('./templates/trial-expired.template').TrialExpiredVars,
  ): Promise<void> {
    const { trialExpiredTemplate } = await import('./templates/trial-expired.template');
    const t = trialExpiredTemplate(vars);
    await this.dispatch('trial-expired', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendTrialSuspendedNoCard(
    to: string,
    vars: import('./templates/trial-suspended-no-card.template').TrialSuspendedNoCardVars,
  ): Promise<void> {
    const { trialSuspendedNoCardTemplate } = await import('./templates/trial-suspended-no-card.template');
    const t = trialSuspendedNoCardTemplate(vars);
    await this.dispatch('trial-suspended-no-card', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendSubscriptionPaymentSucceeded(
    to: string,
    vars: import('./templates/subscription-payment-succeeded.template').SubscriptionPaymentSucceededVars,
  ): Promise<void> {
    const { subscriptionPaymentSucceededTemplate } = await import('./templates/subscription-payment-succeeded.template');
    const t = subscriptionPaymentSucceededTemplate(vars);
    await this.dispatch('subscription-payment-succeeded', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendSubscriptionPaymentFailed(
    to: string,
    vars: import('./templates/subscription-payment-failed.template').SubscriptionPaymentFailedVars,
  ): Promise<void> {
    const { subscriptionPaymentFailedTemplate } = await import('./templates/subscription-payment-failed.template');
    const t = subscriptionPaymentFailedTemplate(vars);
    await this.dispatch('subscription-payment-failed', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendOrphanOrgsDigest(
    to: string,
    vars: import('./templates/orphan-orgs-digest.template').OrphanOrgsDigestVars,
  ): Promise<void> {
    if (vars.orphans.length === 0) return;
    const { orphanOrgsDigestTemplate } = await import('./templates/orphan-orgs-digest.template');
    const t = orphanOrgsDigestTemplate(vars);
    await this.dispatch('orphan-orgs-digest', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendDunningRetry(
    to: string,
    vars: import('./templates/dunning-retry.template').DunningRetryVars,
  ): Promise<void> {
    const { dunningRetryTemplate } = await import('./templates/dunning-retry.template');
    const t = dunningRetryTemplate(vars);
    await this.dispatch('dunning-retry', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendPlanChanged(
    to: string,
    vars: import('./templates/plan-changed.template').PlanChangedVars,
  ): Promise<void> {
    const { planChangedTemplate } = await import('./templates/plan-changed.template');
    const t = planChangedTemplate(vars);
    await this.dispatch('plan-changed', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendAccountStatusChanged(
    to: string,
    vars: import('./templates/account-status-changed.template').AccountStatusChangedVars,
  ): Promise<void> {
    const { accountStatusChangedTemplate } = await import('./templates/account-status-changed.template');
    const t = accountStatusChangedTemplate(vars);
    await this.dispatch('account-status-changed', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendMembershipInvitation(
    to: string,
    vars: import('./templates/membership-invitation.template').MembershipInvitationVars,
  ): Promise<void> {
    const { membershipInvitationTemplate } = await import('./templates/membership-invitation.template');
    const t = membershipInvitationTemplate(vars);
    await this.dispatch('membership-invitation', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendFeatureGraceWarning(
    to: string,
    vars: import('./templates/feature-grace-warning.template').FeatureGraceWarningVars,
  ): Promise<void> {
    const { featureGraceWarningTemplate } = await import('./templates/feature-grace-warning.template');
    const t = featureGraceWarningTemplate(vars);
    await this.dispatch('feature-grace-warning', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendFeatureGraceExpired(
    to: string,
    vars: import('./templates/feature-grace-expired.template').FeatureGraceExpiredVars,
  ): Promise<void> {
    const { featureGraceExpiredTemplate } = await import('./templates/feature-grace-expired.template');
    const t = featureGraceExpiredTemplate(vars);
    await this.dispatch('feature-grace-expired', to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  async sendStaffPasswordReset(params: {
    to: string;
    userName: string;
    resetUrl: string;
  }): Promise<void> {
    const { staffPasswordResetTemplate } = await import('./templates/staff-password-reset.template');
    const t = staffPasswordResetTemplate({ userName: params.userName, resetUrl: params.resetUrl });
    await this.dispatch('staff-password-reset', params.to, this.bilingualSubject(t.subjectAr, t.subjectEn), t.html);
  }

  /**
   * Send a raw email with full control over to/subject/html.
   * Used by the platform email test-send endpoint.
   */
  async sendRaw(opts: { to: string; subject: string; html: string; templateSlug: string }): Promise<void> {
    await this.dispatch(opts.templateSlug, opts.to, opts.subject, opts.html);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private bilingualSubject(ar: string, en: string): string {
    return `${ar} · ${en}`;
  }

  private async dispatch(
    templateName: string,
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    await this.queue.enqueue({
      recipient: to,
      templateName,
      subject,
      html,
      from: this.from,
    });
  }
}
