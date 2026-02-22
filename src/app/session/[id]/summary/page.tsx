'use client'
import { Item, ItemShare } from "@/types/types";
import { supabase } from "@/lib/supabase";
import { use, useState, useEffect } from 'react';

interface ParticipantData {
  id: string;
  name: string;
  tipPercent: number;
  submittedAt: string | null;
}

export default function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('participantId') : null;

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

  // Realtime subscription for items (add/edit/delete)
  useEffect(() => {
    if (!sessionId) return;

    const itemsChannel = supabase
      .channel(`summary_items_${sessionId}`)
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
      .subscribe();

    return () => {
      supabase.removeChannel(itemsChannel);
    };
  }, [sessionId]);

  // Realtime subscription for item_shares updates
  useEffect(() => {
    if (!sessionId || items.length === 0) return;

    const itemIds = items.map(i => i.id);

    const sharesChannel = supabase
      .channel(`summary_shares_${sessionId}`)
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

          if (!record || !itemIds.includes(record.item_id)) return;

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
      .subscribe();

    return () => {
      supabase.removeChannel(sharesChannel);
    };
  }, [sessionId, items, currentUserId]);

  // Realtime subscription for participant updates (submitted_at changes)
  useEffect(() => {
    if (!sessionId) return;

    const participantsChannel = supabase
      .channel(`summary_participants_${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'participants' },
        (payload) => {
          const record = payload.new as {
            id: string;
            name: string;
            tip_percent: number;
            submitted_at: string | null;
          };

          setParticipants(prev =>
            prev.map(p =>
              p.id === record.id
                ? { ...p, name: record.name, tipPercent: record.tip_percent ?? 0, submittedAt: record.submitted_at }
                : p
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(participantsChannel);
    };
  }, [sessionId]);

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
      <div className="min-h-screen bg-teal-50 flex items-center justify-center">
        <p className="text-teal-900 text-lg">Loading summary...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-teal-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-teal-900 mb-2">Final Summary</h1>
        <p className="text-gray-600 mb-6">Session ID: {sessionCode || id}</p>

        {/* Current user tile */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg text-teal-900">{userName ? `${userName}'s` : 'Your'} share is</p>
              <p className="text-5xl font-extrabold text-teal-700 mt-1">${finalTotal.toFixed(2)}</p>
            </div>

            <div className="text-right text-gray-600 space-y-1">
              <div className="flex justify-between gap-8">
                <p>Subtotal</p>
                <p>${subtotal.toFixed(2)}</p>
              </div>
              <div className="flex justify-between gap-8">
                <p>Tax ({(taxPercent * 100).toFixed(0)}%)</p>
                <p>${taxAmount.toFixed(2)}</p>
              </div>
              <div className="flex justify-between gap-8">
                <p>Tip ({tipPercent}%)</p>
                <p>${tipAmount.toFixed(2)}</p>
              </div>
              <div className="flex justify-between gap-8 border-t border-gray-300 pt-1 mt-1 font-semibold text-teal-900">
                <p>Total</p>
                <p>${finalTotal.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bill Coverage */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 mt-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-bold text-lg text-teal-900">Bill Coverage</h2>
            <span className="text-sm text-gray-500">
              ${totalCoveredSubtotal.toFixed(2)} of ${billSubtotal.toFixed(2)}
            </span>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${coveragePercent >= 100 ? 'bg-green-500' : 'bg-teal-500'}`}
              style={{ width: `${coveragePercent}%` }}
            />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {coveragePercent}% of the bill subtotal is covered
            {coveragePercent < 100 && (
              <span className="text-amber-600 font-medium"> — ${(billSubtotal - totalCoveredSubtotal).toFixed(2)} remaining</span>
            )}
          </p>
        </div>

        {/* Group Summary Dropdown */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200 mt-6 overflow-hidden">
          <button
            onClick={() => setGroupOpen(!groupOpen)}
            className="w-full flex justify-between items-center p-6 text-left hover:bg-gray-50 transition-colors"
          >
            <div>
              <h2 className="font-bold text-lg text-teal-900">Group Summary</h2>
              <p className="text-sm text-gray-500">
                {participants.filter(p => p.submittedAt).length} of {participants.length} submitted
              </p>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${groupOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {groupOpen && (
            <div className="border-t border-gray-200">
              {participants.map((p) => {
                const isCurrentUser = p.id === currentUserId;
                const isSubmitted = !!p.submittedAt;
                const pSubtotal = getParticipantSubtotal(p.id);
                const pShares = allShares.filter(s => s.participantId === p.id && s.proportion > 0);
                const shareOfBill = billSubtotal > 0 ? (pSubtotal / billSubtotal) * 100 : 0;
                const isExpanded = expandedParticipant === p.id;

                return (
                  <div key={p.id} className="border-b border-gray-100 last:border-b-0">
                    <button
                      onClick={() => setExpandedParticipant(isExpanded ? null : p.id)}
                      className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          isSubmitted
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          {isSubmitted ? '✓' : '·'}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">
                            {p.name}{isCurrentUser && <span className="text-teal-600 text-sm ml-1">(you)</span>}
                          </p>
                          <p className="text-xs text-gray-400">
                            {isSubmitted ? 'Submitted' : 'Pending'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold text-gray-800">${pSubtotal.toFixed(2)}</p>
                          <p className="text-xs text-gray-400">{shareOfBill.toFixed(0)}% of bill</p>
                        </div>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-6 pb-4 bg-gray-50">
                        {pShares.length === 0 ? (
                          <p className="text-sm text-gray-400 italic">No items selected yet</p>
                        ) : (
                          <div className="space-y-1">
                            {pShares.map((share) => {
                              const item = items.find(i => i.id === share.itemId);
                              if (!item) return null;
                              const shareAmount = item.price * item.qty * share.proportion;
                              return (
                                <div key={share.itemId} className="flex justify-between text-sm">
                                  <span className="text-gray-600">
                                    {item.name} <span className="text-gray-400">({(share.proportion * 100).toFixed(0)}%)</span>
                                  </span>
                                  <span className="text-gray-700">${shareAmount.toFixed(2)}</span>
                                </div>
                              );
                            })}
                            <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1 mt-1">
                              <span className="text-gray-700">Subtotal</span>
                              <span className="text-gray-800">${pSubtotal.toFixed(2)}</span>
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
