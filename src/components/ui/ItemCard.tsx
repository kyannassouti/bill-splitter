'use client'
import { useState, useEffect } from 'react';
import { Item, ItemShare } from '@/types/types';


interface ItemCardProps extends Item {
  currentShare?: ItemShare;
  othersClaimed: number; // 0–1 range: sum of other participants' proportions
  hasClaims: boolean; // true if any participant (including current user) has claimed this item
  expanded: boolean;
  onToggle: () => void;
  onShareUpdate: (itemId: string, proportion: number, splitMethod: 'qty' | 'percentage') => void;
  onItemUpdate?: (item: Item) => void;
  onItemDelete?: (itemId: string) => void;
}


export default function ItemCard({ id, name, price, qty, currentShare, othersClaimed, hasClaims, expanded, onToggle, onShareUpdate, onItemUpdate, onItemDelete }: ItemCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editPrice, setEditPrice] = useState(price.toString());
  const [editQty, setEditQty] = useState(qty.toString());

  // Determine initial state from existing share data (e.g. when navigating back)
  const getInitialState = () => {
    if (!currentShare || currentShare.proportion === 0) {
      return { method: 'qty' as const, qty: 0, percent: undefined as number | undefined, customPercent: false };
    }

    const method = currentShare.splitMethod;
    const proportion = currentShare.proportion;

    if (method === 'qty') {
      const impliedQty = Math.round(proportion * qty);
      return { method: 'qty' as const, qty: impliedQty, percent: undefined as number | undefined, customPercent: false };
    }

    // Percentage split - find matching preset or mark as custom
    const percentValue = proportion * 100;
    const presets = [25, 33, 50, 100];
    const isPreset = presets.includes(Math.round(percentValue));
    return { method: 'percentage' as const, qty: 0, percent: percentValue, customPercent: !isPreset };
  };

  const initial = getInitialState();
  const [splitMethod, setSplitMethod] = useState<'percentage' | 'qty'>(initial.method);
  const [splitPercent, setSplitPercent] = useState<number | undefined>(initial.percent);
  const [selectedQty, setSelectedQty] = useState<number>(initial.qty);
  const [customPercent, setCustomPercent] = useState(initial.customPercent);
  const [customInput, setCustomInput] = useState(initial.customPercent && initial.percent !== undefined ? String(initial.percent) : '');

  // Remaining capacity after others' claims
  const remainingProportion = Math.max(0, 1 - othersClaimed);
  const remainingPercent = remainingProportion * 100;
  const maxQty = Math.floor(qty * remainingProportion);

  // Auto-clamp current selection when othersClaimed increases via realtime
  useEffect(() => {
    if (splitMethod === 'qty' && selectedQty > maxQty) {
      setSelectedQty(maxQty);
      onShareUpdate(id, maxQty / qty, 'qty');
    } else if (splitMethod === 'percentage' && splitPercent !== undefined && splitPercent > remainingPercent) {
      setSplitPercent(remainingPercent);
      onShareUpdate(id, remainingPercent / 100, 'percentage');
    }
  }, [othersClaimed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Convert quantity splits into proportions
  const calculateQuantityProportion = (selectedQty: number): number => {
    return selectedQty / qty;
  }

  // Calculate the share amount based on selected proportion of total item cost
  const calculateShareAmount = (proportion: number): number => {
    const totalItemCost = price * qty;
    return totalItemCost * proportion;
  }

  // Determine current proportion based on split method
  const currentProportion = splitMethod === 'qty'
    ? calculateQuantityProportion(selectedQty)
    : (splitPercent || 0) / 100; // Convert percentage to proportion (e.g., 50% -> 0.5)

  const shareAmount = calculateShareAmount(currentProportion);

  // Handle quantity selection changes
  const handleQuantityChange = (newQty: number) => {
    setSelectedQty(newQty);
    const proportion = calculateQuantityProportion(newQty);
    onShareUpdate(id, proportion, 'qty');
  };

  // Handle percentage selection
  const handlePercentageSelect = (percentage: number) => {
    setSplitPercent(percentage);
    const proportion = percentage / 100;
    onShareUpdate(id, proportion, 'percentage');
  };

  // Handle split method change
  const handleSplitMethodChange = (newMethod: 'percentage' | 'qty') => {
    setSplitMethod(newMethod);

    // Update parent with current proportion for the new method
    if (newMethod === 'qty') {
      // Switching to quantity - use current selected quantity
      const proportion = calculateQuantityProportion(selectedQty);
      onShareUpdate(id, proportion, 'qty');
    } else {
      // Switching to percentage - use current selected percentage (or 0 if none)
      const proportion = (splitPercent || 0) / 100;
      onShareUpdate(id, proportion, 'percentage');
    }
  };

  const handleEditSave = () => {
    const parsedPrice = parseFloat(editPrice);
    const parsedQty = parseInt(editQty);
    if (!editName.trim() || isNaN(parsedPrice) || parsedPrice <= 0 || isNaN(parsedQty) || parsedQty < 1) return;
    onItemUpdate?.({ id, name: editName.trim(), price: parsedPrice, qty: parsedQty });
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setEditName(name);
    setEditPrice(price.toString());
    setEditQty(qty.toString());
    setIsEditing(false);
  };

  // Floor to cents so per-person shares never overshoot the item total
  const floorCents = (n: number) => Math.floor(n * 100) / 100;

  const totalPrice = price * qty;

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50/50 transition-colors duration-150"
      >
        <div className="flex-1 min-w-0">
          <p className="font-bold text-emerald-900 truncate">{name} <span className="font-normal text-gray-500">x{qty}</span></p>
          <p className="text-sm text-gray-500">${price.toFixed(2)} each · ${totalPrice.toFixed(2)} total</p>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          <div className="text-right">
            <p className="font-bold text-emerald-600">${floorCents(shareAmount).toFixed(2)}</p>
            <p className="text-xs text-gray-400">Your share</p>
          </div>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {/* Edit / Delete actions */}
          {(onItemUpdate || onItemDelete) && (
            <div className="pt-3 mb-3">
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-600 font-bold text-lg"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-600 text-sm"
                      placeholder="Price"
                    />
                    <input
                      type="number"
                      min="1"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-600 text-sm"
                      placeholder="Qty"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleEditCancel}
                      className="text-sm px-3 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors duration-150"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleEditSave}
                      className="text-sm px-3 py-1 rounded bg-emerald-700 text-white hover:bg-emerald-800 transition-colors duration-150"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  {onItemUpdate && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors duration-150"
                    >
                      Edit
                    </button>
                  )}
                  {onItemDelete && !confirmingDelete && (
                    <button
                      onClick={() => setConfirmingDelete(true)}
                      disabled={hasClaims}
                      title={hasClaims ? 'Item claimed by a participant' : undefined}
                      className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                    >
                      Delete
                    </button>
                  )}
                  {onItemDelete && confirmingDelete && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setConfirmingDelete(false)}
                        className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors duration-150"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => onItemDelete(id)}
                        className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors duration-150"
                      >
                        Confirm
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Split method toggle */}
          <div className="flex justify-center gap-4">
            <button
              onClick={() => handleSplitMethodChange('qty')}
              className={`flex-1 font-bold px-6 py-2 rounded-md shadow-md transition-colors duration-150 ${splitMethod === 'qty'
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                }`}
            >
              By Quantity
            </button>
            <button
              onClick={() => handleSplitMethodChange('percentage')}
              className={`flex-1 font-bold px-6 py-2 rounded-md shadow-md transition-colors duration-150 ${splitMethod === 'percentage'
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                }`}
            >
              By Proportion
            </button>
          </div>

          {splitMethod === 'qty' && (
            <div className='flex flex-col items-center gap-2 mt-4'>
              <div className='flex justify-center items-center gap-3'>
                <button
                  onClick={() => handleQuantityChange(Math.max(0, selectedQty - 1))}
                  disabled={selectedQty <= 0}
                  className='font-bold px-4 py-2 rounded-md shadow-md bg-white text-emerald-900 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150'
                >
                  -
                </button>
                <input
                  type="number"
                  min="0"
                  max={maxQty}
                  value={selectedQty}
                  onChange={(e) => {
                    const value = e.target.value === '' ? 0 : Number(e.target.value);
                    if (value >= 0 && value <= maxQty) {
                      handleQuantityChange(value);
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  className='w-20 px-3 py-2 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-600'
                />
                <button
                  onClick={() => handleQuantityChange(Math.min(maxQty, selectedQty + 1))}
                  disabled={selectedQty >= maxQty}
                  className='font-bold px-4 py-2 rounded-md shadow-md bg-white text-emerald-900 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150'
                >
                  +
                </button>
              </div>
              {maxQty < qty && (
                <p className="text-xs text-gray-400">Max {maxQty} of {qty} available</p>
              )}
            </div>
          )}

          {splitMethod === 'percentage' && (
            <div className='flex flex-col items-center gap-3 mt-4'>
              <div className='flex flex-wrap justify-center items-center gap-3'>
                {([
                  { label: 25, value: 25 },
                  { label: 33, value: 100 / 3 },
                  { label: 50, value: 50 },
                  { label: 100, value: 100 },
                ]).map(({ label: p, value }) => (
                  <button
                    key={p}
                    onClick={() => { setCustomPercent(false); handlePercentageSelect(value); }}
                    disabled={p > remainingPercent}
                    className={`font-bold px-4 py-2 rounded-md shadow-md bg-white text-emerald-900 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 ${!customPercent && splitPercent !== undefined && Math.round(splitPercent) === p ? 'outline-none ring-2 ring-emerald-600 bg-emerald-50' : ''
                      }`}
                  >
                    {p}%
                  </button>
                ))}
                <button
                  onClick={() => { setCustomPercent(true); setCustomInput(''); setSplitPercent(undefined); onShareUpdate(id, 0, 'percentage'); }}
                  className={`font-bold px-4 py-2 rounded-md shadow-md bg-white text-emerald-900 hover:bg-emerald-50 transition-colors duration-150 ${customPercent ? 'outline-none ring-2 ring-emerald-600 bg-emerald-50' : ''
                    }`}
                >
                  Custom
                </button>
              </div>
              {customPercent && (
                <div className='flex flex-col items-center gap-2'>
                  <div className='flex items-center gap-2'>
                    <input
                      type="text"
                      value={customInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setCustomInput(raw);

                        // Parse fraction (e.g. "1/3") or plain number (e.g. "25")
                        let percent: number | undefined;
                        const fractionMatch = raw.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
                        if (fractionMatch) {
                          const numerator = parseFloat(fractionMatch[1]);
                          const denominator = parseFloat(fractionMatch[2]);
                          if (denominator > 0) {
                            percent = (numerator / denominator) * 100;
                          }
                        } else {
                          const num = parseFloat(raw);
                          if (!isNaN(num)) {
                            percent = num;
                          }
                        }

                        if (percent !== undefined && percent >= 0 && percent <= remainingPercent) {
                          handlePercentageSelect(percent);
                        } else if (raw === '') {
                          handlePercentageSelect(0);
                        }
                      }}
                      onFocus={(e) => e.target.select()}
                      placeholder="e.g. 1/3 or 25"
                      className='w-28 px-3 py-2 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-600'
                    />
                    <span className='text-sm text-gray-500'>= {Math.round(splitPercent ?? 0)}%</span>
                    <button
                      onClick={() => {
                        const remaining = Math.max(0, 1 - othersClaimed);
                        const rPercent = remaining * 100;
                        setCustomInput(String(Math.round(rPercent)));
                        handlePercentageSelect(rPercent);
                      }}
                      disabled={Math.max(0, 1 - othersClaimed) === 0}
                      className="font-bold px-3 py-2 rounded-md shadow-md bg-amber-100 text-amber-900 hover:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed text-sm transition-colors duration-150"
                    >
                      Rest
                    </button>
                  </div>
                  <p className='text-xs text-gray-400'>
                    Enter a fraction (1/4) or percentage (25)
                    {remainingPercent < 100 && <span> · max {Math.round(remainingPercent)}%</span>}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Progress bar showing total claim status */}
          {(() => {
            const othersPercent = Math.min(othersClaimed * 100, 100);
            const youPercent = Math.min(currentProportion * 100, 100 - othersPercent);
            const totalPercent = Math.round(othersPercent + youPercent);
            return (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{totalPercent}% claimed</span>
                  {othersPercent > 0 && <span>{Math.round(othersPercent)}% others &middot; {Math.round(youPercent)}% you</span>}
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden flex">
                  {othersPercent > 0 && (
                    <div
                      className="h-full bg-gray-400 transition-all duration-300"
                      style={{ width: `${othersPercent}%` }}
                    />
                  )}
                  {youPercent > 0 && (
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${youPercent}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
