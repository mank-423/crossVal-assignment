export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div 
      className="flex items-center gap-3 font-mono text-sm"
      style={{ color: '#5B5647' }}
      role="status"
    >
      <span
        className="h-4 w-4 animate-spin rounded-full border-2"
        style={{
          borderColor: '#5B5647',
          borderTopColor: '#B8863B',
        }}
        aria-hidden="true"
      />
      {label}
    </div>
  );
}