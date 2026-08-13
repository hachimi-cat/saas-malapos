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
  verbDescriptor,
  verbTargetId,
  type Fields,
  type ResourceBuilder,
} from '../resource-helpers';

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

export const MARKETING_BUILDERS: Record<string, ResourceBuilder> = {
  'blog-posts': blogPostsResource,
  feeds: feedsResource,
  pixels: pixelsResource,
  'abandoned-cart': abandonedCartResource,
  'marketing-campaigns': marketingCampaignsResource,
  funnels: funnelsResource,
  'affiliate-enrollments': affiliateEnrollmentsResource,
  'affiliate-commissions': affiliateCommissionsResource,
};
