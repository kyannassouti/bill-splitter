"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Bill = { id: string; join_code: string; tax_rate: number; tip_rate: number; tip_mode: string; tip_amount: number; currency: string; };
type Item = { id: string; bill_id: string; name: string; price: number; qty: number; };
type Participant = { id: string; bill_id: string; display_name: string; };
type Share = { id: string; bill_id: string; item_id: string; participant_id: string; proportion: number; };

export default function BillPage() {
    const { code } = useParams<{ code: string }>();
    const supabase = createClient();
    const [bill, setBill] = useState<Bill | null>(null);
    const [items, setItems] = useState<Item[]>([]);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [shares, setShares] = useState<Share[]>([]);
    const [displayName, setDisplayName] = useState("");
    const [me, setMe] = useState<Participant | null>(null);

    useEffect(() => {
        (async () => {
            const { data: b, error } = await supabase
                .from("bills")
                .select("*")
                .eq("join_code", String(code))
                .single();
            if (error || !b) return;
            setBill(b);

            const [it, ps, sh] = await Promise.all([
                supabase.from("items").select("*").eq("bill_id", b.id).order("name", { ascending: true }),
                supabase.from("participants").select("*").eq("bill_id", b.id).order("display_name", { ascending: true }),
                supabase.from("shares").select("*").eq("bill_id", b.id),
            ]);

            setItems(it.data ?? []);
            setParticipants(ps.data ?? []);
            setShares(sh.data ?? []);

            const pid = localStorage.getItem(`p:${b.id}`);
            if (pid) setMe((ps.data ?? []).find(p => p.id === pid) ?? null);
        })();
    }, [code, supabase]);

    async function addMe() {
        if (!bill || !displayName.trim()) return;
        const { data, error } = await supabase
            .from("participants")
            .insert({ bill_id: bill.id, display_name: displayName.trim() })
            .select("*")
            .single();
        if (error) return alert(error.message);
        setParticipants(p => [...p, data!]);
        setMe(data!);
        localStorage.setItem(`p:${bill.id}`, data!.id);
        setDisplayName("");
    }

    async function addItem(name: string, price: number, qty: number) {
        if (!bill) return;
        const { data, error } = await supabase
            .from("items")
            .insert({ bill_id: bill.id, name, price, qty })
            .select("*")
            .single();
        if (error) return alert(error.message);
        setItems(x => [...x, data!]);
    }

    async function setShare(item_id: string, participant_id: string, proportion: number) {
        if (!bill) return;
        const { data, error } = await supabase
            .from("shares")
            .upsert({ bill_id: bill.id, item_id, participant_id, proportion }, { onConflict: "item_id,participant_id" })
            .select("*")
            .single();
        if (error) return alert(error.message);
        setShares(s => {
            const others = s.filter(x => !(x.item_id === item_id && x.participant_id === participant_id));
            return [...others, data!];
        });
    }

    const totals = useMemo(() => {
        if (!bill) return { grand: 0, perPerson: {} as Record<string, number>, coverage: 0 };
        const itemSubtotal = items.reduce((acc, it) => acc + (Number(it.price) * Number(it.qty)), 0);

        const perPretax: Record<string, number> = {};
        for (const it of items) {
            const sub = Number(it.price) * Number(it.qty);
            for (const s of shares.filter(s => s.item_id === it.id)) {
                perPretax[s.participant_id] = (perPretax[s.participant_id] ?? 0) + sub * Number(s.proportion);
            }
        }

        const taxRate = Number(bill.tax_rate ?? 0);
        const tipRate = Number(bill.tip_rate ?? 0);
        const tipMode = String(bill.tip_mode ?? "percent");
        const tipAmount = Number(bill.tip_amount ?? 0);

        const sumPretax = Object.values(perPretax).reduce((a, b) => a + b, 0);
        const grandTax = taxRate * itemSubtotal;
        const grandTip = tipMode === "percent" ? tipRate * itemSubtotal : tipAmount;
        const grandTotal = itemSubtotal + grandTax + grandTip;

        const perPerson: Record<string, number> = {};
        let coveredTotal = 0;
        for (const pid of Object.keys(perPretax)) {
            const pre = perPretax[pid];
            const tax = taxRate * pre;
            const tip = tipMode === "percent" ? tipRate * pre : (sumPretax === 0 ? 0 : tipAmount * (pre / sumPretax));
            const tot = pre + tax + tip;
            perPerson[pid] = tot;
            coveredTotal += tot;
        }

        const coverage = grandTotal === 0 ? 0 : coveredTotal / grandTotal;
        return { grand: grandTotal, perPerson, coverage };
    }, [bill, items, shares]);

    if (!bill) return <main className="p-6">Loading…</main>;

    return (
        <main className="max-w-5xl mx-auto p-6 space-y-8">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">Bill {bill.join_code}</h1>
                    <p className="text-sm opacity-70">
                        {bill.currency} • Tax {(bill.tax_rate * 100).toFixed(0)}% • Tip {bill.tip_mode === "percent" ? `${(bill.tip_rate * 100).toFixed(0)}%` : `amount ${bill.tip_amount}`}
                    </p>
                </div>
            </header>

            {!me && (
                <section className="space-y-2">
                    <h2 className="font-medium">Join this session</h2>
                    <div className="flex gap-2">
                        <input className="border rounded px-3 py-2" placeholder="Your name"
                            value={displayName} onChange={e => setDisplayName(e.target.value)} />
                        <button onClick={addMe} className="px-4 py-2 border rounded">Add me</button>
                    </div>
                </section>
            )}

            <section className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h2 className="font-medium">Items</h2>
                    <AddItem onAdd={addItem} />
                    <ul className="space-y-2">
                        {items.map(it => (
                            <li key={it.id} className="border rounded p-3">
                                <div className="flex justify-between">
                                    <div>{it.name} × {it.qty}</div>
                                    <div>{Number(it.price).toFixed(2)}</div>
                                </div>
                                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                    {participants.map(p => (
                                        <ShareControl key={p.id}
                                            label={p.display_name}
                                            value={shares.find(s => s.item_id === it.id && s.participant_id === p.id)?.proportion ?? 0}
                                            onChange={(val) => setShare(it.id, p.id, val)} />
                                    ))}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="space-y-4">
                    <h2 className="font-medium">Participants</h2>
                    <ul className="space-y-1">
                        {participants.map(p => (
                            <li key={p.id} className="text-sm">{p.display_name}</li>
                        ))}
                    </ul>

                    <h2 className="font-medium pt-4">Totals</h2>
                    <div className="border rounded p-3">
                        <div className="text-sm">Bill total (incl. tax & tip): <b>{totals.grand.toFixed(2)}</b></div>
                        <div className="mt-2 h-2 bg-gray-200 rounded">
                            <div className="h-2 bg-black rounded" style={{ width: `${(totals.coverage * 100).toFixed(1)}%` }} />
                        </div>
                        <div className="text-xs mt-1 opacity-70">Coverage: {(totals.coverage * 100).toFixed(1)}%</div>

                        <div className="mt-3 space-y-1 text-sm">
                            {participants.map(p => {
                                const amt = totals.perPerson[p.id] ?? 0;
                                return <div key={p.id} className="flex justify-between"><span>{p.display_name}</span><b>{amt.toFixed(2)}</b></div>;
                            })}
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}

function AddItem({ onAdd }: { onAdd: (name: string, price: number, qty: number) => void }) {
    const [name, setName] = useState("");
    const [price, setPrice] = useState<string>("");
    const [qty, setQty] = useState<string>("1");
    return (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!name) return; onAdd(name, Number(price || 0), Number(qty || 1)); setName(""); setPrice(""); setQty("1"); }}>
            <input className="border rounded px-3 py-2 flex-1" placeholder="Item name" value={name} onChange={e => setName(e.target.value)} />
            <input className="border rounded px-3 py-2 w-28" placeholder="Price" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
            <input className="border rounded px-3 py-2 w-20" placeholder="Qty" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} />
            <button className="px-3 py-2 border rounded">Add</button>
        </form>
    );
}

