import type { SessionInfo } from "./types";

export interface SessionFamily {
  root: SessionInfo;
  subagents: SessionInfo[];
  latestModified: string;
}

export interface SessionFamilyRow {
  session: SessionInfo;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
}

function resolveFamilyRoots(sessions: readonly SessionInfo[]): Map<string, string | null> {
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const roots = new Map<string, string | null>();

  for (const session of sessions) {
    if (roots.has(session.id)) continue;

    const path: string[] = [];
    const visited = new Set<string>();
    let currentId = session.id;
    let rootId: string | null = null;

    while (true) {
      if (roots.has(currentId)) {
        rootId = roots.get(currentId) ?? null;
        break;
      }
      if (visited.has(currentId)) break;

      visited.add(currentId);
      path.push(currentId);
      const current = byId.get(currentId);
      if (!current) break;
      if (current.relation?.kind !== "subagent") {
        rootId = current.id;
        break;
      }
      currentId = current.relation.parentSessionId;
    }

    for (const id of path) roots.set(id, rootId);
  }

  return roots;
}

/** Groups visible main/fork sessions with every persisted subagent descendant. */
export function listSessionFamilies(sessions: readonly SessionInfo[]): SessionFamily[] {
  const rootsBySessionId = resolveFamilyRoots(sessions);
  const families = new Map<string, SessionFamily>();

  for (const session of sessions) {
    if (session.relation?.kind === "subagent") continue;
    families.set(session.id, {
      root: session,
      subagents: [],
      latestModified: session.modified,
    });
  }

  for (const session of sessions) {
    if (session.relation?.kind !== "subagent") continue;
    const rootId = rootsBySessionId.get(session.id);
    const family = rootId ? families.get(rootId) : undefined;
    if (!family) continue;
    family.subagents.push(session);
    if (session.modified > family.latestModified) family.latestModified = session.modified;
  }

  return [...families.values()].sort((a, b) => b.latestModified.localeCompare(a.latestModified));
}

export function getSessionFamily(
  sessions: readonly SessionInfo[],
  sessionId: string | null | undefined,
): SessionFamily | null {
  if (!sessionId) return null;
  return listSessionFamilies(sessions).find((family) => (
    family.root.id === sessionId
    || family.subagents.some((session) => session.id === sessionId)
  )) ?? null;
}

/**
 * Flatten families into sidebar rows: the root first, then its subagent
 * descendants indented under their parents, newest first. A collapsed parent
 * hides every descendant so the list keeps a real parent/child layering.
 */
export function flattenSessionFamilies(
  families: readonly SessionFamily[],
  collapsedIds: ReadonlySet<string> = new Set(),
): SessionFamilyRow[] {
  const childrenByParent = new Map<string, SessionInfo[]>();
  for (const family of families) {
    for (const subagent of family.subagents) {
      const parentId = subagent.relation?.kind === "subagent" ? subagent.relation.parentSessionId : null;
      if (!parentId) continue;
      const list = childrenByParent.get(parentId);
      if (list) list.push(subagent);
      else childrenByParent.set(parentId, [subagent]);
    }
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => b.modified.localeCompare(a.modified));
  }

  const rows: SessionFamilyRow[] = [];
  const visited = new Set<string>();
  const push = (session: SessionInfo, depth: number): void => {
    if (visited.has(session.id)) return;
    visited.add(session.id);
    const children = childrenByParent.get(session.id) ?? [];
    rows.push({ session, depth, hasChildren: children.length > 0, collapsed: collapsedIds.has(session.id) });
    if (collapsedIds.has(session.id)) return;
    for (const child of children) push(child, depth + 1);
  };
  for (const family of families) push(family.root, 0);
  return rows;
}
