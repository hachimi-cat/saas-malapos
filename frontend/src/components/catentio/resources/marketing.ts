import type { CrudSchemaField } from '@forjio/agent-ui';
import {
  abandonedCartApi,
  blogApi,
  discountCodesApi,
  feedsApi,
  marketingFetch,
  pixelsApi,
  type AbandonedCartConfig,
  type BlogPostInput,
  type MerchantFeedConfig,
  type MerchantPixelsInput,
} from '@/lib/marketing-api';
import {
  bool,
  buildAgentPrompt,
  defined,
  deleteDescriptor,
  num,
  numOrNull,
  str,
  strOrNull,
  verbDescriptor,
  verbTargetId,
  withDelete,
  type Fields,
  type ResourceBuilder,
} from '../resource-helpers';
import { providerGuide } from '@/lib/channel-providers';

/**
 * Marketing-module (Ripllo proxy) descriptors — the FRONTEND mirror of
 * the marketing block of backend/src/lib/catentio-profile.ts, shaped
 * after each hand-built form under
 * src/app/(dashboard)/dashboard/marketing/.
 *
 * Every one of these rows lives in Ripllo; malapos only forwards. The
 * applies call the SAME clients the pages call — the typed slices from
 * lib/marketing-api (blogApi, feedsApi, pixelsApi, abandonedCartApi)
 * where a page uses them, and raw `marketingFetch` against
 * /api/v1/account/marketing/* where the page does that too (campaigns,
 * funnels) — so a record written through the sheet is indistinguishable
 * from one typed by hand, under the USER's own session.
 *
 * Module-off is NOT gated here: the dashboard route guard
 * (use-modules MARKETING_GATED_PREFIXES) already redirects merchants
 * away from /dashboard/marketing/* while the Ripllo module is off, so
 * the mount decides — a descriptor built with the module off would just
 * see its writes 409, same as the pages would.
 *
 * feeds / pixels / abandoned-cart are EDIT-ONLY singleton configs
 * (PATCH, no create) — their builders return null for mode 'create'.
 */

// ── local coercions (sparse-PATCH semantics) ────────────────────────

/** Nullable text, sparse: absent stays absent; '' and null clear —
 *  mirroring the pages' `value.trim() || null`. */
function textOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  return str(v) ?? null;
}

/** A `blob:` URL is the LOCAL preview of an in-flight upload; if the
 *  upload failed it is still sitting in the draft, and persisting it
 *  stores a URL that dies with the tab. Absent stays absent; '' or a
 *  blob: leftover clears. */
function durableUrl(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  const s = str(v);
  return s && !s.startsWith('blob:') ? s : null;
}

/** Tag lists arrive as a real array (from a plan) or the comma-separated
 *  text the Metadata panel uses. Blank stays absent — "leave it alone". */
function strArr(v: unknown): string[] | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) {
    const arr = v.map((x) => String(x).trim()).filter(Boolean);
    return arr.length ? arr : undefined;
  }
  const s = String(v).trim();
  if (!s) return undefined;
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/** The record id for an edit — the sheet passes the row the USER picked
 *  in `initial`; the apply PATCHes that record, never one named inside
 *  `fields`. */
function requireId(initial: Partial<Fields> | undefined, what: string): string {
  const id = str(initial?.id);
  if (!id) throw new Error(`Missing ${what} id`);
  return id;
}

// ── Ripllo proxy transport (campaigns + funnels) ────────────────────

/** Raw writes through the marketing passthrough, exactly as
 *  campaigns/page.tsx and funnels/page.tsx do them — same wrapper
 *  (`marketingFetch`), same paths, same error shape. */
async function ripllo(method: 'POST' | 'PATCH', path: string, body: unknown): Promise<void> {
  const r = await marketingFetch(`/api/v1/account/marketing/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const b = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!r.ok) throw new Error(b?.error?.message ?? `Could not save — ${path}`);
}

/** An object from a JSON textarea, or from an object the plan already
 *  sent. Returns undefined for anything unparseable, so the caller's own
 *  "this is required" message is what the merchant sees rather than a
 *  raw SyntaxError. */
function objFrom(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Connected, ACTIVE channels — the only ones a broadcast can send
 *  through. Same endpoint the compose page reads. */
async function loadChannelOptions(): Promise<{ value: string; label: string }[]> {
  try {
    const r = await marketingFetch('/api/v1/account/marketing/channels', { credentials: 'include' });
    const b = (await r.json()) as { data?: Array<{ id: string; displayName: string; provider: string; status: string }> };
    return (b?.data ?? [])
      .filter((c) => c.status === 'active')
      .map((c) => ({ value: c.provider, label: `${c.displayName} (${c.provider})` }));
  } catch {
    return [];
  }
}

/** DELETE through the marketing passthrough — `ripllo` above is
 *  POST|PATCH only, and a delete descriptor needs the verb. */
async function ripploDelete(path: string): Promise<void> {
  const r = await marketingFetch(`/api/v1/account/marketing/${path}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!r.ok) {
    const b = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(b?.error?.message ?? `Could not delete — ${path}`);
  }
}

// ── option loaders (scoped to the merchant's own workspace; a fetch
//    failure leaves an empty list rather than blocking the sheet) ─────

/** Same selector endpoint CampaignSelect uses — already filtered to
 *  draft/live/paused, so archived campaigns don't clutter new forms. */
async function loadCampaignOptions(): Promise<{ value: string; label: string }[]> {
  try {
    const r = await marketingFetch('/api/v1/account/marketing/marketing-campaigns/_/selector', {
      credentials: 'include',
    });
    const b = (await r.json().catch(() => null)) as {
      data?: { campaigns?: { id: string; name: string }[] };
    } | null;
    if (!r.ok) return [];
    return (b?.data?.campaigns ?? []).map((c) => ({ value: c.id, label: c.name }));
  } catch {
    return [];
  }
}