function ShareControl({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
    function set(v: number) { onChange(Math.max(0, Math.min(1, v))); }
    return (
        <div className="border rounded p-2 text-xs space-y-1">
            <div className="truncate">{label}</div>
            <div className="flex items-center gap-1">
                <button type="button" className="px-2 py-1 border rounded" onClick={() => set(1)}>100%</button>
                <button type="button" className="px-2 py-1 border rounded" onClick={() => set(0.5)}>50%</button>
                <button type="button" className="px-2 py-1 border rounded" onClick={() => set(1 / 3)}>33.33%</button>
                <button type="button" className="px-2 py-1 border rounded" onClick={() => set(0.25)}>25%</button>
            </div>
            <div className="flex gap-1">
                <input
                    className="border rounded px-2 py-1 w-full"
                    placeholder="e.g. 40% or 1/3"
                    onBlur={(e) => {
                        const raw = e.target.value.trim().replace("%", "");
                        let v = 0;
                        if (raw.includes("/")) {
                            const [a, b] = raw.split("/").map(Number);
                            if (a > 0 && b > 0) v = a / b;
                        } else {
                            const n = Number(raw);
                            v = isNaN(n) ? 0 : (e.target.value.includes("%") ? n / 100 : n);
                        }
                        set(v);
                        e.target.value = "";
                    }}
                />
                <div className="px-2 py-1 border rounded whitespace-nowrap">{(value * 100).toFixed(0)}%</div>
            </div>
        </div>
    );
}
