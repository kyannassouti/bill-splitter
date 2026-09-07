'use client';
import { useEffect, useState } from 'react';

const TAX = 0.13;
const TIP = 0.15;

const PEOPLE = [
  { name: 'Maya', color: 'var(--color-claim-1)' },
  { name: 'Alex', color: 'var(--color-claim-2)' },
  { name: 'Sam', color: 'var(--color-claim-3)' },
];

const ITEMS = [
  { name: 'Margherita Pizza', price: 14.99, qty: 1 },
  { name: 'Caesar Salad', price: 9.5, qty: 2 },
  { name: 'Garlic Bread', price: 4.25, qty: 3 },
  { name: 'Sparkling Water', price: 3.0, qty: 4 },
];

/** The order claims arrive in. Portion is the fraction of the whole line. */
const SCRIPT = [
  { item: 0, person: 0, portion: 1 / 2, frac: '1/2' },
  { item: 0, person: 1, portion: 1 / 2, frac: '1/2' },
  { item: 1, person: 0, portion: 1 / 2, frac: '1 of 2' },
  { item: 1, person: 2, portion: 1 / 2, frac: '1 of 2' },
  { item: 2, person: 1, portion: 2 / 3, frac: '2 of 3' },
  { item: 2, person: 2, portion: 1 / 3, frac: '1 of 3' },
  { item: 3, person: 0, portion: 1 / 4, frac: '1 of 4' },
  { item: 3, person: 1, portion: 1 / 4, frac: '1 of 4' },
  { item: 3, person: 2, portion: 1 / 2, frac: '2 of 4' },
];

const lineTotal = (i: number) => ITEMS[i].price * ITEMS[i].qty;
const BILL_SUBTOTAL = ITEMS.reduce((s, _, i) => s + lineTotal(i), 0);

