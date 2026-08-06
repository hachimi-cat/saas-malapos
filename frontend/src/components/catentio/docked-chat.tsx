'use client';

import { useCallback, useMemo, useState } from 'react';
import { LogoMark } from '@/components/brand/logo';
import { DockedChat, createBffChatAdapters, type ChatAction } from '@forjio/agent-ui';
import { catentioHttp } from '@/lib/catentio-http';
import { applyChatAction } from '@/components/catentio/chat-actions';
import { useCatentioStatus, ASSISTANT_ACTIVITY_EVENT } from '@/hooks/use-catentio';
import { ApiRequestError } from '@/lib/api';

/**
 * The docked product chat — malapos's mount of the embedded agent layer
 * (linksnap's docked-chat.tsx is the reference). Renders nothing unless
 * the catentio pilot flag is on for this account (the backend re-checks
 * on every call regardless). Docked bottom-right: resting, only the
 * composer bar shows; focus/submit grows the panel in place.
 */
export function CatentioDockedChat() {
  const { enabled } = useCatentioStatus();
  const [open, setOpen] = useState(false);
  // ONE adapter set per mount — an inline object per render would
  // restart the package's poll/save machinery.
  const adapters = useMemo(
    () => createBffChatAdapters(catentioHttp, { activityEventName: ASSISTANT_ACTIVITY_EVENT }),
    [],
  );

  // The chat's Apply path (review mode): the agent PROPOSED the card,
  // this executes it with the user's own session via the same
  // api-client calls the dashboard pages use (chat-actions.ts).
  const onApplyAction = useCallback(
    async (action: ChatAction, earlier: { action: ChatAction; result?: unknown }[]) => {
      try {
        return await applyChatAction(action, earlier);
      } catch (err) {
        // Surface what the SERVER said — a bare "Request failed" hides
        // the exact rejection the user needs to see on the card.
        throw new Error(
          err instanceof ApiRequestError || err instanceof Error
            ? err.message
            : 'That change could not be applied',
        );
      }
    },
    [],
  );

  if (!enabled) return null;

  // Insets mirror <main>'s padding so the dock lines up with the page
  // content. Expanded: full SCREEN on mobile (fixed inset-0 over
  // everything), full column height on desktop at the same content
  // width (the linksnap layout decisions, 2026-08-05).
  return (
    <div
      className={
        open
          ? 'fixed inset-0 z-50 flex flex-col sm:absolute sm:inset-x-6 sm:bottom-6 sm:top-6 sm:z-40 sm:mx-auto sm:max-w-4xl'
          : 'absolute inset-x-4 bottom-4 z-40 mx-auto flex max-w-4xl flex-col sm:inset-x-6 sm:bottom-6'
      }
    >
      <DockedChat
        adapters={adapters}
        product="malapos"
        open={open}
        onOpenChange={setOpen}
        title="Malapos Assistant"
        avatarUrl="/apple-touch-icon.png"
        brandIcon={<LogoMark />}
        onApplyAction={onApplyAction}
      />
    </div>
  );
}
