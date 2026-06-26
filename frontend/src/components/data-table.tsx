'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  // Returns the value used for sorting + global search. If omitted,
  // sorting falls back to the JSON-stringified cell output.
  sortValue?: (row: T) => string | number | null | undefined;
  searchValue?: (row: T) => string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
};

export type FilterDef<T> = {
  key: string;
  label: string;
  accessor: (row: T) => string | null | undefined;
  // If omitted, options are derived from the data set.
  options?: { value: string; label: string }[];
};

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Radix Select forbids empty-string item values, so the "All" option uses
// this sentinel internally and maps back to '' for the public filter state.
const ALL_SENTINEL = '__all__';

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function DataTable<T>({
  rows,
  columns,
  filters,
  rowKey,
  searchPlaceholder = 'Search…',
  defaultSort = null,
  defaultPageSize = 25,
  rowHref,
  empty,
  renderExpanded,
}: {
  rows: T[];
  columns: Column<T>[];
  filters?: FilterDef<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  defaultSort?: SortState;
  defaultPageSize?: number;
  rowHref?: (row: T) => string | null;
  empty?: React.ReactNode;
  renderExpanded?: (row: T) => React.ReactNode | null;
}) {
  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<SortState>(defaultSort);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const filterOptions = useMemo(() => {
    if (!filters) return {} as Record<string, { value: string; label: string }[]>;
    const out: Record<string, { value: string; label: string }[]> = {};
    for (const f of filters) {
      if (f.options) {
        out[f.key] = f.options;
        continue;
      }
      const seen = new Set<string>();
      for (const r of rows) {
        const v = f.accessor(r);
        if (v != null && v !== '') seen.add(v);
      }
      out[f.key] = Array.from(seen)
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v }));
    }
    return out;
  }, [filters, rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (filters) {
      for (const f of filters) {
        const v = filterValues[f.key];
        if (!v) continue;
        out = out.filter((r) => f.accessor(r) === v);
      }
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) =>
        columns.some((c) => {
          if (!c.searchValue) return false;
          return c.searchValue(r).toLowerCase().includes(q);
        }),
      );
    }
    return out;
  }, [rows, filters, filterValues, search, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const accessor = col.sortValue ?? ((r: T) => col.searchValue?.(r) ?? '');
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => dir * compare(accessor(a), accessor(b)));
  }, [filtered, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const offset = safePage * pageSize;
  const pageRows = sorted.slice(offset, offset + pageSize);

  const hasGlobalSearch = columns.some((c) => c.searchValue);
  const hasFilters = filters && filters.length > 0;
  const hasControls = hasGlobalSearch || hasFilters;

  const onSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
    setPage(0);
  };

  const onClear = () => {
    setSearch('');
    setFilterValues({});
    setPage(0);
  };

  const hasAnyFilter =
    search.trim().length > 0 ||
    Object.values(filterValues).some((v) => v && v.length > 0);

  return (
    <div>
      {hasControls && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          {hasGlobalSearch && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="h-8 w-auto py-1 pl-7 pr-2.5 text-xs shadow-none"
              />
            </div>
          )}
          {filters?.map((f) => (
            <div key={f.key} className="flex items-center gap-1.5 text-muted-foreground">
              {f.label}
              <Select
                value={filterValues[f.key] || ALL_SENTINEL}
                onValueChange={(v) => {
                  setFilterValues((prev) => ({
                    ...prev,
                    [f.key]: v === ALL_SENTINEL ? '' : v,
                  }));
                  setPage(0);
                }}
              >
                <SelectTrigger className="h-8 w-auto gap-1 px-2 py-1 text-xs shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SENTINEL}>All</SelectItem>
                  {filterOptions[f.key]?.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          {hasAnyFilter && (
            <Button
              type="button"
              variant="ghost"
              onClick={onClear}
              className="h-auto px-1 py-0.5 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              Clear
            </Button>
          )}
          <div className="ml-auto text-muted-foreground">
            {sorted.length} of {rows.length}
          </div>
        </div>
      )}

      {/* Desktop: table layout */}
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="border-b border-border bg-secondary/40 hover:bg-secondary/40">
              {renderExpanded && (
                <TableHead className="w-8 px-2 py-2" aria-hidden />
              )}
              {columns.map((c) => {
                const isSorted = sort?.key === c.key;
                const Icon = !isSorted
                  ? ChevronsUpDown
                  : sort.dir === 'asc'
                    ? ChevronUp
                    : ChevronDown;
                const align =
                  c.align === 'right'
                    ? 'text-right'
                    : c.align === 'center'
                      ? 'text-center'
                      : 'text-left';
                const base = `h-auto px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground ${align}`;
                if (!c.sortable) {
                  return (
                    <TableHead key={c.key} className={`${base} ${c.headerClassName ?? ''}`}>
                      {c.header}
                    </TableHead>
                  );
                }
                return (
                  <TableHead key={c.key} className={`${base} ${c.headerClassName ?? ''}`}>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onSort(c.key)}
                      className={`-ml-1 inline-flex h-auto items-center gap-1 px-1 py-0.5 text-xs font-medium uppercase tracking-wider hover:bg-transparent hover:text-foreground ${
                        isSorted ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {c.header}
                      <Icon className="h-3 w-3" />
                    </Button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length + (renderExpanded ? 1 : 0)}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  {empty ?? (rows.length === 0 ? 'No data.' : 'No rows match.')}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => {
                const key = rowKey(row);
                const expandedContent =
                  renderExpanded ? renderExpanded(row) : null;
                const isExpandable =
                  renderExpanded != null && expandedContent != null;
                const isExpanded = isExpandable && expandedKey === key;
                const cells = columns.map((c) => {
                  const align =
                    c.align === 'right'
                      ? 'text-right'
                      : c.align === 'center'
                        ? 'text-center'
                        : 'text-left';
                  return (
                    <TableCell
                      key={c.key}
                      className={`px-3 py-2 text-xs ${align} ${c.className ?? ''}`}
                    >
                      {c.cell(row)}
                    </TableCell>
                  );
                });
                return (
                  <Fragment key={key}>
                    <TableRow
                      className={`border-b border-border last:border-b-0 ${
                        isExpandable
                          ? 'cursor-pointer hover:bg-accent/30'
                          : 'hover:bg-accent/30'
                      } ${isExpanded ? 'bg-accent/20' : ''}`}
                      onClick={
                        isExpandable
                          ? () => setExpandedKey(isExpanded ? null : key)
                          : undefined
                      }
                    >
                      {renderExpanded && (
                        <TableCell className="w-8 px-2 py-2 align-middle">
                          {isExpandable ? (
                            <ChevronRight
                              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                                isExpanded ? 'rotate-90' : ''
                              }`}
                            />
                          ) : null}
                        </TableCell>
                      )}
                      {cells}
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="border-b border-border bg-muted/20 last:border-b-0 hover:bg-muted/20">
                        <TableCell
                          colSpan={columns.length + 1}
                          className="px-4 py-3"
                        >
                          {expandedContent}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: stacked card list (md:hidden) */}
      <div className="space-y-2 md:hidden">
        {pageRows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {empty ?? (rows.length === 0 ? 'No data.' : 'No rows match.')}
          </div>
        ) : (
          pageRows.map((row) => {
            const key = rowKey(row);
            const expandedContent =
              renderExpanded ? renderExpanded(row) : null;
            const isExpandable =
              renderExpanded != null && expandedContent != null;
            const isExpanded = isExpandable && expandedKey === key;
            return (
              <div
                key={key}
                className={`min-w-0 rounded-lg border bg-card transition ${
                  isExpanded
                    ? 'border-primary/40 bg-accent/10'
                    : 'border-border'
                } ${isExpandable ? 'cursor-pointer hover:border-primary/40' : ''}`}
                onClick={
                  isExpandable
                    ? () => setExpandedKey(isExpanded ? null : key)
                    : undefined
                }
              >
                <div className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <dl className="space-y-1.5">
                      {columns.map((c) => {
                        const cell = c.cell(row);
                        return (
                          <div
                            key={c.key}
                            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs"
                          >
                            <dt className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/80">
                              {c.header}
                            </dt>
                            <dd className="min-w-0 max-w-full break-words text-right text-foreground/90">
                              {cell}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>
                  {isExpandable && (
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                  )}
                </div>
                {isExpanded && (
                  <div
                    className="border-t border-border/60 bg-muted/20 px-3 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {expandedContent}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {sorted.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              {offset + 1}–{Math.min(offset + pageSize, sorted.length)} of {sorted.length}
            </span>
            <span className="flex items-center gap-1.5">
              Rows
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(0);
                }}
              >
                <SelectTrigger className="h-7 w-auto gap-1 px-1.5 py-0.5 text-xs shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-7 w-7 bg-card disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2">
              Page {safePage + 1} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="h-7 w-7 bg-card disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RowLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`hover:text-primary ${className}`}>
      {children}
    </Link>
  );
}
