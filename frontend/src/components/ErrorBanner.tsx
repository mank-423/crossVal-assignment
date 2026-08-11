import { ApiError } from '../api/client';

/**
 * Shows the server's own message and hint.
 *
 * The API is written to explain itself — an over-payment rejection states the maximum
 * currently allowed — so this renders that text rather than substituting a generic apology.
 */
export function ErrorBanner({ error, className = '' }: { error: unknown; className?: string }) {
  if (!error) return null;

  const isApiError = error instanceof ApiError;
  const message = isApiError ? error.message : 'Something went wrong.';
  const hint = isApiError ? error.hint : 'Try again in a moment.';

  return (
    <div
      role="alert"
      className={`rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm ${className}`}
    >
      <p className="font-medium text-red-800">{message}</p>
      {hint && <p className="mt-0.5 text-red-700">{hint}</p>}
    </div>
  );
}
