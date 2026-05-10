import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { InvoicesTable } from "@/app/(dashboard)/subscription/invoices/components/invoices-table"
import type { Invoice } from "@/lib/types/billing"

const { useLocale } = vi.hoisted(() => ({
  useLocale: vi.fn(),
}))

vi.mock("@/components/locale-provider", () => ({ useLocale }))
vi.mock("@hugeicons/react", () => ({
  HugeiconsIcon: ({ className }: { className?: string }) => (
    <span data-testid="icon" className={className} />
  ),
}))

function setupLocale() {
  useLocale.mockReturnValue({
    locale: "en",
    t: (k: string) => k,
  })
}

const baseInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: "inv-1",
  invoiceNumber: "INV-2026-000001",
  status: "PAID",
  amount: "115.00",
  currency: "SAR",
  periodStart: "2026-04-01T00:00:00.000Z",
  periodEnd: "2026-04-30T00:00:00.000Z",
  issuedAt: "2026-04-30T12:00:00.000Z",
  paidAt: "2026-04-30T12:01:00.000Z",
  zohoInvoiceUrl: null,
  zohoPdfUrl: null,
  ...overrides,
})

describe("InvoicesTable", () => {
  it("renders one row per invoice with all 5 statuses", () => {
    setupLocale()
    const invoices: Invoice[] = [
      baseInvoice({ id: "1", status: "DRAFT", invoiceNumber: null, issuedAt: null }),
      baseInvoice({ id: "2", status: "DUE" }),
      baseInvoice({ id: "3", status: "PAID" }),
      baseInvoice({ id: "4", status: "FAILED" }),
      baseInvoice({ id: "5", status: "VOID" }),
    ]

    const { container } = render(<InvoicesTable invoices={invoices} />)

    const rows = container.querySelectorAll("tbody tr")
    expect(rows).toHaveLength(5)
    expect(screen.getByText("billing.invoices.status.draft")).toBeInTheDocument()
    expect(screen.getByText("billing.invoices.status.due")).toBeInTheDocument()
    expect(screen.getByText("billing.invoices.status.paid")).toBeInTheDocument()
    expect(screen.getByText("billing.invoices.status.failed")).toBeInTheDocument()
    expect(screen.getByText("billing.invoices.status.void")).toBeInTheDocument()
  })

  it("disables view-invoice button when invoice has not been issued (issuedAt = null)", () => {
    setupLocale()

    render(
      <InvoicesTable
        invoices={[
          baseInvoice({ id: "draft-1", invoiceNumber: null, issuedAt: null }),
        ]}
      />,
    )

    const button = screen.getByRole("button", {
      name: "billing.invoices.action.viewInvoice",
    })
    expect(button).toBeDisabled()
    expect(screen.getByText("billing.invoices.notIssued")).toBeInTheDocument()
  })

  it("disables view-invoice button when zoho mirror not ready", () => {
    setupLocale()

    render(
      <InvoicesTable
        invoices={[
          baseInvoice({ id: "inv-1", zohoInvoiceUrl: null }),
        ]}
      />,
    )

    const button = screen.getByRole("button", {
      name: "billing.invoices.action.viewInvoice",
    })
    expect(button).toBeDisabled()
  })

  it("renders zoho invoice link when zohoInvoiceUrl is present", () => {
    setupLocale()

    render(
      <InvoicesTable
        invoices={[
          baseInvoice({
            id: "inv-1",
            zohoInvoiceUrl: "https://invoice.zoho.com/inv-1",
          }),
        ]}
      />,
    )

    const link = screen.getByRole("link", {
      name: "billing.invoices.action.viewInvoice",
    })
    expect(link).toHaveAttribute("href", "https://invoice.zoho.com/inv-1")
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("renders download PDF link when zohoPdfUrl is present", () => {
    setupLocale()

    render(
      <InvoicesTable
        invoices={[
          baseInvoice({
            id: "inv-1",
            zohoInvoiceUrl: "https://invoice.zoho.com/inv-1",
            zohoPdfUrl: "https://invoice.zoho.com/inv-1.pdf",
          }),
        ]}
      />,
    )

    const link = screen.getByRole("link", {
      name: "billing.invoices.action.downloadPdf",
    })
    expect(link).toHaveAttribute("href", "https://invoice.zoho.com/inv-1.pdf")
  })

  it("shows skeleton rows when isLoading is true", () => {
    setupLocale()

    const { container } = render(<InvoicesTable invoices={[]} isLoading />)

    expect(container.querySelectorAll("tbody tr")).toHaveLength(5)
  })
})
