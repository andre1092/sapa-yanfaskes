
export function ChartSkeleton({ height = 350 }: { height?: number }) {
  return (
    <div 
      style={{ height: `${height}px` }} 
      className="w-full bg-slate-800/30 animate-pulse rounded-xl border border-slate-700/50 flex items-center justify-center"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-slate-700 border-t-cyan-500 rounded-full animate-spin"></div>
        <p className="text-slate-500 text-sm font-medium">Loading visualization...</p>
      </div>
    </div>
  );
}
