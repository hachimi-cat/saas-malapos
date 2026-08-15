/**
 * The channel provider catalog — the ONE list of what
 * /dashboard/marketing/channels can connect, and exactly which
 * credential each provider needs.
 *
 * Two things read it and they must not drift: the page renders its
 * connect cards from it, and the `channels` assistant descriptor builds
 * its provider + credentials guidance from it. bang, 2026-08-14: *"it
 * can help user to setup channels. tell them how to get key/token etc
 * and help them to setup the channel in channels page"* — the assistant
 * can only say which key a provider wants if it reads the same catalog
 * the form does. Ported from storlaunch, which did this first.
 *
 * Icons are deliberately NOT here. They are React components, and the
 * descriptor is a plain module; the page keeps its own key -> icon map.
 */

export type Provider =
  | 'email_resend' | 'email_sendgrid' | 'email_mailgun' | 'email_postmark' | 'email_ses'
  | 'sms_twilio' | 'sms_vonage'
  | 'whatsapp_cloud' | 'telegram_bot' | 'line_business' | 'discord_webhook' | 'slack_webhook'
  | 'push_onesignal' | 'push_fcm'
  | 'meta_business' | 'linkedin' | 'tiktok_business' | 'twitter' | 'youtube' | 'pinterest' | 'threads'
  | 'webhook_generic';

export interface ProviderField {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'password';
}

export interface ProviderMeta {
  key: Provider;
  label: string;
  category: 'Email' | 'SMS' | 'Messaging' | 'Push' | 'Social' | 'Generic';
  blurb: string;
  authKind: 'api_key' | 'oauth' | 'webhook_url';
  fields?: ProviderField[];
}

