'use client';

import type { ComponentType } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The page's BATCH verbs, mounted immediately left of "New X" (bang's
 * entry-point contract; storlaunch's actions-dropdown.tsx is the
 * reference): create lives on New X, single-record verbs live on the
 * row, and everything batch-shaped lives here. Detail pages never
 * mount it — a detail page's verbs are plain buttons.
 *
 * ONE action renders as a plain outline button wearing that action's own
 * words — a dropdown hiding a single item is a click tax. Two or more
 * fold into an "Actions" menu, destructive items styled and separated at
 * the bottom, selection-dependent items disabled with a hint until rows
 * are ticked (the checkbox column is the selector; this is the verb).
 */
export interface PageAction {
  key: string;
  /** The action verb as the merchant reads it — "Bulk edit",
   *  "Delete 3 selected", "Set category". Recompute per render so
   *  counts stay live. */
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Opens the action's own sheet/dialog — confirms live there, and the
   *  partial-failure sentence renders on the bulk bar as before. */
  run: () => void;
  /** Disabled with a "Select rows first" hint while nothing is ticked. */
  requiresSelection?: boolean;
  /** Destructive item styling, grouped last behind a separator. */
  destructive?: boolean;
  disabled?: boolean;
  disabledHint?: string;
}

export function ActionsDropdown({
  actions,
  selectionCount,
  noun,
}: {
  actions: PageAction[];
  /** How many rows are ticked right now — gates `requiresSelection`. */
  selectionCount: number;
  /** Singular, merchant's word: 'product', 'supplier'. */
  noun: string;
}) {
  if (actions.length === 0) return null;

  const state = actions.map((a) => {
    const needsRows = Boolean(a.requiresSelection) && selectionCount === 0;
    return {
      ...a,
      isDisabled: Boolean(a.disabled) || needsRows,
      hint: a.disabled ? a.disabledHint : needsRows ? 'Select rows first' : undefined,
    };
  });

  if (state.length === 1) {
    const only = state[0]!;
    const Icon = only.icon;
    return (
      // The span carries the hint: a disabled Button is pointer-events-
      // none, so a title on the button itself would never show.
      <span title={only.hint} className="inline-flex">
        <Button
          variant="outline"
          size="default"
          disabled={only.isDisabled}
          onClick={() => only.run()}
          className={only.destructive ? 'text-destructive hover:text-destructive' : undefined}
        >
          {Icon && <Icon />}
          {only.label}
        </Button>
      </span>
    );
  }

  const plain = state.filter((a) => !a.destructive);
  const destructive = state.filter((a) => a.destructive);

  const item = (a: (typeof state)[number]) => {
    const Icon = a.icon;
    return (
      <DropdownMenuItem
        key={a.key}
        disabled={a.isDisabled}
        onSelect={() => a.run()}
        className={a.destructive ? 'text-destructive focus:text-destructive' : undefined}
      >
        {Icon && <Icon className="h-4 w-4" />}
        <span>
          {a.label}
          {a.hint && (
            <span className="block text-xs text-muted-foreground">{a.hint}</span>
          )}
        </span>
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="default" aria-label={`${noun} actions`}>
          Actions
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {plain.map(item)}
        {plain.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
        {destructive.map(item)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
