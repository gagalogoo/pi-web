import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatInput.tsx", import.meta.url), "utf8");
const session = await readFile(new URL("../hooks/useAgentSession.ts", import.meta.url), "utf8");
const thinkingControl = source.slice(
  source.indexOf("{onThinkingLevelChange && ("),
  source.indexOf("{!isStreaming && onToolPresetChange"),
);

test("keeps one thinking control and leaves it usable while the session is busy", () => {
  assert.doesNotMatch(source, /isStreaming && onThinkingLevelChange/);
  assert.doesNotMatch(thinkingControl, /disabled=\{isStreaming\}/);
  assert.doesNotMatch(thinkingControl, /onClick=\{\(\) => !isStreaming && setThinkingDropdownOpen/);
  assert.match(thinkingControl, /aria-keyshortcuts="Shift\+Tab"/);
  assert.match(thinkingControl, /t\("chat\.changeReasoning", \{ level: thinkingDisplayLabel \}\)/);
  assert.match(source, /e\.key !== "Tab" || !e\.shiftKey || e\.altKey || e\.ctrlKey || e\.metaKey/);
  assert.match(source, /window\.addEventListener\("keydown", onKey, true\)/);
  assert.match(source, /field !== textareaRef\.current/);
  assert.match(source, /selectableThinkingLevels\(availableThinkingLevels\)/);
  assert.match(source, /onThinkingLevelChange\(next\)/);
  assert.match(source, /high: "#d946ef"/);
  assert.match(source, /level === "xhigh"/);
  assert.match(source, /linear-gradient\(120deg, #f43f5e, #f59e0b, #22c55e, #06b6d4, #8b5cf6\)/);
  assert.match(source, /thinkingFrameStyle\(isAutoThinkingSelection \? null : resolvedThinkingLevel\)/);
});

test("shows the resolved level and treats auto as an uncommitted default", () => {
  assert.match(source, /resolvedThinkingLevel = thinkingLevel && thinkingLevel !== "auto"/);
  assert.match(source, /isAutoThinkingSelection/);
  assert.match(thinkingControl, /lvl === "auto"\s*\n\s*\? isAutoThinkingSelection/);
  assert.match(thinkingControl, /if \(!isActive \|\| isAutoThinkingSelection\) onThinkingLevelChange\(lvl\)/);
});

test("session hook layers thinking like the model selector", () => {
  assert.match(session, /displayThinkingLevel = isNew/);
  assert.match(session, /newSessionThinkingLevel \?\? newSessionDefaultThinkingLevel/);
  assert.match(session, /isAutoThinkingSelection: isNew && newSessionThinkingLevel === null/);
  assert.match(session, /if \(state\?\.thinkingLevel !== undefined\) \{\s*setLiveThinkingLevel\(asConcreteThinkingLevel\(state\.thinkingLevel\)\);/);
  const start = session.slice(session.indexOf('case "agent_start":'), session.indexOf('case "agent_end":'));
  assert.doesNotMatch(start, /fetch\(`\/api\/agent\/\$\{encodeURIComponent\(sid\)\}`\)/);
  assert.match(session, /if \(level === "auto"\) \{/);
});