/** Active codes only, like the abandoned-cart page's picker. */
async function loadDiscountCodeOptions(): Promise<{ value: string; label: string }[]> {
  try {
    const res = await discountCodesApi.list({ active: true, limit: 100 });
    const rows = Array.isArray(res.data) ? res.data : [];
    return rows.map((c) => ({
      value: c.id,
      label: `${c.code} — ${c.description ?? `${c.type} ${c.value}`}`,
    }));
  } catch {
    return [];
  }
}

// ── shared field builders ───────────────────────────────────────────

/** The "Campaign (optional)" select every child-entity form carries
 *  (components/marketing/campaign-select.tsx). */
function campaignField(): CrudSchemaField {
  return {
    name: 'marketingCampaignId',
    label: 'Campaign (optional)',
    kind: 'select',
    loadOptions: loadCampaignOptions,
    placeholder: '— none —',
    description: 'Roll this up under a campaign, or leave it standalone.',
  };
}

/** Prefix for every marketing descriptor's help text — the merchant is
 *  editing a Ripllo record, not a Malapos row. */
const RIPLLO_NOTE = 'This lives in your Ripllo marketing workspace, not in Malapos.';

// The campaign hub's goal + status vocabularies (campaigns/page.tsx
// GOAL_LABELS / STATUS_LABELS) — the profile tells the agent to reuse
// existing values; the manual form offers the same fixed set the page's
// selects do.
const CAMPAIGN_GOALS = [
  { value: 'awareness', label: 'Awareness' },
  { value: 'conversion', label: 'Conversion' },
  { value: 'retention', label: 'Retention' },
  { value: 'launch', label: 'Launch' },
  { value: 'other', label: 'Other' },
];
const CAMPAIGN_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'live', label: 'Live' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

// The funnel triggers the NewFunnelModal offers (funnels/page.tsx
// TRIGGER_LABELS).
const FUNNEL_TRIGGERS = [
  { value: 'list_added', label: 'Contact added to a list' },
  { value: 'tag_added', label: 'Contact tagged' },
  { value: 'signup_form', label: 'Form signup' },
  { value: 'abandoned_cart', label: 'Abandoned cart' },
  { value: 'manual_add', label: 'Manual enrollment' },
  { value: 'webhook_event', label: 'Inbound webhook' },
];

// ── blog posts (blog/_components/post-editor.tsx) ───────────────────

const blogPostsResource: ResourceBuilder = (mode) => {
  // Lifecycle verbs — the same blogApi calls the list page's row
  // buttons make; the id is the row the user opened (or the id the
  // agent looked up and the BFF validated), never one a plan names.
  if (mode === 'publish') {
    return verbDescriptor({
      slug: 'blog-posts',
      label: 'blog post',
      title: 'Publish blog post',
      confirmLabel: 'Publish',
      examplePrompts: ['Publish this post'],
      apply: ({ initial }) => blogApi.publish(verbTargetId(initial, 'post')),
    });
  }
  if (mode === 'unpublish') {
    return verbDescriptor({
      slug: 'blog-posts',
      label: 'blog post',
      title: 'Unpublish blog post',
      confirmLabel: 'Unpublish',
      examplePrompts: ['Unpublish this post — back to draft'],
      apply: ({ initial }) => blogApi.unpublish(verbTargetId(initial, 'post')),
    });
  }
  if (mode === 'delete') {
    return deleteDescriptor({
      slug: 'blog-posts',
      label: 'blog post',
      del: (id) => blogApi.delete(id),
    });
  }
  return {
  slug: 'blog-posts',
  label: 'blog post',
  fields: [
    {
      name: 'title',
      label: 'Title',
      required: mode === 'create',
      placeholder: 'How we doubled conversions with a simple refund policy change',
      description: `${RIPLLO_NOTE} Max 200 characters.`,
    },
    {
      name: 'slug',
      label: 'Slug',
      placeholder: 'how-we-doubled-conversions',
      description: 'The post URL. Leave empty on a new post to derive it from the title.',
    },
    {
      name: 'excerpt',
      label: 'Excerpt',
      kind: 'textarea',
      description: 'One-line hook shown in the blog list + OG preview card (max 500 characters).',
    },
    {
      name: 'body',
      label: 'Body (Markdown)',
      kind: 'textarea',
      required: mode === 'create',
      description: 'Supports headings, bold/italic, links, lists, code blocks, blockquotes, images.',
    },
    {
      name: 'status',
      label: 'Status',
      kind: 'select',
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'published', label: 'Published' },
      ],
      description: 'Draft until you have read it through.',
    },
    { name: 'coverImage', label: 'Cover image', kind: 'image', imageVariant: 'wide', group: 'cover' },
    { name: 'authorName', label: 'Author name', group: 'meta', placeholder: 'Your name' },
    {
      name: 'tags',
      label: 'Tags (comma-separated)',
      group: 'meta',
      placeholder: 'launch, update, tutorial',
      description: 'Up to 20 tags.',
    },
    { ...campaignField(), group: 'meta', colSpan: 2 },
    {
      name: 'metaTitle',
      label: 'Meta title',
      group: 'seo',
      placeholder: 'Falls back to post title',
      description: 'Max 200 characters.',
    },
    {
      name: 'metaDescription',
      label: 'Meta description',
      kind: 'textarea',
      group: 'seo',
      placeholder: 'Falls back to excerpt. 150-160 chars ideal.',
    },
  ],
  groups: [
    { id: 'cover', label: 'Cover image' },
    { id: 'meta', label: 'Metadata', columns: 2 },
    { id: 'seo', label: 'SEO (optional)' },
  ],
  examplePrompts:
    mode === 'create'
      ? [
          'Draft a post announcing our new outlet opening',
          "Write a short post about this week's promo bundle",
          'A tutorial on preordering through our storefront',
        ]
      : ['Publish this post', 'Tighten the excerpt', 'Add an SEO description'],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields, initial }) => {
    const body = defined({
      title: str(fields.title),
      slug: str(fields.slug),
      excerpt: textOrNull(fields.excerpt),
      body: str(fields.body),
      status: str(fields.status),
      coverImage: durableUrl(fields.coverImage),
      authorName: textOrNull(fields.authorName),
      tags: strArr(fields.tags)?.slice(0, 20),
      metaTitle: textOrNull(fields.metaTitle),
      metaDescription: textOrNull(fields.metaDescription),
      marketingCampaignId: textOrNull(fields.marketingCampaignId),
    }) as BlogPostInput;
    if (applyMode === 'edit') {
      await blogApi.update(requireId(initial, 'post'), body);
      return;
    }
    if (!body.title) throw new Error('Title is required');
    if (!body.body) throw new Error('Body is required');
    await blogApi.create(body);
  },
  };
};

