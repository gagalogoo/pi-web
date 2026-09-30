"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { formatContextTokens, type ContextComposition, type ContextPartId } from "@/lib/context-composition";

const COLORS: Record<ContextPartId, string> = {
  system: "#9aa0a6",
  tools: "#6d8cff",
  toolUse: "#c084fc",
  summary: "#f07178",
  conversation: "#e8a598",
};

const LABEL_KEYS: Record<ContextPartId, string> = {
  system: "chat.contextSystem",
  tools: "chat.contextTools",
  toolUse: "chat.contextToolUse",
  summary: "chat.contextSummary",
  conversation: "chat.contextConversation",
};

export function ContextUsageRing({
  composition,
  onOpen,
}: {
  composition: ContextComposition;
  onOpen?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const percent = composition.percent;
  const shown = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  const radius = 6;
  const circumference = 2 * Math.PI * radius;
  const dash = (shown / 100) * circumference;
  const barTotal = composition.parts.reduce((sum, part) => sum + part.tokens, 0);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tokenLine = composition.totalTokens == null
    ? ""
    : composition.contextWindow > 0
      ? `~${formatContextTokens(composition.totalTokens)} / ${formatContextTokens(composition.contextWindow)}`
      : `~${formatContextTokens(composition.totalTokens)}`;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={t("chat.contextOpen")}
        title={percent == null ? t("chat.contextOpen") : `${t("chat.contextOpen")} · ${Math.round(shown)}%`}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) onOpen?.();
        }}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          padding: 0,
          background: open ? "var(--bg-hover)" : "none",
          border: "none",
          borderRadius: 9,
          color: "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r={radius} fill="none" stroke="var(--border)" strokeWidth="2" />
          <circle
            cx="8"
            cy="8"
            r={radius}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeLinecap="round"
            transform="rotate(-90 8 8)"
          />
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          right: 0,
          zIndex: 100,
          width: "min(300px, calc(100vw - 24px))",
          padding: "12px 12px 10px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          boxShadow: "0 -4px 16px rgba(0,0,0,0.12)",
        }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>{t("chat.contextUsage")}</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: "var(--text)" }}>
              {percent == null ? "" : t("chat.contextFull", { percent: Math.round(shown) })}
            </span>
            {tokenLine && <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{tokenLine}</span>}
          </div>
          {barTotal > 0 && (
            <div style={{ display: "flex", height: 8, borderRadius: 99, overflow: "hidden", background: "var(--bg-hover)", marginBottom: 10 }}>
              {composition.parts.map((part) => (
                <div key={part.id} style={{ width: `${(part.tokens / barTotal) * 100}%`, background: COLORS[part.id] }} />
              ))}
            </div>
          )}
          {composition.parts.length === 0 ? (
            composition.totalTokens ? null : <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("chat.contextEmpty")}</div>
          ) : composition.parts.map((part) => (
            <div key={part.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 0" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[part.id], flexShrink: 0 }} />
              <span style={{ flex: 1, color: "var(--text)" }}>{t(LABEL_KEYS[part.id])}</span>
              <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{formatContextTokens(part.tokens)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
