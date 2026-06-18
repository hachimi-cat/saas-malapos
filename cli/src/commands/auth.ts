/**
 * `malapos auth` — Huudis device-flow OIDC.
 *
 * login   — start device flow, poll for tokens, save to ~/.malapos/credentials
 * whoami  — show the active identity (decoded from the access-token claims)
 * logout  — wipe the active profile from the credentials file
 *
 * The Session class (from @forjio/sdk) writes an INI file at
 * `~/.malapos/credentials` with one section per profile, exactly mirroring
 * AWS CLI's `~/.aws/credentials` convention.
 *
 * whoami decodes the JWT access token locally rather than hitting an
 * endpoint: Malapos's `/api/v1/auth/me` is cookie-first (the BFF kit), so a
 * bearer-token CLI reads identity straight from the token's OIDC claims.
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
import { handleError } from '../lib/error.js';
import { kv, ok, printResult } from '../lib/output.js';

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

export function createAuthCommand(): Command {
  const auth = new Command('auth').description('Authenticate with Huudis (device flow)');

  auth
    .command('login')
    .description('Sign in via OIDC device flow and save credentials to ~/.malapos/credentials')
    .option('--scope <scope>', 'OAuth scope string', DEFAULT_SCOPE)
    .option('--no-browser', 'skip automatic browser launch — print the URL only')
    .action(async (opts: { scope?: string; browser?: boolean }, cmd) => {
      const g = getGlobalOpts(cmd);
      const issuer = issuerUrl();
      const cid = clientId();
      const scope = opts.scope ?? DEFAULT_SCOPE;
      try {
        const start = await startDeviceFlow({ issuer, clientId: cid, scope });
        const verifyUrl = start.verificationUriComplete ?? start.verificationUri;
        if (!g.json) {
          process.stderr.write(
            `\nVisit ${g.noColor ? verifyUrl : chalk.cyan(verifyUrl)} and enter code:\n\n` +
              `  ${g.noColor ? start.userCode : chalk.bold.green(start.userCode)}\n\n` +
              `${g.noColor ? '' : chalk.dim(`Waiting for approval (expires in ${Math.floor(start.expiresIn / 60)} min)…\n`)}`,
          );
        }
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
        const session = newSession(g);
        await session.save({
          accessToken: tokens.accessToken,
          ...(tokens.refreshToken ? { refreshToken: tokens.refreshToken } : {}),
          expiresAt: tokens.expiresAt,
          issuer,
          clientId: cid,
          ...(tokens.scope ? { scope: tokens.scope } : {}),
        });

        const claims = decodeJwt(tokens.accessToken);
        const email = claims.email ?? claims.preferred_username;
        printResult(
          { ok: true, profile: session.profile, email },
          (v) => [ok(`Signed in${v.email ? ` as ${v.email}` : ''} (profile: ${v.profile}).`, formatOpts(g))],
          formatOpts(g),
        );
      } catch (err) {
        handleError(err, g);
      }
    });

  auth
    .command('whoami')
    .description('Show the currently signed-in identity')
    .action(async (_opts, cmd) => {
      const g = getGlobalOpts(cmd);
      try {
        const session = newSession(g);
        try {
          await session.load();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`Not signed in (${msg}). Run \`malapos auth login\`.\n`);
          process.exit(1);
        }
        const data = session.data!;
        const claims = decodeJwt(data.accessToken);
        const expIso = new Date(data.expiresAt * 1000).toISOString();
        printResult(
          {
            profile: session.profile,
            sub: claims.sub,
            email: claims.email ?? claims.preferred_username,
            emailVerified: claims.email_verified,
            name: claims.name,
            issuer: data.issuer,
            expiresAt: expIso,
          },
          (v) => [
            kv('Profile', v.profile, formatOpts(g)),
            kv('Subject', v.sub, formatOpts(g)),
            kv('Email', v.emailVerified ? `${v.email} (verified)` : v.email, formatOpts(g)),
            kv('Name', v.name, formatOpts(g)),
            kv('Issuer', v.issuer, formatOpts(g)),
            kv('Token exp', v.expiresAt, formatOpts(g)),
          ],
          formatOpts(g),
        );
      } catch (err) {
        handleError(err, g);
      }
    });

  auth
    .command('logout')
    .description('Remove the active profile from ~/.malapos/credentials')
    .action(async (_opts, cmd) => {
      const g = getGlobalOpts(cmd);
      try {
        const session = newSession(g);
        await session.clear();
        printResult(
          { ok: true, profile: session.profile },
          (v) => [ok(`Signed out (profile: ${v.profile}).`, formatOpts(g))],
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