// ── product feeds (feeds/page.tsx — EDIT-ONLY singleton) ────────────

const feedsResource: ResourceBuilder = (mode) => {
  if (mode === 'create') return null;
  return {
    slug: 'feeds',
    label: 'product feed config',
    fields: [
      {
        name: 'enabled',
        label: 'Feeds enabled',
        kind: 'checkbox',
        description: `${RIPLLO_NOTE} When off, the public feed URLs return 404 — ad networks stop pulling.`,
      },
      {
        name: 'defaultGoogleProductCategory',
        label: 'Default Google product category',
        placeholder: 'Apparel & Accessories > Clothing > Shirts & Tops',
        description: "Path or numeric taxonomy ID. Applied to products that don't set their own category.",
      },
      {
        name: 'includeUnpublished',
        label: 'Include draft (unpublished) products',
        kind: 'checkbox',
        description: 'When on, products with published=false appear in ad-network catalogs. Off by default.',
      },
      campaignField(),
    ],
    examplePrompts: [
      'Turn the product feed on',
      'Set the default category to Food, Beverages & Tobacco',
      'Stop including unpublished products',
    ],
    buildAgentPrompt,
    apply: async ({ fields }) => {
      const body = defined({
        enabled: bool(fields.enabled),
        defaultGoogleProductCategory: textOrNull(fields.defaultGoogleProductCategory),
        includeUnpublished: bool(fields.includeUnpublished),
        marketingCampaignId: textOrNull(fields.marketingCampaignId),
      }) as Partial<Omit<MerchantFeedConfig, 'urls'>>;
      if (!Object.keys(body).length) throw new Error('Nothing to change');
      await feedsApi.update(body);
    },
  };
};

// ── pixels (pixels/page.tsx — EDIT-ONLY singleton) ──────────────────

const pixelsResource: ResourceBuilder = (mode) => {
  if (mode === 'create') return null;
  return {
    slug: 'pixels',
    label: 'ad pixel config',
    fields: [
      {
        name: 'enabled',
        label: 'Enable pixel tracking',
        kind: 'checkbox',
        description: `${RIPLLO_NOTE} Turns the whole system on/off without clearing IDs.`,
      },
      {
        name: 'metaPixelId',
        label: 'Pixel ID',
        group: 'meta',
        placeholder: '1234567890123456',
        description: 'Meta Events Manager → Data Sources → your Pixel → top-right ID.',
      },
      {
        name: 'metaCapiAccessToken',
        label: 'Conversions API access token',
        group: 'meta',
        placeholder: 'EAAB...',
        description: 'A secret from your own Meta Business settings — paste your own, the assistant will not propose one.',
      },
      {
        name: 'metaTestEventCode',
        label: 'Test event code (optional)',
        group: 'meta',
        placeholder: 'TEST12345',
        description: 'When set, CAPI events appear in the Test Events tab instead of live.',
      },
      {
        name: 'googleAnalyticsId',
        label: 'Google Analytics 4 measurement ID',
        group: 'google',
        placeholder: 'G-XXXXXXXXXX',
      },
      {
        name: 'googleAdsConversionId',
        label: 'Google Ads conversion ID (optional)',
        group: 'google',
        placeholder: 'AW-XXXXXXXXX',
      },
      {
        name: 'googleAdsPurchaseLabel',
        label: 'Google Ads purchase conversion label (optional)',
        group: 'google',
        placeholder: 'abcDEFghijKLmnop',
        description: 'The Label under a specific Conversion Action — attributes only the Purchase event.',
      },
      {
        name: 'tiktokPixelId',
        label: 'Pixel ID',
        group: 'tiktok',
        placeholder: 'C123ABC...',
      },
    ],
    groups: [
      { id: 'meta', label: 'Meta Pixel & Conversions API' },
      { id: 'google', label: 'Google Analytics & Google Ads' },
      { id: 'tiktok', label: 'TikTok Pixel' },
    ],
    examplePrompts: [
      'Turn tracking on and set my GA4 id to G-ABC123',
      'Add my Meta pixel 1234567890',
      'Remove the TikTok pixel',
    ],
    buildAgentPrompt,
    apply: async ({ fields }) => {
      const body = defined({
        enabled: bool(fields.enabled),
        metaPixelId: textOrNull(fields.metaPixelId),
        metaCapiAccessToken: textOrNull(fields.metaCapiAccessToken),
        metaTestEventCode: textOrNull(fields.metaTestEventCode),
        googleAnalyticsId: textOrNull(fields.googleAnalyticsId),
        googleAdsConversionId: textOrNull(fields.googleAdsConversionId),
        googleAdsPurchaseLabel: textOrNull(fields.googleAdsPurchaseLabel),
        tiktokPixelId: textOrNull(fields.tiktokPixelId),
      }) as MerchantPixelsInput;
      if (!Object.keys(body).length) throw new Error('Nothing to change');
      await pixelsApi.update(body);
    },
  };
};

