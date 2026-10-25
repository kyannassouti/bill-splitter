'use client'
import { useState } from 'react';
import TipControl from '@/components/ui/TipControl';
import { SessionTip, describeTip, isTipSet } from '@/lib/session-tip';

interface TipButtonProps {
  tip: SessionTip;
  billSubtotal: number;
  isHost: boolean;
  hostName: string;
  onChange: (tip: SessionTip) => void;
}

/** Header chip showing the bill's tip. Only the host can tap it to set the tip. */
export default function TipButton({ tip, billSubtotal, isHost, hostName, onChange }: TipButtonProps) {
  const [open, setOpen] = useState(false);
  const set = isTipSet(tip);
  const label = set ? `Tip ${describeTip(tip, billSubtotal)}` : isHost ? 'Set tip' : 'Tip not set';
  const chipClass = 'inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-xs font-medium';

  if (!isHost) {
    return (
      <span
        className={`${chipClass} bg-pine/10 text-pine cursor-default`}
        title={set ? `${hostName} set the tip for the whole bill` : `${hostName} hasn't set the tip yet`}
      >
        {label}
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Set the tip for the whole bill"
        className={`${chipClass} transition-colors duration-150 ${
          set ? 'bg-pine/10 text-pine hover:bg-pine/20' : 'bg-flag/15 text-flag hover:bg-flag/25'
        }`}
      >
        {label}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4 animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-paper shadow-[0_20px_50px_-12px_rgba(25,28,26,0.35)] p-6 w-full max-w-sm animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-mono font-medium text-lg text-ink">Tip for the whole bill</h2>
            <p className="mt-1 mb-5 text-sm text-ink-soft">
              Enter what you tipped when you paid. Everyone&apos;s share includes it, so you get it all back.
            </p>
            <TipControl tip={tip} onChange={onChange} />
            <button
              onClick={() => setOpen(false)}
              className="mt-6 w-full font-mono text-[0.6875rem] uppercase tracking-[0.14em] px-4 py-2.5 bg-pine text-paper hover:bg-pine-deep transition-colors duration-150"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
