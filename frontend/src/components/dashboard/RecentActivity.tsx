import { Camera, Clapperboard, History, ImageIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { JobStatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useHistory } from "@/hooks/queries";
import { apiUrl } from "@/services/api";
import type { HistoryItem } from "@/types/api";
import { formatDateTime, formatMs } from "@/utils/format";

const KIND_ICON = { image: ImageIcon, video: Clapperboard, live: Camera };

export function Thumbnail({ item, className = "h-11 w-16" }: { item: HistoryItem; className?: string }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <div className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-elevated text-muted-foreground`}>
      {item.artifacts.thumbnail_url ? (
        <img src={apiUrl(item.artifacts.thumbnail_url)} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <Icon className="size-4" aria-hidden />
      )}
    </div>
  );
}

export function RecentActivity() {
  const history = useHistory({ limit: 6 });
  if (history.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }
  if (history.isError) return <ErrorState error={history.error} title="Could not load recent activity" onRetry={() => history.refetch()} />;
  const items = history.data?.items ?? [];
  if (!items.length) {
    return <EmptyState icon={History} title="No inference jobs yet" description="Your image, video and live sessions will show up here." compact />;
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y overflow-hidden rounded-xl border">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={item.kind === "video" ? `/video?job=${item.id}` : `/history?entry=${item.id}`}
              className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:gap-4"
            >
              <Thumbnail item={item} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={item.source_name}>
                  {item.source_name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.model_name ?? "Unknown model"} · {formatDateTime(item.created_at)}
                </p>
              </div>
              <div className="hidden text-right text-xs sm:block">
                <p className="tabular font-medium">{item.num_detections} objects</p>
                <p className="tabular text-muted-foreground">{formatMs(item.duration_ms)}</p>
              </div>
              <JobStatusBadge status={item.status} />
            </Link>
          </li>
        ))}
      </ul>
      <Button asChild variant="ghost" size="sm" className="w-full">
        <Link to="/history">View full history</Link>
      </Button>
    </div>
  );
}
