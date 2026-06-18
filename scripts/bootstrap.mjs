#!/usr/bin/env node
/**
 * bootstrap.mjs — register this product with Huudis + Plugipay.
 *
 * Step 2 of the TEMPLATE.md walkthrough. Run after scripts/rename.sh
 * has swapped brand placeholders.
 *
 * What it does:
 *   1. Reads the brand identity from backend/package.json (name field).
 *   2. Logs in to Huudis as gojo@forjio.com (creds from
 *      ~/.config/agents/gojo/credentials.env).
 *   3. POSTs to https://huudis.com/api/v1/oidc/clients to register
 *      an OIDC client for this product with three redirect URIs
 *      (prod, staging, local).
 *   4. Writes the returned clientId + clientSecret to .env
 *      (gitignored) and an .env.example template (committed).
 *   5. Creates the GitHub repo (hachimi-cat/<brand>) + pushes the
 *      first commit, if the working copy has no `origin` yet.
 *   6. Prints next steps for the Plugipay KNOWN_PARTNERS step,
 *      which today requires a manual PR to saas-plugipay because
 *      KNOWN_PARTNERS is a hardcoded TS literal — link below.
 *
 * Re-runnable: a second run with the same brand creates a SECOND
 * client (Huudis allows it). If you want to rotate the secret instead,
 * use POST /api/v1/oidc/clients/:id/rotate-secret.
 *
 * Usage:
 *   node scripts/bootstrap.mjs            # use defaults
 *   node scripts/bootstrap.mjs --dry-run  # show what it would do
 *   node scripts/bootstrap.mjs --no-repo  # skip the GitHub repo step
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { argv, exit } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const HUUDIS_BASE = process.env.HUUDIS_BASE ?? "https://huudis.com";
const GITHUB_ORG = "hachimi-cat"; // canonical Forjio org — see feedback_forjio_github_org
const PLUGIPAY_PR_URL = "https://github.com/hachimi-cat/saas-plugipay/edit/master/backend/src/services/partner-billing-service.ts";

const DRY_RUN = argv.includes("--dry-run");

function loadCreds() {
  const credsPath = "/root/.config/agents/gojo/credentials.env";
  if (!existsSync(credsPath)) {
    throw new Error(
      `creds not found at ${credsPath}. Drop GOJO_HUUDIS_EMAIL/PASSWORD into the env or that file.`,
    );
  }
  const env = {};
  for (const line of readFileSync(credsPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  const email = env.GOJO_HUUDIS_EMAIL ?? process.env.GOJO_HUUDIS_EMAIL;
  const password = env.GOJO_HUUDIS_PASSWORD ?? process.env.GOJO_HUUDIS_PASSWORD;
  if (!email || !password) throw new Error("missing GOJO_HUUDIS_EMAIL / GOJO_HUUDIS_PASSWORD");
  return { email, password };
}

function loadBrand() {
  const pkgPath = resolve(REPO_ROOT, "backend/package.json");
  if (!existsSync(pkgPath)) throw new Error(`no backend/package.json at ${pkgPath}`);
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  // Backend package name is "<slug>-backend" after rename.sh
  const slug = pkg.name?.replace(/-backend$/, "");
  if (!slug || slug === "forjio-brand") {
    throw new Error(
      `brand not renamed yet — backend/package.json name="${pkg.name}". Run scripts/rename.sh first.`,
    );
  }
  return slug;
}

async function huudisLogin(email, password) {
  // Huudis OIDC login endpoint — sets the session cookie we'll use
  // on the next request. The Huudis frontend posts here too.
  const res = await fetch(`${HUUDIS_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  if (!res.ok && res.status !== 302) {
    throw new Error(`Huudis login failed: ${res.status} ${await res.text()}`);
  }
  const cookies = res.headers.getSetCookie?.() ?? [];
  if (cookies.length === 0) {
    throw new Error("Huudis login returned no Set-Cookie — auth probably failed silently.");
  }
  // Reduce to a Cookie header value
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

async function createOidcClient(cookie, slug) {
  const redirectUris = [
    `https://${slug}.com/callback`,
    `https://${slug}.forjio.com/callback`,
    `http://localhost:3000/callback`,
  ];
  const body = {
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    redirectUris,
    scopes: ["openid", "profile", "email"],
  };
  if (DRY_RUN) {
    console.log("DRY RUN — would POST to", `${HUUDIS_BASE}/api/v1/oidc/clients`);
    console.log("body:", JSON.stringify(body, null, 2));
    return { clientId: "<dry-run>", clientSecret: "<dry-run>" };
  }
  const res = await fetch(`${HUUDIS_BASE}/api/v1/oidc/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OIDC client create failed: ${res.status} ${text}`);
  const parsed = JSON.parse(text);
  const data = parsed.data ?? parsed;
  return { clientId: data.clientId, clientSecret: data.clientSecret };
}

function writeEnv(slug, clientId, clientSecret) {
  const backendEnv = resolve(REPO_ROOT, "backend/.env");
  const frontendEnv = resolve(REPO_ROOT, "frontend/.env.local");

  const backend = [
    "# Generated by scripts/bootstrap.mjs — never commit this file.",
    `FORJIO_SERVICE=${slug}`,
    `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${slug.replace(/-/g, "_")}`,
    `HUUDIS_ISSUER=${HUUDIS_BASE}`,
    `HUUDIS_AUDIENCE=${slug}`,
    `HUUDIS_CLIENT_ID=${clientId}`,
    `HUUDIS_CLIENT_SECRET=${clientSecret}`,
    `PORT=4000`,
    `NODE_ENV=development`,
    `OUTBOX_POLL_INTERVAL_MS=1000`,
    `OUTBOX_BATCH_SIZE=100`,
    "",
  ].join("\n");

  const frontend = [
    "# Generated by scripts/bootstrap.mjs — never commit this file.",
    `NEXT_PUBLIC_API_URL=http://localhost:4000`,
    `NEXT_PUBLIC_OIDC_ISSUER=${HUUDIS_BASE}`,
    `NEXT_PUBLIC_OIDC_CLIENT_ID=${clientId}`,
    `NEXT_PUBLIC_BRAND_NAME="${slug.charAt(0).toUpperCase() + slug.slice(1)}"`,
    "",
  ].join("\n");

  if (DRY_RUN) {
    console.log("\nDRY RUN — would write:");
    console.log(`  ${backendEnv}:\n${backend}`);
    console.log(`  ${frontendEnv}:\n${frontend}`);
    return;
  }
  writeFileSync(backendEnv, backend);
  writeFileSync(frontendEnv, frontend);
  console.log(`  ✓ wrote ${backendEnv}`);
  console.log(`  ✓ wrote ${frontendEnv}`);
}

// Create the GitHub repo + push the first commit if the working copy
// isn't on a remote yet. No-op when spawned via `gh repo create
// --template` (origin already set). Best-effort — skips cleanly if gh
// is missing or the user passes --no-repo.
function ensureGitHubRepo(slug) {
  if (argv.includes("--no-repo")) {
    console.log("  (skipped — --no-repo)");
    return;
  }
  const sh = (cmd) => execSync(cmd, { cwd: REPO_ROOT, stdio: "pipe" }).toString().trim();
  const tryQuiet = (cmd) => {
    try {
      return sh(cmd);
    } catch {
      return null;
    }
  };

  const isGitRepo = existsSync(resolve(REPO_ROOT, ".git"));
  const hasOrigin = isGitRepo && tryQuiet("git remote get-url origin");
  if (hasOrigin) {
    console.log(`  ✓ origin already set (${hasOrigin}) — nothing to create`);
    return;
  }
  if (DRY_RUN) {
    console.log(`  DRY RUN — would: gh repo create ${GITHUB_ORG}/${slug} --private --source=. --push`);
    return;
  }
  if (!tryQuiet("gh --version")) {
    console.log("  ⚠ gh CLI not found — create the repo manually:");
    console.log(`    gh repo create ${GITHUB_ORG}/${slug} --private --source=. --push`);
    return;
  }
  if (!isGitRepo) {
    sh("git init -q");
    sh("git add -A");
    sh(`git commit -q -m "chore: scaffold ${slug} from forjio-service-template"`);
  } else if (tryQuiet("git status --porcelain")) {
    sh("git add -A");
    sh(`git commit -q -m "chore: bootstrap ${slug}"`);
  }
  sh(`gh repo create ${GITHUB_ORG}/${slug} --private --source=. --remote=origin --push`);
  console.log(`  ✓ created + pushed ${GITHUB_ORG}/${slug}`);
}

async function main() {
  console.log("bootstrap.mjs — registering Huudis OIDC client + nudging Plugipay step");
  console.log("");

  const slug = loadBrand();
  console.log(`brand: ${slug}`);
  if (DRY_RUN) console.log("(dry-run mode — no writes, no network)");

  const { email, password } = loadCreds();
  console.log(`huudis: logging in as ${email}…`);
  let cookie;
  if (DRY_RUN) {
    cookie = "<dry-run>";
  } else {
    cookie = await huudisLogin(email, password);
    console.log(`  ✓ logged in`);
  }

  console.log(`huudis: creating OIDC client for ${slug}…`);
  const { clientId, clientSecret } = await createOidcClient(cookie, slug);
  if (!DRY_RUN) {
    console.log(`  ✓ clientId=${clientId}`);
    console.log(`  ✓ clientSecret=${clientSecret.slice(0, 8)}… (full value in backend/.env)`);
  }

  console.log("\nwriting env files…");
  writeEnv(slug, clientId, clientSecret);

  console.log("\ngithub: ensuring the repo exists…");
  ensureGitHubRepo(slug);

  console.log("\n────────────────────────────────────────────────────────────");
  console.log("Huudis: done ✓");
  console.log("Plugipay: open a PR to add this product to KNOWN_PARTNERS:");
  console.log(`  ${PLUGIPAY_PR_URL}`);
  console.log(`  Change the line:`);
  console.log(`    export const KNOWN_PARTNERS = [...,'${slug}'] as const;`);
  console.log(`  Then deploy saas-plugipay (CI auto-deploys on master).`);
  console.log("");
  console.log("next: TEMPLATE.md Step 3 — marketing site");
}

main().catch((e) => {
  console.error("error:", e.message);
  exit(1);
});
