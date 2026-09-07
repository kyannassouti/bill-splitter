'use client'
import { Item, ItemShare } from "@/types/types";
import { supabase } from "@/lib/supabase";
import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ParticipantsBadge from '@/components/ui/ParticipantsBadge';


export default function TaxTipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const currentUserId = typeof window !== 'undefined' ? sessionStorage.getItem('participantId') : null;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participantNames, setParticipantNames] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [shares, setShares] = useState<ItemShare[]>([]);
  const [taxPercent, setTaxPercent] = useState(0.13);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTipPercent, setSelectedTipPercent] = useState<number | undefined>();
  const [customTip, setCustomTip] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!currentUserId) {
        setLoading(false);
        return;
      }

      // Look up session by code
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, tax_percent')
        .eq('code', id)
        .single();

      if (sessionError || !session) {
        console.error('Failed to fetch session:', sessionError);
        setLoading(false);
        return;
      }

      setSessionId(session.id);
      setTaxPercent(Number(session.tax_percent));

      // Fetch participants
      const { data: pData } = await supabase
        .from('participants')
        .select('id, name')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true });

      if (pData) {
        setParticipantNames(pData);
      }

      // Fetch items for this session
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true });

      if (itemsError) {
        console.error('Failed to fetch items:', itemsError);
        setLoading(false);
        return;
      }

      const fetchedItems = itemsData.map((item) => ({
        id: item.id,
        name: item.name,
        price: Number(item.price),
        qty: item.qty,
      }));
      setItems(fetchedItems);

      // Fetch user's item_shares
      const sessionItemIds = itemsData.map(i => i.id);
      const { data: sharesData, error: sharesError } = await supabase
        .from('item_shares')
        .select('*')
        .eq('participant_id', currentUserId)
        .in('item_id', sessionItemIds);

      if (sharesError) {
        console.error('Failed to fetch shares:', sharesError);
      } else if (sharesData) {
        setShares(sharesData.map(s => ({
          participantId: s.participant_id,
          itemId: s.item_id,
          proportion: Number(s.proportion),
          splitMethod: s.split_method as 'qty' | 'percentage',
        })));
      }

      setLoading(false);
    }

    fetchData();
  }, [id, currentUserId]);

  // Realtime subscription for participants (joins/leaves)
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`participants_taxtip_${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants' },
        (payload) => {
          const record = (payload.new ?? payload.old) as {
            id: string;
            name: string;
            session_id: string;
          } | undefined;

          if (!record || record.session_id !== sessionId) return;

          if (payload.eventType === 'INSERT') {
            setParticipantNames(prev => {
              if (prev.some(p => p.id === record.id)) return prev;
              return [...prev, { id: record.id, name: record.name }];
            });
          } else if (payload.eventType === 'DELETE') {
            setParticipantNames(prev => prev.filter(p => p.id !== record.id));
          } else if (payload.eventType === 'UPDATE') {
            setParticipantNames(prev =>
              prev.map(p => p.id === record.id ? { ...p, name: record.name } : p)
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const userSelectedShares = shares.filter(
    share => share.participantId === currentUserId && share.proportion > 0
  );

  // Calculate subtotal
  const subtotal = userSelectedShares.reduce((total, share) => {
    const item = items.find(item => item.id === share.itemId);
    if (item) {
      const itemTotal = item.price * item.qty;
      const userShare = itemTotal * share.proportion;
      return total + userShare;
    }
    return total;
  }, 0);

  // Calculate tax
  const taxAmount = subtotal * taxPercent;

  // Calculate tip amount
  const tipAmount = selectedTipPercent ? (subtotal) * (selectedTipPercent / 100) : 0;

  // Calculate final total
  const finalTotal = subtotal + taxAmount + tipAmount;

  const handleContinue = async () => {
    if (!currentUserId) return;
    setSaving(true);

    // Save tip_percent and mark as submitted
    const { error } = await supabase
      .from('participants')
      .update({ tip_percent: selectedTipPercent || 0, submitted_at: new Date().toISOString() })
      .eq('id', currentUserId);

    if (error) {
      console.error('Failed to save tip:', error);
      setSaving(false);
      return;
    }

    router.push(`/session/${id}/summary`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-paper-edge px-5 py-8 sm:p-8 pb-24">
        <div className="max-w-2xl mx-auto">
          <div className="h-9 w-40 bg-paper-deep animate-skeleton mb-2" />
          <div className="h-5 w-32 bg-paper-deep rounded-full animate-skeleton mb-6" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-paper shadow-[0_1px_2px_rgba(25,28,26,0.06)] p-6 mb-4">
              <div className="h-6 w-28 bg-paper-deep animate-skeleton mb-3" />
              <div className="space-y-2">
                <div className="h-4 w-full bg-paper-deep animate-skeleton" />
                <div className="h-4 w-3/4 bg-paper-deep animate-skeleton" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper-edge px-5 py-8 sm:p-8 pb-24">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-mono font-medium tracking-[-0.02em] text-ink mb-2">Tax and tip</h1>
        <div className="flex items-center gap-2 mb-6">
          <span className="inline-flex items-center px-2.5 py-1 bg-pine/10 text-pine font-mono text-xs tracking-[0.2em]">{id}</span>
          <ParticipantsBadge participants={participantNames} currentUserId={currentUserId} />
        </div>

        {/* Itemized Receipt Breakdown */}
        <div className="bg-paper shadow-[0_1px_2px_rgba(25,28,26,0.06)] transition-shadow duration-200 p-6 mb-4">
          <h2 className="font-mono font-medium text-lg text-ink mb-3">Your items</h2>

          <div className="space-y-2 mb-4">
            {userSelectedShares.map((share) => {
              const item = items.find(i => i.id === share.itemId);
              if (!item) return null;

              const itemTotal = item.price * item.qty;
              const userShare = itemTotal * share.proportion;

              return (
                <div key={share.itemId}>
                  <div className="flex items-baseline font-mono text-[0.8125rem]">
                    <p className="text-ink">{item.name}</p>
                    <span className="leader" />
                    <p className="text-ink tabular-nums">${userShare.toFixed(2)}</p>
                  </div>
                  <p className="font-mono text-[0.6875rem] text-ink-faint">
                    ${item.price.toFixed(2)} × {item.qty} × {(share.proportion * 100).toFixed(0)}%
                  </p>
                </div>
              );
            })}
          </div>

          <div className="border-t border-ink/15 pt-3 mt-3 flex items-baseline font-mono text-[0.8125rem] font-medium">
            <p className="text-ink">Subtotal</p>
            <span className="leader" />
            <p className="text-ink tabular-nums">${subtotal.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-paper shadow-[0_1px_2px_rgba(25,28,26,0.06)] transition-shadow duration-200 p-6 mb-4">
        <h2 className="font-mono font-medium text-lg text-ink mb-3">Tax</h2>
        <div className="space-y-1.5 mb-2">
          <div className="flex items-baseline font-mono text-[0.8125rem]">
            <p className="text-ink-soft">Subtotal</p>
            <span className="leader" />
            <p className="text-ink tabular-nums">${subtotal.toFixed(2)}</p>
          </div>
          <div className="flex items-baseline font-mono text-[0.8125rem]">
            <p className="text-ink-soft">Tax ({(taxPercent * 100).toFixed(0)}%)</p>
            <span className="leader" />
            <p className="text-ink tabular-nums">${taxAmount.toFixed(2)}</p>
          </div>
        </div>

        <div className="border-t border-ink/15 pt-2 mt-2 flex items-baseline font-mono text-[0.8125rem] font-medium">
          <p className="text-ink">Subtotal + tax</p>
          <span className="leader" />
          <p className="text-ink tabular-nums">${(subtotal + taxAmount).toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-paper shadow-[0_1px_2px_rgba(25,28,26,0.06)] transition-shadow duration-200 p-6 mb-4">
        <h2 className="font-mono font-medium text-lg text-ink mb-3">Tip</h2>

        <div className="flex flex-col items-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {[15, 18, 20, 25].map((p) => (
              <button
                key={p}
                onClick={() => { setCustomTip(false); setSelectedTipPercent(p); }}
                className={`font-medium px-4 py-2 border border-paper-deep bg-paper text-ink hover:bg-paper-edge transition-colors duration-150 ${
                  !customTip && selectedTipPercent === p ? 'outline-none ring-2 ring-pine bg-pine/5' : ''
                }`}
              >
                {p}%
              </button>
            ))}
            <button
              onClick={() => { setCustomTip(true); setSelectedTipPercent(undefined); }}
              className={`font-medium px-4 py-2 border border-paper-deep bg-paper text-ink hover:bg-paper-edge transition-colors duration-150 ${
                customTip ? 'outline-none ring-2 ring-pine bg-pine/5' : ''
              }`}
            >
              Custom
            </button>
          </div>
          {customTip && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={selectedTipPercent ?? ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? undefined : Number(e.target.value);
                  if (val === undefined || (val >= 0 && val <= 100)) {
                    setSelectedTipPercent(val);
                  }
                }}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                className="w-20 px-3 py-2 border border-paper-deep text-center focus:outline-none focus:ring-2 focus:ring-pine"
              />
              <span className="text-ink font-bold">%</span>
            </div>
          )}
        </div>

        <div className="border-t border-ink/15 pt-2 mt-4 flex items-baseline font-mono text-[0.8125rem] font-medium">
          <p className="text-ink">Tip ({selectedTipPercent || 0}%)</p>
          <span className="leader" />
          <p className="text-ink tabular-nums">${tipAmount.toFixed(2)}</p>
        </div>
      </div>

      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-paper/95 backdrop-blur-sm border-t border-paper-deep p-4">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <button
            onClick={() => router.push(`/session/${id}/items`)}
            className="border border-ink/20 text-ink font-medium px-8 py-3 hover:border-ink/50 hover:bg-paper-edge transition-colors duration-150"
          >
            Back
          </button>
          <div>
            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-soft">Final total</p>
            <p className="text-2xl font-mono font-medium text-ink tabular-nums mt-0.5">${finalTotal.toFixed(2)}</p>
          </div>
          <button
            onClick={handleContinue}
            disabled={saving}
            className="bg-pine text-white font-bold px-8 py-3 hover:bg-pine-deep disabled:opacity-50 transition-colors duration-150"
          >
            {saving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
