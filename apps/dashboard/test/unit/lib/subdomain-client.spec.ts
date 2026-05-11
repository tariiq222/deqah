import { describe, it, expect } from "vitest"
import { computeExpectedTenantUrl } from "@/lib/subdomain-client"

describe("computeExpectedTenantUrl", () => {
  it("returns null on localhost", () => {
    expect(computeExpectedTenantUrl("localhost", "iu", "/")).toBeNull()
    expect(computeExpectedTenantUrl("127.0.0.1", "iu", "/")).toBeNull()
  })

  it("returns null when hostname has <3 labels", () => {
    expect(computeExpectedTenantUrl("deqah.net", "iu", "/")).toBeNull()
  })

  it("returns null when already on the correct subdomain", () => {
    expect(computeExpectedTenantUrl("iu.staging.deqah.net", "iu", "/dashboard")).toBeNull()
    expect(computeExpectedTenantUrl("iu.deqah.net", "iu", "/")).toBeNull()
  })

  it("redirects from app.* to user's tenant subdomain", () => {
    expect(computeExpectedTenantUrl("app.deqah.net", "iu", "/")).toBe(
      "https://iu.deqah.net/",
    )
    expect(computeExpectedTenantUrl("app.staging.deqah.net", "iu", "/bookings")).toBe(
      "https://iu.staging.deqah.net/bookings",
    )
  })

  it("redirects from a different tenant subdomain", () => {
    expect(computeExpectedTenantUrl("other.deqah.net", "iu", "/")).toBe(
      "https://iu.deqah.net/",
    )
  })

  it("returns null when userSlug is empty", () => {
    expect(computeExpectedTenantUrl("app.deqah.net", "", "/")).toBeNull()
  })

  it("preserves pathname", () => {
    expect(computeExpectedTenantUrl("app.deqah.net", "iu", "/settings/billing")).toBe(
      "https://iu.deqah.net/settings/billing",
    )
  })

  it("defaults empty pathname to /", () => {
    expect(computeExpectedTenantUrl("app.deqah.net", "iu", "")).toBe(
      "https://iu.deqah.net/",
    )
  })
})
