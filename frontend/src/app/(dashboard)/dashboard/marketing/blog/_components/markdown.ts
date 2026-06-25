'use client';

import { marked } from 'marked';

/*
 * Blog body → HTML for the editor preview. storlaunch uses
 * `sanitize-html`; that dependency isn't part of the Malapos template,
 * so we render with `marked` (already a dep) and run a lightweight
 * sanitization pass that strips the dangerous vectors (script/style/
 * iframe/object/embed tags, inline `on*` handlers, and javascript:
 * URLs). The blog body is merchant-authored content shown back to the
 * same merchant in their own dashboard preview.
 */

marked.setOptions({ breaks: true, gfm: true });

function sanitize(html: string): string {
  return html
    .replace(/<\/?(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1=$2#$2');
}

export function renderMarkdown(body: string): string {
  try {
    const html = marked.parse(body, { async: false }) as string;
    return sanitize(html);
  } catch {
    return '';
  }
}
