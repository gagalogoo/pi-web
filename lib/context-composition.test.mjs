import assert from "node:assert/strict";
import test from "node:test";

import { estimateContextComposition, formatContextTokens } from "./context-composition.ts";

test("keeps only the latest compaction and what follows it", () => {
  const composition = estimateContextComposition({
    messages: [
      { role: "user", content: "old history that must drop" },
      { role: "custom", customType: "compaction", content: "SUM", display: true },
      { role: "user", content: "NEW" },
    ],
    contextTokens: 10,
  });
  const summary = composition.parts.find((part) => part.id === "summary");
  const conversation = composition.parts.find((part) => part.id === "conversation");
  assert.equal(summary.tokens + conversation.tokens, 10);
  assert.equal(conversation.tokens > summary.tokens, false);
  assert.equal(composition.parts.reduce((sum, part) => sum + part.tokens, 0), 10);
});

test("splits tool content from conversation and scales to the real total", () => {
  const composition = estimateContextComposition({
    systemPrompt: "sys",
    tools: [{ name: "read", description: "desc", parameters: { type: "object" }, active: true }],
    messages: [
      {
        role: "assistant",
        model: "m",
        provider: "p",
        content: [
          { type: "thinking", thinking: "hmm" },
          { type: "text", text: "hi" },
          { type: "toolCall", toolCallId: "1", toolName: "read", input: { path: "a" } },
          { type: "image", source: { type: "base64", data: "x".repeat(500) } },
        ],
      },
      { role: "toolResult", toolCallId: "1", content: [{ type: "text", text: "file" }, { type: "image", source: { type: "base64", data: "y".repeat(500) } }] },
      { role: "bashExecution", command: "ls", output: "ok", excludeFromContext: true },
      { role: "bashExecution", command: "pwd", output: "here", excludeFromContext: false },
    ],
    contextTokens: 100,
    contextWindow: 200,
    percent: 50,
  });
  assert.equal(composition.parts.reduce((sum, part) => sum + part.tokens, 0), 100);
  assert.ok(composition.parts.find((part) => part.id === "toolUse").tokens > 0);
  assert.ok(composition.parts.find((part) => part.id === "conversation").tokens > 0);
  assert.equal(composition.percent, 50);
  const inactive = estimateContextComposition({
    tools: [{ name: "hidden", description: "x".repeat(400), active: false }],
    messages: [{ role: "user", content: "hi" }],
  });
  assert.equal(inactive.parts.some((part) => part.id === "tools"), false);
});

test("does not inflate the system prompt when the tail is truncated", () => {
  const composition = estimateContextComposition({
    systemPrompt: "s".repeat(400),
    messages: [{ role: "user", content: "hi" }],
    contextTokens: 10_000,
    truncated: true,
  });
  assert.equal(composition.parts.find((part) => part.id === "system").tokens, 100);
  assert.equal(composition.parts.find((part) => part.id === "conversation").tokens, 9900);
});

test("formats token counts like the context panel", () => {
  assert.equal(formatContextTokens(999), "999");
  assert.equal(formatContextTokens(1000), "1.0K");
  assert.equal(formatContextTokens(10700), "10.7K");
});
