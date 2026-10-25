'use client'
import { useState } from 'react';
import { SessionTip } from '@/lib/session-tip';

const PRESETS = [15, 18, 20, 25];

interface TipControlProps {
  tip: SessionTip;
  onChange: (tip: SessionTip) => void;
}

/** The host's tip editor: a percent of the pre-tax bill, or the dollar amount from the receipt. */
export default function TipControl({ tip, onChange }: TipControlProps) {
  const isCustomPercent = tip.percent !== null && !PRESETS.includes(tip.percent);
  const [customOpen, setCustomOpen] = useState(isCustomPercent);
  // Inputs keep their own text so half-typed values like "17." aren't rewritten mid-edit.
  const [percentText, setPercentText] = useState(isCustomPercent ? String(tip.percent) : '');
  const [amountText, setAmountText] = useState(tip.amount !== null ? String(tip.amount) : '');

  const optionClass = (selected: boolean) =>
    `font-medium px-4 py-2 border border-paper-deep bg-paper text-ink hover:bg-paper-edge transition-colors duration-150 ${
      selected ? 'outline-none ring-2 ring-pine bg-pine/5' : ''
    }`;
  const modeClass = (selected: boolean) =>
    `flex-1 font-mono text-[0.6875rem] uppercase tracking-[0.14em] px-3 py-2 transition-colors duration-150 ${
      selected ? 'bg-pine text-paper' : 'text-ink-soft hover:text-ink'
    }`;
  const inputClass =
    'w-24 px-3 py-2 border border-paper-deep bg-white text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-pine';

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex w-full max-w-xs border border-paper-deep" role="group" aria-label="Tip type">
        <button onClick={() => onChange({ ...tip, mode: 'percent' })} className={modeClass(tip.mode === 'percent')}>
          Percent
        </button>
        <button onClick={() => onChange({ ...tip, mode: 'amount' })} className={modeClass(tip.mode === 'amount')}>
          Dollar amount
        </button>
      </div>

      {tip.mode === 'percent' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => { setCustomOpen(false); onChange({ ...tip, percent: p }); }}
                className={optionClass(!customOpen && tip.percent === p)}
              >
                {p}%
              </button>
            ))}
            <button onClick={() => setCustomOpen(true)} className={optionClass(customOpen)}>
              Custom
            </button>
          </div>
          {customOpen && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.5"
                autoFocus
                value={percentText}
                onChange={(e) => {
                  setPercentText(e.target.value);
                  const val = e.target.value === '' ? null : Number(e.target.value);
                  if (val === null || (val >= 0 && val <= 100)) onChange({ ...tip, percent: val });
                }}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                className={inputClass}
              />
              <span className="text-ink font-bold">%</span>
            </div>
          )}
          <p className="text-xs text-ink-faint">Applied to each person&apos;s subtotal before tax.</p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-ink font-bold">$</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amountText}
              onChange={(e) => {
                setAmountText(e.target.value);
                const val = e.target.value === '' ? null : Number(e.target.value);
                if (val === null || val >= 0) onChange({ ...tip, amount: val });
              }}
              onFocus={(e) => e.target.select()}
              placeholder="0.00"
              className={inputClass}
            />
          </div>
          <p className="text-xs text-ink-faint">
            The tip on the receipt. Each person pays a part of it in proportion to what they ordered.
          </p>
        </>
      )}
    </div>
  );
}
