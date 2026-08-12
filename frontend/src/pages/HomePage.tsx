import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CheckCircle2, FileText, MessageCircle, Shield, Users, Zap, Menu } from 'lucide-react';

import { Button } from '@/components/ui/button';

const INK = '#10192B';
const PAPER = '#F6F2E8';
const LINE = '#DCD3BE';
const BRASS = '#B8863B';
const BRASS_LIGHT = '#D9B778';
const MUTED_ON_PAPER = '#5B5647';
const MUTED_ON_INK = '#9AA3B5';

const features = [
    {
        code: 'JE-01',
        icon: <Zap className="h-5 w-5" />,
        title: 'Instant Bookkeeping',
        description: 'Connect your bank and every transaction sorts itself into the right account. Month-end close takes minutes, not weeks.',
    },
    {
        code: 'JE-02',
        icon: <FileText className="h-5 w-5" />,
        title: 'FTA-Ready Filing',
        description: 'VAT and Corporate Tax returns are prepared in FTA format automatically. Review the numbers, then submit.',
    },
    {
        code: 'JE-03',
        icon: <BarChart3 className="h-5 w-5" />,
        title: 'Live Reporting',
        description: 'P&L, cash flow, and balance sheet update as transactions land. Share a live dashboard with investors — no exports.',
    },
    {
        code: 'JE-04',
        icon: <MessageCircle className="h-5 w-5" />,
        title: 'AI on WhatsApp',
        description: 'Ask about your runway or last month\'s biggest expense in plain English, right on WhatsApp.',
    },
    {
        code: 'JE-05',
        icon: <Users className="h-5 w-5" />,
        title: 'Expert Support',
        description: 'A certified accountant answers on Slack, email, or phone within four hours, guaranteed.',
    },
    {
        code: 'JE-06',
        icon: <Shield className="h-5 w-5" />,
        title: 'Bank-Grade Security',
        description: 'Your financial data is encrypted end-to-end. We never train models on it.',
    },
];

const stats = [
    { value: '92%', label: 'Transactions auto-matched' },
    { value: '4 hrs', label: 'Support response time' },
    { value: '14.2 mo', label: 'Runway visibility' },
    { value: '100%', label: 'FTA-ready filings' },
];

function LedgerBalance() {
    const target = 128450;
    const [value, setValue] = useState(0);
    const [balanced, setBalanced] = useState(false);

    useEffect(() => {
        const prefersReduced =
            typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (prefersReduced) {
            setValue(target);
            setBalanced(true);
            return;
        }

        let raf: number;
        const duration = 1200;
        const startTime = performance.now();

        const step = (now: number) => {
            const progress = Math.min((now - startTime) / duration, 1);
            setValue(Math.floor(progress * target));
            if (progress < 1) {
                raf = requestAnimationFrame(step);
            } else {
                setBalanced(true);
            }
        };

        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, []);

    const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    }).format(value);

    return (
        <div
            className="w-full max-w-sm rounded-sm border p-6 font-mono"
            style={{ borderColor: LINE, backgroundColor: PAPER, color: INK, boxShadow: `6px 6px 0 0 ${BRASS}` }}
        >
            <div
                className="mb-4 flex items-center justify-between border-b pb-3 text-[11px] uppercase tracking-[0.2em]"
                style={{ borderColor: LINE, color: MUTED_ON_PAPER }}
            >
                <span>General Ledger</span>
                <span>Aug 2026</span>
            </div>
            <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                    <span style={{ color: MUTED_ON_PAPER }}>Debit</span>
                    <span className="tabular-nums">{formatted}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span style={{ color: MUTED_ON_PAPER }}>Credit</span>
                    <span className="tabular-nums">{formatted}</span>
                </div>
            </div>
            <div className="mt-5 flex items-center justify-between border-t pt-3" style={{ borderColor: LINE }}>
                <span className="text-[11px] uppercase tracking-[0.2em]" style={{ color: MUTED_ON_PAPER }}>
                    Status
                </span>
                <span
                    className={`flex items-center gap-1 text-sm font-semibold transition-all duration-500 motion-reduce:transition-none ${balanced ? 'translate-y-0 rotate-0 opacity-100' : '-rotate-6 translate-y-1 opacity-0'
                        }`}
                    style={{ color: '#2F6B4F' }}
                >
                    <CheckCircle2 className="h-4 w-4" />
                    Balanced
                </span>
            </div>
        </div>
    );
}

