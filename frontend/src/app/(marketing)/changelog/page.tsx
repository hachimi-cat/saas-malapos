import type { Metadata } from 'next';
import releases from '@/data/changelog.json';

/*
 * FORKERS: changelog entries live in src/data/changelog.json. Each
 * release commit can append an entry there (or wire it into CI).
 */

export const metadata: Metadata = {
  title: 'Changelog',
  description: "What's new in Malapos. Product updates, improvements, and fixes.",
};

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Changelog</h1>
      <p className="mt-2 text-lg text-muted-foreground">
        Product updates, improvements, and fixes.
      </p>

      <div className="mt-12 space-y-12">
        {releases.map(
          (release: { version: string; date: string; title: string; changes: string[] }) => (
            <article key={release.version} className="relative border-l-2 border-border pl-8">
              <div className="absolute -left-2.5 top-0 h-5 w-5 rounded-full border-2 border-primary bg-background" />
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-mono font-medium text-primary">
                  v{release.version}
                </span>
                <time className="text-sm text-muted-foreground">{release.date}</time>
              </div>
              <h2 className="mt-3 text-xl font-semibold">{release.title}</h2>
              <ul className="mt-3 space-y-1.5">
                {release.changes.map((change: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                    {change}
                  </li>
                ))}
              </ul>
            </article>
          ),
        )}
      </div>
    </div>
  );
}
