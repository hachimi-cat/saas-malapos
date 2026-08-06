'use client';

import { Switch } from '@/components/ui/switch';
import { useAssistantSettings, useCatentioStatus } from '@/hooks/use-catentio';

/**
 * How much rope the docked-chat assistant gets: apply changes itself,
 * or propose them for approval (linksnap's assistant-section.tsx
 * ported).
 *
 * The setting is not advice to the model — the BFF scopes the run's
 * delegation token to match, so with review on the assistant's writes
 * are refused by the auth layer no matter what it was told
 * (middleware/auth.ts, Path 3). Renders only when the assistant is
 * enabled for the account.
 */
export function AssistantSection() {
  const { enabled } = useCatentioStatus();
  const { autoApply, loading, saving, error, setAutoApply } = useAssistantSettings(enabled);

  if (!enabled) return null;

  return (
    <section className="rounded-xl border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Assistant
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {autoApply
              ? 'The assistant creates and updates categories and products for you as soon as you ask.'
              : 'The assistant proposes each change as a card. Nothing is saved until you press Apply.'}
          </p>
        </div>
        <Switch
          checked={autoApply}
          onCheckedChange={(next) => {
            void setAutoApply(next).catch(() => {
              /* the hook rolled the toggle back and set `error` */
            });
          }}
          disabled={loading || saving}
          aria-label="Let the assistant apply changes"
        />
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  );
}
