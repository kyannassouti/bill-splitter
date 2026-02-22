'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Home() {
    const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
    const [name, setName] = useState('');
    const [sessionCode, setSessionCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    async function handleCreateSession() {
        if (!name.trim()) {
            setError('Please enter your name');
            return;
        }
        setLoading(true);
        setError('');

        // 1. Create session
        const { data: session, error: sessionErr } = await supabase
            .from('sessions')
            .insert({})
            .select()
            .single();

        if (sessionErr || !session) {
            setError(sessionErr?.message ?? 'Failed to create session');
            setLoading(false);
            return;
        }

        // 2. Add participant
        const { data: participant, error: participantErr } = await supabase
            .from('participants')
            .insert({ session_id: session.id, name: name.trim() })
            .select()
            .single();

        if (participantErr || !participant) {
            setError(participantErr?.message ?? 'Failed to add participant');
            setLoading(false);
            return;
        }

        localStorage.setItem('participantId', participant.id);
        router.push(`/session/${session.code}/items`);
    }

    async function handleJoinSession() {
        if (!name.trim()) {
            setError('Please enter your name');
            return;
        }
        if (!sessionCode.trim()) {
            setError('Please enter a session code');
            return;
        }
        setLoading(true);
        setError('');

        // 1. Look up session by code
        const { data: session, error: sessionErr } = await supabase
            .from('sessions')
            .select()
            .eq('code', sessionCode.trim().toUpperCase())
            .single();

        if (sessionErr || !session) {
            setError('Session not found. Check the code and try again.');
            setLoading(false);
            return;
        }

        // 2. Add participant
        const { data: participant, error: participantErr } = await supabase
            .from('participants')
            .insert({ session_id: session.id, name: name.trim() })
            .select()
            .single();

        if (participantErr || !participant) {
            setError(participantErr?.message ?? 'Failed to add participant');
            setLoading(false);
            return;
        }

        localStorage.setItem('participantId', participant.id);
        router.push(`/session/${session.code}/items`);
    }

    return (
        <main className="py-50 h-screen bg-teal-50">
            {mode === 'home' && (
                <div className="w-90 h-60 bg-white rounded-2xl shadow-lg mx-auto">
                    <h1 className="font-extrabold text-4xl text-center p-7 text-teal-900">Bill Splitter</h1>

                    <div className="flex flex-col items-center gap-4">
                        <button
                            className="bg-teal-700 rounded-md text-white font-bold px-6 py-2 shadow-md hover:bg-teal-800"
                            onClick={() => setMode('create')}
                        >
                            Create New Session
                        </button>
                        <button
                            className="bg-white rounded-md border-2 border-solid border-teal-500 text-teal-900 font-bold px-6 py-2 shadow-md hover:bg-teal-50"
                            onClick={() => setMode('join')}
                        >
                            Join Existing Session
                        </button>
                    </div>
                </div>
            )}
            {mode === 'create' && (
                <div className="w-90 h-65 bg-white rounded-2xl shadow-lg mx-auto p-6">
                    <h1 className="font-extrabold text-4xl text-center mb-6 text-teal-900">
                        Create Session
                    </h1>

                    <div className="flex flex-col items-center gap-4">
                        <div className="w-full max-w-xs">
                            <label className="block text-teal-900 font-semibold mb-2">
                                Enter Name:
                            </label>
                            <input
                                name="name"
                                placeholder="Name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                        </div>

                        {error && <p className="text-red-500 text-sm">{error}</p>}

                        <div className="flex gap-3 mt-2">
                            <button
                                className="bg-teal-700 text-white font-bold px-6 py-2 rounded-md shadow-md hover:bg-teal-800 disabled:opacity-50"
                                onClick={handleCreateSession}
                                disabled={loading}
                            >
                                {loading ? 'Creating...' : 'Create Session'}
                            </button>
                            <button
                                onClick={() => setMode('home')}
                                className="bg-teal-100 text-teal-900 font-bold px-6 py-2 rounded-md shadow-md hover:bg-teal-200"
                            >
                                Back
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {mode === 'join' && (
                <div className="w-90 h-85 bg-white rounded-2xl shadow-lg mx-auto p-6">
                    <h1 className="font-extrabold text-4xl text-center mb-6 text-teal-900">
                        Join Session
                    </h1>

                    <div className="flex flex-col items-center gap-4">
                        <div className="w-full max-w-xs">
                            <label className="block text-teal-900 font-semibold mb-2">
                                Enter Name:
                            </label>
                            <input
                                name="name"
                                placeholder="Name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                        </div>

                        <div className="w-full max-w-xs">
                            <label className="block text-teal-900 font-semibold mb-2">
                                Enter Session Code:
                            </label>
                            <input
                                name="sessionCode"
                                placeholder="e.g. X7K9M2"
                                value={sessionCode}
                                onChange={(e) => setSessionCode(e.target.value)}
                                maxLength={6}
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 uppercase tracking-widest text-center font-mono text-lg"
                            />
                        </div>

                        {error && <p className="text-red-500 text-sm">{error}</p>}

                        <div className="flex gap-3 mt-2">
                            <button
                                className="bg-teal-700 text-white font-bold px-6 py-2 rounded-md shadow-md hover:bg-teal-800 disabled:opacity-50"
                                onClick={handleJoinSession}
                                disabled={loading}
                            >
                                {loading ? 'Joining...' : 'Join Session'}
                            </button>
                            <button
                                onClick={() => setMode('home')}
                                className="bg-teal-100 text-teal-900 font-bold px-6 py-2 rounded-md shadow-md hover:bg-teal-200"
                            >
                                Back
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}
