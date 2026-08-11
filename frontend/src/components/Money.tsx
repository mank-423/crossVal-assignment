import { formatMoney } from '@orders/shared';

interface Props {
  cents: number;
  /** Dim a zero balance so a row with nothing outstanding recedes rather than competing. */
  muteZero?: boolean;
  className?: string;
  /** Optional inline styles for the component */
  style?: React.CSSProperties;
}

/**
 * Renders an amount from integer cents, in the mono face used for every figure across the app —
 * the same face as the ledger widget on the home page — so numbers read as numbers, consistently.
 */
export function Money({ cents, muteZero = false, className = '', style }: Props) {
  const muted = muteZero && cents === 0;

  return (
    <span 
      className={`font-mono tabular-nums ${muted ? 'text-muted/50' : ''} ${className}`}
      style={style}
    >
      {formatMoney(cents)}
    </span>
  );
}