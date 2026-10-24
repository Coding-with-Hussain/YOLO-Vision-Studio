import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Database, Eye, History, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { PageHeader } from "@/components/common/PageHeader";
import { JobStatusBadge } from "@/components/common/StatusBadge";
import { Thumbnail } from "@/components/dashboard/RecentActivity";
import { HistoryDetailDialog } from "@/components/history/HistoryDetailDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHistory, useInvalidateActivity, useRuntimeSettings } from "@/hooks/queries";
import { api, describeError } from "@/services/api";
import type { HistoryItem, HistoryKind, HistoryQuery, JobStatus } from "@/types/api";
import { formatDateTime, formatMs, titleCase } from "@/utils/format";

const PAGE_SIZE = 20;
const SORTS = {
  newest: { sort: "created_at", order: "desc" },
  oldest: { sort: "created_at", order: "asc" },
  detections: { sort: "detections", order: "desc" },
  duration: { sort: "duration", order: "desc" },
  name: { sort: "name", order: "asc" },
} as const;
type SortKey = keyof typeof SORTS;
type DatePreset = "all" | "today" | "7d" | "30d" | "custom";

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function dateRange(preset: DatePreset, from: string, to: string): Pick<HistoryQuery, "date_from" | "date_to"> {
  const now = new Date();
  if (preset === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { date_from: start.toISOString() };
  }
  if (preset === "7d" || preset === "30d") {
    const days = preset === "7d" ? 7 : 30;
    return { date_from: new Date(now.getTime() - days * 86_400_000).toISOString() };
  }
  if (preset === "custom") {
    return {
      date_from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      date_to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
    };
  }
  return {};
}

function FilesBadge({ item }: { item: HistoryItem }) {
  const hasFiles = Object.values(item.artifacts).some(Boolean);
  if (item.files_expired) return <Badge variant="warning">Expired</Badge>;
  if (hasFiles) return <Badge variant="success">Available</Badge>;
  return <Badge variant="secondary">Not retained</Badge>;
}

