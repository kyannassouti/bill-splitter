'use client'
import { useState, useEffect } from 'react';
import { Item, ItemShare } from '@/types/types';
import { Claim, EPS, NO_CLAIM, claimFromShare, claimUnits, describeClaim, formatUnits } from '@/lib/units';

const WAY_OPTIONS = [2, 3, 4, 5];

// Floor to cents so per-person shares never overshoot the item total
const floorCents = (n: number) => Math.floor(n * 100) / 100;

const stepLabelClass = 'font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-ink-soft';
const linkClass =
  'font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-pine underline underline-offset-4 decoration-pine/30 hover:decoration-pine';
const stepClass =
  'w-10 h-10 font-medium border border-paper-deep bg-paper text-ink hover:bg-paper-edge disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150';
const chipClass = (selected: boolean) =>
  `h-10 px-3 font-medium border border-paper-deep bg-paper text-ink hover:bg-paper-edge disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 ${
    selected ? 'outline-none ring-2 ring-pine bg-pine/5' : ''
  }`;


interface ItemCardProps extends Item {
  currentShare?: ItemShare;
  othersClaimed: number; // 0–1 range: sum of other participants' proportions
  hasClaims: boolean; // true if any participant (including current user) has claimed this item
  expanded: boolean;
  onToggle: () => void;
  onShareUpdate: (itemId: string, proportion: number, splitMethod: 'qty' | 'percentage', claim: Claim) => void;
  onItemUpdate?: (item: Item) => void;
  onItemDelete?: (itemId: string) => void;
  changedByOthers?: boolean; // your claim was cut back because someone else claimed first
  onClaimReduced?: (itemId: string) => void;
}


