'use client'
import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { extractSessionCode } from '@/lib/session-code';

interface QrScannerProps {
  onCode: (code: string) => void;
  onClose: () => void;
}

export default function QrScanner({ onCode, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    let firstFrame = true;

    // If no frames ever arrive, say so rather than showing a dead black box.
    const stall = setTimeout(() => {
      if (!stopped) setError('The camera did not start. Enter the code instead.');
    }, 8000);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const stop = () => {
      stopped = true;
      clearTimeout(stall);
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };

    const read = () => {
      const video = videoRef.current;
      if (stopped || !video || !ctx) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        if (firstFrame) {
          firstFrame = false;
          clearTimeout(stall);
          setReady(true);
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(image.data, image.width, image.height, {
          inversionAttempts: 'dontInvert',
        });

        const code = found ? extractSessionCode(found.data) : null;
        if (code) {
          stop();
          onCode(code);
          return;
        }
      }
      frame = requestAnimationFrame(read);
    };

    const start = async () => {
      // getUserMedia is only exposed on HTTPS and localhost.
      if (!window.isSecureContext) {
        setError('The camera needs a secure connection (https). Enter the code instead.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser will not open the camera. Enter the code instead.');
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      } catch {
        setError('Camera access was blocked. Allow it in your browser, or enter the code.');
        return;
      }

      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay rejection still leaves the frames readable in practice.
      }
      read();
    };

    start();
    return stop;
  }, [onCode]);

  return (
    <div
      className="fixed inset-0 bg-ink/50 flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-paper shadow-[0_20px_50px_-12px_rgba(25,28,26,0.35)] p-6 w-full max-w-sm animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-mono font-medium text-lg text-ink">Scan a code</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Point the camera at the other phone.
        </p>

        <div className="mt-5 relative bg-ink/90 aspect-square overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {!error && ready && (
            <div className="absolute inset-8 border-2 border-paper/70 pointer-events-none" />
          )}
          {!error && !ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-paper/80">
                Starting the camera
              </p>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <p className="text-center text-sm text-paper">{error}</p>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full font-mono text-[0.6875rem] uppercase tracking-[0.14em] px-4 py-2.5 border border-ink/20 text-ink hover:border-ink/50 hover:bg-paper-edge transition-colors duration-150"
        >
          Enter the code instead
        </button>
      </div>
    </div>
  );
}
