import { beforeEach, describe, expect, it, vi } from "vitest"

const { getMock, patchMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  patchMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  api: { get: getMock, patch: patchMock, post: postMock },
}))

import {
  fetchMoyasarConfig,
  testMoyasarConfig,
  upsertMoyasarConfig,
} from "@/lib/api/moyasar-config"

describe("moyasar-config api", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetchMoyasarConfig calls tenant Moyasar config endpoint", async () => {
    getMock.mockResolvedValueOnce(null)
    await fetchMoyasarConfig()
    expect(getMock).toHaveBeenCalledWith("/dashboard/finance/moyasar/config")
  })

  it("upsertMoyasarConfig patches tenant Moyasar config endpoint", async () => {
    const payload = {
      publishableKey: "pk_test_12345678901234567890",
      secretKey: "sk_test_12345678901234567890",
      webhookSecret: "whsec_test_12345678901234567890",
      isLive: false,
    }
    patchMock.mockResolvedValueOnce({})
    await upsertMoyasarConfig(payload)
    expect(patchMock).toHaveBeenCalledWith("/dashboard/finance/moyasar/config", payload)
  })

  it("testMoyasarConfig posts to stored credential probe endpoint", async () => {
    postMock.mockResolvedValueOnce({ ok: true, status: "OK" })
    await testMoyasarConfig()
    expect(postMock).toHaveBeenCalledWith("/dashboard/finance/moyasar/config/test", {})
  })
})
