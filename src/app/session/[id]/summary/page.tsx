'use client'
import { Item, ItemShare } from "@/types/types";
import { supabase } from "@/lib/supabase";
import { use, useState, useEffect, useRef } from 'react';
import ParticipantsBadge from '@/components/ui/ParticipantsBadge';

interface ParticipantData {
  id: string;
  name: string;
  tipPercent: number;
  submittedAt: string | null;
}

export default function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const currentUserId = typeof window !== 'undefined' ? sessionStorage.getItem('participantId') : null;

  const [sessionCode, setSessionCode] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [shares, setShares] = useState<ItemShare[]>([]);
  const [allShares, setAllShares] = useState<ItemShare[]>([]);
  const [participants, setParticipants] = useState<ParticipantData[]>([]);
  const [taxPercent, setTaxPercent] = useState(0.13);
  const [tipPercent, setTipPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [groupOpen, setGroupOpen] = useState(false);
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null);

  // Ref to track item IDs for realtime callbacks without causing re-subscriptions
  const itemIdsRef = useRef<string[]>([]);
  useEffect(() => {
    itemIdsRef.current = items.map(i => i.id);
  }, [items]);

  useEffect(() => {
    async function fetchData() {
      if (!currentUserId) {
        setLoading(false);
        return;
      }

      // Fetch participant info (name, tip_percent)
      const { data: participant, error: participantError } = await supabase
        .from('participants')
        .select('name, tip_percent, session_id')
        .eq('id', currentUserId)
        .single();

      if (participantError || !participant) {
        console.error('Failed to fetch participant:', participantError);
        setLoading(false);
        return;
      }

      setUserName(participant.name);
      setTipPercent(participant.tip_percent ?? 0);

      // Fetch session (tax_percent, code)
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, tax_percent, code')
        .eq('id', participant.session_id)
        .single();

      if (sessionError || !session) {
        console.error('Failed to fetch session:', sessionError);
        setLoading(false);
        return;
      }

      setSessionId(session.id);
      setSessionCode(session.code);
      setTaxPercent(Number(session.tax_percent));

      // Fetch all participants in this session
      const { data: participantsData, error: participantsError } = await supabase
        .from('participants')
        .select('id, name, tip_percent, submitted_at')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true });

      if (participantsError) {
        console.error('Failed to fetch participants:', participantsError);
      } else if (participantsData) {
        setParticipants(participantsData.map(p => ({
          id: p.id,
          name: p.name,
          tipPercent: p.tip_percent ?? 0,
          submittedAt: p.submitted_at,
        })));
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

      // Fetch ALL item_shares for this session's items
      const sessionItemIds = itemsData.map(i => i.id);
      if (sessionItemIds.length > 0) {
        const { data: allSharesData, error: sharesError } = await supabase
          .from('item_shares')
          .select('*')
          .in('item_id', sessionItemIds);

        if (sharesError) {
          console.error('Failed to fetch shares:', sharesError);
        } else if (allSharesData) {
          const mapped = allSharesData.map(s => ({
            participantId: s.participant_id,
            itemId: s.item_id,
            proportion: Number(s.proportion),
            splitMethod: s.split_method as 'qty' | 'percentage',
          }));
          setShares(mapped.filter(s => s.participantId === currentUserId));
          setAllShares(mapped);
        }
      }

      setLoading(false);
    }

    fetchData();
  }, [id, currentUserId]);

  // Single realtime channel for all tables
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`summary_${sessionId}`)
      // Items
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const r = payload.new as { id: string; name: string; price: number; qty: number };
            setItems(prev => {
              if (prev.some(i => i.id === r.id)) return prev;
              return [...prev, { id: r.id, name: r.name, price: Number(r.price), qty: r.qty }];
            });
          } else if (payload.eventType === 'UPDATE') {
            const r = payload.new as { id: string; name: string; price: number; qty: number };
            setItems(prev => prev.map(i => i.id === r.id ? { id: r.id, name: r.name, price: Number(r.price), qty: r.qty } : i));
          } else if (payload.eventType === 'DELETE') {
            const r = payload.old as { id: string };
            setItems(prev => prev.filter(i => i.id !== r.id));
            setShares(prev => prev.filter(s => s.itemId !== r.id));
            setAllShares(prev => prev.filter(s => s.itemId !== r.id));
          }
        }
      )
      // Item shares
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'item_shares' },
        (payload) => {
          const record = (payload.new ?? payload.old) as {
            participant_id: string;
            item_id: string;
            proportion: number;
            split_method: string;
          } | undefined;

          if (!record) return;
          if (itemIdsRef.current.length > 0 && !itemIdsRef.current.includes(record.item_id)) return;

          const mapped: ItemShare = {
            participantId: record.participant_id,
            itemId: record.item_id,
            proportion: Number(record.proportion),
            splitMethod: record.split_method as 'qty' | 'percentage',
          };

          const updateShareList = (prev: ItemShare[]) => {
            if (payload.eventType === 'DELETE') {
              return prev.filter(
                s => !(s.participantId === record.participant_id && s.itemId === record.item_id)
              );
            }
            const without = prev.filter(
              s => !(s.participantId === mapped.participantId && s.itemId === mapped.itemId)
            );
            return [...without, mapped];
          };

          setAllShares(updateShareList);
          if (record.participant_id === currentUserId) {
            setShares(updateShareList);
          }
        }
      )
      // Participants
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants' },
        (payload) => {
          const record = (payload.new ?? payload.old) as {
            id: string;
            name: string;
            session_id: string;
            tip_percent: number;
            submitted_at: string | null;
          } | undefined;

          if (!record || record.session_id !== sessionId) return;

          if (payload.eventType === 'INSERT') {
            setParticipants(prev => {
              if (prev.some(p => p.id === record.id)) return prev;
              return [...prev, {
                id: record.id,
                name: record.name,
                tipPercent: record.tip_percent ?? 0,
                submittedAt: record.submitted_at,
              }];
            });
          } else if (payload.eventType === 'UPDATE') {
            setParticipants(prev =>
              prev.map(p =>
                p.id === record.id
                  ? { ...p, name: record.name, tipPercent: record.tip_percent ?? 0, submittedAt: record.submitted_at }
                  : p
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setParticipants(prev => prev.filter(p => p.id !== record.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, currentUserId]);

  // Current user's summary
  const userSelectedShares = shares.filter(
    share => share.participantId === currentUserId && share.proportion > 0
  );

  const subtotal = userSelectedShares.reduce((total, share) => {
    const item = items.find(item => item.id === share.itemId);
    if (item) {
      return total + item.price * item.qty * share.proportion;
    }
    return total;
  }, 0);

  const taxAmount = subtotal * taxPercent;
  const tipAmount = subtotal * (tipPercent / 100);
  const finalTotal = subtotal + taxAmount + tipAmount;

  // Bill-wide calculations
  const billSubtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);

  const totalCoveredSubtotal = allShares.reduce((sum, share) => {
    const item = items.find(i => i.id === share.itemId);
    if (item && share.proportion > 0) {
      return sum + item.price * item.qty * share.proportion;
    }
    return sum;
  }, 0);

  const coveragePercent = billSubtotal > 0 ? Math.min(Math.round((totalCoveredSubtotal / billSubtotal) * 100), 100) : 0;

  // Helper: compute a participant's subtotal
  const getParticipantSubtotal = (participantId: string) => {
    return allShares
      .filter(s => s.participantId === participantId && s.proportion > 0)
      .reduce((sum, share) => {
        const item = items.find(i => i.id === share.itemId);
        if (item) return sum + item.price * item.qty * share.proportion;
        return sum;
      }, 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-paper-edge px-5 py-8 sm:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="h-9 w-48 bg-paper-deep animate-skeleton mb-2" />
          <div className="h-5 w-32 bg-paper-deep rounded-full animate-skeleton mb-6" />
          <div className="bg-paper shadow-[0_1px_2px_rgba(25,28,26,0.06)] p-6 mb-6">
            <div className="flex justify-between">
              <div className="space-y-2">
                <div className="h-5 w-36 bg-paper-deep animate-skeleton" />
                <div className="h-12 w-32 bg-paper-deep animate-skeleton" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-24 bg-paper-deep animate-skeleton" />
                <div className="h-4 w-24 bg-paper-deep animate-skeleton" />
                <div className="h-4 w-24 bg-paper-deep animate-skeleton" />
              </div>
            </div>
          </div>
          <div className="bg-paper shadow-[0_1px_2px_rgba(25,28,26,0.06)] p-6">
            <div className="h-5 w-28 bg-paper-deep animate-skeleton mb-3" />
            <div className="h-3 w-full bg-paper-deep rounded-full animate-skeleton" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper-edge px-5 py-8 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-mono font-medium tracking-[-0.02em] text-ink mb-2">Final summary</h1>
        <div className="flex items-center gap-2 mb-6">
          <span className="inline-flex items-center px-2.5 py-1 bg-pine/10 text-pine font-mono text-xs tracking-[0.2em]">{sessionCode || id}</span>
          <ParticipantsBadge participants={participants.map(p => ({ id: p.id, name: p.name }))} currentUserId={currentUserId} />
        </div>

        {/* Current user tile */}
        <div className="bg-paper shadow-[0_1px_2px_rgba(25,28,26,0.06)] transition-shadow duration-200 p-6">
          <div>
            <p className="text-lg text-ink">{userName ? `${userName}'s` : 'Your'} share is</p>
            <p className="text-5xl font-mono font-medium text-ink tabular-nums mt-1">${finalTotal.toFixed(2)}</p>
          </div>

          <div className="text-ink-soft space-y-1 mt-4 border-t border-paper-deep pt-4">
            <div className="flex items-baseline font-mono text-sm">
              <p>Subtotal</p>
              <span className="leader" />
              <p className="tabular-nums">${subtotal.toFixed(2)}</p>
            </div>
            <div className="flex items-baseline font-mono text-sm">
              <p>Tax ({(taxPercent * 100).toFixed(0)}%)</p>
              <span className="leader" />
              <p className="tabular-nums">${taxAmount.toFixed(2)}</p>
            </div>
            <div className="flex items-baseline font-mono text-sm">
              <p>Tip ({tipPercent}%)</p>
              <span className="leader" />
              <p className="tabular-nums">${tipAmount.toFixed(2)}</p>
            </div>
            <div className="flex items-baseline font-mono text-sm border-t border-ink/15 pt-2 mt-2 font-medium text-ink">
              <p>Total</p>
              <span className="leader" />
              <p className="tabular-nums">${finalTotal.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Bill Coverage */}
        <div className="bg-paper shadow-[0_1px_2px_rgba(25,28,26,0.06)] transition-shadow duration-200 p-6 mt-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-mono font-medium text-lg text-ink">Bill coverage</h2>
            <span className="text-sm text-ink-soft">
              ${totalCoveredSubtotal.toFixed(2)} of ${billSubtotal.toFixed(2)}
            </span>
          </div>
          <div className="w-full h-[3px] bg-paper-deep overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${coveragePercent >= 100 ? 'bg-pine' : 'bg-ink-faint'}`}
              style={{ width: `${coveragePercent}%` }}
            />
          </div>
          <p className="text-sm text-ink-soft mt-1">
            {coveragePercent}% of the bill subtotal is covered
            {coveragePercent < 100 && (
              <span className="text-flag font-medium"> — ${(billSubtotal - totalCoveredSubtotal).toFixed(2)} remaining</span>
            )}
          </p>
        </div>

        {/* Group Summary Dropdown */}
        <div className="bg-paper shadow-[0_1px_2px_rgba(25,28,26,0.06)] transition-shadow duration-200 mt-6 overflow-hidden">
          <button
            onClick={() => setGroupOpen(!groupOpen)}
            className="w-full flex justify-between items-center p-6 text-left hover:bg-paper-edge transition-colors duration-150"
          >
            <div>
              <h2 className="font-mono font-medium text-lg text-ink">Group summary</h2>
              <p className="text-sm text-ink-soft">
                {participants.filter(p => p.submittedAt).length} of {participants.length} submitted
              </p>
            </div>
            <svg
              className={`w-5 h-5 text-ink-faint transition-transform duration-200 ${groupOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {groupOpen && (
            <div className="border-t border-paper-deep">
              {participants.map((p) => {
                const isCurrentUser = p.id === currentUserId;
                const isSubmitted = !!p.submittedAt;
                const pSubtotal = getParticipantSubtotal(p.id);
                const pShares = allShares.filter(s => s.participantId === p.id && s.proportion > 0);
                const shareOfBill = billSubtotal > 0 ? (pSubtotal / billSubtotal) * 100 : 0;
                const isExpanded = expandedParticipant === p.id;

                return (
                  <div key={p.id} className="border-b border-paper-deep last:border-b-0">
                    <button
                      onClick={() => setExpandedParticipant(isExpanded ? null : p.id)}
                      className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-paper-edge transition-colors duration-150"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          isSubmitted
                            ? 'bg-pine/10 text-pine'
                            : 'bg-paper-edge text-ink-faint'
                        }`}>
                          {isSubmitted ? '✓' : '·'}
                        </div>
                        <div>
                          <p className="font-semibold text-ink">
                            {p.name}{isCurrentUser && <span className="text-ink-soft text-sm ml-1">(you)</span>}
                          </p>
                          <p className="text-xs text-ink-faint">
                            {isSubmitted ? 'Submitted' : 'Pending'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold text-ink">${pSubtotal.toFixed(2)}</p>
                          <p className="text-xs text-ink-faint">{shareOfBill.toFixed(0)}% of bill</p>
                        </div>
                        <svg
                          className={`w-4 h-4 text-ink-faint transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-6 pb-4 bg-paper-edge">
                        {pShares.length === 0 ? (
                          <p className="text-sm text-ink-faint italic">No items selected yet</p>
                        ) : (
                          <div className="space-y-1">
                            {pShares.map((share) => {
                              const item = items.find(i => i.id === share.itemId);
                              if (!item) return null;
                              const shareAmount = item.price * item.qty * share.proportion;
                              return (
                                <div key={share.itemId} className="flex items-baseline font-mono text-[0.8125rem]">
                                  <span className="text-ink-soft">
                                    {item.name} <span className="text-ink-faint">({(share.proportion * 100).toFixed(0)}%)</span>
                                  </span>
                                  <span className="leader" />
                                  <span className="text-ink tabular-nums">${shareAmount.toFixed(2)}</span>
                                </div>
                              );
                            })}
                            <div className="flex items-baseline font-mono text-[0.8125rem] font-medium border-t border-paper-deep pt-1.5 mt-1.5">
                              <span className="text-ink">Subtotal</span>
                              <span className="leader" />
                              <span className="text-ink tabular-nums">${pSubtotal.toFixed(2)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