// ── abandoned cart (abandoned-cart/page.tsx — EDIT-ONLY singleton) ──

const abandonedCartResource: ResourceBuilder = (mode) => {
  if (mode === 'create') return null;
  return {
    slug: 'abandoned-cart',
    label: 'abandoned-cart recovery config',
    fields: [
      {
        name: 'enabled',
        label: 'Enable abandoned-cart reminders',
        kind: 'checkbox',
        description: `${RIPLLO_NOTE} When off, no reminders are sent regardless of other fields.`,
      },
      {
        name: 'delayHours',
        label: 'Delay after last cart activity (hours)',
        kind: 'number',
        placeholder: '4',
        description:
          '1–168. The dashboard offers 1, 2, 4, 8, 12, 24, 48 or 72; the industry default is 4.',
      },
      {
        name: 'emailSubject',
        label: 'Email subject',
        placeholder: 'You left something in your cart',
        description: 'Max 200 characters.',
      },
      {
        name: 'emailPreview',
        label: 'Preview text',
        placeholder: 'Come back to finish your order',
        description: 'Shown in the inbox list after the subject (max 200 characters).',
      },
      {
        name: 'discountCodeId',
        label: 'Attach discount code (optional)',
        kind: 'select',
        loadOptions: loadDiscountCodeOptions,
        placeholder: '— none —',
        description: 'Include a promo code in the reminder email to sweeten the recovery.',
      },
      campaignField(),
    ],
    examplePrompts: [
      'Send a recovery email 4 hours after abandonment',
      'Write a warmer subject line',
      'Attach a discount code as an incentive',
    ],
    buildAgentPrompt,
    apply: async ({ fields }) => {
      const body = defined({
        enabled: bool(fields.enabled),
        delayHours: num(fields.delayHours),
        emailSubject: str(fields.emailSubject),
        emailPreview: str(fields.emailPreview),
        discountCodeId: textOrNull(fields.discountCodeId),
        marketingCampaignId: textOrNull(fields.marketingCampaignId),
      }) as Partial<AbandonedCartConfig>;
      if (!Object.keys(body).length) throw new Error('Nothing to change');
      await abandonedCartApi.config.update(body);
    },
  };
};

// ── marketing campaigns (campaigns/page.tsx + campaigns/[id]) ───────

const marketingCampaignsResource: ResourceBuilder = (mode) => ({
  slug: 'marketing-campaigns',
  label: 'marketing campaign',
  fields: [
    {
      name: 'name',
      label: 'Name',
      required: mode === 'create',
      placeholder: 'e.g. Q4 holiday launch',
      description: RIPLLO_NOTE,
    },
    { name: 'description', label: 'Description', kind: 'textarea' },
    {
      name: 'goal',
      label: 'Goal',
      group: 'aim',
      kind: 'select',
      required: mode === 'create',
      options: CAMPAIGN_GOALS,
    },
    {
      name: 'status',
      label: 'Status',
      group: 'aim',
      kind: 'select',
      options: CAMPAIGN_STATUSES,
    },
    {
      name: 'budgetIdr',
      label: 'Budget (IDR, optional)',
      kind: 'number',
      description: 'Whole rupiah (5000000 = Rp 5.000.000). On edit, blank clears it.',
    },
  ],
  groups: [{ id: 'aim', tone: 'plain', columns: 2 }],
  examplePrompts:
    mode === 'create'
      ? [
          'A Ramadan 2026 campaign with a Rp 5.000.000 budget',
          'Launch campaign for our new outlet',
          'A retention campaign for our regulars',
        ]
      : ['Raise the budget to Rp 8.000.000', 'Mark this campaign live', 'Pause this campaign'],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields, initial }) => {
    const body = defined({
      name: str(fields.name),
      description: textOrNull(fields.description),
      goal: str(fields.goal),
      status: str(fields.status),
      budgetIdr: numOrNull(fields.budgetIdr),
    });
    if (applyMode === 'edit') {
      await ripllo('PATCH', `marketing-campaigns/${requireId(initial, 'campaign')}`, body);
      return;
    }
    if (!body.name) throw new Error('Name is required');
    if (!body.goal) throw new Error('Goal is required');
    await ripllo('POST', 'marketing-campaigns', body);
  },
});

// ── funnels (funnels/page.tsx NewFunnelModal) ───────────────────────

const funnelsResource: ResourceBuilder = (mode) => ({
  slug: 'funnels',
  label: 'marketing funnel',
  fields: [
    {
      name: 'name',
      label: 'Name',
      required: mode === 'create',
      placeholder: 'e.g. New subscriber welcome series',
      description: RIPLLO_NOTE,
    },
    ...(mode === 'create'
      ? [
          {
            name: 'triggerKind',
            label: 'Trigger',
            kind: 'select',
            required: true,
            options: FUNNEL_TRIGGERS,
            description:
              'What starts it for a contact. Its config starts empty — fill it in on the funnel page.',
          } satisfies CrudSchemaField,
        ]
      : []),
    {
      name: 'status',
      label: 'Status',
      kind: 'select',
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'active', label: 'Active' },
        { value: 'paused', label: 'Paused' },
      ],
      description: 'Activating starts sending to real contacts.',
    },
  ],
  examplePrompts:
    mode === 'create'
      ? [
          'A welcome series for new subscribers',
          'Post-purchase follow-up funnel',
          'Win-back funnel for lapsed customers',
        ]
      : ['Pause this funnel', 'Rename it to Welcome series v2', 'Activate it'],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields, initial }) => {
    const body = defined({
      name: str(fields.name),
      status: str(fields.status),
    });
    if (applyMode === 'edit') {
      await ripllo('PATCH', `funnels/${requireId(initial, 'funnel')}`, body);
      return;
    }
    const triggerKind = str(fields.triggerKind);
    if (!body.name) throw new Error('Name is required');
    if (!triggerKind) throw new Error('Pick what starts this funnel');
    // Mirrors the hand-built modal: new funnels start as drafts with an
    // empty trigger config the merchant fills in on the detail page.
    await ripllo('POST', 'funnels', {
      ...body,
      triggerKind,
      triggerConfig: {},
      status: body.status ?? 'draft',
    });
  },
});

