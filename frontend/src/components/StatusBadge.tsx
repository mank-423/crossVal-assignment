import { ORDER_STATUS_LABELS, type OrderStatus } from '../shared';

const STYLES: Record<OrderStatus, { bg: string; text: string; ring: string }> = {
  pending: { bg: '#DCD3BE', text: '#10192B', ring: '#DCD3BE' },
  partially_paid: { bg: '#F7EFDF', text: '#8A631F', ring: '#D9B778' },
  paid: { bg: '#EAF3EE', text: '#2F6B4F', ring: '#2F6B4F' },
  overdue: { bg: '#F7E9E5', text: '#B04632', ring: '#B04632' },
};

interface Props {
  status: OrderStatus;
  isOverdue?: boolean;
  amountPaidCents?: number;
}

export function StatusBadge({ status, isOverdue, amountPaidCents }: Props) {
  const alsoPartiallyPaid = status === 'overdue' && isOverdue && (amountPaidCents ?? 0) > 0;
  const style = STYLES[status];

  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-xs font-medium ring-1 ring-inset"
      style={{
        backgroundColor: style.bg,
        color: style.text,
      }}
    >
      {alsoPartiallyPaid ? 'Partially paid · overdue' : ORDER_STATUS_LABELS[status]}
    </span>
  );
}