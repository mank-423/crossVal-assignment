import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { centsToDecimalString, formatMoney, toCents, type OrderDetail } from '@orders/shared';

import { ApiError } from '../api/client';
import { paymentsApi } from '../api/endpoints';
import { ErrorBanner } from './ErrorBanner';
import { isoDateOffset } from '../lib/dates';
import { Money } from './Money';

interface Props {
  order: OrderDetail;
  onClose: () => void;
  onRecorded: () => void;
}

export function PaymentForm({ order, onClose, onRecorded }: Props) {
  // Prefilled with the full remaining balance: settling an order in full is the common case,
  // and it should take one click rather than retyping a figure already on screen.
  const [amount, setAmount] = useState(centsToDecimalString(order.amountDueCents));
  const [paidOn, setPaidOn] = useState(isoDateOffset(0));
  const [note, setNote] = useState('');

  const queryClient = useQueryClient();

  const recordPayment = useMutation({
    mutationFn: (input: { amount: string; paidOn: string; note?: string }) =>
      /*
       * A fresh key per submission attempt. If the response is lost to a dropped connection
       * and the user presses the button again, the server recognises the replay and returns
       * the original payment instead of taking the money twice.
       */
      paymentsApi.record(order.id, input, crypto.randomUUID()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      onRecorded();
    },
  });

  // Checked locally to disable the button early, but the server's answer is authoritative —
  // this is a convenience, not the enforcement.
  const enteredCents = safeToCents(amount);
  const exceedsBalance = enteredCents !== null && enteredCents > order.amountDueCents;
  const isEmpty = enteredCents === null || enteredCents <= 0;

  function onSubmit(event: React.FormEvent): void {
    event.preventDefault();
    recordPayment.mutate({ amount: amount.trim(), paidOn, note: note.trim() || undefined });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">Order total</span>
          <Money cents={order.totalCents} className="font-medium text-slate-900" />
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-slate-600">Already paid</span>
          <Money cents={order.amountPaidCents} className="font-medium text-slate-900" />
        </div>
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
          <span className="font-medium text-slate-700">Amount due</span>
          <Money cents={order.amountDueCents} className="font-semibold text-slate-900" />
        </div>
      </div>

      <ErrorBanner error={recordPayment.error} />

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="amount" className="label">
            Amount
          </label>
          {order.amountDueCents > 0 && (
            <button
              type="button"
              className="mb-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              onClick={() => setAmount(centsToDecimalString(order.amountDueCents))}
            >
              Pay in full
            </button>
          )}
        </div>
        <input
          id="amount"
          type="text"
          inputMode="decimal"
          className={`input tabular ${exceedsBalance ? 'input-error' : ''}`}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
        {exceedsBalance ? (
          <p className="field-error">
            More than the {formatMoney(order.amountDueCents)} outstanding on this order.
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Maximum {formatMoney(order.amountDueCents)}. Partial payments are fine.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="paidOn" className="label">
          Payment date
        </label>
        <input
          id="paidOn"
          type="date"
          className="input"
          value={paidOn}
          onChange={(event) => setPaidOn(event.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="note" className="label">
          Note <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="note"
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Bank transfer, ref 12345"
        />
      </div>

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary bg-green-300 text-gray-800"
          disabled={recordPayment.isPending || exceedsBalance || isEmpty}
        >
          {recordPayment.isPending ? 'Recording…' : 'Record payment'}
        </button>
      </div>
    </form>
  );
}

/** Returns null while the field holds something not yet a complete amount. */
function safeToCents(value: string): number | null {
  try {
    return toCents(value.trim());
  } catch {
    return null;
  }
}

export function isOverpaymentError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'OVERPAYMENT_REJECTED';
}
