import { MarketingNav, MarketingFooter } from '@forjio/website-ui';
import { LogoMark } from '@/components/brand/logo';

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
        brandIcon={<LogoMark size={24} className="text-primary" />}
        brandName={brand}
      />
      <div className="flex-1">{children}</div>
      <MarketingFooter
        brandIcon={<LogoMark size={20} className="text-primary" />}
        brandName={brand}
        brandTagline={`${brand} — part of the Forjio family.`}
        copyrightSuffix="part of the Forjio family."
      />
    </div>
  );
}