export default function ItemCard({ id, name, price, qty, currentShare, othersClaimed, hasClaims, expanded, onToggle, onShareUpdate, onItemUpdate, onItemDelete, changedByOthers, onClaimReduced }: ItemCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editName, setEditName] = useState(name);
  const [editPrice, setEditPrice] = useState(price.toString());
  const [editQty, setEditQty] = useState(qty.toString());

  // A claim is "how many of these" × "shares you cover ÷ people splitting them"
  const [claim, setClaim] = useState<Claim>(() => claimFromShare(currentShare, qty));
  const [moreWays, setMoreWays] = useState(claim.mode === 'split' && !WAY_OPTIONS.includes(claim.ways));

  // What's left for you after everyone else's claims, in units
  const remainingUnits = Math.max(0, qty * (1 - othersClaimed));
  const fits = (next: Claim) => claimUnits(next) <= remainingUnits + EPS;

  const myUnits = claimUnits(claim);
  const currentProportion = myUnits / qty;
  const shareAmount = price * myUnits;

  const save = (next: Claim) => {
    setClaim(next);
    // Just yours → 'qty'; split or uneven → 'percentage' (the DB allows just these two)
    onShareUpdate(id, claimUnits(next) / qty, next.mode === 'mine' ? 'qty' : 'percentage', next);
  };
  const update = (changes: Partial<Claim>) => save({ ...claim, ...changes });
  const allows = (changes: Partial<Claim>) => fits({ ...claim, ...changes });

  // If someone else claims more while you're on the page, take away whole ones until yours fits
  useEffect(() => {
    if (fits(claim)) return;
    let next = claim;
    while (next.count > 0 && !fits(next)) next = { ...next, count: next.count - 1 };
    save(next.count > 0 ? next : NO_CLAIM);
    onClaimReduced?.(id);
  }, [othersClaimed]); // eslint-disable-line react-hooks/exhaustive-deps

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


  const totalPrice = price * qty;

  return (
    <div className="bg-paper shadow-[0_1px_2px_rgba(25,28,26,0.06)] transition-shadow duration-200 overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-paper-edge/50 transition-colors duration-150"
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-ink truncate">{name} <span className="font-mono text-ink-soft text-sm">×{qty}</span></p>
          <p className="font-mono text-[0.6875rem] text-ink-faint tabular-nums">
            ${price.toFixed(2)} each · ${totalPrice.toFixed(2)} total
            {othersClaimed > 0 && (
              <span className="text-ink-soft"> · {formatUnits(othersClaimed * qty)} taken</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          <div className="text-right">
            <p className="font-mono font-medium text-ink tabular-nums">${floorCents(shareAmount).toFixed(2)}</p>
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">Your share</p>
          </div>
          <svg
            className={`w-4 h-4 text-ink-faint transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-paper-deep">
          {/* Edit / Delete actions */}
          {(onItemUpdate || onItemDelete) && (
            <div className="pt-3 mb-3">
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="px-2 py-1 border border-paper-deep focus:outline-none focus:ring-2 focus:ring-pine font-bold text-lg"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      className="w-24 px-2 py-1 border border-paper-deep focus:outline-none focus:ring-2 focus:ring-pine text-sm"
                      placeholder="Price"
                    />
                    <input
                      type="number"
                      min="1"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      className="w-16 px-2 py-1 border border-paper-deep focus:outline-none focus:ring-2 focus:ring-pine text-sm"
                      placeholder="Qty"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleEditCancel}
                      className="font-mono text-[0.625rem] uppercase tracking-[0.14em] px-2 py-1 transition-colors duration-150 text-ink-soft hover:text-ink hover:bg-paper-edge"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleEditSave}
                      className="font-mono text-[0.625rem] uppercase tracking-[0.14em] px-2 py-1 transition-colors duration-150 bg-pine text-paper hover:bg-pine-deep"
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
                      className="font-mono text-[0.625rem] uppercase tracking-[0.14em] px-2 py-1 transition-colors duration-150 text-ink-soft hover:text-ink hover:bg-paper-edge"
                    >
                      Edit
                    </button>
                  )}
                  {onItemDelete && !confirmingDelete && (
                    <button
                      onClick={() => setConfirmingDelete(true)}
                      disabled={hasClaims}
                      title={hasClaims ? 'Item claimed by a participant' : undefined}
                      className="font-mono text-[0.625rem] uppercase tracking-[0.14em] px-2 py-1 transition-colors duration-150 text-alert hover:bg-alert/10 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  )}
                  {onItemDelete && confirmingDelete && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setConfirmingDelete(false)}
                        className="font-mono text-[0.625rem] uppercase tracking-[0.14em] px-2 py-1 transition-colors duration-150 text-ink-soft hover:text-ink hover:bg-paper-edge"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => onItemDelete(id)}
                        className="font-mono text-[0.625rem] uppercase tracking-[0.14em] px-2 py-1 transition-colors duration-150 bg-alert text-paper hover:bg-alert/90"
                      >
                        Confirm
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {changedByOthers && (
            <p className="mt-3 px-3 py-2 bg-flag/10 text-flag text-sm">
              Someone else claimed part of this first, so yours was cut to what&apos;s left. Check it, then tap Continue.
            </p>
          )}

          {/* Step 1: how many */}
          <div className="pt-3 flex items-center justify-between gap-3">
            <div>
              <p className={stepLabelClass}>How many did you have?</p>
              {qty > 1 && <p className="mt-0.5 text-sm text-ink-soft">On your own or shared</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => update({ count: claim.count - 1 })}
                disabled={claim.count <= 0}
                aria-label="One fewer"
                className={stepClass}
              >
                −
              </button>
              <span className="w-8 text-center font-mono text-lg text-ink tabular-nums">{claim.count}</span>
              <button
                onClick={() => update({ count: claim.count + 1 })}
                disabled={claim.count >= qty || !allows({ count: claim.count + 1 })}
                aria-label="One more"
                className={stepClass}
              >
                +
              </button>
            </div>
          </div>

          {claim.count > 0 && (
            <>
              {/* Step 2: shared? */}
              <div className="mt-4">
                <p className={stepLabelClass}>{claim.count > 1 ? 'Were they shared?' : 'Was it shared?'}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => update({ mode: 'mine' })}
                    disabled={!allows({ mode: 'mine' })}
                    className={chipClass(claim.mode === 'mine')}
                  >
                    Just me
                  </button>
                  <button
                    onClick={() => update({ mode: 'split' })}
                    disabled={!allows({ mode: 'split' })}
                    className={chipClass(claim.mode !== 'mine')}
                  >
                    Split it
                  </button>
                </div>
              </div>

              {claim.mode === 'split' && (
                <>
                  {/* Step 3a: how many people */}
                  <div className="mt-4">
                    <p className={stepLabelClass}>Split between how many people?</p>
                    <div className="mt-2 grid grid-cols-5 gap-2">
                      {WAY_OPTIONS.map((ways) => (
                        <button
                          key={ways}
                          onClick={() => { setMoreWays(false); update({ ways, covered: Math.min(claim.covered, ways) }); }}
                          disabled={!allows({ ways, covered: Math.min(claim.covered, ways) })}
                          className={chipClass(!moreWays && claim.ways === ways)}
                        >
                          {ways}
                        </button>
                      ))}
                      <button
                        onClick={() => { setMoreWays(true); update({ ways: Math.max(claim.ways, 6) }); }}
                        className={`${chipClass(moreWays)} text-xs px-1`}
                      >
                        More
                      </button>
                    </div>
                    {moreWays && (
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          onClick={() => update({ ways: claim.ways - 1, covered: Math.min(claim.covered, claim.ways - 1) })}
                          disabled={claim.ways <= 2 || !allows({ ways: claim.ways - 1, covered: Math.min(claim.covered, claim.ways - 1) })}
                          aria-label="Fewer people"
                          className={stepClass}
                        >
                          −
                        </button>
                        <span className="w-8 text-center font-mono text-lg text-ink tabular-nums">{claim.ways}</span>
                        <button
                          onClick={() => update({ ways: claim.ways + 1 })}
                          disabled={claim.ways >= 30}
                          aria-label="More people"
                          className={stepClass}
                        >
                          +
                        </button>
                        <span className="text-sm text-ink-soft">people</span>
                      </div>
                    )}
                  </div>

                  {/* Step 3b: how many of those shares you pay for */}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div>
                      <p className={stepLabelClass}>Shares you&apos;re paying for</p>
                      <p className="mt-0.5 text-sm text-ink-soft">1 is just you. More if you&apos;re covering someone.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => update({ covered: claim.covered - 1 })}
                        disabled={claim.covered <= 1}
                        aria-label="Fewer shares"
                        className={stepClass}
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-mono text-lg text-ink tabular-nums">{claim.covered}</span>
                      <button
                        onClick={() => update({ covered: claim.covered + 1 })}
                        disabled={claim.covered >= claim.ways - 1 || !allows({ covered: claim.covered + 1 })}
                        aria-label="More shares"
                        className={stepClass}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </>
              )}

              {claim.mode === 'percent' ? (
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className={stepLabelClass}>Your percent of {claim.count > 1 ? `those ${claim.count}` : 'it'}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="1"
                      max="100"
                      value={claim.percent}
                      onChange={(e) => {
                        const percent = Number(e.target.value);
                        if (percent > 0 && percent <= 100 && allows({ percent })) update({ percent });
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-20 px-3 py-2 border border-paper-deep bg-white text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-pine"
                    />
                    <span className="text-ink font-bold">%</span>
                    <button onClick={() => update({ mode: 'split' })} className={linkClass}>Use people</button>
                  </div>
                </div>
              ) : claim.mode === 'split' && (
                <button
                  onClick={() => update({ mode: 'percent', percent: Math.round((claim.covered / claim.ways) * 100) })}
                  className={`mt-3 ${linkClass}`}
                >
                  Uneven split? Use a percent
                </button>
              )}

              <p className="mt-4 flex items-baseline font-mono text-[0.8125rem] font-medium">
                <span className="text-ink">You: {describeClaim(claim)}</span>
                <span className="leader" />
                <span className="text-ink tabular-nums">${floorCents(shareAmount).toFixed(2)}</span>
              </p>
            </>
          )}

          {/* Progress bar showing total claim status */}
          {(() => {
            const othersPercent = Math.min(othersClaimed * 100, 100);
            const youPercent = Math.min(currentProportion * 100, 100 - othersPercent);
            const leftUnits = Math.max(0, qty - othersClaimed * qty - myUnits);
            return (
              <div className="mt-4">
                <div className="flex justify-between font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-soft mb-1.5">
                  <span>{formatUnits(othersClaimed * qty + myUnits)} of {qty} claimed</span>
                  <span className={leftUnits > EPS ? 'text-flag' : ''}>
                    {leftUnits > EPS ? `${formatUnits(leftUnits)} left` : 'All claimed'}
                  </span>
                </div>
                <div className="w-full h-[3px] bg-paper-deep overflow-hidden flex">
                  {othersPercent > 0 && (
                    <div
                      className="h-full bg-ink-faint transition-all duration-300"
                      style={{ width: `${othersPercent}%` }}
                    />
                  )}
                  {youPercent > 0 && (
                    <div
                      className="h-full bg-pine transition-all duration-300"
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
