'use client'
import ItemCard from "@/components/ui/ItemCard";
import AddItemModal from "@/components/ui/AddItemModal";
import { Item, ItemShare } from "@/types/types";
import { supabase } from "@/lib/supabase";
import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';


export default function ItemsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shares, setShares] = useState<ItemShare[]>([]);
  const [otherShares, setOtherShares] = useState<ItemShare[]>([]);
  const [participantCount, setParticipantCount] = useState(1);
  const [splitCount, setSplitCount] = useState(1);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [evenSplitVersion, setEvenSplitVersion] = useState(0);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('participantId') : null;

  // Fetch session UUID, items, and existing shares on mount
  useEffect(() => {
    async function fetchSessionAndItems() {
      if (!currentUserId) {
        setLoading(false);
        return;
      }

      // Look up session UUID by code
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id')
        .eq('code', id)
        .single();

      if (sessionError || !session) {
        console.error('Failed to fetch session:', sessionError);
        setLoading(false);
        return;
      }

      setSessionId(session.id);

      // Fetch participant count for this session
      const { count: pCount, error: pError } = await supabase
        .from('participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session.id);

      if (!pError && pCount) {
        setParticipantCount(pCount);
        setSplitCount(pCount);
      }

      // Fetch items for this session
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: true });

      if (itemsError) {
        console.error('Failed to fetch items:', itemsError);
      } else {
        setItems(itemsData.map((item) => ({
          id: item.id,
          name: item.name,
          price: Number(item.price),
          qty: item.qty,
        })));
      }

      // Fetch ALL item_shares for this session's items
      const sessionItemIds = new Set(itemsData?.map(i => i.id) ?? []);
      const itemIdArray = Array.from(sessionItemIds);

      if (itemIdArray.length > 0) {
        const { data: allSharesData, error: sharesError } = await supabase
          .from('item_shares')
          .select('*')
          .in('item_id', itemIdArray);

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
          setOtherShares(mapped.filter(s => s.participantId !== currentUserId));
        }
      }

      setLoading(false);
    }

    fetchSessionAndItems();
  }, [id, currentUserId]);

  // Realtime subscription for item_shares changes from other participants
  useEffect(() => {
    if (!sessionId || !currentUserId || items.length === 0) return;

    const itemIds = items.map(i => i.id);

    const channel = supabase
      .channel(`item_shares_${sessionId}`)
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

          if (!record || record.participant_id === currentUserId) return;
          if (!itemIds.includes(record.item_id)) return;

          const mapped: ItemShare = {
            participantId: record.participant_id,
            itemId: record.item_id,
            proportion: Number(record.proportion),
            splitMethod: record.split_method as 'qty' | 'percentage',
          };

          setOtherShares(prev => {
            if (payload.eventType === 'DELETE') {
              return prev.filter(
                s => !(s.participantId === record.participant_id && s.itemId === record.item_id)
              );
            }
            // INSERT or UPDATE — upsert
            const without = prev.filter(
              s => !(s.participantId === mapped.participantId && s.itemId === mapped.itemId)
            );
            return [...without, mapped];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId, currentUserId, items]);

  // Realtime subscription for items (add/edit/delete from other users)
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`items_${sessionId}`)
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
            setOtherShares(prev => prev.filter(s => s.itemId !== r.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Compute how much of each item others have claimed (0-1)
  const othersClaimed: Record<string, number> = {};
  for (const share of otherShares) {
    othersClaimed[share.itemId] = (othersClaimed[share.itemId] ?? 0) + share.proportion;
  }

  // Check which items have any claims (from any participant, including current user)
  const itemHasClaims = (itemId: string): boolean => {
    const othersHaveClaimed = otherShares.some(s => s.itemId === itemId && s.proportion > 0);
    const userHasClaimed = shares.some(s => s.itemId === itemId && s.proportion > 0);
    return othersHaveClaimed || userHasClaimed;
  };

  const handleAddItem = async (name: string, price: number, qty: number) => {
    if (!sessionId) return;

    const { data, error } = await supabase
      .from('items')
      .insert({ session_id: sessionId, name, price, qty })
      .select()
      .single();

    if (error) {
      console.error('Failed to add item:', error);
      return;
    }

    setItems(prev => [...prev, { id: data.id, name: data.name, price: Number(data.price), qty: data.qty }]);
    setShowAddModal(false);
  };

  const handleItemUpdate = async (updatedItem: Item) => {
    const { error } = await supabase
      .from('items')
      .update({ name: updatedItem.name, price: updatedItem.price, qty: updatedItem.qty })
      .eq('id', updatedItem.id);

    if (error) {
      console.error('Failed to update item:', error);
      return;
    }

    setItems(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
  };

  const handleItemDelete = async (itemId: string) => {
    // Double-check for claims server-side before deleting
    const { count, error: countError } = await supabase
      .from('item_shares')
      .select('*', { count: 'exact', head: true })
      .eq('item_id', itemId)
      .gt('proportion', 0);

    if (countError) {
      console.error('Failed to check claims:', countError);
      return;
    }

    if (count && count > 0) {
      alert('This item has been claimed by participants and cannot be deleted.');
      return;
    }

    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', itemId);

    if (error) {
      console.error('Failed to delete item:', error);
      return;
    }

    setItems(prev => prev.filter(item => item.id !== itemId));
    setShares(prev => prev.filter(share => share.itemId !== itemId));
    setOtherShares(prev => prev.filter(share => share.itemId !== itemId));
  };

  const handleShareUpdate = (itemId: string, proportion: number, splitMethod: 'qty' | 'percentage') => {
    if (!currentUserId) return;
    const newSharesList = [...shares];
    const existingIndex = newSharesList.findIndex(
      share => share.itemId === itemId && share.participantId === currentUserId
    );

    if (existingIndex >= 0) {
      newSharesList[existingIndex] = { participantId: currentUserId, itemId, proportion, splitMethod };
    } else {
      newSharesList.push({ participantId: currentUserId, itemId, proportion, splitMethod });
    }
    setShares(newSharesList);
  };

  const handleEvenSplit = () => {
    if (!currentUserId || items.length === 0) return;
    const proportion = 1 / splitCount;
    const newShares: ItemShare[] = items.map(item => ({
      participantId: currentUserId,
      itemId: item.id,
      proportion,
      splitMethod: 'percentage' as const,
    }));
    setShares(newShares);
    setEvenSplitVersion(v => v + 1);
    setShowSplitModal(false);
  };

  const handleContinue = async () => {
    if (!currentUserId) return;
    setSaving(true);

    // Upsert all shares into item_shares table
    const userShares = shares.filter(s => s.participantId === currentUserId);
    if (userShares.length > 0) {
      const { error } = await supabase
        .from('item_shares')
        .upsert(
          userShares.map(s => ({
            participant_id: s.participantId,
            item_id: s.itemId,
            proportion: s.proportion,
            split_method: s.splitMethod,
          })),
          { onConflict: 'participant_id,item_id' }
        );

      if (error) {
        console.error('Failed to save shares:', error);
        setSaving(false);
        return;
      }
    }

    router.push(`/session/${id}/tax-tip`);
  };

  const calculateSubtotal = (): number => {
    if (!currentUserId) return 0;
    const userItemSelections = shares.filter(
      itemShare => itemShare.participantId === currentUserId
    );

    let userSubtotal = 0;

    for (const itemShare of userItemSelections) {
      const matchedItem = items.find(item => item.id === itemShare.itemId);
      if (matchedItem) {
        const totalLineCost = matchedItem.price * matchedItem.qty;
        const myShareCost = itemShare.proportion * totalLineCost;
        userSubtotal += myShareCost;
      }
    }

    return userSubtotal;
  };

  const subtotal = calculateSubtotal();
  const hasSelections = shares.some(s => s.participantId === currentUserId && s.proportion > 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-emerald-50 p-8 pb-24">
        <div className="max-w-2xl mx-auto">
          <div className="h-9 w-56 bg-gray-200 rounded-lg animate-skeleton mb-2" />
          <div className="h-5 w-32 bg-gray-200 rounded-full animate-skeleton mb-6" />
          <div className="flex flex-col gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex justify-between">
                  <div className="space-y-2">
                    <div className="h-5 w-32 bg-gray-200 rounded animate-skeleton" />
                    <div className="h-4 w-20 bg-gray-200 rounded animate-skeleton" />
                  </div>
                  <div className="h-6 w-16 bg-gray-200 rounded animate-skeleton" />
                </div>
                <div className="flex gap-4 mt-3">
                  <div className="flex-1 h-10 bg-gray-200 rounded-md animate-skeleton" />
                  <div className="flex-1 h-10 bg-gray-200 rounded-md animate-skeleton" />
                </div>
                <div className="h-2 w-full bg-gray-200 rounded-full mt-4 animate-skeleton" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-emerald-50 p-8 pb-24">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-emerald-900">Select Your Items</h1>
            <span className="inline-flex items-center mt-1 px-3 py-0.5 bg-emerald-100 text-emerald-800 font-mono text-sm rounded-full">{id}</span>
          </div>
          {items.length > 0 && (
            <button
              onClick={() => setShowSplitModal(true)}
              className="font-bold px-4 py-2 rounded-md shadow-md bg-white text-emerald-700 border-2 border-emerald-700 hover:bg-emerald-50 transition-colors duration-150"
            >
              Split Evenly
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4 mt-4">
          {items.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
              <p className="mt-3 text-gray-500 font-medium">No items yet</p>
              <p className="text-gray-400 text-sm">Add one to get started!</p>
            </div>
          ) : (
            items.map((item) => (
              <ItemCard
                key={`${item.id}-${evenSplitVersion}`}
                {...item}
                currentShare={shares.find(
                  s => s.itemId === item.id && s.participantId === currentUserId
                )}
                othersClaimed={othersClaimed[item.id] ?? 0}
                hasClaims={itemHasClaims(item.id)}
                expanded={expandedItems.has(item.id)}
                onToggle={() => setExpandedItems(prev => {
                  const next = new Set(prev);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                })}
                onShareUpdate={handleShareUpdate}
                onItemUpdate={handleItemUpdate}
                onItemDelete={handleItemDelete}
              />
            ))
          )}
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="mt-6 w-full font-bold px-6 py-3 rounded-md shadow-md bg-emerald-700 text-white hover:bg-emerald-800 transition-colors duration-150"
        >
          + Add Item
        </button>
      </div>

      {showAddModal && (
        <AddItemModal
          onAdd={handleAddItem}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {showSplitModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm animate-scale-in">
            <h2 className="font-bold text-xl text-emerald-900 mb-2">Split Evenly</h2>
            <p className="text-sm text-gray-500 mb-6">Set your share on every item to 1/N</p>

            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">Split across</span>
                <button
                  onClick={() => setSplitCount(Math.max(participantCount, splitCount - 1))}
                  disabled={splitCount <= participantCount}
                  className="font-bold px-3 py-1 rounded-md bg-gray-100 text-emerald-900 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  -
                </button>
                <input
                  type="number"
                  min={participantCount}
                  value={splitCount}
                  onChange={(e) => {
                    const val = e.target.value === '' ? participantCount : Number(e.target.value);
                    if (val >= participantCount) setSplitCount(val);
                  }}
                  onFocus={(e) => e.target.select()}
                  className="w-14 px-2 py-1 border border-gray-300 rounded-md text-center focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <button
                  onClick={() => setSplitCount(splitCount + 1)}
                  className="font-bold px-3 py-1 rounded-md bg-gray-100 text-emerald-900 hover:bg-gray-200 transition-colors duration-150"
                >
                  +
                </button>
                <span className="text-sm text-gray-600">people</span>
              </div>
              <p className="text-emerald-700 font-semibold">{Math.round((1 / splitCount) * 100)}% each</p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSplitModal(false)}
                className="flex-1 font-bold px-4 py-2 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                onClick={handleEvenSplit}
                className="flex-1 font-bold px-4 py-2 rounded-md shadow-md bg-emerald-700 text-white hover:bg-emerald-800 transition-colors duration-150"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] p-4">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Your Subtotal</p>
            <p className="text-2xl font-bold text-emerald-900">${subtotal.toFixed(2)}</p>
          </div>
          <button
            onClick={handleContinue}
            disabled={saving || !hasSelections}
            title={!hasSelections ? 'Select at least one item before continuing' : undefined}
            className="bg-emerald-700 text-white font-bold px-8 py-3 rounded-md shadow-md hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
          >
            {saving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
