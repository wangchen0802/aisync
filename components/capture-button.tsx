"use client";

import { openCapture } from "@/components/shell";
import { Icon } from "@/components/ui";

export function CaptureButton() {
  return (
    <button className="btn" onClick={openCapture} title="快速记录一条决策或任务（C）">
      <Icon name="bolt" />快速记录<kbd style={{ marginLeft: 2 }}>C</kbd>
    </button>
  );
}
