import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ImageDetectionPage from "@/pages/ImageDetectionPage";
import { ApiError, api } from "@/services/api";
import { useWorkspace } from "@/stores/workspace";
import { inferenceResult, mockBackend, renderWithProviders } from "./utils";

function selectImage(name = "street.jpg") {
  const input = screen.getByLabelText("Drop an image to analyse");
  fireEvent.change(input, { target: { files: [new File(["img"], name, { type: "image/jpeg" })] } });
}

describe("Image detection", () => {
  beforeEach(() => useWorkspace.setState({ imageFile: null, imageResult: null, imageParams: null }));

  it("disables detection until an image is chosen and a model is loaded", async () => {
    mockBackend({ withModel: false });
    renderWithProviders(<ImageDetectionPage />);
    expect(await screen.findByText("No model loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run Object Detection/ })).toBeDisabled();
  });

  it("rejects unsupported image types", async () => {
    mockBackend();
    renderWithProviders(<ImageDetectionPage />);
    selectImage("animation.gif");
    expect(await screen.findByText(/is not supported/)).toBeInTheDocument();
  });

  it("sends the configured settings and renders real results", async () => {
    mockBackend();
    const infer = vi.spyOn(api, "inferImage").mockResolvedValue(inferenceResult);
    renderWithProviders(<ImageDetectionPage />);
    selectImage();
    const run = await screen.findByRole("button", { name: /Run Object Detection/ });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);

    await waitFor(() => expect(infer).toHaveBeenCalledTimes(1));
    const [file, settings] = infer.mock.calls[0];
    expect(file.name).toBe("street.jpg");
    expect(settings).toMatchObject({ confidence: 0.25, iou: 0.45, image_size: 640, classes: null });

    expect(await screen.findByText("43 ms")).toBeInTheDocument();
    expect(screen.getByText("640 × 480")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4); // header + 3 detections
    expect(within(table).getByText("91.0%")).toBeInTheDocument();
    expect(screen.getAllByTestId("detection-overlay")[0].children).toHaveLength(3);
  });

  it("prevents duplicate submissions while a request is running", async () => {
    mockBackend();
    const infer = vi.spyOn(api, "inferImage").mockReturnValue(new Promise(() => {}));
    renderWithProviders(<ImageDetectionPage />);
    selectImage();
    const run = await screen.findByRole("button", { name: /Run Object Detection/ });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    const busy = await screen.findByRole("button", { name: /Detecting/ });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(infer).toHaveBeenCalledTimes(1);
  });

  it("shows backend errors and keeps the page usable", async () => {
    mockBackend();
    vi.spyOn(api, "inferImage").mockRejectedValue(new ApiError(503, "OUT_OF_MEMORY", "The backend ran out of memory during inference."));
    renderWithProviders(<ImageDetectionPage />);
    selectImage();
    const run = await screen.findByRole("button", { name: /Run Object Detection/ });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    expect(await screen.findByText("Detection failed", { selector: "p" })).toBeInTheDocument();
    expect(screen.getAllByText(/ran out of memory/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows a friendly empty state when nothing is detected", async () => {
    mockBackend();
    vi.spyOn(api, "inferImage").mockResolvedValue({ ...inferenceResult, count: 0, detections: [], class_counts: {} });
    renderWithProviders(<ImageDetectionPage />);
    selectImage();
    const run = await screen.findByRole("button", { name: /Run Object Detection/ });
    await waitFor(() => expect(run).toBeEnabled());
    fireEvent.click(run);
    expect(await screen.findByText("No objects detected")).toBeInTheDocument();
    expect(screen.getByText(/25% confidence threshold/)).toBeInTheDocument();
  });
});
