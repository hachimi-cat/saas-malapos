import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface Props {
  href: string;
  label: string;
}

export function BackLink({ href, label }: Props) {
  return (
    <Link
      href={href}
      className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft size={14} />
      {label}
    </Link>
  );
}
