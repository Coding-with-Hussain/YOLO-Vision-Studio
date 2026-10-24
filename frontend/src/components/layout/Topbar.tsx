import { Boxes, ChevronRight, Menu, Monitor, Moon, Sun } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { ConnectionBadge, ConnectionDot } from "@/components/common/ConnectionIndicator";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useActiveModel, useHealth } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import { usePreferences, type ThemePreference } from "@/stores/preferences";
import { LogoMark } from "./Logo";
import { findNavItem } from "./nav";

const NEXT_THEME: Record<ThemePreference, ThemePreference> = { dark: "light", light: "system", system: "dark" };
const THEME_ICON = { dark: Moon, light: Sun, system: Monitor };

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { pathname } = useLocation();
  const item = findNavItem(pathname);
  const { connection } = useHealth();
  const { active } = useActiveModel();
  const theme = usePreferences((s) => s.theme);
  const setTheme = usePreferences((s) => s.setTheme);
  const ThemeIcon = THEME_ICON[theme];

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/75 px-4 backdrop-blur-xl sm:px-6">
      <Button variant="ghost" size="icon" className="-ml-1 md:hidden" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>
      <Link to="/" className="md:hidden" aria-label="YOLO Vision Studio home">
        <LogoMark className="size-7" />
      </Link>

      <div className="min-w-0 flex-1">
        <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <Link to="/" className="hover:text-foreground">
            Studio
          </Link>
          <ChevronRight className="size-3" aria-hidden />
          <span className="text-foreground/80">{item.section}</span>
        </nav>
        <p className="truncate text-sm font-semibold sm:text-[15px]">{item.label}</p>
      </div>

      <div className="flex items-center gap-2">
        <ConnectionBadge state={connection} className="hidden lg:inline-flex" />
        <Tooltip content={connection === "connected" ? "Backend ready" : connection === "disconnected" ? "Backend offline" : "Checking backend"}>
          <span className="flex size-9 items-center justify-center rounded-lg border lg:hidden" role="status" aria-label={`Backend ${connection}`}>
            <ConnectionDot state={connection} />
          </span>
        </Tooltip>
        <Link
          to="/models"
          className={cn(
            "hidden h-9 max-w-[14rem] items-center gap-2 rounded-lg border bg-card px-3 text-xs font-medium transition-colors hover:border-input hover:bg-accent sm:flex",
          )}
          title={active ? `Active model: ${active.name}` : "No model loaded"}
        >
          <Boxes className={cn("size-4 shrink-0", active?.status === "loaded" ? "text-primary" : "text-muted-foreground")} aria-hidden />
          <span className="truncate">{active ? active.name : "No model"}</span>
          {active && (
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                active.status === "loaded" ? "bg-success" : active.status === "error" ? "bg-destructive" : "bg-muted-foreground",
              )}
              aria-hidden
            />
          )}
        </Link>
        <Tooltip content={`Theme: ${theme}`}>
          <Button variant="ghost" size="icon" onClick={() => setTheme(NEXT_THEME[theme])} aria-label={`Switch theme (current: ${theme})`}>
            <ThemeIcon className="size-[18px]" />
          </Button>
        </Tooltip>
        <div
          className="hidden size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-cyan text-xs font-semibold text-white sm:flex"
          aria-hidden
        >
          YV
        </div>
      </div>
    </header>
  );
}
