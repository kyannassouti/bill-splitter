'use client'
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { joinUrl } from '@/lib/session-code';

interface SessionQrProps {
  code: string;
  onClose: () => void;
}

export default function SessionQr({ code, onClose }: SessionQrProps) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const link = joinUrl(code);

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, {
      margin: 1,
      width: 640,
      color: { dark: '#191C1A', light: '#FBF9F5' },
    })
      .then(setQr)
      .catch(() => setQr(''));
  }, [link]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-paper shadow-[0_20px_50px_-12px_rgba(25,28,26,0.35)] p-6 w-full max-w-sm animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-mono font-medium text-lg text-ink">Bring people in</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Point a phone camera at this, or pass on the code.
        </p>

        <div className="mt-5 flex justify-center">
          {qr ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={qr}
              alt={`QR code to join session ${code}`}
              className="w-56 h-56 border border-paper-deep"
            />
          ) : (
            <div className="w-56 h-56 bg-paper-deep animate-skeleton" />
          )}
        </div>

        <p className="mt-5 text-center font-mono text-2xl tracking-[0.3em] text-ink">
          {code}
        </p>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleCopy}
            className="flex-1 font-mono text-[0.6875rem] uppercase tracking-[0.14em] px-4 py-2.5 border border-ink/20 text-ink hover:border-ink/50 hover:bg-paper-edge transition-colors duration-150"
          >
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 font-mono text-[0.6875rem] uppercase tracking-[0.14em] px-4 py-2.5 bg-pine text-paper hover:bg-pine-deep transition-colors duration-150"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
