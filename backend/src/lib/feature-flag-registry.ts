import { ensureFeatureFlag, isEnabled } from './feature-flags.js';

/*
 * This product's declared feature flags.
 *
 * The standard is explicit that a flag which exists in the database but
 * that nothing reads is worse than useless — it looks like a working
 * control and does nothing. So every key here is read by a helper below
 * it, and the helper is exported for the code that will call it.
 *
 * Registration runs once at boot (see registerFeatureFlags in app.ts). It
 * is idempotent and never overwrites an operator's toggle: `enabled`,
 * `rollout` and `allowlist` are seeded on CREATE only, so a redeploy
 * cannot re-enable something turned off during an incident, nor put back
 * somebody deliberately removed from a pilot.
 */

/** bang (adhya@forjio.com) and gojo — the two accounts piloting the
 *  catentio embedded layer ahead of any customer seeing it. Huudis user
 *  ids rather than emails: an email can change, `usr_…` cannot. */
const PILOT_SUBJECTS = [
  'usr_01KPHFKMCERET4RYTBPHKVK4ET', // adhya@forjio.com
  'usr_01KQXET0CV2A0ND610289DYEHA', // gojo@forjio.com
];

export const CATENTIO_PILOT_FLAG = 'catentio.pilot_integration';

/**
 * Declare every flag this product owns. Idempotent; safe to call on every
 * boot.
 */
export async function registerFeatureFlags(): Promise<void> {
  await ensureFeatureFlag({
    key: CATENTIO_PILOT_FLAG,
    label: 'Catentio pilot integration',
    description:
      "Embeds catentio's agentic sheet and chat/search bubbles in this product. OFF for everyone; the allowlisted accounts get it anyway, which is how the pilot runs without shipping it to customers.",
    defaultEnabled: false,
    defaultAllowlist: PILOT_SUBJECTS,
  });
}

/**
 * Is the catentio pilot on for this user?
 *
 * The gate on the embedded catentio layer, read at
 * `routes/catentio.ts:63` (`flagEnabled`). The comment here used to say
 * this was NOT YET CALLED ANYWHERE and that the layer was not built —
 * true when the flag was staged ahead of the work, and wrong since the
 * integration landed. It is load-bearing now: the flag is OFF in prod
 * with the two pilot accounts allowlisted, so this is what decides
 * whether a given user sees the assistant at all.
 *
 * Delete this helper if the pilot is abandoned; do not leave it here
 * reading a flag nobody flips.
 */
export async function catentioPilotEnabled(
  huudisUserId: string | null | undefined,
  email?: string | null,
): Promise<boolean> {
  if (await isEnabled(CATENTIO_PILOT_FLAG, huudisUserId ?? null)) return true;
  // The email is tried as a second allowlist subject (linksnap lesson,
  // 2026-08-05): `usr_…` ids are per-Huudis-instance — staging mints
  // different ids for the same person, so an id-only check quietly
  // excludes the pilot accounts everywhere but prod.
  return !!email && isEnabled(CATENTIO_PILOT_FLAG, email);
}
