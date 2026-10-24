import { motion } from "framer-motion";
import { Boxes, ChevronsLeft, ChevronsRight } from "lucide-react";
import { NavLink } from "react-router-dom";

import { ConnectionDot, connectionLabel } from "@/components/common/ConnectionIndicator";
import { Tooltip } from "@/components/ui/tooltip";
import { useActiveModel, useHealth } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, type NavItem } from "./nav";
import { Logo } from "./Logo";

const SECTIONS: NavItem["section"][] = ["Workspace", "Detect", "Manage"];

export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5" aria-label="Main navigation">
      {SECTIONS.map((section) => (
        <div key={section} className="flex flex-col gap-1">
          {!collapsed && (
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70">{section}</p>
          )}
          {NAV_ITEMS.filter((item) => item.section === section).map((item) => (
            <Tooltip key={item.to} content={collapsed ? item.label : null} side="right">
              <NavLink
                to={item.to}
                end={item.to === "/"}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                    collapsed && "justify-center px-0",
                    isActive ? "text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId={collapsed ? "nav-active-collapsed" : "nav-active"}
                        className="absolute inset-0 rounded-xl border border-primary/25 bg-primary/10 shadow-[inset_0_0_20px_-12px_rgb(var(--primary))]"
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                      />
                    )}
                    <item.icon
                      className={cn("relative size-[18px] shrink-0 transition-colors", isActive ? "text-primary" : "group-hover:text-foreground")}
                      aria-hidden
                    />
                    {!collapsed && <span className="relative truncate">{item.label}</span>}
                    {collapsed && <span className="sr-only">{item.label}</span>}
                  </>
                )}
              </NavLink>
            </Tooltip>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function SidebarFooter({ collapsed }: { collapsed?: boolean }) {
  const { connection, data: health } = useHealth();
  const { active } = useActiveModel();
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3">
        <Tooltip content={connectionLabel(connection)} side="right">
          <span className="flex size-9 items-center justify-center rounded-xl border bg-card">
            <ConnectionDot state={connection} />
          </span>
        </Tooltip>
        <Tooltip content={active ? `${active.name} (${active.status.replace("_", " ")})` : "No model loaded"} side="right">
          <span className="flex size-9 items-center justify-center rounded-xl border bg-card text-muted-foreground">
            <Boxes className="size-4" aria-hidden />
          </span>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl border bg-card/60 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Backend</span>
        <span className="flex items-center gap-1.5 font-medium">
          <ConnectionDot state={connection} />
          {connection === "connected" ? "Connected" : connection === "connecting" ? "Connecting" : connection === "degraded" ? "Degraded" : "Offline"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Model</span>
        <span className={cn("max-w-[9.5rem] truncate font-medium", !active && "text-muted-foreground")} title={active?.name}>
          {active ? active.name : "None loaded"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
        <span>v{health?.version ?? "1.0.0"}</span>
        <span>{health?.ultralytics_version ? `Ultralytics ${health.ultralytics_version}` : "Ultralytics —"}</span>
      </div>
    </div>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-300 ease-out md:flex",
        collapsed ? "w-[76px]" : "w-[264px]",
      )}
    >
      <div className={cn("flex h-16 items-center border-b", collapsed ? "justify-center px-2" : "px-5")}>
        <Logo collapsed={collapsed} />
      </div>
      <div className={cn("flex-1 overflow-y-auto py-5", collapsed ? "px-3" : "px-3.5")}>
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className={cn("space-y-3 border-t p-3.5", collapsed && "px-3")}>
        <SidebarFooter collapsed={collapsed} />
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            collapsed && "justify-center",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && "Collapse"}
        </button>
      </div>
    </aside>
  );
}
