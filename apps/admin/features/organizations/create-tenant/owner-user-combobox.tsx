'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchUsers } from '@/features/users/search-users/use-search-users';
import { Input } from '@deqah/ui/primitives/input';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

interface Props {
  value: string;
  onSelect: (userId: string, label: string) => void;
}

export function OwnerUserCombobox({ value, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isFetching } = useSearchUsers({
    page: 1,
    perPage: 10,
    search: debouncedSearch || undefined,
  });

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setOpen(true);
      if (!e.target.value) onSelect('', '');
    },
    [onSelect],
  );

  const selectedLabel = value
    ? (data?.items.find((u) => u.id === value)?.email ?? search)
    : search;

  return (
    <div className="relative">
      <Input
        value={selectedLabel}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search by email or name…" /* TODO i18n: no key */
        autoComplete="off"
      />
      {open && (search.length > 0 || isFetching) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {isFetching ? (
            // TODO i18n: Searching…
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
          ) : data?.items.length === 0 ? (
            // TODO i18n: No users found.
            <div className="px-3 py-2 text-sm text-muted-foreground">No users found.</div>
          ) : (
            <ul className="max-h-48 overflow-auto py-1">
              {data?.items.map((user) => (
                <li
                  key={user.id}
                  className="cursor-pointer px-3 py-2 text-sm hover:bg-accent"
                  onMouseDown={() => {
                    onSelect(user.id, user.email);
                    setSearch(user.email);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{user.name}</span>
                  <span className="ml-2 text-muted-foreground">{user.email}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
