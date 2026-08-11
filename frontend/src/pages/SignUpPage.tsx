import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ErrorBanner';
import { AuthCard } from './AuthCard';

const INK = '#10192B';
const LINE = '#DCD3BE';
const BRASS = '#B8863B';
const BRASS_LIGHT = '#D9B778';
const MUTED_ON_PAPER = '#5B5647';
const RED_INK = '#B04632';

export function SignUpPage() {
  const { user, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  // Per-field messages from the API, so "password too short" appears under the password box
  // rather than in a banner at the top.
  const fieldErrors = error instanceof ApiError ? error.fieldErrors : undefined;

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await signUp(email, password);
    } catch (caught) {
      setError(caught);
      setIsSubmitting(false);
    }
  }

  const inputStyle = (hasError?: boolean): React.CSSProperties => ({
    borderColor: hasError ? RED_INK : LINE,
    color: INK,
    backgroundColor: '#FFFFFF',
  });

  function focusBrass(hasError?: boolean) {
    return (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.borderColor = hasError ? RED_INK : BRASS;
    };
  }

  function blurReset(hasError?: boolean) {
    return (e: React.FocusEvent<HTMLInputElement>) => {
      e.currentTarget.style.borderColor = hasError ? RED_INK : LINE;
    };
  }

  return (
    <AuthCard
      title="Create an account"
      subtitle="Your orders and payments are visible only to you."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/signin" className="font-medium" style={{ color: BRASS }}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {/* Field-level problems are shown inline; anything else gets the banner. */}
        {!fieldErrors && <ErrorBanner error={error} />}

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
            style={inputStyle(!!fieldErrors?.email)}
            onFocus={focusBrass(!!fieldErrors?.email)}
            onBlur={blurReset(!!fieldErrors?.email)}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          {fieldErrors?.email && (
            <p className="mt-1.5 text-xs" style={{ color: RED_INK }}>
              {fieldErrors.email[0]}
            </p>
          )}
          {error instanceof ApiError && error.code === 'EMAIL_ALREADY_REGISTERED' && (
            <p className="mt-1.5 text-xs" style={{ color: RED_INK }}>
              {error.message}
            </p>
          )}
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
            autoComplete="new-password"
            className="mt-1.5 block w-full rounded-sm border px-4 py-2.5 text-sm outline-none transition-colors"
            style={inputStyle(!!fieldErrors?.password)}
            onFocus={focusBrass(!!fieldErrors?.password)}
            onBlur={blurReset(!!fieldErrors?.password)}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {fieldErrors?.password ? (
            <p className="mt-1.5 text-xs" style={{ color: RED_INK }}>
              {fieldErrors.password[0]}
            </p>
          ) : (
            <p className="mt-1.5 text-xs" style={{ color: MUTED_ON_PAPER }}>
              At least 8 characters.
            </p>
          )}
        </div>

        <button
          type="submit"
          className="w-full rounded-sm px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60"
          style={{ backgroundColor: BRASS, color: INK }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRASS_LIGHT)}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRASS)}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthCard>
  );
}