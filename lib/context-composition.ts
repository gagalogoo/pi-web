import type { AgentMessage } from "./types";

export type ContextPartId = "system" | "tools" | "toolUse" | "summary" | "conversation";

export interface ContextPart {
  id: ContextPartId;
  tokens: number;
}

export interface ContextComposition {
  parts: ContextPart[];
  totalTokens: number | null;
  contextWindow: number;
  percent: number | null;
}

export interface ContextToolLike {
  name: string;
  description?: string;
  parameters?: unknown;
  promptGuidelines?: string[];
  active?: boolean;
}

const PARTS: ContextPartId[] = ["system", "tools", "toolUse", "summary", "conversation"];

function textChars(content: string | Array<{ type: string; text?: string }> | undefined | null): number {
  if (!content) return 0;
  if (typeof content === "string") return content.length;
  let size = 0;
  for (const block of content) {
    if (block.type === "text" && block.text) size += block.text.length;
  }
  return size;
}

function toolChars(tool: ContextToolLike): number {
  if (tool.active === false) return 0;
  let size = tool.name.length + (tool.description?.length ?? 0);
  if (tool.parameters != null) {
    try {
      size += JSON.stringify(tool.parameters).length;
    } catch {
      // A cyclic schema is not worth failing the panel over.
    }
  }
  if (tool.promptGuidelines) size += tool.promptGuidelines.join("\n").length;
  return size;
}

function measureMessages(messages: AgentMessage[]): {
  toolUse: number;
  summary: number;
  conversation: number;
  sawCompaction: boolean;
} {
  let cut = -1;
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.role === "custom" && message.customType === "compaction") cut = i;
  }
  const cutMessage = cut >= 0 ? messages[cut] : undefined;
  const summary = cutMessage?.role === "custom" ? textChars(cutMessage.content) : 0;
  let toolUse = 0;
  let conversation = 0;
  for (const message of cut >= 0 ? messages.slice(cut + 1) : messages) {
    if (message.role === "user") {
      conversation += textChars(message.content);
    } else if (message.role === "assistant") {
      for (const block of message.content) {
        if (block.type === "text") conversation += block.text.length;
        else if (block.type === "thinking") conversation += block.thinking.length;
        else if (block.type === "toolCall") {
          const args = block.rawInput ?? JSON.stringify(block.input ?? {});
          toolUse += block.toolName.length + args.length;
        }
      }
    } else if (message.role === "toolResult") {
      toolUse += textChars(message.content);
    } else if (message.role === "bashExecution") {
      if (!message.excludeFromContext) toolUse += message.command.length + message.output.length;
    } else if (message.role === "custom") {
      conversation += textChars(message.content);
    }
  }
  return { toolUse, summary, conversation, sawCompaction: cut >= 0 };
}

function scaleWeights(weights: number[], total: number): number[] {
  const sum = weights.reduce((left, right) => left + right, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (total * weight) / sum);
  const floors = raw.map((value) => Math.floor(value));
  let left = total - floors.reduce((sumLeft, value) => sumLeft + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - floors[index] }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (const item of order) {
    if (left <= 0) break;
    floors[item.index] += 1;
    left -= 1;
  }
  return floors;
}

function partsFrom(tokens: number[]): ContextPart[] {
  return PARTS.flatMap((id, index) => (tokens[index] > 0 ? [{ id, tokens: tokens[index] }] : []));
}

function percentOf(total: number | null, contextWindow: number, given: number | null): number | null {
  if (typeof given === "number") return given;
  if (total == null || contextWindow <= 0) return null;
  return Math.round((total / contextWindow) * 100);
}

/**
 * Estimate the current model context as character buckets, then fit them to the
 * real token total when we can see the whole context.
 *
 * ponytail: chars/4 for the system prompt and tool definitions when the loaded
 * tail has no compaction. A SDK per-part token split replaces this.
 */
export function estimateContextComposition(input: {
  systemPrompt?: string | null;
  tools?: ContextToolLike[] | null;
  messages: AgentMessage[];
  contextTokens?: number | null;
  contextWindow?: number;
  percent?: number | null;
  truncated?: boolean;
}): ContextComposition {
  const systemChars = input.systemPrompt?.length ?? 0;
  const toolsChars = (input.tools ?? []).reduce((sum, tool) => sum + toolChars(tool), 0);
  const measured = measureMessages(input.messages);
  const weights = [systemChars, toolsChars, measured.toolUse, measured.summary, measured.conversation];
  const contextWindow = input.contextWindow ?? 0;
  const contextTokens = typeof input.contextTokens === "number" && Number.isFinite(input.contextTokens)
    ? Math.max(0, Math.round(input.contextTokens))
    : null;
  const complete = measured.sawCompaction || !input.truncated;

  let tokens: number[];
  if (contextTokens != null && complete) {
    tokens = scaleWeights(weights, contextTokens);
  } else if (contextTokens != null) {
    const systemTokens = Math.round(systemChars / 4);
    const toolTokens = Math.round(toolsChars / 4);
    const fixed = systemTokens + toolTokens;
    if (fixed >= contextTokens) {
      tokens = scaleWeights(weights, contextTokens);
    } else {
      const rest = contextTokens - fixed;
      const messageWeights = [measured.toolUse, measured.summary, measured.conversation];
      const scaled = messageWeights.some((weight) => weight > 0)
        ? scaleWeights(messageWeights, rest)
        : [0, 0, rest];
      tokens = [systemTokens, toolTokens, scaled[0], scaled[1], scaled[2]];
    }
  } else {
    tokens = weights.map((weight) => Math.round(weight / 4));
  }

  const totalTokens = contextTokens ?? tokens.reduce((sum, value) => sum + value, 0);
  return {
    parts: partsFrom(tokens),
    totalTokens,
    contextWindow,
    percent: percentOf(totalTokens, contextWindow, input.percent ?? null),
  };
}

export function formatContextTokens(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  if (rounded >= 1_000_000) return `${(rounded / 1_000_000).toFixed(1)}M`;
  if (rounded >= 1000) return `${(rounded / 1000).toFixed(1)}K`;
  return String(rounded);
}
