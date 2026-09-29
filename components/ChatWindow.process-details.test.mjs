import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ChatWindow.tsx", import.meta.url), "utf8");

test("expands process details for the latest turn and turns without a final answer", () => {
  assert.match(source, /const \[expanded, setExpanded\] = useState\(defaultExpanded\)/);
  assert.match(
    source,
    /<ProcessDetailsGroup[\s\S]*?defaultExpanded=\{!finalAnswerMessage \|\| userIdx === lastAnchorIdx\}/,
  );
});

test("expands the latest turn's last thought round inside a multi-round tree", () => {
  assert.match(source, /defaultExpanded=\{latestTurn && roundIndex === rounds\.length - 1\}/);
  assert.match(source, /renderTree\(plan\.steps, resolveProcess, "process", false, userIdx === lastAnchorIdx\)/);
});
