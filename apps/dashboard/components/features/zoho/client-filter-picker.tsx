"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button, Input } from "@deqah/ui"
import { fetchClients } from "@/lib/api/clients"
import { useLocale } from "@/components/locale-provider"

interface ClientLite {
  id: string
  firstName: string
  lastName: string
  phone: string | null
}

interface Props {
  /** Currently selected client id (controls the cleared/applied state). */
  value: string | null
  /** Fired when the user picks a client OR clears the filter. */
  onChange: (clientId: string | null, label: string | null) => void
  /** Optional label shown alongside the picker chip when a client is selected. */
  selectedLabel: string | null
}

/**
 * Debounced search-as-you-type picker for filtering the Zoho payments mirror
 * table by a single Client. Hits the existing `/dashboard/people/clients`
 * paginated endpoint with `search=` and shows up to 8 matches in a dropdown.
 *
 * Renders nothing fancy when a client is already selected — just a chip with
 * a "Clear" button. The user clears it to re-open the search.
 */
export function ClientFilterPicker({ value, onChange, selectedLabel }: Props) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState("")
  const [debounced, setDebounced] = useState("")

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 250)
    return () => clearTimeout(id)
  }, [term])

  const { data, isFetching } = useQuery({
    enabled: open && debounced.length >= 2,
    queryKey: ["zoho-client-picker", debounced],
    queryFn: () =>
      fetchClients({ page: 1, perPage: 8, search: debounced }),
    staleTime: 30_000,
  })

  if (value && selectedLabel) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          {t("zoho.payments.filterClient")}
        </span>
        <span className="text-sm font-medium">{selectedLabel}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => {
            onChange(null, null)
            setTerm("")
            setOpen(false)
          }}
        >
          {t("zoho.payments.filterClear")}
        </Button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Input
        placeholder={t("zoho.payments.filterPlaceholder")}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay to allow click events on the dropdown to register first.
          setTimeout(() => setOpen(false), 150)
        }}
        className="h-9 w-72"
      />
      {open && debounced.length >= 2 ? (
        <div className="absolute z-20 mt-1 w-72 overflow-hidden rounded-md border bg-popover shadow-md">
          {isFetching ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t("zoho.payments.filterSearching")}
            </div>
          ) : !data?.items.length ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {t("zoho.payments.filterNoResults")}
            </div>
          ) : (
            <ul role="listbox">
              {(data.items as ClientLite[]).map((c) => {
                const label = `${c.firstName} ${c.lastName}`.trim() || c.phone || c.id
                return (
                  <li
                    key={c.id}
                    role="option"
                    onMouseDown={(e) => {
                      // mousedown fires before blur — keeps selection working
                      e.preventDefault()
                      onChange(c.id, label)
                      setTerm("")
                      setOpen(false)
                    }}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-muted"
                  >
                    <div className="font-medium">{label}</div>
                    {c.phone ? (
                      <div className="text-xs text-muted-foreground">{c.phone}</div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
