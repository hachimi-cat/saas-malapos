'use client';

import * as React from 'react';
import { format, parse, isValid } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Real shadcn date picker — Popover + Calendar (react-day-picker), a
 * drop-in for `<input type="date">`. Keeps a `yyyy-MM-dd` string value so
 * existing form state (which does `new Date(value).toISOString()`) is
 * unchanged. The trigger is styled like a shadcn Input so it reads as a
 * form field.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  id,
  disabled,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const parsed = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;

  return (
    // `modal` matters when this picker is used inside the agentic sheet,
    // which is a Radix Dialog. Dialog mounts RemoveScroll with
    // `shards: [contentRef]`, so the allowed region is the dialog's own
    // content; this popover portals its calendar to <body>, outside it.
    // react-remove-scroll honours only the LAST lock on its stack and
    // Radix Popover mounts its own ONLY when `modal` is set (default
    // false) — so without this the calendar belongs to no lock at all.
    // Ported from storlaunch a50a1b1, where bang confirmed the fix on
    // real iPad Safari after it could not be reproduced in any harness.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          {selected ? format(selected, 'PP') : placeholder}
          <CalendarIcon className="size-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            onChange(d ? format(d, 'yyyy-MM-dd') : '');
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
