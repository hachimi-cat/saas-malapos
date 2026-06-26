import { Router } from 'express';
import { z } from 'zod';
import { newId } from '../lib/ids.js';
import { sendCreated, ApiError } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { presignPut, publicUrl } from '../lib/s3.js';

/*
 * /api/v1/uploads — presigned direct-to-Spaces uploads (behind requireAuth).
 *
 *   POST /sign   body { contentType, ext? } → { key, url, publicUrl, contentType }
 *
 * The client PUTs the file directly to `url` with the SAME headers that
 * were signed — `Content-Type: <contentType>` AND `x-amz-acl: public-read`
 * (presignPut signs the public-read ACL). Once stored, the object is
 * anonymously loadable at `publicUrl`. Used by the product form to host
 * product images. Ported from saas-ripllo.
 */

const router = Router();

// Allowed image content types → file extension for the key.
const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/avif': 'avif',
};

const signSchema = z.object({
  contentType: z.string().trim().min(1),
  // Optional caller-supplied extension (e.g. from the filename); we
  // prefer the content-type-derived one and only fall back to this.
  ext: z.string().trim().max(8).optional(),
});

router.post(
  '/sign',
  asyncHandler(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const { contentType, ext } = signSchema.parse(req.body);

    const ct = contentType.toLowerCase();
    if (!ct.startsWith('image/') || !IMAGE_EXT[ct]) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Only image uploads are allowed', 'contentType');
    }
    const extension = (IMAGE_EXT[ct] ?? ext ?? 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';

    const key = `products/${accountId}/${newId('prd')}.${extension}`;
    try {
      const url = await presignPut(key, ct, 300, { publicRead: true });
      sendCreated(res, req, { key, url, publicUrl: publicUrl(key), contentType: ct });
    } catch (e) {
      throw new ApiError(503, 'S3_UNAVAILABLE', (e as Error).message);
    }
  }),
);

export default router;
