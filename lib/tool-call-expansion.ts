/**
 * Remembers which tool-call cards the user has expanded, keyed by toolCallId.
 *
 * A streaming assistant message is rendered from `streamState`, then re-rendered
 * from `messages` after `message_end`, and re-keyed again once `entryIds` arrive
 * from the session file. Each of those hops remounts `ToolCallBlock`, so plain
 * component state would collapse a card the user just opened. Keeping the set
 * outside React lets the remounted card start expanded without threading state
 * through every message component.
 */
const expansionChoice = new Map<string, boolean>();

export function isToolCallExpanded(toolCallId: string | undefined): boolean {
  return toolCallId !== undefined && expansionChoice.get(toolCallId) === true;
}

export function hasToolCallExpansionChoice(toolCallId: string | undefined): boolean {
  return toolCallId !== undefined && expansionChoice.has(toolCallId);
}

export function setToolCallExpanded(toolCallId: string | undefined, expanded: boolean): void {
  if (!toolCallId) return;
  expansionChoice.set(toolCallId, expanded);
}

export function clearExpandedToolCalls(): void {
  expansionChoice.clear();
}
