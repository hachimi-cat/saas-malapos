import { Hexagon } from 'lucide-react';
import { MarketingNav, MarketingFooter } from '@forjio/website-ui';

/*
 * Auth route-group layout — same marketing chrome as the public site,
 * wrapping the login / signup / password-reset pages. Mirrors every
 * shipped Forjio product.
 */
const brand = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'Malapos';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <MarketingNav
        brandIcon={<Hexagon className="h-6 w-6 text-primary" strokeWidth={2} />}
        brandName={brand}
      />
      <div className="flex-1">{children}</div>
      <MarketingFooter
        brandIcon={<Hexagon className="h-5 w-5 text-primary" strokeWidth={2} />}
        brandName={brand}
        brandTagline={`${brand} — part of the Forjio family.`}
        copyrightSuffix="part of the Forjio family."
      />
    </div>
  );
}