export const PROVIDERS: ProviderMeta[] = [
  // Email
  { key: 'email_resend', label: 'Resend', category: 'Email', blurb: 'Modern transactional + marketing email API.', authKind: 'api_key', fields: [
    { key: 'apiKey', label: 'API key', placeholder: 're_…', type: 'password' },
    { key: 'fromEmail', label: 'From address', placeholder: 'hello@yourstore.com' },
    { key: 'fromName', label: 'From name', placeholder: 'Your Store' },
  ] },
  { key: 'email_sendgrid', label: 'SendGrid', category: 'Email', blurb: 'Twilio SendGrid email send.', authKind: 'api_key', fields: [
    { key: 'apiKey', label: 'API key', placeholder: 'SG.…', type: 'password' },
    { key: 'fromEmail', label: 'From address' },
    { key: 'fromName', label: 'From name' },
  ] },
  { key: 'email_mailgun', label: 'Mailgun', category: 'Email', blurb: 'Mailgun European/US sending domain.', authKind: 'api_key', fields: [
    { key: 'apiKey', label: 'API key', placeholder: 'key-…', type: 'password' },
    { key: 'domain', label: 'Sending domain', placeholder: 'mg.yourstore.com' },
    { key: 'region', label: 'Region (us / eu)', placeholder: 'us' },
    { key: 'fromEmail', label: 'From address' },
    { key: 'fromName', label: 'From name' },
  ] },
  { key: 'email_postmark', label: 'Postmark', category: 'Email', blurb: 'Transactional email — high deliverability.', authKind: 'api_key', fields: [
    { key: 'serverToken', label: 'Server token', type: 'password' },
    { key: 'fromEmail', label: 'From address' },
    { key: 'fromName', label: 'From name' },
  ] },
  { key: 'email_ses', label: 'AWS SES', category: 'Email', blurb: 'Amazon Simple Email Service.', authKind: 'api_key', fields: [
    { key: 'accessKeyId', label: 'Access key ID' },
    { key: 'secretAccessKey', label: 'Secret access key', type: 'password' },
    { key: 'region', label: 'AWS region', placeholder: 'ap-southeast-1' },
    { key: 'fromEmail', label: 'From address' },
    { key: 'fromName', label: 'From name' },
  ] },
  // SMS
  { key: 'sms_twilio', label: 'Twilio SMS', category: 'SMS', blurb: 'SMS via Twilio messaging service.', authKind: 'api_key', fields: [
    { key: 'accountSid', label: 'Account SID' },
    { key: 'authToken', label: 'Auth token', type: 'password' },
    { key: 'messagingServiceSid', label: 'Messaging service SID' },
  ] },
  { key: 'sms_vonage', label: 'Vonage SMS', category: 'SMS', blurb: 'Vonage (formerly Nexmo) SMS API.', authKind: 'api_key', fields: [
    { key: 'apiKey', label: 'API key' },
    { key: 'apiSecret', label: 'API secret', type: 'password' },
    { key: 'fromNumber', label: 'From number / sender ID', placeholder: '+62…' },
  ] },
  // Messaging
  { key: 'whatsapp_cloud', label: 'WhatsApp', category: 'Messaging', blurb: 'WA Cloud API — campaign + transactional.', authKind: 'api_key', fields: [
    { key: 'phoneNumberId', label: 'Phone number ID' },
    { key: 'accessToken', label: 'Access token', type: 'password' },
    { key: 'businessAccountId', label: 'Business account ID' },
  ] },
  { key: 'telegram_bot', label: 'Telegram', category: 'Messaging', blurb: 'Bot API — broadcast to subscribers + DM.', authKind: 'api_key', fields: [
    { key: 'botToken', label: 'Bot token (from @BotFather)', type: 'password' },
    { key: 'defaultChatId', label: 'Default chat / channel ID', placeholder: '@yourchannel or -100…' },
  ] },
  { key: 'line_business', label: 'LINE Business', category: 'Messaging', blurb: 'LINE Official Account messaging API.', authKind: 'api_key', fields: [
    { key: 'channelId', label: 'Channel ID' },
    { key: 'channelAccessToken', label: 'Channel access token', type: 'password' },
    { key: 'channelSecret', label: 'Channel secret', type: 'password' },
  ] },
  { key: 'discord_webhook', label: 'Discord', category: 'Messaging', blurb: 'Webhook to a single Discord channel.', authKind: 'webhook_url', fields: [
    { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/…', type: 'password' },
  ] },
  { key: 'slack_webhook', label: 'Slack', category: 'Messaging', blurb: 'Incoming webhook to a Slack channel.', authKind: 'webhook_url', fields: [
    { key: 'webhookUrl', label: 'Incoming webhook URL', placeholder: 'https://hooks.slack.com/services/…', type: 'password' },
  ] },
  // Push
  { key: 'push_onesignal', label: 'OneSignal', category: 'Push', blurb: 'Web + mobile push notifications.', authKind: 'api_key', fields: [
    { key: 'appId', label: 'App ID' },
    { key: 'restApiKey', label: 'REST API key', type: 'password' },
  ] },
  { key: 'push_fcm', label: 'Firebase Cloud Messaging', category: 'Push', blurb: 'Mobile push via FCM (HTTP v1).', authKind: 'api_key', fields: [
    { key: 'projectId', label: 'Project ID' },
    { key: 'serviceAccountJson', label: 'Service account JSON', placeholder: 'paste full JSON here', type: 'password' },
  ] },
  // Social
  { key: 'meta_business', label: 'Meta (FB + IG)', category: 'Social', blurb: 'Page posts + IG Business posts via Graph API.', authKind: 'oauth' },
  { key: 'linkedin', label: 'LinkedIn', category: 'Social', blurb: 'Personal + Company page posts.', authKind: 'oauth' },
  { key: 'tiktok_business', label: 'TikTok', category: 'Social', blurb: 'Business account posts via TikTok API.', authKind: 'api_key', fields: [
    { key: 'accessToken', label: 'Access token', type: 'password' },
    { key: 'advertiserId', label: 'Advertiser ID' },
  ] },
  { key: 'twitter', label: 'X (Twitter)', category: 'Social', blurb: 'Post to X via the v2 API.', authKind: 'oauth' },
  { key: 'youtube', label: 'YouTube', category: 'Social', blurb: 'Channel posts (Community tab).', authKind: 'oauth' },
  { key: 'pinterest', label: 'Pinterest', category: 'Social', blurb: 'Pin to boards via Pinterest API.', authKind: 'oauth' },
  { key: 'threads', label: 'Threads', category: 'Social', blurb: 'Threads posts via Meta Graph.', authKind: 'oauth' },
  // Generic
  { key: 'webhook_generic', label: 'Generic webhook', category: 'Generic', blurb: 'POST to any URL — for in-house tools / Zapier-style hooks.', authKind: 'webhook_url', fields: [
    { key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://your-endpoint.example.com/hook', type: 'password' },
    { key: 'authHeader', label: 'Authorization header (optional)', placeholder: 'Bearer …', type: 'password' },
  ] },
];

export const CATEGORIES: ProviderMeta['category'][] = ['Email', 'SMS', 'Messaging', 'Push', 'Social', 'Generic'];

export const PROVIDER_BY_KEY = Object.fromEntries(PROVIDERS.map((p) => [p.key, p])) as Record<Provider, ProviderMeta>;

/**
 * One line per provider, naming the credential keys it wants — the text
 * the assistant plans against.
 *
 * OAuth providers are called out separately: they have no `fields`
 * because there is nothing to paste. Connecting them is a redirect the
 * merchant walks through in the browser, so a plan proposing
 * `credentials` for one would be proposing something that cannot work.
 */
export function providerGuide(): string {
  return PROVIDERS.map((p) => {
    const where =
      p.authKind === 'oauth'
        ? 'OAuth — connect it from the provider card on the channels page; no keys to paste'
        : (p.fields ?? []).map((f) => f.key).join(', ') || 'no credentials';
    return `${p.key} (${p.label}, ${p.category}) — ${where}`;
  }).join('\n');
}