// ── affiliate approval queue (verb-only) ────────────────────────────

/**
 * The affiliate queue's two resources have NO form: an affiliator
 * enrolls themselves and a commission is earned by a sale, so the whole
 * vocabulary is the review verb the approvals page offers. The registry
 * gate (`resourceSupports` — they are VERB_ONLY_RESOURCES) refuses
 * create/edit before these builders are reached.
 *
 * Every apply is the SAME per-record proxy POST the approvals page's
 * row buttons make. There is no ids[] route in Ripllo for either, so a
 * batch is a fan-out over these (the batch verb sheet's default path).
 *
 * The proxy path needs the PROGRAM as well as the record. The sheet
 * gets it off the row (`initial`); a chat card carries only the record
 * id, so `programId` is a declared field the agent fills from the queue
 * it read — hence the initial-then-fields lookup order.
 */
const AFFILIATE_PROGRAM_FIELD: CrudSchemaField = {
  name: 'programId',
  label: 'Program',
  required: true,
  placeholder: 'prog_…',
  description:
    'The affiliate program this belongs to, taken from the row. Rows in the approvals queue carry it — never type one in by hand.',
};

function requireProgramId(fields: Fields, initial: Partial<Fields> | undefined): string {
  const id = str(initial?.programId) ?? str(fields.programId);
  if (!id) throw new Error('Missing affiliate program id');
  return id;
}

/** POST through the marketing passthrough, exactly as the approvals
 *  page does it (same wrapper, same paths, same error shape). */
async function affiliatePost(path: string): Promise<void> {
  const r = await marketingFetch(`/api/v1/account/marketing/programs/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: '{}',
  });
  const b = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!r.ok) throw new Error(b?.error?.message ?? 'action failed');
}

const affiliateEnrollmentsResource: ResourceBuilder = (mode) => {
  if (mode !== 'approve') return null;
  return verbDescriptor({
    slug: 'affiliate-enrollments',
    label: 'affiliate enrollment',
    title: 'Approve enrollment',
    confirmLabel: 'Approve',
    fields: [AFFILIATE_PROGRAM_FIELD],
    examplePrompts: [
      'Approve this affiliator',
      'Approve the ones with an audience over 10.000',
    ],
    apply: ({ fields, initial }) =>
      affiliatePost(
        `${encodeURIComponent(requireProgramId(fields, initial))}/enrollments/${encodeURIComponent(
          verbTargetId(initial, 'enrollment'),
        )}/approve`,
      ),
  });
};

const affiliateCommissionsResource: ResourceBuilder = (mode) => {
  if (mode !== 'approve' && mode !== 'void') return null;
  const voiding = mode === 'void';
  return verbDescriptor({
    slug: 'affiliate-commissions',
    label: 'affiliate commission',
    title: voiding ? 'Void commission' : 'Approve commission',
    confirmLabel: voiding ? 'Void' : 'Approve',
    // Voided money is never paid and the void cannot be undone.
    destructive: voiding,
    fields: [AFFILIATE_PROGRAM_FIELD],
    examplePrompts: voiding
      ? ['Void this commission', 'Void the ones from the refunded order']
      : ['Approve this commission', 'Approve everything still pending'],
    apply: ({ fields, initial }) =>
      affiliatePost(
        `${encodeURIComponent(requireProgramId(fields, initial))}/commissions/${encodeURIComponent(
          verbTargetId(initial, 'commission'),
        )}/${voiding ? 'void' : 'approve'}`,
      ),
  });
};

// ── the group's registry slice ──────────────────────────────────────

// ── channels (marketing/channels/page.tsx provider cards) ───────────

/**
 * Setting a channel up is the job, and the credential hunt is the hard
 * part of it. bang, 2026-08-14: *"tell them how to get key/token etc and
 * help them to setup the channel in channels page"* — so the provider
 * guidance is BUILT from the same catalog the page's cards render from
 * (`@/lib/channel-providers`), never hand-listed here.
 */
const channelsResource: ResourceBuilder = () => ({
  slug: 'channels',
  label: 'messaging channel',
  fields: [
    {
      name: 'provider',
      label: 'Provider',
      required: true,
      description:
        `${RIPLLO_NOTE} Which service to connect. One of these exact keys, ` +
        `and each one's credential keys:\n${providerGuide()}`,
    },
    { name: 'displayName', label: 'Display name', required: true, placeholder: 'Warung Mekar mail', description: 'What you will recognise it by.' },
    {
      name: 'credentials',
      label: 'Credentials',
      kind: 'textarea',
      description:
        'JSON, keyed exactly as the provider line above lists. Only the ' +
        'merchant can supply the values — never invent, guess or fill in a ' +
        'key, token, SID or webhook URL. Explaining where in the provider ' +
        'dashboard to find each one is the useful thing to do, and it is ' +
        'what people usually need help with.',
    },
  ],
  examplePrompts: [
    'How do I connect Telegram, and where do I get the bot token?',
    'Which provider should I use for order updates on WhatsApp?',
    'Walk me through connecting SendGrid — what do I need before I start?',
  ],
  buildAgentPrompt,
  apply: async ({ fields }) => {
    const provider = str(fields.provider);
    const displayName = str(fields.displayName);
    const credentials = objFrom(fields.credentials);
    if (!provider) throw new Error('Pick a provider');
    if (!displayName) throw new Error('Display name is required');
    if (!credentials) throw new Error('Paste the connection credentials from your provider');
    await ripllo('POST', 'channels', { provider, displayName, credentials });
  },
});

