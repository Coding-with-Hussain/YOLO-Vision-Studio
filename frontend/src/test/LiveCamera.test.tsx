import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LiveCameraPage from "@/pages/LiveCameraPage";
import { mockBackend, renderWithProviders } from "./utils";

function mockGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(impl), enumerateDevices: vi.fn(async () => []) } });
}

describe("Live camera", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  });

  it("does not request the camera until the user starts it", async () => {
    mockBackend();
    mockGetUserMedia(() => new Promise(() => {}));
    renderWithProviders(<LiveCameraPage />);
    expect(await screen.findByText("Camera Off")).toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Start Camera/ }));
    expect(await screen.findByText("Requesting Permission")).toBeInTheDocument();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("explains a denied permission", async () => {
    mockBackend();
    mockGetUserMedia(() => Promise.reject(new DOMException("Permission denied", "NotAllowedError")));
    renderWithProviders(<LiveCameraPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Start Camera/ }));
    expect(await screen.findByText(/Camera permission was denied/)).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start Detection/ })).toBeDisabled();
  });

  it("explains a missing camera", async () => {
    mockBackend();
    mockGetUserMedia(() => Promise.reject(new DOMException("No device", "NotFoundError")));
    renderWithProviders(<LiveCameraPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Start Camera/ }));
    expect(await screen.findByText(/No camera was found/)).toBeInTheDocument();
  });

  it("handles browsers without the MediaDevices API", async () => {
    mockBackend();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    renderWithProviders(<LiveCameraPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Start Camera/ }));
    expect(await screen.findByText(/does not support camera access|secure context/)).toBeInTheDocument();
  });
});
