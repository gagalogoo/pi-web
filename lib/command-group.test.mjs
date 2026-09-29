import assert from "node:assert/strict";
import test from "node:test";

async function loadSubject() {
  return import("./command-group.ts");
}

function assistant(content) {
  return { role: "assistant", provider: "test", model: "test-model", content };
}

const bash = (id) => ({ type: "toolCall", toolCallId: id, toolName: "bash", input: { command: id } });
const read = (id) => ({ type: "toolCall", toolCallId: id, toolName: "read", input: { path: id } });
const think = (text) => ({ type: "thinking", thinking: text });

test("splits a tree into one round per thinking step", async () => {
  const { groupTreeRounds } = await loadSubject();
  assert.deepEqual(groupTreeRounds([
    { type: "thinking", index: 0 },
    { type: "tools", key: "read", indices: [0], count: 1 },
    { type: "thinking", index: 1 },
    { type: "tools", key: "command", indices: [1], count: 2 },
  ]), [
    [
      { type: "thinking", index: 0 },
      { type: "tools", key: "read", indices: [0], count: 1 },
    ],
    [
      { type: "thinking", index: 1 },
      { type: "tools", key: "command", indices: [1], count: 2 },
    ],
  ]);
});

test("groups consecutive command calls and skips tool results between them", async () => {
  const { planCommandRuns } = await loadSubject();
  const messages = [
    { role: "user", content: "go" },
    assistant([bash("a")]),
    { role: "toolResult", toolCallId: "a" },
    assistant([think("next"), bash("b")]),
    { role: "toolResult", toolCallId: "b" },
    assistant([bash("c"), bash("d")]),
  ];
  assert.deepEqual(planCommandRuns(messages, 0, messages.length), [
    { type: "message", index: 0 },
    { type: "tools", key: "command", indices: [1], count: 1 },
    { type: "thinking", index: 3 },
    { type: "tools", key: "command", indices: [3, 5], count: 3 },
  ]);
});

test("keeps a single command as a tools step beside its thinking", async () => {
  const { planCommandRuns, planToolTrees } = await loadSubject();
  const messages = [
    assistant([think("only"), bash("a")]),
    { role: "toolResult", toolCallId: "a" },
    assistant([{ type: "text", text: "done" }]),
  ];
  assert.deepEqual(planCommandRuns(messages, 0, messages.length), [
    { type: "thinking", index: 0 },
    { type: "tools", key: "command", indices: [0], count: 1 },
    { type: "message", index: 2 },
  ]);
  assert.deepEqual(planToolTrees(messages, 0, messages.length), [
    {
      type: "tree",
      steps: [
        { type: "thinking", index: 0 },
        { type: "tools", key: "command", indices: [0], count: 1 },
      ],
    },
    { type: "message", index: 2 },
  ]);
});

test("splits categories in the planner and joins them into one tree", async () => {
  const { planCommandRuns, toolGroupRunning } = await loadSubject();
  const messages = [
    assistant([bash("a")]),
    { role: "toolResult", toolCallId: "a" },
    assistant([read("file")]),
    assistant([bash("b")]),
    assistant([{ type: "toolCall", toolCallId: "c", toolName: "PowerShell", input: {} }]),
  ];
  assert.deepEqual(planCommandRuns(messages, 0, messages.length), [
    { type: "tools", key: "command", indices: [0], count: 1 },
    { type: "tools", key: "read", indices: [2], count: 1 },
    { type: "tools", key: "command", indices: [3, 4], count: 2 },
  ]);
  const { planToolTrees } = await loadSubject();
  assert.deepEqual(planToolTrees(messages, 0, messages.length), [
    {
      type: "tree",
      steps: [
        { type: "tools", key: "command", indices: [0], count: 1 },
        { type: "tools", key: "read", indices: [2], count: 1 },
        { type: "tools", key: "command", indices: [3, 4], count: 2 },
      ],
    },
  ]);
  assert.equal(toolGroupRunning(messages, [3, 4], new Map([["b", {}]]), "command"), true);
  assert.equal(toolGroupRunning(messages, [3, 4], new Map([["b", {}], ["c", {}]]), "command"), false);
});

const tool = (id, name) => ({ type: "toolCall", toolCallId: id, toolName: name, input: {} });

test("groups consecutive tools by pig's category and splits when the category changes", async () => {
  const { planCommandRuns } = await loadSubject();
  const messages = [
    assistant([read("a")]),
    assistant([read("b")]),
    assistant([tool("e1", "edit")]),
    assistant([tool("e2", "str_replace")]),
    assistant([tool("g", "grep")]),
    assistant([tool("l", "ls")]),
    assistant([tool("w", "web_search")]),
    assistant([tool("f", "fetch")]),
    assistant([read("c"), bash("d")]),
  ];
  assert.deepEqual(planCommandRuns(messages, 0, messages.length), [
    { type: "tools", key: "read", indices: [0, 1], count: 2 },
    { type: "tools", key: "edit", indices: [2, 3], count: 2 },
    { type: "tools", key: "search", indices: [4, 5], count: 2 },
    { type: "tools", key: "tool", indices: [6, 7], count: 2 },
    { type: "tools", key: "read", indices: [8], count: 1 },
    { type: "tools", key: "command", indices: [8], count: 1 },
  ]);
});

test("keeps narration and mixed tools from one message in one tree", async () => {
  const { planToolTrees } = await loadSubject();
  const messages = [
    assistant([
      think("look"),
      { type: "text", text: "checking" },
      bash("a"),
      read("file"),
    ]),
    { role: "toolResult", toolCallId: "a" },
    assistant([{ type: "text", text: "done" }]),
  ];
  assert.deepEqual(planToolTrees(messages, 0, messages.length), [
    {
      type: "tree",
      steps: [
        { type: "thinking", index: 0 },
        { type: "text", index: 0 },
        { type: "tools", key: "command", indices: [0], count: 1 },
        { type: "tools", key: "read", indices: [0], count: 1 },
      ],
    },
    { type: "message", index: 2 },
  ]);
});
