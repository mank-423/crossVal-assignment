import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatMoney, toCents, type OrderDetail } from '@orders/shared';

import { paymentsApi } from '../api/endpoints';
import { ErrorBanner } from './ErrorBanner';
import { isoDateOffset } from '../lib/dates';
import { Money } from './Money';

interface Props {
  order: OrderDetail;
  onClose: () => void;
  onRecorded: () => void;
}

export function RefundForm({ order, onClose, onRecorded }: Props) {
  // Not prefilled, unlike the payment form. Refunding everything collected is the rare case
  // and the destructive one, so it should be typed deliberately rather than accepted by
  // reflex.
  const [amount, setAmount] = useState('');
  const [refundedOn, setRefundedOn] = useState(isoDateOffset(0));
  const [note, setNote] = useState('');

  const queryClient = useQueryClient();

  const recordRefund = useMutation({
    mutationFn: (input: { amount: string; refundedOn: string; note?: string }) =>
      paymentsApi.refund(order.id, input, crypto.randomUUID()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      onRecorded();
    },
  });

  const enteredCents = safeToCents(amount);
  const exceedsCollected = enteredCents !== null && enteredCents > order.amountPaidCents;
  const isEmpty = enteredCents === null || enteredCents <= 0;

  function onSubmit(event: React.FormEvent): void {
    event.preventDefault();
    recordRefund.mutate({ amount: amount.trim(), refundedOn, note: note.trim() || undefined });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">Collected so far</span>
          <Money cents={order.amountPaidCents} className="font-medium text-slate-900" />
        </div>
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
          <span className="font-medium text-slate-700">Available to refund</span>
          <Money cents={order.amountPaidCents} className="font-semibold text-slate-900" />
        </div>
      </div>

      <ErrorBanner error={recordRefund.error} />

      <div>
        <label htmlFor="refundAmount" className="label">
          Refund amount
        </label>
        <input
          id="refundAmount"
          type="text"
          inputMode="decimal"
          className={`input tabular ${exceedsCollected ? 'input-error' : ''}`}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="0.00"
          required
        />
        {exceedsCollected ? (
          <p className="field-error">
            More than the {formatMoney(order.amountPaidCents)} collected on this order.
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Maximum {formatMoney(order.amountPaidCents)}. This increases the amount due.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="refundedOn" className="label">
          Refund date
        </label>
        <input
          id="refundedOn"
          type="date"
          className="input"
          value={refundedOn}
          onChange={(event) => setRefundedOn(event.target.value)}
          required
        />
      </div>

      <div>
        <label htmlFor="refundNote" className="label">
          Reason <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="refundNote"
          className="input"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Session cancelled"
        />
      </div>

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn-danger"
          disabled={recordRefund.isPending || exceedsCollected || isEmpty}
        >
          {recordRefund.isPending ? 'Recording…' : 'Record refund'}
        </button>
      </div>
    </form>
  );
}

function safeToCents(value: string): number | null {
  try {
    return toCents(value.trim());
  } catch {
    return null;
  }
}
