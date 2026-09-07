'use client'
import { useState } from 'react';

interface Participant {
  id: string;
  name: string;
}

interface ParticipantsBadgeProps {
  participants: Participant[];
  currentUserId: string | null;
}

export default function ParticipantsBadge({ participants, currentUserId }: ParticipantsBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-pine/10 text-pine font-mono text-xs font-medium cursor-default">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
        {participants.length}
      </span>

      {showTooltip && participants.length > 0 && (
        <div className="absolute top-full left-0 mt-1.5 bg-paper shadow-[0_10px_30px_-10px_rgba(25,28,26,0.30)] border border-paper-deep py-2 px-3 z-50 min-w-36 animate-fade-in">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-1">Participants</p>
          {participants.map((p) => (
            <p key={p.id} className="text-sm text-ink py-0.5">
              {p.name}{p.id === currentUserId && <span className="text-ink-faint ml-1">(you)</span>}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
