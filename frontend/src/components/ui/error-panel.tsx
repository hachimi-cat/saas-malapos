'use client';

/**
 * Reusable error panel. Ported from saas-plugipay.
 *
 * Template uses inline styles + CSS custom properties (vs plugipay's
 * Tailwind). Products that add Tailwind can drop-in the plugipay
 * version — this file is intentionally styling-library-agnostic.
 */

export interface ErrorPanelProps {
  title?: string;
  message?: string;
  code?: string;
  onRetry?: () => void;
}

export function ErrorPanel({ title, message, code, onRetry }: ErrorPanelProps) {
  return (
    <div
      role="alert"
      style={{
        borderRadius: 12,
        border: '1px solid #fecaca',
        background: '#fef2f2',
        color: '#991b1b',
        padding: 24,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
      }}
    >
      <span aria-hidden style={{ fontSize: 20, lineHeight: 1, marginTop: 2 }}>
        ⚠
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          {title ?? 'Something went wrong'}
        </h3>
        <p style={{ fontSize: 14, margin: '4px 0 0', lineHeight: 1.5 }}>
          {message ?? 'The request failed. Try again in a moment.'}
        </p>
        {code && (
          <p
            style={{
              fontSize: 11,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
              opacity: 0.75,
              margin: '8px 0 0',
            }}
          >
            code: {code}
          </p>
        )}
        {onRetry && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={onRetry}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #fca5a5',
                background: '#fff',
                color: '#991b1b',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
