'use client'
import { useState } from 'react';

interface AddItemModalProps {
  onAdd: (name: string, price: number, qty: number) => void;
  onClose: () => void;
}

export default function AddItemModal({ onAdd, onClose }: AddItemModalProps) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parseFloat(price);
    const parsedQty = parseInt(qty);
    if (!name.trim() || isNaN(parsedPrice) || parsedPrice <= 0 || isNaN(parsedQty) || parsedQty < 1) return;
    onAdd(name.trim(), parsedPrice, parsedQty);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-paper shadow-[0_20px_50px_-12px_rgba(25,28,26,0.35)] p-6 w-full max-w-md animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-ink mb-4">Add Item</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Item Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Burger"
              className="w-full px-3 py-2 border border-paper-deep focus:outline-none focus:ring-2 focus:ring-pine"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Unit Price ($)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-paper-deep focus:outline-none focus:ring-2 focus:ring-pine"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Quantity</label>
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full px-3 py-2 border border-paper-deep focus:outline-none focus:ring-2 focus:ring-pine"
            />
          </div>
          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 font-bold px-6 py-2 bg-paper-edge text-ink hover:bg-paper-deep transition-colors duration-150"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 font-bold px-6 py-2 bg-pine text-white hover:bg-pine-deep transition-colors duration-150"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
