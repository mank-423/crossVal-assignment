// src/pages/SignInPage.tsx
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ErrorBanner';
import { AuthCard } from './AuthCard';

const INK = '#10192B';
const LINE = '#DCD3BE';
const BRASS = '#B8863B';
const BRASS_LIGHT = '#D9B778';
const MUTED_ON_PAPER = '#5B5647';

export function SignInPage() {
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('demo-password-123');
  const [error, setError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  
  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await signIn(email, password);
    } catch (caught) {
      setError(caught);
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Welcome Back"
      subtitle="Track orders, record payments, and see what is still owed."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-medium transition-colors" style={{ color: BRASS }}>
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorBanner error={error} />

        <div>
          <label
            htmlFor="email"
            className="font-mono text-[11px] uppercase tracking-[0.15em]"
            style={{ color: MUTED_ON_PAPER }}
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className="mt-1.5 block w-full rounded-sm border px-4 py-2.5 text-sm outline-none transition-colors"
            style={{ borderColor: LINE, color: INK, backgroundColor: '#FFFFFF' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = BRASS)}
            onBlur={(e) => (e.currentTarget.style.borderColor = LINE)}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="font-mono text-[11px] uppercase tracking-[0.15em]"
            style={{ color: MUTED_ON_PAPER }}
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className="mt-1.5 block w-full rounded-sm border px-4 py-2.5 text-sm outline-none transition-colors"
            style={{ borderColor: LINE, color: INK, backgroundColor: '#FFFFFF' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = BRASS)}
            onBlur={(e) => (e.currentTarget.style.borderColor = LINE)}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-sm px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
          style={{ backgroundColor: BRASS, color: INK }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRASS_LIGHT)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRASS)}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="text-center text-xs" style={{ color: MUTED_ON_PAPER }}>
          Seeded demo account:{' '}
          <span className="font-mono" style={{ color: INK }}>
            demo@example.com
          </span>{' '}
          /{' '}
          <span className="font-mono" style={{ color: INK }}>
            demo-password-123
          </span>
        </p>
      </form>
    </AuthCard>
  );
}