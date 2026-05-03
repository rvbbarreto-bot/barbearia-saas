import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton
              key={j}
              className="h-5 flex-1"
              style={{ opacity: 1 - i * 0.12 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export { Skeleton };
