'use client'
import { Item, ItemShare } from "@/types/types";
import { supabase } from "@/lib/supabase";
import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';


export default function TaxTipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('participantId') : null;

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

      setTaxPercent(Number(session.tax_percent));

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
      <div className="min-h-screen bg-teal-50 flex items-center justify-center">
        <p className="text-teal-900 text-lg">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-teal-50 p-8 pb-24">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-teal-900 mb-2">Tax and Tip</h1>
        <p className="text-gray-600 mb-6">Session ID: {id}</p>

        {/* Itemized Receipt Breakdown */}
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 mb-4">
          <h2 className="font-bold text-xl text-teal-900 mb-3">Your Items</h2>

          <div className="space-y-2 mb-4">
            {userSelectedShares.map((share) => {
              const item = items.find(i => i.id === share.itemId);
              if (!item) return null;

              const itemTotal = item.price * item.qty;
              const userShare = itemTotal * share.proportion;

              return (
                <div key={share.itemId} className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className="text-gray-800">{item.name}</p>
                    <p className="text-sm text-gray-500">
                      ${item.price.toFixed(2)} × {item.qty} × {(share.proportion * 100).toFixed(0)}%
                    </p>
                  </div>
                  <p className="text-gray-800">${userShare.toFixed(2)}</p>
                </div>
              );
            })}
          </div>

          <div className="border-t border-gray-300 pt-3 mt-3 flex justify-between items-center">
            <p className="font-semibold text-gray-800">Subtotal</p>
            <p className="font-semibold text-gray-800">${subtotal.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200 mb-4">
        <h1 className="font-bold text-xl text-teal-900 mb-3">Tax</h1>
        <div className="flex justify-between items-center mb-2">
          <div>
            <p className="text-gray-700">Subtotal</p>
            <p className="text-gray-700">Tax ({(taxPercent * 100).toFixed(0)}%)</p>
          </div>

          <div className="text-right">
            <p className="text-gray-700">${subtotal.toFixed(2)}</p>
            <p className="text-gray-700">${taxAmount.toFixed(2)}</p>
          </div>
        </div>

        <div className="border-t border-gray-300 pt-2 mt-2 flex justify-between items-center">
          <p className="font-bold text-teal-900">Subtotal + Tax</p>
          <p className="font-bold text-teal-900">${(subtotal + taxAmount).toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200 mb-4">
        <h1 className="font-bold text-xl text-teal-900 mb-3">Tip</h1>

        <div className="flex flex-col items-center gap-3 mt-4">
          <div className="flex justify-center items-center gap-3">
            {[15, 18, 20, 25].map((p) => (
              <button
                key={p}
                onClick={() => { setCustomTip(false); setSelectedTipPercent(p); }}
                className={`font-bold px-4 py-2 rounded-md shadow-md bg-white text-teal-900 hover:bg-teal-50 ${
                  !customTip && selectedTipPercent === p ? 'outline-none ring-2 ring-teal-600 bg-teal-50' : ''
                }`}
              >
                {p}%
              </button>
            ))}
            <button
              onClick={() => { setCustomTip(true); setSelectedTipPercent(undefined); }}
              className={`font-bold px-4 py-2 rounded-md shadow-md bg-white text-teal-900 hover:bg-teal-50 ${
                customTip ? 'outline-none ring-2 ring-teal-600 bg-teal-50' : ''
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
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <span className="text-teal-900 font-bold">%</span>
            </div>
          )}
        </div>

        <div className="border-t border-gray-300 pt-2 mt-2 flex justify-between items-start">
          <div>
            <p>Tip Amount ({selectedTipPercent || 0}%)</p>
          </div>
          <div>
            <p>${tipAmount.toFixed(2)}</p>
          </div>
        </div>
      </div>

      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-teal-600 shadow-lg p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <button
            onClick={() => router.push(`/session/${id}/items`)}
            className="bg-gray-500 text-white font-bold px-8 py-3 rounded-md shadow-md hover:bg-gray-600"
          >
            Back
          </button>
          <div>
            <p className="text-sm text-gray-600">Final Total</p>
            <p className="text-2xl font-bold text-teal-900">${finalTotal.toFixed(2)}</p>
          </div>
          <button
            onClick={handleContinue}
            disabled={saving}
            className="bg-teal-700 text-white font-bold px-8 py-3 rounded-md shadow-md hover:bg-teal-800 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
