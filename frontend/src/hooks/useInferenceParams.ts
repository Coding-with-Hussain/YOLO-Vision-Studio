import { useEffect, useRef, useState } from "react";

import type { InferenceParams } from "@/types/api";
import { useActiveModel, useRuntimeSettings } from "./queries";

export const FALLBACK_PARAMS: InferenceParams = {
  confidence: 0.25,
  iou: 0.45,
  image_size: 640,
  max_detections: 300,
  device: "auto",
  classes: null,
};

/**
 * Local inference settings initialised from the backend defaults. The class
 * filter is cleared whenever the active model changes, because class ids are
 * specific to a model.
 */
export function useInferenceParams(initial?: InferenceParams) {
  const { data: defaults } = useRuntimeSettings();
  const { active } = useActiveModel();
  const [params, setParams] = useState<InferenceParams>(initial ?? FALLBACK_PARAMS);
  const initialized = useRef(Boolean(initial));
  const modelId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!defaults || initialized.current) return;
    initialized.current = true;
    setParams((p) => ({
      ...p,
      confidence: defaults.default_confidence,
      iou: defaults.default_iou,
      image_size: defaults.default_image_size,
      max_detections: defaults.default_max_detections,
      device: defaults.preferred_device,
    }));
  }, [defaults]);

  useEffect(() => {
    const id = active?.id ?? null;
    if (modelId.current !== undefined && modelId.current !== id) {
      setParams((p) => ({ ...p, classes: null }));
    }
    modelId.current = id;
  }, [active?.id]);

  return [params, setParams] as const;
}
