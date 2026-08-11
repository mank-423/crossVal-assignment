import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { ApiError } from './api/client';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Money changes when someone records a payment, not on a timer. Refetching on focus
      // covers the case where a colleague recorded one in another tab.
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Retrying a 4xx just repeats a request the server already refused. Only network and
        // server faults are worth a second attempt.
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      // Never retry a mutation automatically: a retried payment is a duplicate payment.
      // Deliberate replays go through the Idempotency-Key header instead.
      retry: false,
    },
  },
});

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element not found.');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
