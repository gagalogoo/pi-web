import type { AgentMessage, AssistantContentBlock, AssistantMessage } from "./types";

function isWriteToolName(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name === "write" || name.startsWith("write_") || name.endsWith(".write") || name.endsWith("_write");
}

function isEditToolName(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name === "edit" || name.startsWith("edit_") || name.endsWith(".edit") || name.endsWith("_edit") || name.includes("str_replace") || name.includes("replace_editor");
}

const COMMAND_TOOLS = new Set(["bash", "powershell", "pwsh"]);
const SEARCH_TOOLS = new Set(["grep", "find", "ls", "web_search", "web_fetch"]);

export type ToolGroupKey = "read" | "write" | "edit" | "command" | "search" | "tool";

// ponytail: inlined empty-thinking filter so node --test can load this file. Same rule as isEmptyThinkingBlock.
function displayableBlocks(message: AssistantMessage): AssistantContentBlock[] {
  return (message.content ?? []).filter((block) =>
    !(block.type === "thinking" && !block.deferred && block.thinking.trim() === ""),
  );
}

export function isCommandToolName(name: string): boolean {
  return COMMAND_TOOLS.has(name.trim().toLowerCase());
}

/** Token count from a compress receipt. Null when the receipt has no number yet. */
export function compressSavedTokens(text: string): number | null {
  const match = text.match(/~?([\d,]+)\s+tokens saved/i);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function toolGroupKey(toolName: string): ToolGroupKey {
  const name = toolName.trim().toLowerCase();
  if (name === "read") return "read";
  if (isWriteToolName(name)) return "write";
  if (isEditToolName(name)) return "edit";
  if (isCommandToolName(name)) return "command";
  if (SEARCH_TOOLS.has(name)) return "search";
  return "tool";
}

type Piece =
  | { type: "thinking"; index: number }
  | { type: "text"; index: number }
  | { type: "compress"; index: number; toolCallId: string }
  | { type: "tools"; index: number; key: ToolGroupKey; calls: number };

export type CommandRenderStep =
  | { type: "message"; index: number }
  | { type: "thinking"; index: number }
  | { type: "text"; index: number }
  | { type: "compress"; index: number; toolCallId: string }
  | { type: "tools"; key: ToolGroupKey; indices: number[]; count: number };

function piecesFor(message: AgentMessage, index: number): Piece[] | null {
  if (message.role !== "assistant") return null;
  const blocks = displayableBlocks(message as AssistantMessage);
  const pieces: Piece[] = [];
  let runKey: ToolGroupKey | null = null;
  let runCalls = 0;
  let sawThinking = false;
  let sawText = false;
  const flushRun = () => {
    if (!runKey) return;
    pieces.push({ type: "tools", index, key: runKey, calls: runCalls });
    runKey = null;
    runCalls = 0;
  };
  for (const block of blocks) {
    if (block.type === "thinking") {
      if (!sawThinking) {
        flushRun();
        pieces.push({ type: "thinking", index });
        sawThinking = true;
      }
      continue;
    }
    if (block.type === "toolCall") {
      if (block.toolName.trim().toLowerCase() === "compress") {
        flushRun();
        pieces.push({ type: "compress", index, toolCallId: block.toolCallId });
        continue;
      }
      const key = toolGroupKey(block.toolName);
      if (runKey && runKey !== key) flushRun();
      runKey = key;
      runCalls += 1;
      continue;
    }
    if (block.type === "text" && block.text.trim()) {
      if (!sawText) {
        flushRun();
        pieces.push({ type: "text", index });
        sawText = true;
      }
    }
  }
  flushRun();
  return pieces.some((piece) => piece.type === "tools" || piece.type === "thinking" || piece.type === "compress") ? pieces : null;
}

export function planCommandRuns(
  messages: readonly AgentMessage[],
  start: number,
  end: number,
  resolve: (index: number) => AgentMessage = (index) => messages[index],
): CommandRenderStep[] {
  const out: CommandRenderStep[] = [];
  let indices: number[] | null = null;
  let count = 0;
  let key: ToolGroupKey | null = null;
  const flush = () => {
    if (!indices || !key) return;
    out.push({ type: "tools", key, indices, count });
    indices = null;
    count = 0;
    key = null;
  };

  for (let index = start; index < end; index++) {
    const message = resolve(index);
    // toolResult rows render inside the tool card, so they must not split a run.
    if (message.role === "toolResult") continue;
    const parsed = piecesFor(message, index);
    if (!parsed) {
      flush();
      out.push({ type: "message", index });
      continue;
    }
    for (const piece of parsed) {
      if (piece.type === "tools") {
        if (key && key !== piece.key) flush();
        key = piece.key;
        indices ??= [];
        if (indices[indices.length - 1] !== piece.index) indices.push(piece.index);
        count += piece.calls;
      } else {
        flush();
        out.push(piece);
      }
    }
  }
  flush();
  return out;
}

export type ToolTreeStep = Extract<CommandRenderStep, { type: "thinking" | "text" | "tools" }>;

export type ToolTreePlan =
  | { type: "message"; index: number }
  | { type: "text"; index: number }
  | { type: "compress"; index: number; toolCallId: string }
  | { type: "tree"; steps: ToolTreeStep[] };

/** One pig-style tree for a contiguous thinking/tool run, across categories. */
export function planToolTrees(
  messages: readonly AgentMessage[],
  start: number,
  end: number,
  resolve: (index: number) => AgentMessage = (index) => messages[index],
): ToolTreePlan[] {
  const out: ToolTreePlan[] = [];
  let steps: ToolTreeStep[] = [];
  const flush = () => {
    if (steps.length === 0) return;
    out.push({ type: "tree", steps });
    steps = [];
  };
  for (const step of planCommandRuns(messages, start, end, resolve)) {
    if (step.type === "message") {
      flush();
      out.push(step);
    } else if (step.type === "text" || step.type === "compress") {
      // Prose and compression stay in the flow. A collapsed round hides when
      // context was compressed.
      flush();
      out.push(step.type === "text" ? { type: "text", index: step.index } : step);
    } else {
      steps.push(step);
    }
  }
  flush();
  return out;
}

/** Split a tree's flat steps into rounds: each `thinking`/`text` step starts a
 * new round and absorbs the tool steps that follow it. A leading tools-only
 * run becomes its own round. */
export function groupTreeRounds(steps: readonly ToolTreeStep[]): ToolTreeStep[][] {
  const rounds: ToolTreeStep[][] = [];
  let current: ToolTreeStep[] = [];
  for (const step of steps) {
    if ((step.type === "thinking" || step.type === "text") && current.length > 0) {
      rounds.push(current);
      current = [];
    }
    current.push(step);
  }
  if (current.length > 0) rounds.push(current);
  return rounds;
}

export function groupBlocks(message: AssistantMessage, key: ToolGroupKey): AssistantContentBlock[] {
  return displayableBlocks(message).filter(
    (block) => block.type === "toolCall" && toolGroupKey(block.toolName) === key,
  );
}

export function thinkingBlocks(message: AssistantMessage): AssistantContentBlock[] {
  return displayableBlocks(message).filter((block) => block.type === "thinking");
}

export function textBlocks(message: AssistantMessage): AssistantContentBlock[] {
  return displayableBlocks(message).filter((block) => block.type === "text" && block.text.trim() !== "");
}

export function toolGroupRunning(
  messages: readonly AgentMessage[],
  indices: readonly number[],
  toolResults: ReadonlyMap<string, unknown>,
  key: ToolGroupKey,
  resolve: (index: number) => AgentMessage = (index) => messages[index],
): boolean {
  for (const index of indices) {
    const message = resolve(index);
    if (message.role !== "assistant") continue;
    for (const block of groupBlocks(message as AssistantMessage, key)) {
      if (block.type === "toolCall" && !toolResults.has(block.toolCallId)) return true;
    }
  }
  return false;
}
