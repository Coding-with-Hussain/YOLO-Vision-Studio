import { Boxes, Camera, Clapperboard, History, Image, LayoutDashboard, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  description: string;
  section: "Workspace" | "Detect" | "Manage";
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, description: "Dashboard", section: "Workspace" },
  { to: "/image", label: "Image Detection", icon: Image, description: "Detect objects in images", section: "Detect" },
  { to: "/video", label: "Video Detection", icon: Clapperboard, description: "Process video files", section: "Detect" },
  { to: "/live", label: "Live Camera", icon: Camera, description: "Real-time webcam detection", section: "Detect" },
  { to: "/models", label: "Model Manager", icon: Boxes, description: "Upload and manage weights", section: "Manage" },
  { to: "/history", label: "Detection History", icon: History, description: "Past inference jobs", section: "Manage" },
  { to: "/settings", label: "Settings", icon: Settings, description: "Defaults and storage", section: "Manage" },
];

export function findNavItem(pathname: string): NavItem {
  return (
    NAV_ITEMS.filter((item) => item.to !== "/").find((item) => pathname.startsWith(item.to)) ??
    NAV_ITEMS[0]
  );
}
