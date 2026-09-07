'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import placeholderItems from '@/data/placeholder-items.json';
import sampleParticipants from '@/data/sample-participants.json';
import ReceiptDemo from '@/components/ui/ReceiptDemo';
import QrScanner from '@/components/ui/QrScanner';

const STEPS = [
  {
    label: 'Add the bill',
    body: 'One person enters the line items once. Anyone at the table can add whatever got missed.',
  },
  {
    label: 'Share the code',
    body: 'Six letters. No app to install, no account to make, no one added to a group chat.',
  },
  {
    label: 'Claim your share',
    body: 'Take a whole item or part of one. The split fills in live on everyone’s phone.',
  },
];

/**
 * Fill a sample session with the demo bill and a few people mid-split, so
 * someone opening it alone still sees what a real table looks like.
 */
async function seedSampleSession(sessionId: string) {
    const { data: items } = await supabase
        .from('items')
        .insert(placeholderItems.map(item => ({ session_id: sessionId, ...item })))
        .select('id, name');
    if (!items) return;

    // Insert order is not guaranteed, so match rows back up by name.
    const itemIdByName = new Map(items.map(item => [item.name, item.id]));
    const itemIdAt = (index: number) => itemIdByName.get(placeholderItems[index]?.name);

    const now = new Date().toISOString();
    const { data: people } = await supabase
        .from('participants')
        .insert(sampleParticipants.map(person => ({
            session_id: sessionId,
            name: person.name,
            tip_percent: person.tipPercent,
            submitted_at: person.submitted ? now : null,
        })))
        .select('id, name');
    if (!people) return;

    const personIdByName = new Map(people.map(person => [person.name, person.id]));

    const shares = sampleParticipants
        .flatMap(person =>
            person.claims.map(claim => ({
                participant_id: personIdByName.get(person.name),
                item_id: itemIdAt(claim.item),
                proportion: claim.proportion,
                split_method: claim.splitMethod,
            }))
        )
        .filter(share => share.participant_id && share.item_id);

    if (shares.length) await supabase.from('item_shares').insert(shares);
}

