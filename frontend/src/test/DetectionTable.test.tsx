import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DetectionTable } from "@/components/detection/DetectionTable";
import { inferenceResult } from "./utils";

const confidences = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getByText(/%$/).textContent);

describe("DetectionTable", () => {
  it("sorts by confidence, descending by default", () => {
    render(<DetectionTable detections={inferenceResult.detections} />);
    expect(confidences()).toEqual(["91.0%", "73.0%", "55.0%"]);
    fireEvent.click(screen.getByRole("button", { name: /Confidence/ }));
    expect(confidences()).toEqual(["55.0%", "73.0%", "91.0%"]);
  });

  it("shows bounding boxes as x, y, width and height", () => {
    render(<DetectionTable detections={inferenceResult.detections.slice(1, 2)} />);
    const cells = within(screen.getAllByRole("row")[1]).getAllByRole("cell").map((c) => c.textContent);
    expect(cells.slice(-4)).toEqual(["300", "200", "200", "120"]);
  });
});