export function HomePage() {
    return (
        <div className="flex min-h-screen flex-col font-sans" style={{ backgroundColor: PAPER }}>
            {/* Navigation Bar */}
            <nav className="sticky top-0 z-50 border-b" style={{ backgroundColor: PAPER, borderColor: LINE }}>
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <Link to="/" className="flex items-center gap-2">
                        <span className="font-serif text-xl font-semibold" style={{ color: INK }}>
                            Order<span style={{ color: BRASS }}>Settle</span>
                        </span>
                    </Link>

                    <div className="flex items-center gap-4">
                        <Link
                            to="/signin"
                            className="hidden font-mono text-sm transition-colors hover:opacity-70 md:block border border-2 rounded-sm p-2"
                            style={{ color: MUTED_ON_PAPER }}
                        >
                            Sign in
                        </Link>
                        <button className="md:hidden" style={{ color: INK }}>
                            <Menu className="h-6 w-6" />
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero */}
            <section className="py-20 md:py-28" style={{ backgroundColor: INK, color: PAPER }}>
                <div className="container mx-auto grid items-center gap-12 px-4 md:grid-cols-2">
                    <div>
                        <p className="mb-5 font-mono text-xs uppercase tracking-[0.25em]" style={{ color: BRASS_LIGHT }}>
                            AI Accountant System
                        </p>
                        <h1 className="mb-6 font-serif text-4xl leading-[1.1] sm:text-5xl md:text-6xl">
                            Books that close{' '}
                            <span className="italic" style={{ color: BRASS_LIGHT }}>
                                themselves.
                            </span>
                        </h1>
                        <p className="mb-8 max-w-md text-lg" style={{ color: MUTED_ON_INK }}>
                            Connect your bank once. Every transaction gets categorized, every filing gets prepped for the FTA, and
                            your reports stay current to the minute.
                        </p>
                        <div className="flex flex-wrap items-center gap-4">
                            <Button
                        
                                variant="outline"
                                className="rounded-sm border-white/30 bg-transparent font-mono text-xs uppercase tracking-[0.15em] text-white hover:bg-white/10"
                                style={{ padding: '12px 28px', height: 'auto' }}
                            >
                                <Link to="/signin">Sign in</Link>
                            </Button>
                        </div>
                        <p className="mt-5 font-mono text-xs uppercase tracking-[0.15em]" style={{ color: MUTED_ON_INK }}>
                            1,000+ UAE businesses · Avg. close time 3.2 days
                        </p>
                    </div>
                    <div className="flex justify-center md:justify-end">
                        <LedgerBalance />
                    </div>
                </div>
            </section>

            {/* Features as ledger entries */}
            <section className="py-16 md:py-24">
                <div className="container mx-auto px-4">
                    <div className="mb-12 max-w-xl">
                        <h2 className="font-serif text-3xl sm:text-4xl" style={{ color: INK }}>
                            Every entry, handled.
                        </h2>
                        <p className="mt-3 text-lg" style={{ color: MUTED_ON_PAPER }}>
                            Six lines. That's the whole system.
                        </p>
                    </div>
                    <div className="grid gap-x-12 gap-y-10 md:grid-cols-2">
                        {features.map((feature) => (
                            <div key={feature.code} className="flex gap-4 border-t pt-6" style={{ borderColor: LINE }}>
                                <div className="mt-1 shrink-0" style={{ color: BRASS }}>
                                    {feature.icon}
                                </div>
                                <div>
                                    <div className="mb-1.5 flex items-baseline gap-3">
                                        <span className="font-mono text-xs tracking-[0.2em]" style={{ color: BRASS }}>
                                            {feature.code}
                                        </span>
                                        <h3 className="font-serif text-xl" style={{ color: INK }}>
                                            {feature.title}
                                        </h3>
                                    </div>
                                    <p className="text-sm leading-relaxed" style={{ color: MUTED_ON_PAPER }}>
                                        {feature.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Totals band */}
            <section className="py-14" style={{ backgroundColor: INK, color: PAPER }}>
                <div className="container mx-auto px-4">
                    <div className="grid grid-cols-2 md:grid-cols-4">
                        {stats.map((stat, i) => (
                            <div
                                key={stat.label}
                                className={`px-4 py-2 text-center ${i > 0 ? 'md:border-l' : ''}`}
                                style={{ borderColor: '#2A374F' }}
                            >
                                <div className="font-mono text-3xl sm:text-4xl" style={{ color: BRASS_LIGHT }}>
                                    {stat.value}
                                </div>
                                <div
                                    className="mt-2 font-mono text-[11px] uppercase tracking-[0.15em]"
                                    style={{ color: MUTED_ON_INK }}
                                >
                                    {stat.label}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Closing entry */}
            <section className="py-16 md:py-24">
                <div className="container mx-auto px-4">
                    <div className="mx-auto max-w-2xl rounded-sm border p-10 text-center md:p-14" style={{ borderColor: BRASS }}>
                        <h2 className="mb-4 font-serif text-3xl sm:text-4xl" style={{ color: INK }}>
                            Close this month in one sitting.
                        </h2>
                        <p className="mb-8 text-lg" style={{ color: MUTED_ON_PAPER }}>
                            Books, tax, and reports, done — from your first invoice to your next funding round.
                        </p>
                        
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t py-6" style={{ borderColor: LINE }}>
                <div className="container mx-auto px-4 text-center">
                    <p className="font-mono text-xs" style={{ color: MUTED_ON_PAPER }}>
                        © 2026 OrderSettle · Books that close themselves.
                    </p>
                </div>
            </footer>
        </div>
    );
}