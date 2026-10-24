import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModelUploader } from "@/components/model-manager/ModelUploader";
import { ApiError, api } from "@/services/api";
import { mockBackend, model, renderWithProviders } from "./utils";

function pickFile(file: File) {
  const input = screen.getByLabelText("Drop your YOLO model here");
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ModelUploader", () => {
  it("rejects files that are not .pt checkpoints without uploading", async () => {
    mockBackend();
    const upload = vi.spyOn(api, "uploadModel");
    renderWithProviders(<ModelUploader />);
    pickFile(new File(["x"], "weights.onnx"));
    expect(await screen.findByText(/is not supported/)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("shows upload progress, then the validated model", async () => {
    mockBackend();
    let report: (fraction: number) => void = () => {};
    let resolve: (value: typeof model) => void = () => {};
    vi.spyOn(api, "uploadModel").mockImplementation((_file, onProgress) => {
      report = onProgress;
      return { promise: new Promise((r) => (resolve = r)), abort: vi.fn() };
    });
    const onUploaded = vi.fn();
    renderWithProviders(<ModelUploader onUploaded={onUploaded} />);
    pickFile(new File(["weights"], "best.pt"));

    expect(await screen.findByText("best.pt")).toBeInTheDocument();
    act(() => report(0.4));
    expect(await screen.findByText("Uploading… 40%")).toBeInTheDocument();
    act(() => report(1));
    expect(await screen.findByText(/Scanning the checkpoint/)).toBeInTheDocument();
    await act(async () => resolve(model));
    expect(await screen.findByText(/Validated and loaded: detect, 3 classes on cpu/)).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledWith(model);
  });

  it("surfaces the backend's validation error instead of reporting success", async () => {
    mockBackend();
    vi.spyOn(api, "uploadModel").mockReturnValue({
      promise: Promise.reject(
        new ApiError(422, "MODEL_REJECTED_UNSAFE", "The checkpoint references Python objects that are not part of a YOLO model", {
          offending: ["posix.system"],
        }),
      ),
      abort: vi.fn(),
    });
    renderWithProviders(<ModelUploader />);
    pickFile(new File(["evil"], "best.pt"));
    expect(await screen.findByText(/not part of a YOLO model/)).toBeInTheDocument();
    expect(screen.getByText("Error code: MODEL_REJECTED_UNSAFE")).toBeInTheDocument();
    expect(screen.getByText("posix.system")).toBeInTheDocument();
    expect(screen.queryByText(/Validated and loaded/)).not.toBeInTheDocument();
  });

  it("offers to load the existing copy of a duplicate upload", async () => {
    mockBackend();
    vi.spyOn(api, "uploadModel").mockReturnValue({
      promise: Promise.reject(new ApiError(409, "MODEL_ALREADY_EXISTS", "This model is already uploaded as 'best.pt'.", { model_id: model.id })),
      abort: vi.fn(),
    });
    const load = vi.spyOn(api, "loadModel").mockResolvedValue(model);
    renderWithProviders(<ModelUploader />);
    pickFile(new File(["w"], "copy.pt"));
    fireEvent.click(await screen.findByRole("button", { name: "Load the existing copy" }));
    await waitFor(() => expect(load).toHaveBeenCalledWith(model.id, { device: undefined, force_reload: undefined }));
  });
});
