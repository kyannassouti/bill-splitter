"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { makeJoinCode } from "@/lib/joinCode";

export default function Home() {
  const r = useRouter();
  const supabase = createClient();
  const [joinCode, setJoinCode] = useState("");

  async function onCreateBill() {
    const code = makeJoinCode();
    const { data, error } = await supabase
      .from("bills")
      .insert({ join_code: code })
      .select("join_code")
      .single();
    if (error) { alert(error.message); return; }
    r.push(`/b/${data!.join_code}`);
  }

  function onJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode) return;
    r.push(`/b/${joinCode.trim().toUpperCase()}`);
  }

  return (
    <main className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-semibold">Bill Splitter</h1>

      <button onClick={onCreateBill} className="px-4 py-3 rounded-xl shadow border w-full">
        Create a new bill session
      </button>

      <form onSubmit={onJoin} className="space-y-3">
        <label className="block text-sm">Join with a code</label>
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="e.g. 7YX3QK2"
          className="w-full border rounded-lg px-3 py-2"
        />
        <button className="px-4 py-2 rounded-lg shadow border">Join</button>
      </form>
    </main>
  );
}
