export function ChartSkeleton({ height = 350 }: { height?: number }) {
  return (
    <div 
      style={{ height: `${height}px` }} 
      className="w-full glass-card animate-pulse rounded-2xl border border-emerald-500/20 flex items-center justify-center shadow-lg"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-slate-800 border-t-emerald-400 rounded-full animate-spin shadow-md shadow-emerald-950/40"></div>
        <p className="text-emerald-400/80 text-xs font-semibold">Memuat visualisasi data...</p>
      </div>
    </div>
  );
}
