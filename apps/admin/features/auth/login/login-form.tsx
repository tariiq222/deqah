"use client";

import { Suspense, useState, useRef } from "react";
import type HCaptcha from "@hcaptcha/react-hcaptcha";
import { CaptchaField } from "./captcha-field";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@deqah/ui/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deqah/ui/primitives/card";
import { Input } from "@deqah/ui/primitives/input";
import { Label } from "@deqah/ui/primitives/label";
import { login } from "./login.api";
export function LoginForm() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const t = useTranslations("login");
  const tForgot = useTranslations("forgotPassword");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hcaptchaToken, setHcaptchaToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hcaptchaToken) return;
    setSubmitting(true);
    try {
      const res = await login({ email, password, hCaptchaToken: hcaptchaToken });
      if (!res.user?.isSuperAdmin) {
        toast.error(t("error.notAuthorized"));
        captchaRef.current?.resetCaptcha();
        setHcaptchaToken(null);
        return;
      }
      if (!res.accessToken) {
        toast.error(t("error.noToken"));
        return;
      }
      window.localStorage.setItem("admin.accessToken", res.accessToken);
      const secureFlag = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `admin.authenticated=1; path=/; SameSite=Strict${secureFlag}; Max-Age=${60 * 60 * 24}`;
      router.push(next);
    } catch {
      toast.error(t("error.failed"));
      captchaRef.current?.resetCaptcha();
      setHcaptchaToken(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/diqqa-logo.svg" alt="Deqah" className="h-8 w-auto mb-4" />
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Link href="/forgot-password" className="text-sm text-primary hover:underline ms-auto">
              {tForgot("linkLabel")}
            </Link>
            <div className="flex justify-center py-2">
              <CaptchaField
                ref={captchaRef}
                onVerify={(token) => setHcaptchaToken(token)}
                onExpire={() => setHcaptchaToken(null)}
              />
            </div>
            <Button type="submit" disabled={submitting || !hcaptchaToken} className="mt-2">
              {submitting ? t("submitting") : t("submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
