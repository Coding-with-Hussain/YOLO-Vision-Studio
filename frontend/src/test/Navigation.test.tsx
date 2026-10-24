import { fireEvent, screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/AppShell";
import { ModelRequired } from "@/components/common/ModelRequired";
import OverviewPage from "@/pages/OverviewPage";
import { ApiError, api } from "@/services/api";
import { mockBackend, renderWithProviders } from "./utils";

function Shell() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="image" element={<p>Image page body</p>} />
      </Route>
    </Routes>
  );
}

describe("Navigation and status", () => {
  it("opens the mobile drawer and navigates", async () => {
    mockBackend();
    renderWithProviders(<Shell />);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    const drawer = await screen.findByRole("dialog");
    fireEvent.click(within(drawer).getByRole("link", { name: /Image Detection/ }));
    expect(await screen.findByText("Image page body")).toBeInTheDocument();
  });

  it("lists every section in the main navigation", async () => {
    mockBackend();
    renderWithProviders(<Shell />);
    const nav = screen.getAllByRole("navigation", { name: "Main navigation" })[0];
    for (const label of ["Overview", "Image Detection", "Video Detection", "Live Camera", "Model Manager", "Detection History", "Settings"]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
  });

  it("reports a connected backend and the active model", async () => {
    mockBackend();
    renderWithProviders(<Shell />);
    expect((await screen.findAllByText("Backend ready")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("best.pt")).length).toBeGreaterThan(0);
  });

  it("shows an offline banner when the backend is unreachable", async () => {
    mockBackend();
    vi.spyOn(api, "health").mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "Cannot reach the backend"));
    renderWithProviders(<ModelRequired />);
    expect(await screen.findByText("The backend is not reachable")).toBeInTheDocument();
  });

  it("shows zero statistics without history instead of invented numbers", async () => {
    mockBackend({ withModel: false });
    renderWithProviders(<Shell />);
    expect(await screen.findByText("No inference jobs yet")).toBeInTheDocument();
    expect(screen.getByText("Images processed").parentElement?.parentElement).toHaveTextContent("0");
    expect(screen.getByText("no runs yet")).toBeInTheDocument();
  });

  it("shows an error with retry when statistics fail to load", async () => {
    mockBackend();
    vi.spyOn(api, "stats").mockRejectedValue(new ApiError(500, "INTERNAL_ERROR", "Database unavailable"));
    renderWithProviders(<Shell />);
    expect(await screen.findByText("Could not load statistics")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Retry/ }).length).toBeGreaterThan(0);
  });
});
