export function SkeletonCard({ className = '' }) {
  return (
    <div className={`card p-5 animate-pulse ${className}`}>
      <div className="h-3 bg-white/5 rounded w-1/3 mb-3" />
      <div className="h-7 bg-white/8 rounded w-1/2 mb-2" />
      <div className="h-2.5 bg-white/4 rounded w-2/3" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="card overflow-hidden animate-pulse">
      <div className="bg-white/2 border-b border-white/5 px-5 py-3 flex gap-8">
        {[80, 60, 50, 70, 55, 40, 50].map((w, i) => (
          <div key={i} className="h-2.5 bg-white/5 rounded" style={{ width: w }} />
        ))}
      </div>
      <div className="divide-y divide-white/5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-5 py-4 flex items-center gap-8">
            {[60, 80, 40, 70, 90, 30, 50].map((w, j) => (
              <div key={j} className="h-3 bg-white/5 rounded" style={{ width: w, opacity: 1 - i * 0.12 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonChart({ height = 200 }) {
  return (
    <div className="card p-5 animate-pulse">
      <div className="h-3 bg-white/5 rounded w-1/4 mb-5" />
      <div className="bg-white/3 rounded-xl" style={{ height }} />
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="card p-5 animate-pulse">
        <div className="flex gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/5 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-white/5 rounded w-1/4" />
            <div className="h-3 bg-white/5 rounded w-full" />
            <div className="h-3 bg-white/5 rounded w-3/4" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <SkeletonChart height={220} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SkeletonChart height={180} />
        <SkeletonChart height={180} />
      </div>
    </div>
  )
}
