import { create } from "zustand";

import type { ImageInferenceResponse, InferenceParams } from "@/types/api";

/**
 * In-memory state that survives navigating between pages during a session.
 * Nothing here is persisted: files and results are gone after a reload.
 */
interface WorkspaceState {
  imageFile: File | null;
  imageResult: ImageInferenceResponse | null;
  imageParams: InferenceParams | null;
  videoFile: File | null;
  videoJobId: string | null;
  setImage: (file: File | null) => void;
  setImageResult: (result: ImageInferenceResponse | null) => void;
  setImageParams: (params: InferenceParams) => void;
  setVideo: (file: File | null) => void;
  setVideoJobId: (id: string | null) => void;
}

export const useWorkspace = create<WorkspaceState>()((set) => ({
  imageFile: null,
  imageResult: null,
  imageParams: null,
  videoFile: null,
  videoJobId: null,
  setImage: (imageFile) => set({ imageFile, imageResult: null }),
  setImageResult: (imageResult) => set({ imageResult }),
  setImageParams: (imageParams) => set({ imageParams }),
  setVideo: (videoFile) => set({ videoFile }),
  setVideoJobId: (videoJobId) => set({ videoJobId }),
}));
