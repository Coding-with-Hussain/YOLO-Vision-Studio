import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemePreference = "dark" | "light" | "system";

export interface DisplayPreferences {
  showBoxes: boolean;
  showLabels: boolean;
  showConfidence: boolean;
}

/**
 * Interface preferences stored in this browser only (localStorage key
 * "yvs-preferences"). Nothing here is sent to the backend.
 */
interface PreferencesState {
  theme: ThemePreference;
  sidebarCollapsed: boolean;
  /** Overrides VITE_API_BASE_URL when set. */
  apiBaseUrl: string | null;
  display: DisplayPreferences;
  liveMirror: boolean;
  setTheme: (theme: ThemePreference) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setApiBaseUrl: (url: string | null) => void;
  setDisplay: (display: Partial<DisplayPreferences>) => void;
  setLiveMirror: (mirror: boolean) => void;
  reset: () => void;
}

const defaults = {
  theme: "dark" as ThemePreference,
  sidebarCollapsed: false,
  apiBaseUrl: null,
  display: { showBoxes: true, showLabels: true, showConfidence: true },
  liveMirror: true,
};

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...defaults,
      setTheme: (theme) => set({ theme }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setApiBaseUrl: (apiBaseUrl) => set({ apiBaseUrl: apiBaseUrl?.trim() ? apiBaseUrl.trim() : null }),
      setDisplay: (display) => set((state) => ({ display: { ...state.display, ...display } })),
      setLiveMirror: (liveMirror) => set({ liveMirror }),
      reset: () => set(defaults),
    }),
    {
      name: "yvs-preferences",
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
