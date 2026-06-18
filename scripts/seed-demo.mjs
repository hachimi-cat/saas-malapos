#!/usr/bin/env node
/**
 * seed-demo.mjs — populate a "Forjio Demo" workspace with realistic
 * Indonesian-merchant flavored data for this product.
 *
 * Why this exists: the forjio.com engine product detail pages each
 * show a multi-step tour of the portal in action. Empty-state
 * captures look broken; populated captures look like real merchants
 * are using the product. This script keeps the screenshot-friendly
 * state easy to recreate after a DB reset or a fresh deploy.
 *
 * Canonical data: the eight Indonesian merchants used by saas-plugipay's
 * portal-tour shoot. Names, emails, and amounts are family-stable;
 * reuse them across products so the cross-product screenshots feel
 * like the same customers showing up everywhere — because per the
 * Pattern-2 partner-billing model, they actually do.
 *
 * Usage:
 *   node scripts/seed-demo.mjs              # seeds against $API_BASE
 *   node scripts/seed-demo.mjs --dry-run    # prints planned POSTs
 *   API_BASE=https://my-brand.com node scripts/seed-demo.mjs
 *
 * Each product fills in its own `seedDataFor` cases below — the script
 * has no idea what entities your product owns. The merchants array is
 * universal; the entities you create from them are product-specific.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argv, exit } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const API_BASE = process.env.API_BASE ?? "http://localhost:4000";
const DRY_RUN = argv.includes("--dry-run");

// ─── The canonical Indonesian-merchant set ───────────────────────────
// Stable across the family — reuse in seed-demo for every product so
// the cross-product portal tours show the same eight people.
export const FORJIO_DEMO_MERCHANTS = [
  { email: "naila@tokonaila.id",     name: "Naila — Toko Naila",          phone: "+62 812-3456-7890" },
  { email: "rendi@kopikecil.id",     name: "Rendi — Kopi Kecil",          phone: "+62 813-2233-4455" },
  { email: "siti@batikbintang.id",   name: "Siti — Batik Bintang",        phone: "+62 815-9988-7766" },
  { email: "andi@kelaslogic.id",     name: "Andi — Kelas Logic",          phone: "+62 811-5544-3322" },
  { email: "mira@frescopapeterie.id", name: "Mira — Fresco Papeterie" },
  { email: "yuda@studiokunyit.id",   name: "Yuda — Studio Kunyit" },
  { email: "tiara@bunduhabit.com",   name: "Tiara — Bundu Habit" },
  { email: "ferdy@sabunseger.id",    name: "Ferdy — Sabun Seger" },
];

// Realistic Indonesian product names you can mix into the seeds.
export const FORJIO_DEMO_PRODUCTS = [
  { name: "Gummy Jelly Stickers",   priceCents: 4900000, slug: "gummy-jelly-stickers",   type: "digital" },
  { name: "Montessori Worksheets",  priceCents: 7900000, slug: "montessori-worksheets",  type: "digital" },
  { name: "Dark Academia Planner",  priceCents: 9900000, slug: "dark-academia-planner",  type: "digital" },
  { name: "Forjio Cap",             priceCents: 15000000, slug: "forjio-cap",            type: "physical" },
  { name: "Forjio Hoodie",          priceCents: 35000000, slug: "forjio-hoodie",         type: "physical" },
];

function loadBrand() {
  const pkgPath = resolve(REPO_ROOT, "backend/package.json");
  if (!existsSync(pkgPath)) throw new Error(`no backend/package.json at ${pkgPath}`);
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const slug = pkg.name?.replace(/-backend$/, "");
  if (!slug || slug === "forjio-brand") {
    throw new Error(`brand not renamed yet — run scripts/rename.sh first.`);
  }
  return slug;
}

async function post(path, body, idempotencyKey) {
  if (DRY_RUN) {
    console.log(`  DRY POST ${path}\n    ${JSON.stringify(body)}`);
    return { status: 201, body: { id: "<dry-run>" } };
  }
  const headers = { "Content-Type": "application/json" };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}

// ─── Product-specific seeders ───────────────────────────────────────
// Each forked product fills in its own cases by replacing this
// function. The example below shows how saas-plugipay would seed
// customers + invoices — adapt to your domain.
//
// PRO TIP: use idempotency keys so re-running this script does not
// duplicate rows. Most Forjio backends respect Idempotency-Key.

async function seedDataFor(brand) {
  console.log(`\nseeding ${FORJIO_DEMO_MERCHANTS.length} demo merchants for ${brand}…\n`);

  // EXAMPLE: customer + invoice flow (plugipay shape — adapt for
  // your product). Delete this and write your own based on what
  // your backend owns.
  for (const merchant of FORJIO_DEMO_MERCHANTS) {
    const customer = await post(
      "/api/v1/customers",
      { email: merchant.email, name: merchant.name, phone: merchant.phone },
      `seed-customer-${brand}-${merchant.email}`,
    );
    console.log(`  customer ${merchant.email.padEnd(28)} -> ${customer.status}`);
    // Follow-on entity (e.g. invoice, link, agent, session) goes here.
    //
    // const invoice = await post(
    //   "/api/v1/invoices",
    //   {
    //     customerId: customer.body?.data?.id,
    //     currency: "IDR",
    //     lines: [{ description: "Pro Plan — Monthly", quantity: 1, unitAmount: 9900000 }],
    //     status: "open",
    //   },
    // );
    // console.log(`    invoice -> ${invoice.status}`);
  }

  console.log("\nseeding complete.\n");
  console.log("verify by visiting:");
  console.log(`  ${API_BASE.replace(/\/$/, "")}/dashboard`);
  console.log("");
  console.log("If you're capturing forjio.com portal-tour screenshots, switch to the");
  console.log('"Forjio Demo" workspace before shooting so the seeded data shows up.');
}

async function main() {
  const brand = loadBrand();
  console.log(`seed-demo.mjs — brand=${brand} target=${API_BASE}${DRY_RUN ? " (dry-run)" : ""}`);
  await seedDataFor(brand);
}

main().catch((e) => {
  console.error("error:", e.message);
  exit(1);
});
