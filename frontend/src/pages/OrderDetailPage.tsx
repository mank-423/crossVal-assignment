import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney, type OrderDetail, type OrderEvent } from '@orders/shared';

import { ordersApi } from '../api/endpoints';
import { ErrorBanner } from '../components/ErrorBanner';
import { Modal } from '../components/Modal';
import { Money } from '../components/Money';
import { PaymentForm } from '../components/PaymentModal';
import { RefundForm } from '../components/RefundModal';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, formatDateTime, relativeDueLabel } from '../lib/format';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openModal, setOpenModal] = useState<'payment' | 'refund' | null>(null);

  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id!),
    enabled: Boolean(id),
  });

  const deleteOrder = useMutation({
    mutationFn: () => ordersApi.remove(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      navigate('/');
    },
  });

  if (order.isLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Spinner label="Loading order" />
      </div>
    );
  }

  if (order.isError || !order.data) {
    return (
      <div className="mx-auto max-w-lg py-10 text-center">
        <ErrorBanner error={order.error} />
        <Link
          to="/"
          className="mt-4 inline-block font-mono text-xs uppercase tracking-[0.15em] transition-colors hover:opacity-70"
          style={{ color: '#5B5647' }}
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const data = order.data;
  const isSettled = data.amountDueCents === 0;

  return (
    <div className="space-y-6 p-3 max-w-7xl mx-auto" style={{ backgroundColor: '#F6F2E8' }}>
      {/* Header */}
      <div>
        <Link
          to="/"
          className="font-mono text-xs uppercase tracking-[0.15em] transition-colors hover:opacity-70"
          style={{ color: '#5B5647' }}
        >
          ← Back to dashboard
        </Link>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-2xl font-semibold" style={{ color: '#10192B' }}>
                {data.customerName}
              </h1>
              <StatusBadge
                status={data.status}
                isOverdue={data.isOverdue}
                amountPaidCents={data.amountPaidCents}
              />
            </div>
            <p className="mt-1 font-mono text-sm" style={{ color: '#5B5647' }}>
              Order #{data.id} · Due {formatDate(data.dueDate)} ·{' '}
              <span className={data.isOverdue ? 'font-medium' : ''} style={{ color: data.isOverdue ? '#B04632' : '#5B5647' }}>
                {relativeDueLabel(data.dueDate, data.status)}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {!data.isLocked && (
              <button
                type="button"
                className="font-mono text-xs uppercase tracking-[0.15em] px-4 py-2 rounded-md border transition-colors hover:opacity-70"
                style={{
                  color: '#B04632',
                  borderColor: '#B04632',
                  backgroundColor: 'transparent'
                }}
                onClick={() => {
                  if (window.confirm('Delete this order? This cannot be undone.')) {
                    deleteOrder.mutate();
                  }
                }}
                disabled={deleteOrder.isPending}
              >
                Delete
              </button>
            )}
            {data.amountPaidCents > 0 && (
              <button
                type="button"
                className="font-mono text-xs uppercase tracking-[0.15em] px-4 py-2 rounded-md border transition-colors hover:opacity-70"
                style={{
                  color: '#10192B',
                  borderColor: '#DCD3BE',
                  backgroundColor: 'transparent'
                }}
                onClick={() => setOpenModal('refund')}
              >
                Record refund
              </button>
            )}
            <button
              type="button"
              className="font-mono text-xs uppercase tracking-[0.15em] px-4 py-2 rounded-md transition-colors hover:opacity-70"
              style={{
                color: '#F6F2E8',
                backgroundColor: '#B8863B',
                borderColor: '#B8863B'
              }}
              onClick={() => setOpenModal('payment')}
              disabled={isSettled}
              title={isSettled ? 'This order is fully paid' : undefined}
            >
              Record payment
            </button>
          </div>
        </div>
      </div>

      <ErrorBanner error={deleteOrder.error} />

      {/* Amount Tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <AmountTile label="Order total" cents={data.totalCents} />
        <AmountTile label="Amount paid" cents={data.amountPaidCents} />
        <AmountTile
          label="Amount due"
          cents={data.amountDueCents}
          emphasis={data.amountDueCents > 0}
        />
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
          {data.isLocked && (
            <span
              className="rounded-full px-2.5 py-0.5 font-mono text-xs"
              style={{
                backgroundColor: '#DCD3BE',
                color: '#5B5647'
              }}
            >
              Locked — a payment has been recorded
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="border-b text-left font-mono text-xs uppercase tracking-[0.15em]"
                style={{
                  borderColor: '#DCD3BE',
                  color: '#5B5647'
                }}
              >
                <th className="px-5 py-2.5 font-medium">Description</th>
                <th className="px-5 py-2.5 text-right font-medium">Qty</th>
                <th className="px-5 py-2.5 text-right font-medium">Unit price</th>
                <th className="px-5 py-2.5 text-right font-medium">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: '#DCD3BE' }}>
              {data.lineItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3" style={{ color: '#10192B' }}>{item.description}</td>
                  <td className="px-5 py-3 text-right font-mono tabular" style={{ color: '#5B5647' }}>
                    {item.quantity}
                  </td>
                  <td className="px-5 py-3 text-right font-mono" style={{ color: '#5B5647' }}>
                    <Money cents={item.unitPriceCents} />
                  </td>
                  <td className="px-5 py-3 text-right font-mono font-medium" style={{ color: '#10192B' }}>
                    <Money cents={item.lineTotalCents} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr
                className="border-t"
                style={{
                  borderColor: '#DCD3BE',
                  backgroundColor: '#DCD3BE',
                }}
              >
                <td colSpan={3} className="px-5 py-3 text-right font-mono text-sm font-medium" style={{ color: '#5B5647' }}>
                  Subtotal
                </td>
                <td className="px-5 py-3 text-right font-mono font-semibold" style={{ color: '#10192B' }}>
                  <Money cents={data.subtotalCents} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Payment History & Audit Trail */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PaymentHistory order={data} />
        <AuditTrail events={data.events} />
      </div>

      {/* Modals */}
      {openModal === 'payment' && (
        <Modal title="Record a payment" onClose={() => setOpenModal(null)}>
          <PaymentForm
            order={data}
            onClose={() => setOpenModal(null)}
            onRecorded={() => setOpenModal(null)}
          />
        </Modal>
      )}

      {openModal === 'refund' && (
        <Modal title="Record a refund" onClose={() => setOpenModal(null)}>
          <RefundForm
            order={data}
            onClose={() => setOpenModal(null)}
            onRecorded={() => setOpenModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}

// AmountTile component
function AmountTile({
  label,
  cents,
  emphasis = false,
}: {
  label: string;
  cents: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className="rounded-sm border p-4"
      style={{
        borderColor: '#DCD3BE',
        backgroundColor: '#F6F2E8'
      }}
    >
      <p className="font-mono text-xs uppercase tracking-[0.15em]" style={{ color: '#5B5647' }}>
        {label}
      </p>
      <p
        className={`mt-1 font-serif text-2xl font-semibold ${emphasis ? '' : ''}`}
        style={{ color: emphasis ? '#10192B' : '#5B5647' }}
      >
        <Money cents={cents} />
      </p>
    </div>
  );
}

// PaymentHistory component
function PaymentHistory({ order }: { order: OrderDetail }) {
  const refundedCents = order.payments
    .filter((payment) => payment.kind === 'refund')
    .reduce((total, payment) => total + Math.abs(payment.amountCents), 0);

  return (
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
          Payment history
          <span className="ml-2 font-normal" style={{ color: '#5B5647' }}>({order.payments.length})</span>
        </h2>
        {refundedCents > 0 && (
          <span className="font-mono text-xs" style={{ color: '#5B5647' }}>
            <Money cents={refundedCents} /> refunded
          </span>
        )}
      </div>

      {order.payments.length === 0 ? (
        <p className="px-5 py-8 text-center font-mono text-sm" style={{ color: '#5B5647' }}>
          No payments recorded yet.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: '#DCD3BE' }}>
          {order.payments.map((payment) => {
            const isRefund = payment.kind === 'refund';

            return (
              <li key={payment.id} className="flex items-start justify-between gap-4 px-5 py-3">
                <div>
                  <p className="flex items-center gap-2 font-mono text-sm font-medium" style={{ color: '#10192B' }}>
                    {formatDate(payment.paidOn)}
                    {isRefund && (
                      <span
                        className="rounded-full px-2 py-0.5 font-mono text-xs font-medium"
                        style={{
                          backgroundColor: '#F7E9E5',
                          color: '#B04632'
                        }}
                      >
                        Refund
                      </span>
                    )}
                  </p>
                  {payment.note && <p className="mt-0.5 font-mono text-sm" style={{ color: '#5B5647' }}>{payment.note}</p>}
                </div>
                <Money
                  cents={payment.amountCents}
                  className={`font-mono text-sm font-semibold ${isRefund ? '' : ''}`}
                  style={{ color: isRefund ? '#B04632' : '#10192B' }}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div
        className="flex items-center justify-between px-5 py-3 border-t"
        style={{
          borderColor: '#DCD3BE',
          backgroundColor: '#E8E3D8'
        }}
      >
        <span className="font-mono text-sm font-medium" style={{ color: '#5B5647' }}>Net collected</span>
        <Money cents={order.amountPaidCents} className="font-mono text-sm font-semibold" style={{ color: '#10192B' }} />
      </div>
    </div>
  );
}

// AuditTrail component
function AuditTrail({ events }: { events: OrderEvent[] }) {
  return (
    <div
      className="rounded-sm border overflow-hidden"
      style={{
        borderColor: '#DCD3BE',
        backgroundColor: '#F6F2E8'
      }}
    >
      <div
        className="px-5 py-3 border-b"
        style={{ borderColor: '#DCD3BE' }}
      >
        <h2 className="font-serif text-sm font-semibold" style={{ color: '#10192B' }}>
          Activity
          <span className="ml-2 font-normal" style={{ color: '#5B5647' }}>({events.length})</span>
        </h2>
      </div>

      <ul className="divide-y" style={{ borderColor: '#DCD3BE' }}>
        {events.map((event) => (
          <li key={event.id} className="px-5 py-3">
            <div className="flex items-start justify-between gap-4">
              <p className="font-mono text-sm" style={{ color: '#10192B' }}>
                {describeEvent(event)}
              </p>
              {event.amountCents !== null &&
                (event.eventType === 'payment_recorded' ||
                  event.eventType === 'refund_recorded') && (
                  <Money
                    cents={event.amountCents}
                    className="font-mono text-sm font-medium"
                    style={{ color: event.eventType === 'refund_recorded' ? '#B04632' : '#5B5647' }}
                  />
                )}
            </div>
            <p className="mt-0.5 font-mono text-xs" style={{ color: '#5B5647' }}>
              {formatDateTime(event.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function describeEvent(event: OrderEvent): string {
  switch (event.eventType) {
    case 'order_created':
      return `Order created for ${formatMoney(event.amountCents ?? 0)}`;
    case 'payment_recorded':
      return 'Payment recorded';
    case 'refund_recorded':
      return 'Refund recorded';
    case 'status_changed':
      return `Status changed from ${labelFor(event.fromStatus)} to ${labelFor(event.toStatus)}`;
    case 'order_updated':
      return 'Order details updated';
    case 'order_deleted':
      return 'Order deleted';
    default:
      return event.eventType;
  }
}

function labelFor(status: string | null): string {
  return status ? status.replace('_', ' ') : 'none';
}