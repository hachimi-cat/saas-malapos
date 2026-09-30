/**
 * `malapos auth` — sign in with Huudis (device flow) or an API key.
 *
 * login             — start the device flow, poll for tokens, save them to the
 *                     active profile of ~/.malapos/credentials
 * login --api-key   — save an `sk_live_…` API key to the profile instead (CI,
 *                     servers); `--api-key -` reads it from stdin
 * whoami            — what the CLI is signed in as: `MALAPOS_TOKEN`, the saved
 *                     key, or the Huudis user (OIDC userinfo)
 * logout            — wipe the active profile from the credentials file
 *
 * The Session class (from @forjio/sdk) writes an INI file at
 * `~/.malapos/credentials` with one section per profile, exactly mirroring
 * AWS CLI's `~/.aws/credentials` convention; an API key is kept in the same
 * section as `api_key = …` (lib/credentials.ts). `MALAPOS_TOKEN` in the
 * environment wins over both.
 *
 * whoami asks Huudis (userinfo) rather than Malapos: `/api/v1/auth/me` is
 * cookie-first (the BFF kit), so a bearer-token CLI can't use it.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import { startDeviceFlow, pollDeviceToken } from '@forjio/sdk';
import {
  DEFAULT_SCOPE,
  clientId,
  formatOpts,
  getGlobalOpts,
  issuerUrl,
  newSession,
} from '../lib/context.js';
import {
  TOKEN_ENV,
  envToken,
  fetchUserinfo,
  keyHint,
  loadApiKey,
  profileKind,
  saveApiKey,
  type Userinfo,
} from '../lib/credentials.js';
import { handleError } from '../lib/error.js';
import { kv, ok, printResult, warn } from '../lib/output.js';

interface JwtClaims {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  exp?: number;
  iss?: string;
}

/** Decode (without verifying) a JWT's payload. Returns {} on any failure. */
function decodeJwt(token: string): JwtClaims {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return {};
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json) as JwtClaims;
  } catch {
    return {};
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString('utf8');
}

