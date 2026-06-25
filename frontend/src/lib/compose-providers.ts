/**
 * Provider-key resolution for the compose form.
 *
 * The broadcasts API (ripllo, proxied through storlaunch's
 * /api/v1/account/marketing/broadcasts) validates `providers` against
 * an integration-specific enum:
 *
 *   email_resend, email_sendgrid, email_mailgun, email_postmark, email_ses,
 *   sms_twilio, sms_vonage,
 *   whatsapp_cloud, whatsapp_twilio, telegram_bot, line_business,
 *   discord_webhook, slack_webhook,
 *   push_onesignal, push_fcm,
 *   meta_business, linkedin, tiktok_business, twitter, youtube, pinterest, threads,
 *   webhook_generic
 *
 * Generic tokens like `email`, `sms`, `whatsapp`, `push` get a 400.
 *
 * PR #3 (E2E sprint, 2026-05-26) caught a regression where the
 * compose page POSTed `providers: ['email']` and the broadcast
 * silently failed validation. The compose UI now routes every
 * selection through `resolveProviders` before submit so that even if a
 * generic token sneaks in (URL preset, template content, future
 * grouped-channel UI), it gets remapped to the merchant's configured
 * specific provider.
 */

/// Channel record shape from GET /channels. Only the fields we need.
export interface ChannelLike {
  id: string;
  provider: string;
  status?: string;
}

/// Generic channel-type → list of specific provider keys, ordered by
/// preference. The first connected provider in the list wins. Order
/// reflects "popularity in the Forjio family" not a quality ranking —
/// merchants who connect a single provider per type get a stable
/// resolution regardless of array order.
const GENERIC_TO_SPECIFIC: Record<string, string[]> = {
  email: [
    'email_resend',
    'email_sendgrid',
    'email_mailgun',
    'email_postmark',
    'email_ses',
  ],
  sms: ['sms_twilio', 'sms_vonage'],
  whatsapp: ['whatsapp_cloud', 'whatsapp_twilio'],
  push: ['push_onesignal', 'push_fcm'],
};

/// The full set of specific provider keys the backend accepts. Stays
/// in sync with the `ChannelProvider` enum in ripllo's prisma schema.
export const SPECIFIC_PROVIDERS: ReadonlySet<string> = new Set([
  'email_resend', 'email_sendgrid', 'email_mailgun', 'email_postmark', 'email_ses',
  'sms_twilio', 'sms_vonage',
  'whatsapp_cloud', 'whatsapp_twilio', 'telegram_bot', 'line_business',
  'discord_webhook', 'slack_webhook',
  'push_onesignal', 'push_fcm',
  'meta_business', 'linkedin', 'tiktok_business', 'twitter', 'youtube',
  'pinterest', 'threads',
  'webhook_generic',
]);

/**
 * Resolve a list of (possibly generic) provider tokens against the
 * merchant's active channels.
 *
 * - Specific keys (e.g. `email_resend`) pass through unchanged.
 * - Generic keys (e.g. `email`) map to the first active channel whose
 *   `provider` starts with the matching prefix.
 * - Unknown tokens with no match get reported back in `unresolved` so
 *   the caller can surface a clear error.
 *
 * Duplicates are removed in the output while preserving first-seen order.
 */
export function resolveProviders(
  pickedProviders: string[],
  channels: ChannelLike[],
): { resolved: string[]; unresolved: string[] } {
  const active = channels.filter((c) => (c.status ?? 'active') === 'active');
  const resolved: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  for (const token of pickedProviders) {
    if (SPECIFIC_PROVIDERS.has(token)) {
      if (!seen.has(token)) {
        seen.add(token);
        resolved.push(token);
      }
      continue;
    }
    // Generic token (e.g. 'email') — find a configured channel.
    const candidates = GENERIC_TO_SPECIFIC[token];
    if (!candidates) {
      unresolved.push(token);
      continue;
    }
    const match = candidates.find((p) => active.some((c) => c.provider === p));
    if (!match) {
      unresolved.push(token);
      continue;
    }
    if (!seen.has(match)) {
      seen.add(match);
      resolved.push(match);
    }
  }

  return { resolved, unresolved };
}
