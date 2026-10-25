'use client'
import { useState } from 'react';
import SessionQr from '@/components/ui/SessionQr';

interface SessionCodeChipProps {
  code: string;
}

/** The session code chip shown under each page title. Tapping it opens the QR code. */
export default function SessionCodeChip({ code }: SessionCodeChipProps) {
  const [showQr, setShowQr] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowQr(true)}
        title="Show the QR code and link for this session"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-pine/10 text-pine font-mono text-xs tracking-[0.2em] hover:bg-pine/20 transition-colors duration-150"
      >
        {code}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5zM13.5 14.25h2.25v2.25H13.5zM18 18.75h2.25V21H18zM13.5 18.75h2.25V21H13.5zM18 14.25h2.25v2.25H18z" />
        </svg>
      </button>
      {showQr && <SessionQr code={code} onClose={() => setShowQr(false)} />}
    </>
  );
}
