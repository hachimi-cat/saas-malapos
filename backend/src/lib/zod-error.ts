import type { ZodError } from 'zod';
import { ApiError } from './http.js';

/**
 * Convert a ZodError into the Forjio ApiError shape. Pick the first
 * issue; put its dot-joined path in `param` for precise client
 * diagnostics.
 */
export function validationError(e: ZodError): ApiError {
  const first = e.issues[0];
  const param = first?.path.join('.') || undefined;
  const message = first?.message ?? 'validation failed';
  return new ApiError(400, 'VALIDATION_ERROR', message, param);
}