export default function ReceiptDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      // Show the finished split and stop, rather than looping.
      if (step === SCRIPT.length) return;
      const settle = setTimeout(() => setStep(SCRIPT.length), 0);
      return () => clearTimeout(settle);
    }

    const done = step >= SCRIPT.length;
    const timer = setTimeout(
      () => setStep(done ? 0 : step + 1),
      done ? 3000 : 780
    );
    return () => clearTimeout(timer);
  }, [step]);

  const claims = SCRIPT.slice(0, step);
  const claimsFor = (item: number) => claims.filter((c) => c.item === item);

  const claimedSubtotal = claims.reduce(
    (sum, c) => sum + lineTotal(c.item) * c.portion,
    0
  );
  const coverage = Math.round((claimedSubtotal / BILL_SUBTOTAL) * 100);

  const personSubtotal = (person: number) =>
    claims
      .filter((c) => c.person === person)
      .reduce((sum, c) => sum + lineTotal(c.item) * c.portion, 0);

  // Everyone's total, in cents, reconciled so the shares add up to the claimed
  // amount exactly. Rounding each share on its own leaks a cent or two.
  const personCents = (() => {
    const exact = PEOPLE.map((_, i) => personSubtotal(i) * (1 + TAX + TIP) * 100);
    const cents = exact.map(Math.floor);
    const target = Math.round(claimedSubtotal * (1 + TAX + TIP) * 100);
    let short = target - cents.reduce((a, b) => a + b, 0);

    // Hand the leftover cents to the largest fractions first.
    const byFraction = exact
      .map((value, i) => ({ i, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction);

    for (let k = 0; short > 0; k++, short--) {
      cents[byFraction[k % byFraction.length].i] += 1;
    }
    return cents;
  })();

  return (
    <div
      role="img"
      aria-label="A sample bill splitting live: three people each claim their own share of four items until the whole bill is covered."
      className="relative w-full max-w-[21rem] mx-auto"
    >
      <div className="bg-paper shadow-[0_1px_2px_rgba(25,28,26,0.06),0_12px_32px_-12px_rgba(25,28,26,0.22)] px-6 pt-6 pb-8 font-mono text-ink">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-[0.625rem] tracking-[0.22em] text-pine">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-pine opacity-70 motion-safe:animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pine" />
            </span>
            LIVE
          </div>
          <p className="mt-2 text-sm tracking-[0.3em] font-medium">X7K9M2</p>
          <p className="mt-1 text-[0.6875rem] text-ink-soft tracking-wide">
            3 people · 4 items
          </p>
        </div>

        <div className="my-4 border-t border-dashed border-paper-deep" />

        {/* Items */}
        <ul className="space-y-3.5">
          {ITEMS.map((item, i) => {
            const itemClaims = claimsFor(i);
            const claimed = itemClaims.reduce((s, c) => s + c.portion, 0);

            return (
              <li key={item.name}>
                <div className="flex items-baseline text-[0.8125rem]">
                  <span className="font-medium">{item.name}</span>
                  <span className="leader" />
                  <span className="tabular-nums">
                    {lineTotal(i).toFixed(2)}
                  </span>
                </div>

                {item.qty > 1 && (
                  <p className="text-[0.625rem] text-ink-faint mt-0.5">
                    {item.qty} × {item.price.toFixed(2)}
                  </p>
                )}

                {/* Segmented claim bar */}
                <div className="mt-1.5 flex h-[3px] w-full overflow-hidden bg-paper-deep">
                  {itemClaims.map((c, idx) => (
                    <div
                      key={idx}
                      className="h-full transition-[width] duration-500 ease-out"
                      style={{
                        width: `${c.portion * 100}%`,
                        background: PEOPLE[c.person].color,
                      }}
                    />
                  ))}
                </div>

                {/* Who claimed what */}
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 min-h-[0.875rem]">
                  {itemClaims.map((c, idx) => (
                    <span
                      key={idx}
                      className="flex items-center gap-1 text-[0.625rem] tracking-wide animate-print-in"
                      style={{ color: PEOPLE[c.person].color }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: PEOPLE[c.person].color }}
                      />
                      {PEOPLE[c.person].name.toUpperCase()}
                      <span className="text-ink-faint">{c.frac}</span>
                    </span>
                  ))}
                  {claimed === 0 && (
                    <span className="text-[0.625rem] text-ink-faint tracking-wide">
                      unclaimed
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="my-4 border-t border-dashed border-paper-deep" />

        {/* Coverage */}
        <div className="flex items-baseline text-[0.75rem] tracking-wide">
          <span className="text-ink-soft">CLAIMED</span>
          <span className="leader" />
          <span className="tabular-nums font-medium">{coverage}%</span>
        </div>

        <div className="my-4 border-t border-dashed border-paper-deep" />

        {/* Per-person totals */}
        <ul className="space-y-1.5">
          {PEOPLE.map((person, i) => {
            const total = personCents[i] / 100;
            return (
              <li key={person.name} className="flex items-baseline text-[0.8125rem]">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: person.color }}
                  />
                  {person.name}
                </span>
                <span className="leader" />
                <span className="tabular-nums font-medium">
                  ${total.toFixed(2)}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 pt-3 border-t border-ink/15 flex items-baseline text-[0.8125rem] font-medium">
          <span>TOTAL</span>
          <span className="leader" />
          <span className="tabular-nums">
            ${(BILL_SUBTOTAL * (1 + TAX + TIP)).toFixed(2)}
          </span>
        </div>

        <p className="mt-2 text-[0.625rem] text-ink-faint text-center tracking-wide">
          incl. 13% tax · 15% tip
        </p>
      </div>

      {/* Torn bottom edge */}
      <svg
        viewBox="0 0 336 10"
        preserveAspectRatio="none"
        className="block w-full h-2.5 drop-shadow-[0_6px_10px_rgba(25,28,26,0.10)]"
        aria-hidden="true"
      >
        <path
          d="M0 0 L8 10 L16 0 L24 10 L32 0 L40 10 L48 0 L56 10 L64 0 L72 10 L80 0 L88 10 L96 0 L104 10 L112 0 L120 10 L128 0 L136 10 L144 0 L152 10 L160 0 L168 10 L176 0 L184 10 L192 0 L200 10 L208 0 L216 10 L224 0 L232 10 L240 0 L248 10 L256 0 L264 10 L272 0 L280 10 L288 0 L296 10 L304 0 L312 10 L320 0 L328 10 L336 0 L336 0 L0 0 Z"
          fill="#FBF9F5"
        />
      </svg>
    </div>
  );
}
