/**
 * S3 (or S3-compatible — DigitalOcean Spaces) plumbing for product
 * images. Ported from saas-ripllo.
 *
 * Env:
 *   MALAPOS_S3_BUCKET
 *   MALAPOS_S3_REGION          (default us-east-1)
 *   MALAPOS_S3_ENDPOINT        (optional — set to https://<region>.digitaloceanspaces.com for DO)
 *   MALAPOS_S3_PUBLIC_BASE     (optional — CDN-style public base for built object URLs)
 *   MALAPOS_S3_ACCESS_KEY_ID
 *   MALAPOS_S3_SECRET_ACCESS_KEY
 *
 * presignPut() is called by /api/v1/uploads/sign with a deterministic
 * key under `products/<accountId>/<id>.<ext>`; the object is signed
 * with the `public-read` ACL so the CDN endpoint can serve it
 * anonymously. publicUrl() resolves the final, browser-loadable URL.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let cached: S3Client | null = null;

function client(): S3Client {
  if (cached) return cached;
  const region = process.env.MALAPOS_S3_REGION ?? 'us-east-1';
  const endpoint = process.env.MALAPOS_S3_ENDPOINT;
  const accessKeyId = process.env.MALAPOS_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.MALAPOS_S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('MALAPOS_S3_ACCESS_KEY_ID + MALAPOS_S3_SECRET_ACCESS_KEY required');
  }
  cached = new S3Client({
    region,
    endpoint,
    forcePathStyle: !!endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // Bound every S3 request. Without this the SDK falls back to its
    // (effectively unbounded) socket defaults — a slow/unreachable
    // Spaces endpoint would otherwise hang the presign indefinitely.
    requestHandler: { connectionTimeout: 5_000, requestTimeout: 10_000 },
    maxAttempts: 2,
  });
  return cached;
}

function bucket(): string {
  const b = process.env.MALAPOS_S3_BUCKET;
  if (!b) throw new Error('MALAPOS_S3_BUCKET env var required');
  return b;
}

/**
 * Presigned PUT URL. When `publicRead` is set the signature includes
 * the `public-read` ACL — the client PUT MUST then send the matching
 * `x-amz-acl: public-read` header (along with the signed Content-Type)
 * or DO Spaces returns 403.
 */
export async function presignPut(
  key: string,
  contentType: string,
  ttlSeconds = 300,
  opts: { publicRead?: boolean } = {},
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
    ...(opts.publicRead ? { ACL: 'public-read' } : {}),
  });
  return getSignedUrl(client(), cmd, { expiresIn: ttlSeconds });
}

/** Final, anonymously-loadable URL for an uploaded object. */
export function publicUrl(key: string): string {
  const base = process.env.MALAPOS_S3_PUBLIC_BASE;
  if (base) return `${base.replace(/\/$/, '')}/${key}`;
  const endpoint = process.env.MALAPOS_S3_ENDPOINT;
  if (endpoint) return `${endpoint.replace(/\/$/, '')}/${bucket()}/${key}`;
  const region = process.env.MALAPOS_S3_REGION ?? 'us-east-1';
  return `https://${bucket()}.s3.${region}.amazonaws.com/${key}`;
}
