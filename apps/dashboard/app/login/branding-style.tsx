import type { PublicBranding } from "@/lib/types/branding"

export function BrandingStyle({ branding }: { branding: PublicBranding | null }) {
  if (!branding) return null
  const rules: string[] = []
  if (branding.colorPrimary) rules.push(`--primary: ${branding.colorPrimary};`)
  if (branding.colorPrimaryLight) rules.push(`--primary-light: ${branding.colorPrimaryLight};`)
  if (branding.colorPrimaryDark) rules.push(`--primary-dark: ${branding.colorPrimaryDark};`)
  if (branding.colorAccent) rules.push(`--accent: ${branding.colorAccent};`)
  if (branding.colorAccentDark) rules.push(`--accent-dark: ${branding.colorAccentDark};`)
  if (branding.colorBackground) rules.push(`--background: ${branding.colorBackground};`)
  if (branding.fontFamily) rules.push(`--font-family: ${branding.fontFamily};`)
  if (rules.length === 0) return null
  const css = `:root {\n${rules.map((r) => `  ${r}`).join("\n")}\n}`
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
