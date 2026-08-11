import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from '@orders/shared';

import { ordersApi } from '../api/endpoints';
import { ErrorBanner } from '../components/ErrorBanner';
import { Money } from '../components/Money';
import { Spinner } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { SummaryTiles } from '../components/SummaryTiles';
import { formatDate, relativeDueLabel } from '../lib/format';

const PAGE_SIZE = 10;

export function DashboardPage() {
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const summary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: ordersApi.summary,
  });

  const orders = useQuery({
    queryKey: ['orders', { status, search, page }],
    queryFn: () => ordersApi.list({ status, search: search || undefined, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  function applyFilter(next: OrderStatus | undefined): void {
    setStatus(next);
    setPage(1);
  }

  return (
    <div className="space-y-6 p-3 max-w-7xl mx-auto" style={{ backgroundColor: '#F6F2E8' }}>
      <div>
        <h1 className="font-serif text-2xl font-bold" style={{ color: '#10192B' }}>
          Dashboard
        </h1>
        <p className="mt-1 font-mono text-sm" style={{ color: '#5B5647' }}>
          Every order you have created, and what is still outstanding on each.
        </p>
      </div>

      <SummaryTiles summary={summary.data} isLoading={summary.isLoading} />

      <div 
        className="rounded-sm border overflow-hidden"
        style={{ 
          borderColor: '#DCD3BE',
          backgroundColor: '#F6F2E8'
        }}
      >
        {/* Filters */}
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: '#DCD3BE' }}>
          <div className="flex flex-wrap gap-2">
            <FilterChip label="All" isActive={!status} onClick={() => applyFilter(undefined)} />
            {ORDER_STATUSES.map((option) => (
              <FilterChip
                key={option}
                label={ORDER_STATUS_LABELS[option]}
                count={summary.data?.byStatus.find((bucket) => bucket.status === option)?.count}
                isActive={status === option}
                onClick={() => applyFilter(option)}
              />
            ))}
          </div>

          <label className="relative sm:w-64">
            <span className="sr-only">Search by customer</span>
            <input
              type="search"
              className="w-full rounded-md border px-4 py-2 font-mono text-sm transition-colors focus:outline-none focus:ring-2"
              style={{ 
                borderColor: '#DCD3BE',
                backgroundColor: '#F6F2E8',
                color: '#10192B'
              }}
              placeholder="Search customer…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>

        {orders.isError && <ErrorBanner error={orders.error} className="m-4" />}

        {orders.isLoading ? (
          <div className="p-8">
            <Spinner label="Loading orders" />
          </div>
        ) : orders.data && orders.data.data.length > 0 ? (
          <OrdersTable rows={orders.data.data} />
        ) : (
          <EmptyState hasFilters={Boolean(status || search)} />
        )}

        {orders.data && orders.data.meta.total > PAGE_SIZE && (
          <Pagination
            page={orders.data.meta.page}
            totalPages={orders.data.meta.totalPages}
            total={orders.data.meta.total}
            onChange={setPage}
          />
        )}
      </div>
    </div>
  );
}

// OrdersTable component
function OrdersTable({ rows }: { rows: import('@orders/shared').OrderSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr 
            className="border-b text-left font-mono text-[11px] uppercase tracking-[0.15em]"
            style={{ 
              borderColor: '#DCD3BE',
              color: '#5B5647'
            }}
          >
            <th className="px-4 py-3 font-medium">Customer</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Total</th>
            <th className="px-4 py-3 text-right font-medium">Paid</th>
            <th className="px-4 py-3 text-right font-medium">Due</th>
            <th className="px-4 py-3 font-medium">Due date</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: '#DCD3BE' }}>
          {rows.map((order) => (
            <tr key={order.id} className="transition-colors hover:bg-[#F7EFDF]/50">
              <td className="px-4 py-3">
                <Link
                  to={`/orders/${order.id}`}
                  className="rounded-sm font-medium transition-colors hover:opacity-70 focus-visible:outline-none focus-visible:ring-2"
                  style={{ 
                    color: '#10192B'
                  }}
                >
                  {order.customerName}
                </Link>
                <p className="font-mono text-xs" style={{ color: '#5B5647' }}>
                  {order.lineItemCount} {order.lineItemCount === 1 ? 'line item' : 'line items'}
                </p>
              </td>
              <td className="px-4 py-3">
                <StatusBadge
                  status={order.status}
                  isOverdue={order.isOverdue}
                  amountPaidCents={order.amountPaidCents}
                />
              </td>
              <td className="px-4 py-3 text-right">
                <Money cents={order.totalCents} style={{ color: '#10192B' }} />
              </td>
              <td className="px-4 py-3 text-right">
                <Money cents={order.amountPaidCents} muteZero style={{ color: '#10192B' }} />
              </td>
              <td className="px-4 py-3 text-right font-medium">
                <Money cents={order.amountDueCents} muteZero style={{ color: '#10192B' }} />
              </td>
              <td className="px-4 py-3">
                <span style={{ color: '#10192B', opacity: 0.8 }}>{formatDate(order.dueDate)}</span>
                <p 
                  className="font-mono text-xs"
                  style={{ 
                    color: order.isOverdue ? '#B04632' : '#5B5647',
                    fontWeight: order.isOverdue ? 500 : 400
                  }}
                >
                  {relativeDueLabel(order.dueDate, order.status)}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// FilterChip component
function FilterChip({
  label,
  count,
  isActive,
  onClick,
}: {
  label: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className="rounded-full px-3 py-1.5 font-mono text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
      style={{
        backgroundColor: isActive ? '#10192B' : '#F6F2E8',
        color: isActive ? '#F6F2E8' : '#10192B',
        border: isActive ? 'none' : '1px solid #DCD3BE',
        opacity: isActive ? 1 : 0.8,
      }}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span 
          className="ml-1.5 text-xs"
          style={{ color: isActive ? '#D9B778' : '#5B5647' }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// EmptyState component
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="px-4 py-14 text-center">
      <p className="font-serif text-base" style={{ color: '#10192B' }}>
        {hasFilters ? 'No orders match these filters' : 'No orders yet'}
      </p>
      <p className="mx-auto mt-1 max-w-sm font-mono text-sm" style={{ color: '#5B5647' }}>
        {hasFilters
          ? 'Try a different status, or clear the search box.'
          : 'Create your first order to start tracking what is owed.'}
      </p>
      {!hasFilters && (
        <Link
          to="/orders/new"
          className="inline-block rounded-md px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] transition-colors hover:opacity-70"
          style={{
            backgroundColor: '#B8863B',
            color: '#F6F2E8',
          }}
        >
          New order
        </Link>
      )}
    </div>
  );
}

// Pagination component
function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div 
      className="flex items-center justify-between border-t px-4 py-3"
      style={{ borderColor: '#DCD3BE' }}
    >
      <p className="font-mono text-xs" style={{ color: '#5B5647' }}>
        Page {page} of {totalPages} · {total} orders
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-md border px-4 py-1.5 font-mono text-xs uppercase tracking-[0.15em] transition-colors hover:opacity-70 disabled:opacity-40"
          style={{
            borderColor: '#DCD3BE',
            color: '#10192B',
            backgroundColor: 'transparent',
          }}
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </button>
        <button
          type="button"
          className="rounded-md border px-4 py-1.5 font-mono text-xs uppercase tracking-[0.15em] transition-colors hover:opacity-70 disabled:opacity-40"
          style={{
            borderColor: '#DCD3BE',
            color: '#10192B',
            backgroundColor: 'transparent',
          }}
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </button>
      </div>
    </div>
  );
}