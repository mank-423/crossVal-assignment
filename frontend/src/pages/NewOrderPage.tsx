import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatMoney, toCents } from '@orders/shared';

import { ApiError } from '../api/client';
import { ordersApi } from '../api/endpoints';
import { ErrorBanner } from '../components/ErrorBanner';
import { isoDateOffset } from '../lib/dates';

interface DraftLine {
  key: number;
  description: string;
  quantity: string;
  unitPrice: string;
}

let nextKey = 0;

function emptyLine(): DraftLine {
  return { key: nextKey++, description: '', quantity: '1', unitPrice: '' };
}

export function NewOrderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [customerName, setCustomerName] = useState('');
  const [dueDate, setDueDate] = useState(isoDateOffset(7));
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);

  const { lineTotals, subtotalCents } = useMemo(() => {
    const totals = lines.map((line) => {
      const quantity = Number.parseInt(line.quantity, 10);
      if (!Number.isInteger(quantity) || quantity < 1) return null;

      try {
        return quantity * toCents(line.unitPrice);
      } catch {
        return null;
      }
    });

    return {
      lineTotals: totals,
      subtotalCents: totals.reduce((sum: number, value) => sum + (value ?? 0), 0),
    };
  }, [lines]);

  const createOrder = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      navigate(`/orders/${order.id}`);
    },
  });

  const fieldErrors = createOrder.error instanceof ApiError ? createOrder.error.fieldErrors : undefined;

  function updateLine(key: number, patch: Partial<DraftLine>): void {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function onSubmit(event: React.FormEvent): void {
    event.preventDefault();

    createOrder.mutate({
      customerName: customerName.trim(),
      dueDate,
      lineItems: lines.map((line) => ({
        description: line.description.trim(),
        quantity: Number.parseInt(line.quantity, 10) || 0,
        unitPrice: line.unitPrice.trim() || '0',
      })),
    });
  }

  return (
    <div className="space-y-6 p-3 max-w-7xl mx-auto" style={{ backgroundColor: '#F6F2E8' }}>
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="font-mono text-xs uppercase tracking-[0.15em] transition-colors hover:opacity-70"
          style={{ color: '#5B5647' }}
        >
          ← Back to dashboard
        </button>
        <h1 className="mt-2 font-serif text-2xl font-semibold" style={{ color: '#10192B' }}>
          New order
        </h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {!fieldErrors && <ErrorBanner error={createOrder.error} />}

        {/* Customer & Due Date */}
        <div 
          className="rounded-sm border p-5 space-y-4"
          style={{ 
            borderColor: '#DCD3BE',
            backgroundColor: '#F6F2E8'
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="customer" className="font-mono text-xs uppercase tracking-[0.15em]" style={{ color: '#5B5647' }}>
                Customer
              </label>
              <input
                id="customer"
                className="mt-1 w-full rounded-md border px-4 py-2.5 font-mono text-sm transition-colors focus:outline-none focus:ring-2"
                style={{ 
                  borderColor: fieldErrors?.customerName ? '#B04632' : '#DCD3BE',
                  backgroundColor: '#F6F2E8',
                  color: '#10192B'
                }}
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Acme Industries"
                required
              />
              {fieldErrors?.customerName && (
                <p className="mt-1 font-mono text-xs" style={{ color: '#B04632' }}>
                  {fieldErrors.customerName[0]}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="dueDate" className="font-mono text-xs uppercase tracking-[0.15em]" style={{ color: '#5B5647' }}>
                Due date
              </label>
              <input
                id="dueDate"
                type="date"
                className="mt-1 w-full rounded-md border px-4 py-2.5 font-mono text-sm transition-colors focus:outline-none focus:ring-2"
                style={{ 
                  borderColor: fieldErrors?.dueDate ? '#B04632' : '#DCD3BE',
                  backgroundColor: '#F6F2E8',
                  color: '#10192B'
                }}
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                required
              />
              {fieldErrors?.dueDate && (
                <p className="mt-1 font-mono text-xs" style={{ color: '#B04632' }}>
                  {fieldErrors.dueDate[0]}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div 
          className="rounded-sm border overflow-hidden"
          style={{ 
            borderColor: '#DCD3BE',
            backgroundColor: '#F6F2E8'
          }}
        >
          <div 
            className="flex items-center justify-between px-5 py-3 border-b"
            style={{ borderColor: '#DCD3BE' }}
          >
            <h2 className="font-serif text-sm font-semibold" style={{ color: '#10192B' }}>
              Line items
            </h2>
            <button
              type="button"
              className="rounded-md border px-4 py-1.5 font-mono text-xs uppercase tracking-[0.15em] transition-colors hover:opacity-70"
              style={{ 
                borderColor: '#DCD3BE',
                color: '#10192B',
                backgroundColor: 'transparent'
              }}
              onClick={() => setLines((current) => [...current, emptyLine()])}
            >
              Add line
            </button>
          </div>

          <div className="divide-y" style={{ borderColor: '#DCD3BE' }}>
            {lines.map((line, index) => {
              const lineError =
                fieldErrors?.[`lineItems.${index}.description`]?.[0] ??
                fieldErrors?.[`lineItems.${index}.quantity`]?.[0] ??
                fieldErrors?.[`lineItems.${index}.unitPrice`]?.[0];

              return (
                <div key={line.key} className="p-4 sm:px-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className="font-mono text-xs uppercase tracking-[0.15em]" style={{ color: '#5B5647' }} htmlFor={`description-${line.key}`}>
                        Description
                      </label>
                      <input
                        id={`description-${line.key}`}
                        className="mt-1 w-full rounded-md border px-4 py-2.5 font-mono text-sm transition-colors focus:outline-none focus:ring-2"
                        style={{ 
                          borderColor: '#DCD3BE',
                          backgroundColor: '#F6F2E8',
                          color: '#10192B'
                        }}
                        value={line.description}
                        onChange={(event) =>
                          updateLine(line.key, { description: event.target.value })
                        }
                        placeholder="Consulting day"
                        required
                      />
                    </div>

                    <div className="w-full sm:w-24">
                      <label className="font-mono text-xs uppercase tracking-[0.15em]" style={{ color: '#5B5647' }} htmlFor={`quantity-${line.key}`}>
                        Qty
                      </label>
                      <input
                        id={`quantity-${line.key}`}
                        type="number"
                        min={1}
                        step={1}
                        className="mt-1 w-full rounded-md border px-4 py-2.5 font-mono text-sm transition-colors focus:outline-none focus:ring-2"
                        style={{ 
                          borderColor: '#DCD3BE',
                          backgroundColor: '#F6F2E8',
                          color: '#10192B'
                        }}
                        value={line.quantity}
                        onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                        required
                      />
                    </div>

                    <div className="w-full sm:w-36">
                      <label className="font-mono text-xs uppercase tracking-[0.15em]" style={{ color: '#5B5647' }} htmlFor={`price-${line.key}`}>
                        Unit price
                      </label>
                      <input
                        id={`price-${line.key}`}
                        type="text"
                        inputMode="decimal"
                        className="mt-1 w-full rounded-md border px-4 py-2.5 font-mono text-sm transition-colors focus:outline-none focus:ring-2"
                        style={{ 
                          borderColor: '#DCD3BE',
                          backgroundColor: '#F6F2E8',
                          color: '#10192B'
                        }}
                        value={line.unitPrice}
                        onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
                        placeholder="500.00"
                        required
                      />
                    </div>

                    <div className="flex w-full items-center justify-between gap-3 sm:w-36 sm:justify-end">
                      <div className="text-right">
                        <p className="font-mono text-xs uppercase tracking-[0.15em]" style={{ color: '#5B5647' }}>
                          Line total
                        </p>
                        <p className="mt-1 font-mono text-sm font-medium" style={{ color: '#10192B' }}>
                          {lineTotals[index] === null ? '—' : formatMoney(lineTotals[index]!)}
                        </p>
                      </div>

                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setLines((current) => current.filter((item) => item.key !== line.key))
                          }
                          className="rounded p-1.5 transition-colors hover:opacity-70"
                          style={{ color: '#5B5647' }}
                          aria-label={`Remove line ${index + 1}`}
                        >
                          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path
                              d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {lineError && (
                    <p className="mt-1 font-mono text-xs" style={{ color: '#B04632' }}>
                      {lineError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Order Total */}
          <div 
            className="flex items-center justify-between px-5 py-4 border-t"
            style={{ 
              borderColor: '#DCD3BE',
              backgroundColor: '#E8E3D8'
            }}
          >
            <span className="font-mono text-sm font-medium" style={{ color: '#5B5647' }}>
              Order total
            </span>
            <span className="font-serif text-lg font-semibold" style={{ color: '#10192B' }}>
              {formatMoney(subtotalCents)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md border px-4 py-2.5 font-mono text-xs uppercase tracking-[0.15em] transition-colors hover:opacity-70"
            style={{ 
              borderColor: '#DCD3BE',
              color: '#10192B',
              backgroundColor: 'transparent'
            }}
            onClick={() => navigate('/')}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md px-4 py-2.5 font-mono text-xs uppercase tracking-[0.15em] transition-colors hover:opacity-70 disabled:opacity-50"
            style={{ 
              backgroundColor: '#B8863B',
              color: '#F6F2E8'
            }}
            disabled={createOrder.isPending}
          >
            {createOrder.isPending ? 'Creating…' : 'Create order'}
          </button>
        </div>
      </form>
    </div>
  );
}