// ── broadcasts (marketing/compose/page.tsx) ─────────────────────────

const broadcastsResource: ResourceBuilder = () => ({
  slug: 'broadcasts',
  label: 'broadcast',
  fields: [
    { name: 'name', label: 'Name', required: true, placeholder: 'Ramadan sale announcement', description: `${RIPLLO_NOTE} Internal only.` },
    {
      name: 'providers',
      label: 'Send through',
      kind: 'combobox',
      multi: true,
      required: true,
      loadOptions: loadChannelOptions,
      description: 'Only connected, active channels.',
    },
    {
      name: 'content',
      label: 'Message',
      kind: 'textarea',
      required: true,
      description: 'JSON, keyed per channel kind — email subject and html, text for SMS and chat.',
    },
    {
      name: 'audience',
      label: 'Audience',
      kind: 'textarea',
      description: '{"listIds": ["…"]} — which contact lists receive it.',
    },
  ],
  examplePrompts: [
    'Draft a Ramadan sale announcement for my newsletter list',
    'A restock message for the VIP list',
    'Announce the new cold brew to everyone',
  ],
  buildAgentPrompt,
  apply: async ({ fields }) => {
    const name = str(fields.name);
    const providers = strArr(fields.providers);
    const content = objFrom(fields.content);
    const audience = objFrom(fields.audience);
    if (!name) throw new Error('Name is required');
    if (!providers?.length) throw new Error('Pick at least one channel');
    if (!content) throw new Error('The message is required');
    // Creating a broadcast does NOT send it — the compose page's
    // separate /send step does, and that is left to the merchant.
    await ripllo('POST', 'broadcasts', defined({ name, providers, content, audience }));
  },
});

// ── campaign-invitations (marketing/creators/page.tsx) ──────────────

const campaignInvitationsResource: ResourceBuilder = () => ({
  slug: 'campaign-invitations',
  label: 'creator invitation',
  fields: [
    { name: 'campaignId', label: 'Brief', required: true, description: `${RIPLLO_NOTE} Which creator brief to invite into.` },
    { name: 'creatorId', label: 'Creator', required: true, description: 'From the creators directory.' },
    {
      name: 'message',
      label: 'Message',
      kind: 'textarea',
      description: 'Sent to a real person outside your workspace, under your name.',
    },
  ],
  examplePrompts: [
    'Which creators here suit a cold-brew launch?',
    'Invite the top three food creators to my Ramadan brief',
    'Write a friendly invitation mentioning our coffee range',
  ],
  buildAgentPrompt,
  apply: async ({ fields }) => {
    const campaignId = str(fields.campaignId);
    const creatorId = str(fields.creatorId);
    if (!campaignId) throw new Error('Pick the brief to invite into');
    if (!creatorId) throw new Error('Pick the creator to invite');
    await ripllo('POST', `campaigns/${encodeURIComponent(campaignId)}/invitations`, defined({
      creatorId,
      message: str(fields.message),
    }));
  },
});

// ── programs (marketing/programs/page.tsx) ──────────────────────────

const programsBase: ResourceBuilder = (mode) => ({
  slug: 'programs',
  label: 'affiliate program',
  fields: [
    { name: 'name', label: 'Name', required: mode === 'create', placeholder: 'Warung Mekar affiliates', description: RIPLLO_NOTE },
    { name: 'description', label: 'Description', kind: 'textarea' },
    { name: 'targetUrl', label: 'Target URL', placeholder: 'https://warungmekar.id', description: 'Where affiliate links point. Empty means your storefront.' },
    { name: 'commissionModel', group: 'commission', label: 'Commission model', required: mode === 'create', description: 'Match what your other programs use.' },
    {
      name: 'commissionRate', group: 'commission',
      label: 'Commission rate',
      kind: 'number',
      required: mode === 'create',
      placeholder: '0.1',
      description: 'A FRACTION, not a percent — 0.1 is 10%.',
    },
    { name: 'cookieDays', group: 'terms', label: 'Attribution window (days)', kind: 'number', placeholder: '30' },
    { name: 'autoApprove', label: 'Auto-approve applicants', kind: 'checkbox' },
    { name: 'minFollowerCount', group: 'terms', label: 'Minimum followers', kind: 'number', description: 'Leave empty for no minimum.' },
    { name: 'requiresKyc', label: 'Require identity verification', kind: 'checkbox' },
    { name: 'platformFeeRate', label: 'Platform fee', kind: 'number', placeholder: '0.05', description: 'A fraction, same as the commission rate.' },
    ...(mode === 'edit'
      ? [{ name: 'status', label: 'Status', description: 'Match what your other programs use.' } as CrudSchemaField]
      : []),
  ],
  groups: [
    { id: 'commission', tone: 'plain', columns: 2 },
    { id: 'terms', tone: 'plain', columns: 2 },
  ],
  examplePrompts:
    mode === 'create'
      ? ['An affiliate program at 10% commission, 30-day window', 'Creator program, 15% commission, auto-approve, KYC required']
      : ['Raise the commission to 15%', 'Turn on auto-approve'],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields, initial }) => {
    const body = defined({
      name: str(fields.name),
      description: strOrNull(fields.description),
      targetUrl: strOrNull(fields.targetUrl),
      commissionModel: str(fields.commissionModel),
      commissionRate: num(fields.commissionRate),
      cookieDays: num(fields.cookieDays),
      autoApprove: bool(fields.autoApprove),
      minFollowerCount: numOrNull(fields.minFollowerCount),
      requiresKyc: bool(fields.requiresKyc),
      platformFeeRate: num(fields.platformFeeRate),
      status: str(fields.status),
    });
    if (applyMode === 'edit') {
      await ripllo('PATCH', `programs/${encodeURIComponent(verbTargetId(initial, 'program'))}`, body);
      return;
    }
    if (!body.name) throw new Error('Name is required');
    if (!body.commissionModel) throw new Error('Commission model is required');
    if (body.commissionRate === undefined) throw new Error('Commission rate is required');
    await ripllo('POST', 'programs', { ...body, status: body.status ?? 'open' });
  },
});

