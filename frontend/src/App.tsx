import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import OverviewPage from "@/pages/OverviewPage";

const ImageDetectionPage = lazy(() => import("@/pages/ImageDetectionPage"));
const VideoDetectionPage = lazy(() => import("@/pages/VideoDetectionPage"));
const LiveCameraPage = lazy(() => import("@/pages/LiveCameraPage"));
const ModelManagerPage = lazy(() => import("@/pages/ModelManagerPage"));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

function PageFallback() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="image" element={<Suspense fallback={<PageFallback />}><ImageDetectionPage /></Suspense>} />
        <Route path="video" element={<Suspense fallback={<PageFallback />}><VideoDetectionPage /></Suspense>} />
        <Route path="live" element={<Suspense fallback={<PageFallback />}><LiveCameraPage /></Suspense>} />
        <Route path="models" element={<Suspense fallback={<PageFallback />}><ModelManagerPage /></Suspense>} />
        <Route path="history" element={<Suspense fallback={<PageFallback />}><HistoryPage /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<PageFallback />}><SettingsPage /></Suspense>} />
        <Route path="*" element={<Suspense fallback={<PageFallback />}><NotFoundPage /></Suspense>} />
      </Route>
    </Routes>
  );
}
