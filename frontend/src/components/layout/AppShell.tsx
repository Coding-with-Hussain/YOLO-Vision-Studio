import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { useLocation, useOutlet } from "react-router-dom";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePreferences } from "@/stores/preferences";
import { Logo } from "./Logo";
import { Sidebar, SidebarFooter, SidebarNav } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell() {
  const location = useLocation();
  const outlet = useOutlet();
  const reduceMotion = useReducedMotion();
  const collapsedPref = usePreferences((s) => s.sidebarCollapsed);
  const setCollapsed = usePreferences((s) => s.setSidebarCollapsed);
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1279px)");
  const [tabletExpanded, setTabletExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Tablets default to the icon rail; desktop follows the saved preference.
  const collapsed = isTablet ? !tabletExpanded : collapsedPref;

  useEffect(() => {
    setMobileOpen(false);
    setTabletExpanded(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={() => (isTablet ? setTabletExpanded((v) => !v) : setCollapsed(!collapsedPref))} />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
          <div className="flex h-16 items-center border-b px-5">
            <Logo />
          </div>
          <div className="flex-1 overflow-y-auto px-3.5 py-5">
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </div>
          <div className="border-t p-3.5">
            <SidebarFooter />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <main id="main" className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,rgb(var(--primary)/0.08),transparent_65%)]" aria-hidden />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="relative mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