const programsResource = withDelete(programsBase, {
  slug: 'programs',
  label: 'affiliate program',
  del: (id) => ripploDelete(`programs/${encodeURIComponent(id)}`),
});

// ── creator briefs — ripllo `campaigns` (model: CreatorBrief) ───────

const BRIEF_PRICING_MODELS = [
  { value: 'flat', label: 'Flat fee' },
  { value: 'cpm', label: 'CPM (per 1.000 views)' },
  { value: 'hybrid', label: 'Hybrid — flat + CPM' },
];

const BRIEF_DISCOVERY_MODES = [
  { value: 'public', label: 'Public — any verified creator may apply' },
  { value: 'invite_only', label: 'Invite only' },
];

const BRIEF_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'open', label: 'Open — accepting applications' },
  { value: 'closed', label: 'Closed' },
  { value: 'archived', label: 'Archived' },
];

/** No delete arm: ripllo serves POST /campaigns and PATCH
 *  /campaigns/{id} and nothing else. Ending a brief is closing it. */
const creatorBriefsResource: ResourceBuilder = (mode) => ({
  slug: 'creator-briefs',
  label: 'creator brief',
  fields: [
    { name: 'name', label: 'Name', required: mode === 'create', placeholder: 'Ramadan unboxing', description: RIPLLO_NOTE },
    {
      name: 'brief',
      label: 'The brief',
      kind: 'textarea',
      required: mode === 'create',
      description: 'What you are asking the creator to make, and who it is for. Up to 10000 characters.',
    },
    { name: 'budgetIdr', group: 'terms', label: 'Budget (Rp)', kind: 'number', placeholder: '5000000', description: 'Whole rupiah.' },
    { name: 'pricingModel', group: 'terms', label: 'Pricing model', kind: 'select', options: BRIEF_PRICING_MODELS },
    { name: 'discoveryMode', group: 'terms', label: 'Who can apply', kind: 'select', options: BRIEF_DISCOVERY_MODES },
    {
      name: 'platformFeeRate', group: 'terms',
      label: 'Platform fee',
      kind: 'number',
      placeholder: '0.15',
      description: 'A FRACTION, not a percent — 0.15 is 15%.',
    },
    { name: 'status', label: 'Status', kind: 'select', options: BRIEF_STATUSES, description: 'A brief only takes applications while it is open.' },
  ],
  groups: [{ id: 'terms', tone: 'plain', columns: 2 }],
  examplePrompts:
    mode === 'create'
      ? ['A brief for Ramadan unboxing videos, Rp 5.000.000, open to anyone', 'Invite-only brief for our cold brew launch at a flat Rp 2.500.000']
      : ['Close this brief', 'Raise the budget to Rp 8.000.000'],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields, initial }) => {
    const body = defined({
      name: str(fields.name),
      brief: str(fields.brief),
      budgetIdr: num(fields.budgetIdr),
      pricingModel: str(fields.pricingModel),
      discoveryMode: str(fields.discoveryMode),
      platformFeeRate: num(fields.platformFeeRate),
      status: str(fields.status),
    });
    if (applyMode === 'edit') {
      await ripllo('PATCH', `campaigns/${encodeURIComponent(verbTargetId(initial, 'creator brief'))}`, body);
      return;
    }
    if (!body.name) throw new Error('Name is required');
    if (!body.brief) throw new Error('The brief itself is required');
    await ripllo('POST', 'campaigns', { ...body, status: body.status ?? 'open', deliverables: [] });
  },
});

// ── contacts + contact lists (marketing/audience/page.tsx) ──────────

const contactsBase: ResourceBuilder = () => ({
  slug: 'contacts',
  label: 'contact',
  fields: [
    { name: 'email', label: 'Email', placeholder: 'dewi@example.com', description: `${RIPLLO_NOTE} Email or phone — at least one.` },
    { name: 'phone', label: 'Phone', placeholder: '+62 812 3456 7890' },
    { name: 'firstName', label: 'First name', placeholder: 'Dewi' },
    { name: 'lastName', label: 'Last name', placeholder: 'Rahmawati' },
  ],
  examplePrompts: [
    'Add Dewi Rahmawati, dewi@example.com',
    'New contact on +62 812 3456 7890',
    'Fix the spelling of this name',
  ],
  buildAgentPrompt,
  apply: async ({ mode: applyMode, fields, initial }) => {
    if (applyMode === 'edit') {
      const body = defined({
        email: strOrNull(fields.email),
        phone: strOrNull(fields.phone),
        firstName: strOrNull(fields.firstName),
        lastName: strOrNull(fields.lastName),
      });
      // Ripllo keeps email-or-phone at CREATE only and its PATCH is
      // partial, so an edit could blank the last one and leave a
      // contact nothing can reach. Guard only when the plan TOUCHES
      // one: `initial` is whatever the page handed over, so checking
      // the merged record unconditionally would block an unrelated
      // name edit on a row that carries neither.
      if ('email' in body || 'phone' in body) {
        const mergedEmail = 'email' in body ? body.email : initial?.email;
        const mergedPhone = 'phone' in body ? body.phone : initial?.phone;
        if (!mergedEmail && !mergedPhone) {
          throw new Error('A contact needs an email or a phone — this would leave neither');
        }
      }
      await ripllo('PATCH', `contacts/${encodeURIComponent(verbTargetId(initial, 'contact'))}`, body);
      return;
    }
    const email = strOrNull(fields.email);
    const phone = strOrNull(fields.phone);
    if (!email && !phone) throw new Error('Email or phone is required');
    await ripllo('POST', 'contacts', defined({
      email,
      phone,
      firstName: strOrNull(fields.firstName),
      lastName: strOrNull(fields.lastName),
      source: 'manual',
    }));
  },
});

