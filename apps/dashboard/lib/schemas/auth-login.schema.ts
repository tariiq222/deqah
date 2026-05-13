import { z } from "zod"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^(\+9665|009665|05)[0-9]{8}$/

export const identifierSchema = z
  .string()
  .min(1, { message: "REQUIRED" })
  .refine((v) => EMAIL_RE.test(v.trim()) || PHONE_RE.test(v.trim().replace(/\s/g, "")), {
    message: "INVALID_IDENTIFIER",
  })

export const otpCodeSchema = z
  .string()
  .regex(/^[0-9]{6}$/, { message: "INVALID_OTP" })

export type LoginStep = "identifier" | "method" | "password" | "otp" | "org-selection"
export type LoginMethod = "password" | "otp"
