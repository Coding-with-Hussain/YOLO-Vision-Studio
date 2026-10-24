import { useCallback, useMemo } from "react";

import { classColor } from "@/utils/colors";
import { useModels } from "./queries";

/**
 * Colour lookup by class *name* for results that only store names (video
 * summaries, history, live totals). Uses the model's real class list so the
 * colour matches the overlays; unknown names fall back to neutral.
 */
export function useClassColors(modelId: string | null | undefined) {
  const { data } = useModels();
  const index = useMemo(() => {
    const names = data?.models.find((m) => m.id === modelId)?.class_names ?? [];
    return new Map(names.map((name, id) => [name, id]));
  }, [data, modelId]);
  return useCallback(
    (row: { name: string }) => {
      const id = index.get(row.name);
      return id == null ? undefined : classColor(id);
    },
    [index],
  );
}