export function createAuthCommand(): Command {
  const auth = new Command('auth').description('Sign in with Huudis (device flow) or an API key');

  auth
    .command('login')
    .description('Sign in via the OIDC device flow, or save an API key with --api-key')
    .option('--api-key <key>', 'save an API key instead of signing in with a browser ("-" reads it from stdin)')
    .option('--issuer <url>', 'Huudis issuer URL (default: $MALAPOS_HUUDIS_ISSUER or https://huudis.com)')
    .option('--client-id <id>', 'OIDC client id (default: $MALAPOS_CLI_CLIENT_ID or malapos-cli)')
    .option('--scope <scope>', 'OAuth scope string', DEFAULT_SCOPE)
    .option('--no-browser', 'skip automatic browser launch — print the URL only')
    .action(
      async (
        opts: { apiKey?: string; issuer?: string; clientId?: string; scope?: string; browser?: boolean },
        cmd: Command,
      ) => {
        const g = getGlobalOpts(cmd);
        try {
          const session = newSession(g);

          if (opts.apiKey !== undefined) {
            const key = (opts.apiKey === '-' ? await readStdin() : opts.apiKey).trim();
            if (!key || /\s/.test(key)) throw new Error('The API key is empty or contains whitespace.');
            await saveApiKey(session, key);
            printResult(
              { ok: true, mode: 'api_key', profile: session.profile, key: keyHint(key), credentials: session.credentialsPath },
              (v) => [ok(`API key ${v.key} saved (profile: ${v.profile}).`, formatOpts(g))],
              formatOpts(g),
            );
            if (!g.json && envToken()) process.stderr.write(`${warn(`${TOKEN_ENV} is set in this shell and takes precedence.`, formatOpts(g))}\n`);
            return;
          }

          const issuer = (opts.issuer ?? issuerUrl()).replace(/\/+$/, '');
          const cid = opts.clientId ?? clientId();
          const scope = opts.scope ?? DEFAULT_SCOPE;
          const start = await startDeviceFlow({ issuer, clientId: cid, scope });
          const verifyUrl = start.verificationUriComplete ?? start.verificationUri;
          // Always on stderr — with --json too, or the user would never see the code.
          process.stderr.write(
            `\nVisit ${g.noColor ? verifyUrl : chalk.cyan(verifyUrl)} and enter code:\n\n` +
              `  ${g.noColor ? start.userCode : chalk.bold.green(start.userCode)}\n\n` +
              `${g.noColor ? '' : chalk.dim(`Waiting for approval (expires in ${Math.max(1, Math.floor(start.expiresIn / 60))} min)…\n`)}`,
          );
          if (opts.browser !== false) {
            await open(verifyUrl).catch(() => {
              /* fallback: user already saw URL */
            });
          }
          const tokens = await pollDeviceToken({
            issuer,
            clientId: cid,
            deviceCode: start.deviceCode,
            interval: start.interval,
          });
          await session.save({
            accessToken: tokens.accessToken,
            ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
            expiresAt: tokens.expiresAt,
            issuer,
            clientId: cid,
            ...(tokens.scope ? { scope: tokens.scope } : {}),
          });

          const info: Userinfo | JwtClaims =
            (await fetchUserinfo(issuer, tokens.accessToken).catch(() => null)) ?? decodeJwt(tokens.accessToken);
          const email = info.email ?? (info as JwtClaims).preferred_username;
          printResult(
            { ok: true, mode: 'session', profile: session.profile, sub: info.sub, email, credentials: session.credentialsPath },
            (v) => [ok(`Signed in${v.email ? ` as ${v.email}` : ''} (profile: ${v.profile}).`, formatOpts(g))],
            formatOpts(g),
          );
          if (!g.json && envToken()) process.stderr.write(`${warn(`${TOKEN_ENV} is set in this shell and takes precedence.`, formatOpts(g))}\n`);
        } catch (err) {
          handleError(err, g);
        }
      },
    );

  auth
    .command('whoami')
    .description('Show what the CLI is signed in as (session, API key, or $MALAPOS_TOKEN)')
    .action(async (_opts, cmd) => {
      const g = getGlobalOpts(cmd);
      try {
        const env = envToken();
        if (env) {
          printResult(
            { authenticated: true, mode: 'env', variable: TOKEN_ENV, token: keyHint(env) },
            (v) => [kv('Signed in with', `${v.variable} (environment)`, formatOpts(g)), kv('Token', v.token, formatOpts(g))],
            formatOpts(g),
          );
          return;
        }

        const session = newSession(g);
        const saved = await loadApiKey(session);
        if (saved) {
          printResult(
            {
              authenticated: true,
              mode: 'api_key',
              profile: session.profile,
              key: keyHint(saved.apiKey),
              savedAt: saved.savedAt,
              credentials: session.credentialsPath,
            },
            (v) => [
              kv('Signed in with', 'API key', formatOpts(g)),
              kv('Profile', v.profile, formatOpts(g)),
              kv('Key', v.key, formatOpts(g)),
              kv('Saved', v.savedAt, formatOpts(g)),
            ],
            formatOpts(g),
          );
          return;
        }

        try {
          await session.load();
        } catch (err) {
          if (g.json) process.stdout.write(`${JSON.stringify({ authenticated: false, profile: session.profile }, null, 2)}\n`);
          else {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(
              `Not signed in (${msg}). Run \`malapos auth login\` (or \`malapos auth login --api-key <key>\`).\n`,
            );
          }
          process.exit(1);
        }
        // Refresh first if the access token is (nearly) expired, as the ApiClient would.
        if (session.willExpireSoon(60) && session.data?.refreshToken) await session.refresh();
        const data = session.data!;
        let info: Userinfo | JwtClaims;
        let note: string | undefined;
        try {
          info = await fetchUserinfo(data.issuer, data.accessToken);
        } catch (err) {
          info = decodeJwt(data.accessToken);
          note = err instanceof Error ? err.message : String(err);
        }
        printResult(
          {
            authenticated: true,
            mode: 'session',
            profile: session.profile,
            sub: info.sub,
            email: info.email ?? (info as JwtClaims).preferred_username,
            emailVerified: info.email_verified,
            name: info.name,
            issuer: data.issuer,
            clientId: data.clientId,
            expiresAt: new Date(data.expiresAt * 1000).toISOString(),
            ...(note ? { warning: note } : {}),
          },
          (v) => [
            kv('Signed in with', 'Huudis session', formatOpts(g)),
            kv('Profile', v.profile, formatOpts(g)),
            kv('Subject', v.sub, formatOpts(g)),
            kv('Email', v.emailVerified ? `${v.email} (verified)` : v.email, formatOpts(g)),
            kv('Name', v.name, formatOpts(g)),
            kv('Issuer', `${v.issuer} (client ${v.clientId})`, formatOpts(g)),
            kv('Token exp', v.expiresAt, formatOpts(g)),
            ...(v.warning ? [warn(v.warning, formatOpts(g))] : []),
          ],
          formatOpts(g),
        );
      } catch (err) {
        handleError(err, g);
      }
    });

  auth
    .command('logout')
    .description('Remove the active profile (session or API key) from ~/.malapos/credentials')
    .action(async (_opts, cmd) => {
      const g = getGlobalOpts(cmd);
      try {
        const session = newSession(g);
        const cleared = (await profileKind(session)) !== null;
        await session.clear();
        printResult(
          { ok: true, profile: session.profile, cleared, envTokenSet: Boolean(envToken()) },
          (v) => [
            v.cleared
              ? ok(`Signed out (profile: ${v.profile}).`, formatOpts(g))
              : `Nothing to clear (profile: ${v.profile}).`,
            ...(v.envTokenSet ? [warn(`${TOKEN_ENV} is still set in this shell.`, formatOpts(g))] : []),
          ],
          formatOpts(g),
        );
      } catch (err) {
        handleError(err, g);
      }
    });

  return auth;
}

/** Module-level instance for `src/index.ts` to register. */
export const auth = createAuthCommand();
