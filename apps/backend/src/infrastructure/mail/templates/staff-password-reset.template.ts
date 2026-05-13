import { bilingualLayout, escapeHtml, BRAND } from './shared';

export interface StaffPasswordResetVars {
  userName: string;
  resetUrl: string;
}

export function staffPasswordResetTemplate(vars: StaffPasswordResetVars): {
  subjectAr: string;
  subjectEn: string;
  html: string;
} {
  const userName = escapeHtml(vars.userName);
  const resetUrl = escapeHtml(vars.resetUrl);

  const ctaBlock = `
    <div style="text-align:center;margin:24px 0;">
      <a href="${resetUrl}" style="display:inline-block;background:${BRAND.primary};color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:600;">
        إعادة تعيين كلمة المرور
      </a>
    </div>
    <p style="color:${BRAND.textMuted};font-size:13px;text-align:center;word-break:break-all;">${resetUrl}</p>
  `;

  const ar = `
    <h1 style="color:${BRAND.primary};font-size:20px;margin:0 0 12px;">إعادة تعيين كلمة المرور</h1>
    <p style="color:${BRAND.textBody};font-size:15px;">مرحباً ${userName}،</p>
    <p style="color:${BRAND.textBody};font-size:15px;">تلقّينا طلبًا لإعادة تعيين كلمة المرور الخاصة بحسابك على Deqah. اضغط الزر أدناه لتعيين كلمة مرور جديدة. الرابط صالح لمدة ٣٠ دقيقة.</p>
    ${ctaBlock}
    <p style="color:${BRAND.textMuted};font-size:13px;">إذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذه الرسالة — حسابك آمن.</p>
  `;

  const en = `
    <h1 style="color:${BRAND.primary};font-size:20px;margin:0 0 12px;">Reset your Deqah password</h1>
    <p style="color:${BRAND.textBody};font-size:15px;">Hi ${userName},</p>
    <p style="color:${BRAND.textBody};font-size:15px;">We received a request to reset your Deqah password. Click the button below to set a new one. The link is valid for 30 minutes.</p>
    ${ctaBlock}
    <p style="color:${BRAND.textMuted};font-size:13px;">If you didn't request a password reset, you can safely ignore this email — your account is secure.</p>
  `;

  return {
    subjectAr: 'إعادة تعيين كلمة المرور — Deqah',
    subjectEn: 'Reset your Deqah password',
    html: bilingualLayout({ ar, en }),
  };
}
