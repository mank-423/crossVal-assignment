import type { ReactNode } from 'react';

const INK = '#10192B';
const PAPER = '#F6F2E8';
const LINE = '#DCD3BE';
const BRASS = '#B8863B';
const MUTED_ON_PAPER = '#5B5647';

interface Props {
  title: string;
  subtitle: string;
  footer: ReactNode;
  children: ReactNode;
}

export function AuthCard({ title, subtitle, footer, children }: Props) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ backgroundColor: PAPER }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-sm font-mono text-sm tracking-[0.15em]"
            style={{ backgroundColor: INK, color: BRASS }}
          >
            OS
          </div>
          <h1 className="font-serif text-2xl" style={{ color: INK }}>
            {title}
          </h1>
          <p className="mt-2 text-sm" style={{ color: MUTED_ON_PAPER }}>
            {subtitle}
          </p>
        </div>

        <div
          className="rounded-sm border p-6"
          style={{ borderColor: LINE, backgroundColor: PAPER, boxShadow: `6px 6px 0 0 ${BRASS}` }}
        >
          {children}
        </div>

        <p className="mt-6 text-center text-sm" style={{ color: MUTED_ON_PAPER }}>
          {footer}
        </p>
      </div>
    </div>
  );
}