const contactsResource = withDelete(contactsBase, {
  slug: 'contacts',
  label: 'contact',
  del: (id) => ripploDelete(`contacts/${encodeURIComponent(id)}`),
});

/** Create and delete only — ripllo has NO update endpoint for a list
 *  (POST / GET / DELETE plus member add/remove). A declared edit would
 *  render a form with nothing to call. */
const contactListsBase: ResourceBuilder = () => ({
  slug: 'contact-lists',
  label: 'contact list',
  fields: [
    { name: 'name', label: 'Name', required: true, placeholder: 'Newsletter subscribers', description: RIPLLO_NOTE },
    { name: 'description', label: 'Description', kind: 'textarea' },
  ],
  examplePrompts: ['A list called Newsletter subscribers', 'Create a VIP customers list'],
  buildAgentPrompt,
  apply: async ({ fields }) => {
    const name = str(fields.name);
    if (!name) throw new Error('Name is required');
    await ripllo('POST', 'contact-lists', defined({
      name,
      description: strOrNull(fields.description),
    }));
  },
});

const contactListsResource = withDelete(contactListsBase, {
  slug: 'contact-lists',
  label: 'contact list',
  del: (id) => ripploDelete(`contact-lists/${encodeURIComponent(id)}`),
});

// ── creator contracts — ripllo `collaborations` (verb-only) ─────────

/**
 * A contract is born from accepting a creator's application and ripllo
 * serves no PATCH, so there is no create and no edit — approve, cancel
 * and dispute ARE the vocabulary (bang, 2026-08-15).
 *
 * All three end the contract, so all three are proposals the merchant
 * applies themselves. Nothing had to be carved out of the delegation
 * list here: malapos grants the marketing proxy per collection and none
 * of them is /collaborations.
 */
const collaborationsResource: ResourceBuilder = (mode) => {
  if (mode === 'cancel') {
    return verbDescriptor({
      slug: 'collaborations',
      label: 'creator contract',
      title: 'Cancel creator contract',
      confirmLabel: 'Cancel contract',
      destructive: true,
      fields: [
        {
          name: 'reason',
          label: 'Reason',
          kind: 'textarea',
          required: true,
          description: 'The creator reads this, under your name. Max 2000 characters.',
        },
      ],
      examplePrompts: ['Cancel this contract — the campaign was pulled'],
      apply: async ({ fields, initial }) => {
        // `required` is NOT the guard: the package's check is
        // `merged[f.name] == null`, so '' and '   ' both sail past it,
        // and ripllo's cancelSchema is `z.string().max(2000)` — an
        // empty reason is ACCEPTED upstream and shown to the creator.
        // On a batch that is N contracts cancelled with a blank
        // explanation, so trim and refuse here.
        const reason = str(fields.reason)?.trim();
        if (!reason) throw new Error('A reason is required — the creator sees it');
        await ripllo('POST', `collaborations/${encodeURIComponent(verbTargetId(initial, 'contract'))}/cancel`, { reason });
      },
    });
  }
  if (mode === 'dispute') {
    return verbDescriptor({
      slug: 'collaborations',
      label: 'creator contract',
      title: 'Dispute creator contract',
      confirmLabel: 'Open dispute',
      fields: [
        {
          name: 'notes',
          label: 'What is wrong',
          kind: 'textarea',
          required: true,
          description: 'The creator reads this too. Between 20 and 5000 characters.',
        },
      ],
      examplePrompts: ['Dispute this — the video never went live'],
      apply: async ({ fields, initial }) => {
        const notes = str(fields.notes)?.trim();
        if (!notes) throw new Error('Say what the dispute is about — the creator sees it');
        if (notes.length < 20) throw new Error('Ripllo needs at least 20 characters of explanation');
        await ripllo('POST', `collaborations/${encodeURIComponent(verbTargetId(initial, 'contract'))}/dispute`, { notes });
      },
    });
  }
  return verbDescriptor({
    slug: 'collaborations',
    label: 'creator contract',
    title: 'Approve creator contract',
    confirmLabel: 'Approve and pay',
    examplePrompts: ['Approve this contract', 'Approve — the work is all signed off'],
    // Ripllo 409s unless EVERY deliverable is already approved, so this
    // is the last step rather than a step: it releases the payout.
    apply: async ({ initial }) => {
      await ripllo('POST', `collaborations/${encodeURIComponent(verbTargetId(initial, 'contract'))}/approve`, {});
    },
  });
};

export const MARKETING_BUILDERS: Record<string, ResourceBuilder> = {
  'blog-posts': blogPostsResource,
  feeds: feedsResource,
  pixels: pixelsResource,
  'abandoned-cart': abandonedCartResource,
  'marketing-campaigns': marketingCampaignsResource,
  funnels: funnelsResource,
  'affiliate-enrollments': affiliateEnrollmentsResource,
  'affiliate-commissions': affiliateCommissionsResource,
  channels: channelsResource,
  broadcasts: broadcastsResource,
  'campaign-invitations': campaignInvitationsResource,
  programs: programsResource,
  'creator-briefs': creatorBriefsResource,
  contacts: contactsResource,
  'contact-lists': contactListsResource,
  collaborations: collaborationsResource,
};
