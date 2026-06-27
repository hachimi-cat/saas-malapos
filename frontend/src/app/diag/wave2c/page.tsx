'use client';
export const dynamic = 'force-dynamic';

import { Star, Receipt, ArrowDownUp, Gift, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const rupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground font-display">{icon} {title}</h3>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function DiagWave2c() {
  return (
    <div className="min-h-screen bg-background p-10 text-foreground">
      <p className="text-sm text-muted-foreground">customers — detail slide-over as &lt;Sheet&gt; (rendered open)</p>
      <Sheet open onOpenChange={() => {}}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="pr-8 text-left">
            <SheetTitle className="truncate font-display">Budi Santoso</SheetTitle>
            <p className="text-sm text-muted-foreground">+62 811 1234 5678</p>
            <p className="text-sm text-muted-foreground">budi@mail.com</p>
          </SheetHeader>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat icon={<Star className="h-4 w-4" />} label="Points" value="1.250" />
            <Stat label="Lifetime spend" value={rupiah(4250000)} />
            <Stat label="Visits" value="37" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm"><ArrowDownUp className="h-4 w-4" /> Adjust points</Button>
            <Button variant="outline" size="sm"><Gift className="h-4 w-4" /> Redeem</Button>
            <Button variant="outline" size="sm"><Pencil className="h-4 w-4" /> Edit</Button>
            <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>

          <Section title="Recent transactions" icon={<Receipt className="h-4 w-4" />}>
            <ul className="divide-y divide-border">
              {[['#1042', 'Jun 26, 2026 · paid', 70000], ['#1021', 'Jun 20, 2026 · paid', 38000]].map(([n, d, t]) => (
                <li key={n as string} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{n}</p>
                    <p className="text-xs text-muted-foreground">{d}</p>
                  </div>
                  <span className="font-medium">{rupiah(t as number)}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Loyalty ledger" icon={<Star className="h-4 w-4" />}>
            <ul className="divide-y divide-border">
              <li className="flex items-center justify-between py-2 text-sm">
                <div><p>Earned on sale</p><p className="text-xs text-muted-foreground">Jun 26, 2026</p></div>
                <span className="font-semibold text-primary">+70</span>
              </li>
              <li className="flex items-center justify-between py-2 text-sm">
                <div><p>Redeemed</p><p className="text-xs text-muted-foreground">Jun 20, 2026</p></div>
                <span className="font-semibold text-destructive">-500</span>
              </li>
            </ul>
          </Section>
        </SheetContent>
      </Sheet>
    </div>
  );
}
