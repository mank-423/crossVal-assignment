import type { DashboardSummary } from '@orders/shared';
import { Money } from './Money';

interface Props {
  summary: DashboardSummary | undefined;
  isLoading: boolean;
}

export function SummaryTiles({ summary, isLoading }: Props) {
  if (isLoading || !summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div 
            key={index} 
            className="h-[86px] animate-pulse rounded-sm border"
            style={{ 
              borderColor: '#DCD3BE',
              backgroundColor: '#DCD3BE',
              opacity: 0.3,
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label="Outstanding"
        value={<Money cents={summary.totalOutstandingCents} style={{ color: '#10192B' }} />}
        caption={`across ${summary.orderCount} ${summary.orderCount === 1 ? 'order' : 'orders'}`}
      />
      <Tile
        label="Overdue"
        value={<Money cents={summary.overdueAmountCents} style={{ color: '#B04632' }} />}
        caption={`${summary.overdueCount} ${summary.overdueCount === 1 ? 'order' : 'orders'} past due`}
        tone="danger"
      />
      <Tile
        label="Collected"
        value={<Money cents={summary.totalCollectedCents} style={{ color: '#10192B' }} />}
        caption="paid to date"
      />
      <Tile
        label="Invoiced"
        value={<Money cents={summary.totalInvoicedCents} style={{ color: '#10192B' }} />}
        caption="total order value"
      />
    </div>
  );
}

function Tile({
  label,
  value,
  caption,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  caption: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <div 
      className="rounded-sm border p-4"
      style={{ 
        borderColor: '#DCD3BE',
        backgroundColor: '#F6F2E8'
      }}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.15em]" style={{ color: '#5B5647' }}>
        {label}
      </p>
      <p 
        className="mt-1 font-serif text-2xl"
        style={{ color: tone === 'danger' ? '#B04632' : '#10192B' }}
      >
        {value}
      </p>
      <p className="mt-0.5 font-mono text-xs" style={{ color: '#5B5647' }}>
        {caption}
      </p>
    </div>
  );
}