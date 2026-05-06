"use client"

import { useEffect, useState } from "react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@deqah/ui"
import { useLocale } from "@/components/locale-provider"
import {
  useSendZohoInvoice,
  useZohoPaymentMirrors,
} from "@/hooks/use-zoho-invoice"
import { ClientFilterPicker } from "./client-filter-picker"

const STATUS_TONE: Record<string, string> = {
  paid: "border-success/40 bg-success/10 text-success",
  sent: "border-primary/40 bg-primary/10 text-primary",
  void: "border-destructive/40 bg-destructive/10 text-destructive",
  overdue: "border-warning/40 bg-warning/10 text-warning",
  draft: "border-muted bg-muted text-muted-foreground",
  partially_paid: "border-warning/40 bg-warning/10 text-warning",
}

interface ZohoPaymentMirrorTableProps {
  /**
   * When provided, locks the table to a single client (used by the client
   * detail page's "Zoho receipts" section). The in-table picker is hidden.
   */
  lockedClientId?: string
}

export function ZohoPaymentMirrorTable({ lockedClientId }: ZohoPaymentMirrorTableProps = {}) {
  const { t, locale } = useLocale()
  const [page, setPage] = useState(1)
  const [filterClientId, setFilterClientId] = useState<string | null>(lockedClientId ?? null)
  const [filterClientLabel, setFilterClientLabel] = useState<string | null>(null)

  // External lock wins — prop changes (rare) reset internal filter state.
  useEffect(() => {
    if (lockedClientId !== undefined) {
      setFilterClientId(lockedClientId ?? null)
    }
  }, [lockedClientId])

  // Reset to page 1 whenever the filter changes so we don't land on a missing page.
  useEffect(() => {
    setPage(1)
  }, [filterClientId])

  const { data, isLoading } = useZohoPaymentMirrors({
    page,
    perPage: 25,
    clientId: filterClientId ?? undefined,
  })
  const send = useSendZohoInvoice()
  const [resentId, setResentId] = useState<string | null>(null)

  const onResend = async (zohoInvoiceId: string) => {
    await send.mutateAsync(zohoInvoiceId)
    setResentId(zohoInvoiceId)
    setTimeout(() => setResentId(null), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t("zoho.payments.title")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("zoho.payments.description")}</p>
          </div>
          {!lockedClientId ? (
            <ClientFilterPicker
              value={filterClientId}
              onChange={(id, label) => {
                setFilterClientId(id)
                setFilterClientLabel(label)
              }}
              selectedLabel={filterClientLabel}
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !data?.items.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("zoho.payments.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("zoho.payments.colDate")}</TableHead>
                  <TableHead>{t("zoho.payments.colAmount")}</TableHead>
                  <TableHead>{t("zoho.payments.colMethod")}</TableHead>
                  <TableHead>{t("zoho.payments.colInvoice")}</TableHead>
                  <TableHead>{t("zoho.payments.colZoho")}</TableHead>
                  <TableHead>{t("zoho.payments.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => {
                  const date = row.processedAt
                    ? new Date(row.processedAt).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB", {
                        year: "numeric",
                        month: "short",
                        day: "2-digit",
                      })
                    : "—"
                  const status = row.zohoMirror?.status ?? null
                  const tone = (status && STATUS_TONE[status]) || "border-muted bg-muted text-muted-foreground"
                  return (
                    <TableRow key={row.paymentId}>
                      <TableCell className="text-sm">{date}</TableCell>
                      <TableCell className="text-sm font-medium">
                        {Number(row.amount).toFixed(2)} {row.currency}
                      </TableCell>
                      <TableCell className="text-sm">{row.method}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {row.invoiceId.slice(0, 8)}…
                      </TableCell>
                      <TableCell>
                        {status ? (
                          <Badge variant="outline" className={tone}>
                            {status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t("zoho.payments.zohoNotMirrored")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.zohoMirror ? (
                          <div className="flex flex-wrap gap-2">
                            {row.zohoMirror.invoiceUrl ? (
                              <Button asChild variant="outline" size="sm">
                                <a href={row.zohoMirror.invoiceUrl} target="_blank" rel="noopener noreferrer">
                                  {t("zoho.payments.openInvoice")}
                                </a>
                              </Button>
                            ) : null}
                            {row.zohoMirror.pdfUrl ? (
                              <Button asChild variant="ghost" size="sm">
                                <a href={row.zohoMirror.pdfUrl} target="_blank" rel="noopener noreferrer">
                                  {t("zoho.payments.openPdf")}
                                </a>
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={send.isPending}
                              onClick={() => onResend(row.zohoMirror!.zohoInvoiceId)}
                            >
                              {resentId === row.zohoMirror.zohoInvoiceId
                                ? t("zoho.payments.resent")
                                : send.isPending
                                ? t("zoho.payments.resending")
                                : t("zoho.payments.resend")}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {data && data.meta.totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹
            </Button>
            <span className="text-xs text-muted-foreground">
              {data.meta.page} / {data.meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              ›
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
