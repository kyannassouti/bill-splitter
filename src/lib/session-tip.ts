import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * The tip for the whole bill. The host (whoever started the session, who
 * usually paid) sets it once, and everyone's share uses it so the payer is
 * paid back exactly what they tipped.
 */
export interface SessionTip {
  mode: 'percent' | 'amount';
  percent: number | null;  // e.g. 18 for 18%, applied to the pre-tax subtotal
  amount: number | null;   // dollars from the receipt, split by each person's subtotal
}

export const NO_TIP: SessionTip = { mode: 'percent', percent: null, amount: null };

export function isTipSet(tip: SessionTip): boolean {
  return tip.mode === 'percent' ? tip.percent !== null : tip.amount !== null;
}

/** One person's part of the tip, given their pre-tax subtotal and the whole bill's. */
export function tipShare(tip: SessionTip, subtotal: number, billSubtotal: number): number {
  if (tip.mode === 'percent') return subtotal * ((tip.percent ?? 0) / 100);
  if (billSubtotal <= 0) return 0;
  return (tip.amount ?? 0) * (subtotal / billSubtotal);
}

/** Short label like "18%" or "$30.00 (15%)". */
export function describeTip(tip: SessionTip, billSubtotal: number): string {
  if (!isTipSet(tip)) return 'Not set';
  if (tip.mode === 'percent') return `${tip.percent}%`;
  const amount = tip.amount ?? 0;
  if (billSubtotal <= 0) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(2)} (${((amount / billSubtotal) * 100).toFixed(0)}%)`;
}

/** Label for a "Tip (...)" line: "18%", or "share of $30.00" when it's a dollar amount. */
export function tipLineLabel(tip: SessionTip): string {
  if (!isTipSet(tip)) return 'not set';
  if (tip.mode === 'percent') return `${tip.percent}%`;
  return `share of $${(tip.amount ?? 0).toFixed(2)}`;
}

function fromRow(row: { tip_mode: string; tip_percent: number | string | null; tip_amount: number | string | null }): SessionTip {
  return {
    mode: row.tip_mode === 'amount' ? 'amount' : 'percent',
    percent: row.tip_percent === null ? null : Number(row.tip_percent),
    amount: row.tip_amount === null ? null : Number(row.tip_amount),
  };
}

export async function saveSessionTip(sessionId: string, tip: SessionTip) {
  const { error } = await supabase
    .from('sessions')
    .update({ tip_mode: tip.mode, tip_percent: tip.percent, tip_amount: tip.amount })
    .eq('id', sessionId);
  if (error) console.error('Failed to save tip:', error);
}

/**
 * The session's tip, kept live: when the host changes it, every open page
 * updates. The setter only changes local state; call saveSessionTip to store it.
 * `loaded` turns true once the stored tip has been read.
 */
export function useSessionTip(sessionId: string | null) {
  const [tip, setTip] = useState<SessionTip>(NO_TIP);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    supabase
      .from('sessions')
      .select('tip_mode, tip_percent, tip_amount')
      .eq('id', sessionId)
      .single()
      .then(({ data }) => {
        if (data) setTip(fromRow(data));
        setLoaded(true);
      });

    // Unique name per page, so the next page never picks up this one's channel while it's closing.
    const channel = supabase
      .channel(`session_tip_${sessionId}_${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => setTip(fromRow(payload.new as Parameters<typeof fromRow>[0]))
      )
      .subscribe();

    return () => {
      // Not removeChannel: when the last channel goes it closes the shared connection,
      // and the next page's channels then fail to connect without any error.
      channel.unsubscribe();
    };
  }, [sessionId]);

  return [tip, setTip, loaded] as const;
}
