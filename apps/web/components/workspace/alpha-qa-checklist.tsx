"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "internal-alpha-qa-checklist-v1";

type QaItem = { id: string; label: string };

type QaSection = { id: string; title: string; items: QaItem[] };

/** Mirrors `docs/internal-alpha-qa-checklist.md` — use as pass/fail gate. */
export const QA_SECTIONS: QaSection[] = [
  {
    id: "workspace",
    title: "1 · Workspace & project",
    items: [
      {
        id: "w1",
        label: "/workspace loads signed in; no console errors",
      },
      {
        id: "w2",
        label: "Projects dropdown accurate (or clear empty state)",
      },
      {
        id: "w3",
        label: "New project: org + name → appears & selects",
      },
      {
        id: "w4",
        label: "No orgs: message explains sync; no crash",
      },
    ],
  },
  {
    id: "ingest",
    title: "2 · Document ingest",
    items: [
      {
        id: "i1",
        label: "Upload PDF/DOCX/md/txt; success + row appears",
      },
      {
        id: "i2",
        label: "Status: uploading → queued → parsing → parsed (poll)",
      },
      {
        id: "i3",
        label: "Pipeline strip: Document / Req AI / Test AI sensible",
      },
      {
        id: "i4",
        label: "Storage/upload errors are readable",
      },
    ],
  },
  {
    id: "ai",
    title: "3 · AI jobs",
    items: [
      {
        id: "a1",
        label: "Requirements job completes or failed + error visible",
      },
      {
        id: "a2",
        label: "Test-case job follows requirements (or fails visibly)",
      },
      {
        id: "a3",
        label: "Document parse failed shows on row + pipeline",
      },
    ],
  },
  {
    id: "req",
    title: "4 · Requirements",
    items: [
      {
        id: "r1",
        label: "List fills; empty state matches job/doc state",
      },
      { id: "r2", label: "Select: detail title/description/ordinal/status" },
      { id: "r3", label: "active vs deprecated chips distinct" },
    ],
  },
  {
    id: "tc",
    title: "5 · Test cases & traceability",
    items: [
      {
        id: "t1",
        label: "List fills after test AI; empty state while running OK",
      },
      { id: "t2", label: "Traceability line shows linked requirements" },
      { id: "t3", label: "Save edit persists (poll or refresh)" },
      { id: "t4", label: "Cannot save empty step action/expected" },
    ],
  },
  {
    id: "res",
    title: "6 · Resilience",
    items: [
      { id: "x1", label: "Switch project clears doc; data matches" },
      { id: "x2", label: "Full page reload restores project + data" },
      {
        id: "x3",
        label: "Worker down: jobs pending/running; UI stays usable",
      },
    ],
  },
];

const ALL_IDS = QA_SECTIONS.flatMap((s) => s.items.map((i) => i.id));

function loadState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    for (const id of ALL_IDS) {
      out[id] = Boolean(p[id]);
    }
    return out;
  } catch {
    return {};
  }
}

function saveState(s: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function AlphaQaChecklist() {
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setChecks(loadState());
  }, []);

  const total = ALL_IDS.length;
  const passed = useMemo(
    () => ALL_IDS.filter((id) => checks[id]).length,
    [checks],
  );
  const complete = passed === total;

  const toggle = useCallback((id: string) => {
    setChecks((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveState(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    const empty: Record<string, boolean> = {};
    for (const id of ALL_IDS) empty[id] = false;
    setChecks(empty);
    saveState(empty);
  }, []);

  return (
    <div className={`ws-qa ${complete ? "ws-qa-complete" : ""}`}>
      <button
        type="button"
        className="ws-qa-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="ws-qa-toggle-label">Alpha QA gate</span>
        <span className="ws-qa-count">
          {passed}/{total} pass
          {complete ? " ✓" : ""}
        </span>
      </button>
      {!complete ? (
        <p className="ws-qa-hint" role="status">
          Demo-ready when all items are checked (this browser only).
        </p>
      ) : null}
      {open ? (
        <div className="ws-qa-panel">
          {QA_SECTIONS.map((sec) => (
            <div key={sec.id} className="ws-qa-section">
              <div className="ws-qa-section-title">{sec.title}</div>
              <ul className="ws-qa-list">
                {sec.items.map((item) => (
                  <li key={item.id}>
                    <label className="ws-qa-item">
                      <input
                        type="checkbox"
                        checked={Boolean(checks[item.id])}
                        onChange={() => toggle(item.id)}
                      />
                      <span>{item.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <button type="button" className="ws-btn ws-btn-ghost ws-qa-reset" onClick={resetAll}>
            Reset checklist
          </button>
        </div>
      ) : null}
    </div>
  );
}