export default function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<HistoryKind | "all">("all");
  const [status, setStatus] = useState<JobStatus | "all">("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<HistoryItem | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const q = useDebounced(search);
  const { data: runtime } = useRuntimeSettings();
  const invalidate = useInvalidateActivity();
  const client = useQueryClient();
  const detailId = searchParams.get("entry");

  const query: HistoryQuery = useMemo(
    () => ({
      q: q || undefined,
      kind: kind === "all" ? undefined : kind,
      status: status === "all" ? undefined : status,
      ...dateRange(datePreset, customFrom, customTo),
      ...SORTS[sort],
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [q, kind, status, datePreset, customFrom, customTo, sort, page],
  );
  useEffect(() => setPage(0), [q, kind, status, datePreset, customFrom, customTo, sort]);

  const history = useHistory(query);
  const items = history.data?.items ?? [];
  const total = history.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const remove = useMutation({
    mutationFn: (item: HistoryItem) => api.deleteHistoryEntry(item.id),
    onSuccess: (_d, item) => toast.success(`Deleted ${item.source_name}`),
    onError: (error) => toast.error("Could not delete entry", { description: describeError(error) }),
    onSettled: invalidate,
  });
  const clear = useMutation({
    mutationFn: api.clearHistory,
    onSuccess: (r) => toast.success(`Deleted ${r.deleted} entries`),
    onError: (error) => toast.error("Could not clear history", { description: describeError(error) }),
    onSettled: () => {
      invalidate();
      client.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const openDetail = (id: string | null) => setSearchParams(id ? { entry: id } : {}, { replace: true });
  const filtersActive = Boolean(q || kind !== "all" || status !== "all" || datePreset !== "all");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Detection History"
        description={
          <>
            Stored on the backend (SQLite) and shared by every browser that uses this server. Result files are kept for{" "}
            {runtime ? `${runtime.output_retention_hours} hours` : "the configured retention period"}, then removed; the metadata stays.
          </>
        }
        actions={
          <Button variant="destructive-ghost" onClick={() => setConfirmClear(true)} disabled={!total || clear.isPending}>
            <Trash2 /> Clear history
          </Button>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative lg:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search file or model…" className="pl-9" aria-label="Search history" />
        </div>
        <Tabs value={kind} onValueChange={(v) => setKind(v as HistoryKind | "all")}>
          <TabsList className="h-10" aria-label="Task type">
            {(["all", "image", "video", "live"] as const).map((k) => (
              <TabsTrigger key={k} value={k} className="px-3">
                {k === "all" ? "All" : titleCase(k)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
            <SelectTrigger className="sm:w-40" aria-label="Date range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as JobStatus | "all")}>
            <SelectTrigger className="sm:w-36" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {(["completed", "running", "queued", "failed", "cancelled"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {titleCase(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="col-span-2 sm:w-48" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="detections">Most detections</SelectItem>
              <SelectItem value="duration">Longest processing</SelectItem>
              <SelectItem value="name">Name (A–Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {datePreset === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="From date" className="w-40" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="To date" className="w-40" />
          </div>
        )}
      </div>

      {history.isError && <ErrorState error={history.error} title="Could not load history" onRetry={() => history.refetch()} />}

      <Card className={history.isFetching && !history.isLoading ? "opacity-70 transition-opacity" : "transition-opacity"}>
        <CardContent className="p-0 sm:p-0">
          {history.isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={filtersActive ? Search : History}
                title={filtersActive ? "No entries match these filters" : "No history yet"}
                description={filtersActive ? "Try a different search or date range." : "Run an image, video or live detection to build your history."}
                compact
              />
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Source</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Detections</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Files</TableHead>
                      <TableHead className="w-24 text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} className="cursor-pointer" onClick={() => openDetail(item.id)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Thumbnail item={item} className="h-9 w-14" />
                            <div className="min-w-0">
                              <p className="max-w-[16rem] truncate font-medium" title={item.source_name}>
                                {item.source_name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {titleCase(item.kind)}
                                {item.task ? ` · ${item.task}` : ""}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate text-muted-foreground">{item.model_name ?? "—"}</TableCell>
                        <TableCell className="tabular text-right">{item.num_detections}</TableCell>
                        <TableCell className="tabular text-right text-muted-foreground">{formatMs(item.duration_ms)}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(item.created_at)}</TableCell>
                        <TableCell>
                          <JobStatusBadge status={item.status} />
                        </TableCell>
                        <TableCell>
                          <FilesBadge item={item} />
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon-sm" onClick={() => openDetail(item.id)} aria-label={`View ${item.source_name}`}>
                            <Eye />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setPendingDelete(item)}
                            disabled={item.status === "running" || item.status === "queued"}
                            aria-label={`Delete ${item.source_name}`}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {/* Mobile cards */}
              <ul className="divide-y md:hidden">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 p-3">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openDetail(item.id)}>
                      <Thumbnail item={item} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.source_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.num_detections} objects · {formatMs(item.duration_ms)} · {formatDateTime(item.created_at)}
                        </p>
                        <div className="mt-1.5 flex gap-1.5">
                          <JobStatusBadge status={item.status} />
                          <FilesBadge item={item} />
                        </div>
                      </div>
                    </button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setPendingDelete(item)} aria-label={`Delete ${item.source_name}`} disabled={item.status === "running" || item.status === "queued"}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Database className="size-3.5" aria-hidden /> {total} entr{total === 1 ? "y" : "ies"}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon-sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page">
                    <ChevronLeft />
                  </Button>
                  <span className="tabular">
                    {page + 1} / {pages}
                  </span>
                  <Button variant="ghost" size="icon-sm" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label="Next page">
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <HistoryDetailDialog id={detailId} onClose={() => openDetail(null)} />

      <AlertDialog open={pendingDelete != null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.source_name}” and its retained files (annotated outputs, thumbnails, uploaded video) are removed from the backend.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction destructive onClick={() => pendingDelete && remove.mutate(pendingDelete)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the entire history?</AlertDialogTitle>
            <AlertDialogDescription>
              Every finished entry and its files are deleted from the backend. Running jobs are kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction destructive onClick={() => clear.mutate()}>
              Clear history
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
