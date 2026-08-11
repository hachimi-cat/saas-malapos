import { api } from '@/lib/api';

/**
 * Malapos image upload — the presigned-PUT flow extracted from the
 * products page's ImageField so the agentic sheet and the hand-built
 * form share ONE write path.
 *
 * Asks the backend for a presigned public-read PUT URL
 * (`POST /uploads/sign`), uploads the file straight to DO Spaces, then
 * resolves the resulting public URL. The PUT MUST send exactly the
 * headers the presign signed — `Content-Type` + `x-amz-acl: public-read`
 * — or Spaces returns 403.
 */
export async function uploadImageToSpaces(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pick an image file (JPG / PNG / WebP).');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image too large — max 5MB.');
  }
  const ext = file.name.includes('.') ? file.name.split('.').pop() : undefined;
  const { data } = await api.post<{
    key: string;
    url: string;
    publicUrl: string;
    contentType: string;
  }>('/uploads/sign', { contentType: file.type, ext });
  // Direct-to-Spaces PUT. Use the signed content-type and the
  // public-read ACL header the presign signed — both, exactly.
  const put = await fetch(data.url, {
    method: 'PUT',
    headers: { 'Content-Type': data.contentType, 'x-amz-acl': 'public-read' },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);
  return data.publicUrl;
}

/**
 * Upload an image with an instant local preview — the callback contract
 * @forjio/agent-ui's `image` field kind expects (storlaunch's
 * uploadWithPreview is the reference shape).
 *
 * Renders a blob URL from the File synchronously so the caller can
 * `<img src>` it immediately, then runs the SAME presigned upload the
 * products form uses and swaps in the server URL when done. On error,
 * clears the preview and reports the message.
 */
export async function uploadWithPreview(
  file: File,
  {
    onPreview,
    onReady,
    onError,
  }: {
    /** Called synchronously with a blob: URL the caller can render immediately. */
    onPreview: (previewUrl: string) => void;
    /** Called after upload succeeds. Caller should replace previewUrl with serverUrl. */
    onReady: (serverUrl: string, previewUrl: string) => void;
    /** Called on upload failure. Caller should clean up the previewUrl. */
    onError: (message: string, previewUrl: string) => void;
  },
): Promise<void> {
  const blobUrl = URL.createObjectURL(file);
  onPreview(blobUrl);
  try {
    const url = await uploadImageToSpaces(file);
    onReady(url, blobUrl);
    // Revoke on next tick so the `<img>` has had a chance to re-render
    // with the server URL before we free the blob.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
  } catch (err) {
    // ApiRequestError already carries the server's own message.
    onError(err instanceof Error && err.message ? err.message : 'Upload failed', blobUrl);
    URL.revokeObjectURL(blobUrl);
  }
}
