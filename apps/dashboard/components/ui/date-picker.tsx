"use client"

/**
 * DatePicker — the only canonical date picker in the system.
 *
 * Correct usage:
 *   import { DatePicker } from "@/components/ui/date-picker"
 *   <DatePicker value={value} onChange={onChange} />
 *
 * Forbidden:
 *   - <Input type="date" ...>
 *   - any local date picker inside feature pages
 *   - importing react-day-picker or date-fns directly in feature pages
 */

import * as React from "react"
import { format } from "date-fns"
import { ar, enUS } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { Button } from "@deqah/ui"
import { Calendar } from "@deqah/ui"
import { Popover, PopoverContent, PopoverTrigger } from "@deqah/ui"
import { HugeiconsIcon } from "@hugeicons/react"
import { Calendar03Icon } from "@hugeicons/core-free-icons"
import { useLocale } from "@/components/locale-provider"

export interface DatePickerProps {
  /** ISO date string: "YYYY-MM-DD" */
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Disable the picker entirely */
  disabled?: boolean
  /** Minimum selectable date — ISO "YYYY-MM-DD" */
  minDate?: string
  /** Maximum selectable date — ISO "YYYY-MM-DD" */
  maxDate?: string
  /** Show error state (red border) */
  error?: boolean
  /** Mark field as required (visual only) */
  required?: boolean
  /** Override layout direction */
  dir?: "rtl" | "ltr"
  /** Suppress Next.js hydration mismatch warning on dynamic date values */
  suppressHydrationWarning?: boolean
}

export function DatePicker({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
  minDate,
  maxDate,
  error = false,
  required = false,
  dir,
}: DatePickerProps) {
  const { locale, t } = useLocale()
  const [open, setOpen] = React.useState(false)

  // Safely parse any date string: "YYYY-MM-DD", ISO full, or datetime-local
  const parseDateSafe = (v: string): Date | undefined => {
    if (!v) return undefined
    // Already "YYYY-MM-DD" — append noon to avoid timezone-shift to previous day
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v
    const d = new Date(normalized)
    return isNaN(d.getTime()) ? undefined : d
  }

  const dateValue = parseDateSafe(value ?? "")
  const dateLocale = locale === "ar" ? ar : enUS

  const fromDate = parseDateSafe(minDate ?? "")
  const toDate = parseDateSafe(maxDate ?? "")

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      const yyyy = date.getFullYear()
      const mm = String(date.getMonth() + 1).padStart(2, "0")
      const dd = String(date.getDate()).padStart(2, "0")
      onChange(`${yyyy}-${mm}-${dd}`)
    } else {
      onChange("")
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          dir={dir}
          className={cn(
            "h-9 w-full justify-start gap-2 rounded-md border-border bg-background px-3 text-sm font-normal shadow-sm",
            "hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary/30",
            !value && "text-muted-foreground",
            error && "border-destructive focus-visible:ring-destructive/30",
            disabled && "cursor-not-allowed opacity-50",
            className
          )}
          aria-required={required}
          aria-invalid={error}
        >
          <HugeiconsIcon
            icon={Calendar03Icon}
            size={15}
            className="shrink-0 text-muted-foreground"
          />
          {dateValue ? (
            <span className="tabular-nums">
              {format(dateValue, "dd MMM yyyy", { locale: dateLocale })}
            </span>
          ) : (
            <span>{placeholder ?? t("common.datePicker.placeholder")}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={4}>
        <Calendar
          mode="single"
          selected={dateValue}
          onSelect={handleSelect}
          locale={dateLocale}
          defaultMonth={dateValue ?? fromDate}
          disabled={[
            ...(fromDate ? [{ before: fromDate }] : []),
            ...(toDate ? [{ after: toDate }] : []),
          ]}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
