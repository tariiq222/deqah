import { describe, it, expect, vi } from "vitest"

// Mock server-only so we can import this in tests
vi.mock("server-only", () => ({}))

import { parseHost } from "@/lib/subdomain"

describe("parseHost", () => {
  it("returns no subdomain for root domain", () => {
    const r = parseHost("deqah.net")
    expect(r.subdomain).toBeNull()
    expect(r.isReserved).toBe(false)
    expect(r.isTenantCandidate).toBe(false)
  })

  it("returns no subdomain for localhost", () => {
    expect(parseHost("localhost").subdomain).toBeNull()
    expect(parseHost("localhost:5103").subdomain).toBeNull()
  })

  it("returns no subdomain for empty input", () => {
    expect(parseHost("").subdomain).toBeNull()
    expect(parseHost(null).subdomain).toBeNull()
    expect(parseHost(undefined).subdomain).toBeNull()
  })

  it("identifies app as reserved", () => {
    const r = parseHost("app.deqah.net")
    expect(r.subdomain).toBe("app")
    expect(r.isReserved).toBe(true)
    expect(r.isTenantCandidate).toBe(false)
  })

  it("identifies admin as reserved", () => {
    expect(parseHost("admin.deqah.net").isReserved).toBe(true)
  })

  it("identifies tenant slug as candidate", () => {
    // 3+ char slugs satisfy the regex /^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$/
    const r = parseHost("sawa.staging.deqah.net")
    expect(r.subdomain).toBe("sawa")
    expect(r.isReserved).toBe(false)
    expect(r.isTenantCandidate).toBe(true)
  })

  it("rejects invalid slug shapes", () => {
    // host is lowercased before regex test, so UPPERCASE becomes uppercase (valid)
    expect(parseHost("UPPERCASE.deqah.net").isTenantCandidate).toBe(true)
    expect(parseHost("-leading.deqah.net").isTenantCandidate).toBe(false)
    expect(parseHost("trailing-.deqah.net").isTenantCandidate).toBe(false)
    // 2-char slugs (e.g. "iu", "ab") fail the regex — single and 3+ char pass
    expect(parseHost("abc.deqah.net").isTenantCandidate).toBe(true)
    expect(parseHost("ab.deqah.net").isTenantCandidate).toBe(false)
    expect(parseHost("a.deqah.net").isTenantCandidate).toBe(true)
  })

  it("strips port from host", () => {
    expect(parseHost("iu.staging.deqah.net:443").subdomain).toBe("iu")
  })

  it("lowercases host", () => {
    expect(parseHost("IU.STAGING.DEQAH.NET").subdomain).toBe("iu")
  })
})
