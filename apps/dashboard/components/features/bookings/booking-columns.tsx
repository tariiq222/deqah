"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { Avatar, AvatarFallback } from "@deqah/ui"
import { cn, formatClinicDate, formatClinicTime } from "@/lib/utils"
import type { DateFormat, TimeFormat } from "@/lib/utils"
import type { Booking } from "@/lib/types/booking"
import { FormattedCurrency } from "@/components/features/shared/sar-symbol"
import { ActionsCell, StatusCell } from "@/components/features/bookings/booking-column-cells"

function getInitials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

const avatarGradients = [
  "from-avatar-1-from to-avatar-1-to",
  "from-avatar-2-from to-avatar-2-to",
  "from-avatar-3-from to-avatar-3-to",
  "from-avatar-4-from to-avatar-4-to",
  "from-avatar-5-from to-avatar-5-to",
  "from-avatar-6-from to-avatar-6-to",
  "from-avatar-7-from to-avatar-7-to",
  "from-avatar-8-from to-avatar-8-to",
]

function getGradient(name: string): string {
  let hash = 0
  for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash)
  return avatarGradients[Math.abs(hash) % avatarGradients.length]
}

const typeDotConfig: Record<string, string> = {
  in_person: "bg-primary",
  online: "bg-accent",
  walk_in: "bg-success",
}

const typeLabelKey: Record<string, string> = {
  in_person: "bookings.col.type.inPerson",
  online: "bookings.col.type.online",
  walk_in: "bookings.col.type.walkIn",
}

/* ── Column definitions ── */

export function getBookingColumns(
  onRowClick: (booking: Booking) => void,
  onEditClick: (booking: Booking) => void,
  onStatusAction: (booking: Booking, action: "confirm" | "noshow") => void,
  onDelete: (booking: Booking) => void,
  t: (key: string) => string,
  config?: { dateFormat?: DateFormat },
): ColumnDef<Booking>[] {
  const dateFormat = config?.dateFormat ?? "Y-m-d"
  return [
    {
      accessorKey: "id",
      header: "#",
      cell: ({ row }) => (
        <span className="text-[13px] font-medium font-numeric text-muted-foreground">
          #{row.original.bookingNumber.toString().padStart(4, "0")}
        </span>
      ),
    },
    {
      id: "client",
      header: t("bookings.col.header.client"),
      cell: ({ row }) => {
        const p = row.original.client
        if (!p) return <span className="text-muted-foreground">—</span>
        const name = `${p.firstName} ${p.lastName}`
        const grad = getGradient(name)
        return (
          <button
            className="flex items-center gap-2.5 text-start hover:opacity-80 transition-opacity"
            onClick={() => onRowClick(row.original)}
          >
            <Avatar className="size-8">
              <AvatarFallback className={cn("bg-gradient-to-br text-primary-foreground text-[11px] font-semibold", grad)}>
                {getInitials(p.firstName, p.lastName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-semibold text-foreground">{name}</p>
              <p className="text-[11px] font-numeric text-muted-foreground">
                #{row.original.bookingNumber.toString().padStart(4, "0")}
              </p>
            </div>
          </button>
        )
      },
    },
    {
      id: "employee",
      header: t("bookings.col.header.employee"),
      cell: ({ row }) => {
        const u = row.original.employee?.user
        if (!u) return <span className="text-muted-foreground">—</span>
        return (
          <span className="text-sm font-medium text-foreground">
            {t("bookings.info.drPrefix")} {u.firstName} {u.lastName}
          </span>
        )
      },
    },
    {
      accessorKey: "type",
      header: t("bookings.col.header.type"),
      cell: ({ row }) => {
        const type = row.original.type
        const dot = typeDotConfig[type] ?? "bg-muted-foreground"
        const labelKey = typeLabelKey[type]
        const label = labelKey ? t(labelKey) : type
        return (
          <div className="flex items-center gap-2">
            <span className={cn("size-2 shrink-0 rounded-full", dot)} />
            <span className="text-[13px] font-medium text-foreground">{label}</span>
          </div>
        )
      },
    },
    {
      id: "datetime",
      header: t("bookings.col.header.datetime"),
      cell: ({ row }) => (
        <div className="font-numeric">
          <p className="text-sm font-medium text-foreground">
            {formatClinicDate(row.original.date, dateFormat)}
          </p>
          <p className="text-xs text-muted-foreground">{formatClinicTime(row.original.startTime)}</p>
        </div>
      ),
    },
    {
      id: "amount",
      header: t("bookings.col.header.amount"),
      cell: ({ row }) => {
        const payment = row.original.payment
        if (!payment) return <span className="text-muted-foreground">—</span>
        return <FormattedCurrency amount={payment.totalAmount} locale="ar" decimals={2} />
      },
    },
    {
      accessorKey: "status",
      header: t("bookings.col.header.status"),
      cell: ({ row }) => (
        <StatusCell booking={row.original} onStatusAction={onStatusAction} />
      ),
    },
    {
      id: "actions",
      header: t("bookings.col.header.actions"),
      cell: ({ row }) => (
        <ActionsCell
          booking={row.original}
          onView={() => onRowClick(row.original)}
          onEdit={() => onEditClick(row.original)}
          onDelete={() => onDelete(row.original)}
          t={t}
        />
      ),
    },
  ]
}
