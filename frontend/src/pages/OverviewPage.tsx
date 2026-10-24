import { motion } from "framer-motion";
import { Activity, ArrowRight, Clapperboard, Gauge, ImageIcon, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { DailyActivityChart } from "@/components/charts/DailyActivityChart";
import { ErrorState } from "@/components/common/ErrorState";
import { StatCard } from "@/components/common/StatCard";
import { ModelStatusCard } from "@/components/dashboard/ModelStatusCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useStats } from "@/hooks/queries";
import { formatCompact, formatMs, formatNumber } from "@/utils/format";

export default function OverviewPage() {
  const stats = useStats();
  const s = stats.data;
  const anyActivity = (s?.daily ?? []).some((d) => d.detections > 0 || d.jobs > 0);

  return (
    <div className="space-y-6 sm:space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="surface relative overflow-hidden p-6 sm:p-8 lg:p-10"
      >
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:linear-gradient(to_left,black,transparent_75%)]" aria-hidden />
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-32 right-40 size-64 rounded-full bg-cyan/10 blur-3xl" aria-hidden />
        <div className="relative max-w-2xl space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden /> Custom YOLO inference
          </span>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Welcome to YOLO Vision Studio</h1>
          <p className="text-base text-muted-foreground sm:text-lg">Your workspace for real-time AI-powered object detection.</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg">
              <Link to="/image">
                Open Detection Studio <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/models">Upload model</Link>
            </Button>
          </div>
        </div>
      </motion.section>

      {stats.isError && <ErrorState error={stats.error} title="Could not load statistics" onRetry={() => stats.refetch()} />}

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Statistics">
        <StatCard label="Total detections" value={formatCompact(s?.total_detections ?? 0)} icon={Activity} loading={stats.isLoading} hint="across completed jobs" />
        <StatCard label="Images processed" value={formatNumber(s?.images_processed ?? 0)} icon={ImageIcon} tone="cyan" loading={stats.isLoading} />
        <StatCard label="Videos processed" value={formatNumber(s?.videos_processed ?? 0)} icon={Clapperboard} tone="success" loading={stats.isLoading} />
        <StatCard
          label="Average inference time"
          value={s?.avg_inference_ms != null ? formatMs(s.avg_inference_ms) : "—"}
          icon={Gauge}
          tone="warning"
          loading={stats.isLoading}
          hint={s?.avg_inference_ms == null ? "no runs yet" : "per image / frame"}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <QuickActions />
          <Card>
            <CardHeader>
              <CardTitle>Detections per day</CardTitle>
              <CardDescription>Last 14 days (UTC)</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.isLoading ? (
                <Skeleton className="h-[220px]" />
              ) : anyActivity && s ? (
                <DailyActivityChart daily={s.daily} />
              ) : (
                <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                  No detections in the last 14 days
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <ModelStatusCard />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Stored by the backend (see Settings for retention)</CardDescription>
        </CardHeader>
        <CardContent>
          <RecentActivity />
        </CardContent>
      </Card>
    </div>
  );
}