export default function Home() {
    const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
    const [name, setName] = useState('');
    const [sessionCode, setSessionCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [stats, setStats] = useState<{ sessions: number; people: number; items: number } | null>(null);
    const [scanning, setScanning] = useState(false);
    const router = useRouter();

    // A scanned QR link lands here with the code already attached.
    useEffect(() => {
        const code = new URLSearchParams(window.location.search).get('code');
        if (code && /^[A-Za-z0-9]{6}$/.test(code)) {
            // Syncing from the URL on mount; there is no earlier point to read it.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSessionCode(code.toUpperCase());
            setMode('join');
        }
    }, []);

    // Real usage counts. If the query fails, the tally is hidden rather than faked.
    useEffect(() => {
        async function loadStats() {
            const [sessions, people, items] = await Promise.all([
                supabase.from('sessions').select('*', { count: 'exact', head: true }),
                supabase.from('participants').select('*', { count: 'exact', head: true }),
                supabase.from('items').select('*', { count: 'exact', head: true }),
            ]);
            if (sessions.count && people.count && items.count) {
                setStats({ sessions: sessions.count, people: people.count, items: items.count });
            }
        }
        loadStats();
    }, []);

    async function handleCreateSession(withSample = false) {
        const participantName = name.trim() || (withSample ? 'Guest' : '');
        if (!participantName) {
            setError('Enter your name to start');
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
            setError(sessionErr?.message ?? 'Could not start the split. Try again.');
            setLoading(false);
            return;
        }

        // 2. Add participant
        const { data: participant, error: participantErr } = await supabase
            .from('participants')
            .insert({ session_id: session.id, name: participantName })
            .select()
            .single();

        if (participantErr || !participant) {
            setError(participantErr?.message ?? 'Could not add you to the session. Try again.');
            setLoading(false);
            return;
        }

        // Sample bills start pre-filled so a session can be tried solo.
        if (withSample) {
            await seedSampleSession(session.id);
        }

        sessionStorage.setItem('participantId', participant.id);
        router.push(`/session/${session.code}/items`);
    }

    async function handleJoinSession() {
        if (!name.trim()) {
            setError('Enter your name to join');
            return;
        }
        if (!sessionCode.trim()) {
            setError('Enter the six-letter code');
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
            setError('No session with that code. Check the letters and try again.');
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
            setError(participantErr?.message ?? 'Could not add you to the session. Try again.');
            setLoading(false);
            return;
        }

        sessionStorage.setItem('participantId', participant.id);
        router.push(`/session/${session.code}/items`);
    }

    function goHome() {
        setMode('home');
        setError('');
    }

    const inputClass =
        'w-full bg-white border border-paper-deep px-3.5 py-2.5 text-ink placeholder:text-ink-faint focus:outline-none focus:border-pine focus:ring-1 focus:ring-pine transition-colors';
    const labelClass =
        'block font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-ink-soft mb-2';
    const primaryClass =
        'bg-pine text-paper font-medium px-6 py-3 hover:bg-pine-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine disabled:opacity-50 transition-colors';
    const secondaryClass =
        'border border-ink/20 text-ink font-medium px-6 py-3 hover:border-ink/50 hover:bg-paper-edge focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine transition-colors';

    if (mode !== 'home') {
        const isCreate = mode === 'create';
        return (
            <main className="min-h-screen bg-paper-edge flex items-center justify-center p-6">
                <div className="w-full max-w-sm bg-paper p-8 shadow-[0_1px_2px_rgba(25,28,26,0.06),0_12px_32px_-12px_rgba(25,28,26,0.18)]">
                    <h1 className="font-mono text-xl tracking-tight text-ink mb-6">
                        {isCreate ? 'Start a split' : 'Join with a code'}
                    </h1>

                    <div className="space-y-5">
                        <div>
                            <label htmlFor="name" className={labelClass}>Your name</label>
                            <input
                                id="name"
                                name="name"
                                placeholder="Maya"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className={inputClass}
                            />
                        </div>

                        {!isCreate && (
                            <div>
                                <label htmlFor="code" className={labelClass}>Session code</label>
                                <input
                                    id="code"
                                    name="sessionCode"
                                    placeholder="X7K9M2"
                                    value={sessionCode}
                                    onChange={(e) => setSessionCode(e.target.value)}
                                    maxLength={6}
                                    className={`${inputClass} font-mono uppercase tracking-[0.3em] text-center text-lg`}
                                />
                                <button
                                    type="button"
                                    onClick={() => setScanning(true)}
                                    className="mt-3 w-full flex items-center justify-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em] px-4 py-2.5 border border-ink/20 text-ink hover:border-ink/50 hover:bg-paper-edge transition-colors duration-150"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5zM13.5 14.25h2.25v2.25H13.5zM18 18.75h2.25V21H18zM13.5 18.75h2.25V21H13.5zM18 14.25h2.25v2.25H18z" />
                                    </svg>
                                    Scan a QR code
                                </button>
                            </div>
                        )}

                        {error && (
                            <p className="font-mono text-[0.75rem] text-claim-3">{error}</p>
                        )}

                        <div className="flex items-center gap-3 pt-1">
                            <button
                                className={primaryClass}
                                onClick={() => (isCreate ? handleCreateSession(false) : handleJoinSession())}
                                disabled={loading}
                            >
                                {loading ? 'One moment' : isCreate ? 'Start a split' : 'Join with a code'}
                            </button>
                            <button onClick={goHome} className="font-mono text-[0.75rem] uppercase tracking-[0.16em] text-ink-soft hover:text-ink transition-colors">
                                Back
                            </button>
                        </div>
                    </div>
                </div>

                {scanning && (
                    <QrScanner
                        onCode={(code) => {
                            setSessionCode(code);
                            setScanning(false);
                            setError('');
                        }}
                        onClose={() => setScanning(false)}
                    />
                )}
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-paper-edge text-ink">
            {/* Hero */}
            <section className="max-w-5xl mx-auto px-6 pt-10 pb-16 sm:pt-16 sm:pb-24">
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-ink-soft animate-rise-in">
                    Bill Splitter
                </p>

                <div className="mt-10 grid lg:grid-cols-[1fr_auto] gap-14 lg:gap-16 items-center">
                    <div>
                        <h1
                            className="font-mono font-medium tracking-[-0.03em] leading-[1.08] text-[clamp(2.1rem,5.2vw,3.5rem)] animate-rise-in"
                            style={{ animationDelay: '80ms' }}
                        >
                            Everyone claims their own items, at the same time.
                        </h1>

                        <p
                            className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-ink-soft animate-rise-in"
                            style={{ animationDelay: '160ms' }}
                        >
                            Share a six-letter code. Everyone opens the bill on their own phone and
                            takes exactly what they had — half the pizza, one of the three garlic
                            breads. Totals update live, tax and tip included.
                        </p>

                        <div
                            className="mt-9 flex flex-wrap items-center gap-3 animate-rise-in"
                            style={{ animationDelay: '240ms' }}
                        >
                            <button className={primaryClass} onClick={() => setMode('create')}>
                                Start a split
                            </button>
                            <button className={secondaryClass} onClick={() => setMode('join')}>
                                Join with a code
                            </button>
                        </div>

                        <button
                            onClick={() => handleCreateSession(true)}
                            disabled={loading}
                            className="mt-5 font-mono text-[0.75rem] uppercase tracking-[0.16em] text-pine hover:text-pine-deep underline underline-offset-4 decoration-pine/30 hover:decoration-pine disabled:opacity-50 transition-colors animate-rise-in"
                            style={{ animationDelay: '300ms' }}
                        >
                            {loading ? 'Opening sample bill' : 'Or try a sample bill →'}
                        </button>

                        {error && (
                            <p className="mt-3 font-mono text-[0.75rem] text-claim-3">{error}</p>
                        )}
                    </div>

                    <div className="animate-rise-in lg:w-[21rem]" style={{ animationDelay: '360ms' }}>
                        <ReceiptDemo />
                    </div>
                </div>
            </section>

            {/* How it works */}
            <section className="border-t border-paper-deep">
                <div className="max-w-5xl mx-auto px-6 py-16 sm:py-20">
                    <div className="grid sm:grid-cols-3 gap-10 sm:gap-8">
                        {STEPS.map((step) => (
                            <div key={step.label}>
                                <h2 className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-pine">
                                    {step.label}
                                </h2>
                                <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
                                    {step.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Usage tally — real numbers, straight from the database */}
            {stats && (
                <section className="border-t border-paper-deep">
                    <div className="max-w-5xl mx-auto px-6 py-16 sm:py-20">
                        <div className="max-w-sm">
                            <p className="font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-ink-soft">
                                Used so far
                            </p>
                            <ul className="mt-5 font-mono text-[0.875rem] space-y-2.5">
                                <li className="flex items-baseline">
                                    <span className="text-ink-soft">Sessions created</span>
                                    <span className="leader" />
                                    <span className="tabular-nums font-medium">{stats.sessions}</span>
                                </li>
                                <li className="flex items-baseline">
                                    <span className="text-ink-soft">People joined</span>
                                    <span className="leader" />
                                    <span className="tabular-nums font-medium">{stats.people}</span>
                                </li>
                                <li className="flex items-baseline">
                                    <span className="text-ink-soft">Items split</span>
                                    <span className="leader" />
                                    <span className="tabular-nums font-medium">{stats.items}</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </section>
            )}

            {/* Footer */}
            <footer className="border-t border-paper-deep">
                <div className="max-w-5xl mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-4">
                    <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint">
                        Bill Splitter
                    </p>
                    <a
                        href="https://github.com/kyannassouti/bill-splitter"
                        className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-soft hover:text-ink underline underline-offset-4 decoration-ink-faint/50 hover:decoration-ink transition-colors"
                    >
                        Source on GitHub
                    </a>
                </div>
            </footer>
        </main>
    );
}
