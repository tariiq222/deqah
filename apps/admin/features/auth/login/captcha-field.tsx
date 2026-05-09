"use client";

import { forwardRef } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useTranslations } from "next-intl";

const SITE_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;

if (process.env.NODE_ENV === "production" && !SITE_KEY) {
  throw new Error("NEXT_PUBLIC_HCAPTCHA_SITE_KEY is required in production");
}

interface CaptchaFieldProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  theme?: "light" | "dark";
}

export const CaptchaField = forwardRef<HCaptcha, CaptchaFieldProps>(
  function CaptchaField({ onVerify, onExpire, theme = "light" }, ref) {
    const t = useTranslations("login");

    if (!SITE_KEY) {
      return (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-destructive bg-destructive/5 px-4 py-3 text-xs text-destructive">
          <span>{t("captchaNotConfigured")}</span>
        </div>
      );
    }

    return (
      <HCaptcha
        ref={ref}
        sitekey={SITE_KEY}
        onVerify={onVerify}
        onExpire={onExpire}
        theme={theme}
      />
    );
  },
);