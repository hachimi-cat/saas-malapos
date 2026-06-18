import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    // Scan the shared marketing-chrome package so its Tailwind classes
    // (used inside MarketingNav / Footer / docs scaffold) get extracted
    // into our CSS bundle. Required by every consumer of @forjio/website-ui.
    './node_modules/@forjio/website-ui/dist/**/*.{js,cjs}',
    // Same for portal-ui (dashboard + buyer-portal Sidebar/shell) and
    // auth-ui (login/signup). WITHOUT these globs, classes used only
    // inside those packages aren't generated — which left the Sidebar
    // `position: sticky` but `top: auto` (no anchor → it scrolled with
    // the body instead of staying fixed). Keep all three.
    './node_modules/@forjio/portal-ui/dist/**/*.{js,cjs}',
    './node_modules/@forjio/auth-ui/dist/**/*.{js,cjs}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
        display: ['var(--font-display)', 'Gellix', 'var(--font-sans)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
