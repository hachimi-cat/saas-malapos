import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CircleDollarSign,
  ChefHat,
  Layers,
  Boxes,
  Users,
  Store,
  Plug,
  Code2,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Everything Malapos ships — a point-of-sale for Indonesian retail, F&B, and pharmacy. Counter, dine-in, takeaway & delivery; kitchen display; inventory; loyalty; QRIS; reports — priced in rupiah.',
};

const features = [
  {
    Icon: CircleDollarSign,
    title: 'Sell, however they order',
    body: 'One fast screen for every order type. Ring up a counter sale, seat a dine-in table, or take a takeaway or delivery — search or scan into the cart and take payment.',
    details: [
      'Counter, dine-in floor, takeaway & delivery',
      'Cash with automatic change, QRIS, card & transfer',
      'Barcode scan-to-add and keyboard hotkeys',
      'Hold & resume open bills, split the bill, printed & shareable receipts',
    ],
  },
  {
    Icon: ChefHat,
    title: 'Kitchen display & expo',
    body: 'Send orders straight to the kitchen. Cooks work a live board from New to Preparing to Ready; the expo screen calls what to plate and serve.',
    details: [
      'Live KDS board, item-by-item, oldest first',
      'Dine-in / takeaway / delivery badge on every ticket (plate vs box)',
      'Dine-in floor map — seat a table, switch between layout & list',
      'Ready-to-serve expo board for the front of house',
    ],
  },
  {
    Icon: Layers,
    title: 'Catalog & recipes',
    body: 'Build your menu or shelf once. Organise products with variants and categories, add F&B modifiers, and sell bundles that deduct their ingredients.',
    details: [
      'Products, variants, categories & per-product pricing',
      'Modifiers like sugar level and extra shot',
      'Composite items — a recipe deducts its components on sale',
      'Works for retail, cafe, and pharmacy items',
    ],
  },
  {
    Icon: Boxes,
    title: 'Inventory & pharmacy',
    body: 'Track every item of stock. Each sale, adjustment, and transfer is recorded so your counts always add up — with dated batches for pharmacy.',
    details: [
      'Live stock levels + append-only movement ledger',
      'Low-stock alerts and manual adjustments',
      'Inter-outlet stock transfers',
      'Batch & expiry tracking, first-expiry-first-out selling',
    ],
  },
  {
    Icon: Users,
    title: 'Customers, loyalty & gift cards',
    body: 'Keep regulars coming back. Reward loyalty at the till, sell gift cards and store credit, and refund part of a sale when you need to.',
    details: [
      'Customer directory with loyalty points',
      'Earn on sale, adjust or redeem by hand',
      'Gift cards & store credit as a tender',
      'Full and partial refunds',
    ],
  },
  {
    Icon: Store,
    title: 'Outlets, shifts & reports',
    body: 'Run more than one store and keep the till honest. Close every shift against the cash drawer, receive supplier deliveries, and read what sold.',
    details: [
      'Multiple outlets with per-outlet tax and receipt numbering',
      'Cashier shifts with cash reconciliation',
      'Suppliers & purchase orders, receive-to-stock',
      'Sales-by-day, top products, payment-mix & low-stock reports',
    ],
  },
  {
    Icon: Plug,
    title: 'Add-on modules',
    body: 'Switch on more when you need it. Each module connects a Forjio partner — turn it on from Settings, no extra account juggling.',
    details: [
      'Payments — live dynamic QRIS at the till (Plugipay)',
      'Marketing — discount codes, loyalty & campaigns (Ripllo)',
      'Fulfillment — book couriers for delivery orders (Fulkruma)',
      'Help center & live chat support (Suppuo)',
    ],
  },
  {
    Icon: Code2,
    title: 'Developer API',
    body: 'Build on top of your data. Authenticate with an API key and subscribe to events to sync sales into your own tools.',
    details: [
      'REST API with sk_live_… bearer keys',
      'Webhooks for malapos.* events (sale completed, voided, …)',
      'Signed deliveries you can verify',
      'CLI for login + day-to-day ops',
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 md:px-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Everything your counter needs.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Malapos is a point-of-sale for Indonesian retail, F&amp;B, and pharmacy. Sell on the
          Free plan today; unlock inventory, customers, multi-outlet, and pharmacy batches as
          your shop grows. Priced in rupiah.
        </p>
      </div>

      <div className="mt-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {features.map(({ Icon, title, body, details }) => (
            <Card key={title} className="p-6 md:p-8">
              <div className="mb-5 flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-6" strokeWidth={1.5} />
              </div>
              <h2 className="text-xl font-semibold tracking-[-0.01em]">{title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                {details.map((d) => (
                  <li key={d} className="flex items-start gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/60" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-20 text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Start free — no card required.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Start on the Free plan — Rp0, no card needed — and upgrade as your shop grows. Set up
          your shop and ring up your first sale in minutes.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/signup">
              Start free <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/pricing">View pricing</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
