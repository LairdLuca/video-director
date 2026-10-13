import type React from "react";
import type { SceneName } from "../lib/timeline.mjs";
import { CodeWalk } from "./CodeWalk";
import { FlowDiagram } from "./FlowDiagram";
import { HookStatus } from "./HookStatus";
import { Lesson } from "./Lesson";
import { Screenshot } from "./Screenshot";
import { StatusCard } from "./StatusCard";
import { StepList } from "./StepList";
import { StrikeReplace } from "./StrikeReplace";
import { Terminal } from "./Terminal";

// The scene catalogue (style guide section 2). "Custom" is resolved separately.
export const scenes: Record<Exclude<SceneName, "Custom">, React.FC> = {
  HookStatus,
  Terminal,
  CodeWalk,
  FlowDiagram,
  StrikeReplace,
  StatusCard,
  StepList,
  Lesson,
  Screenshot,
};
