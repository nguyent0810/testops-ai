"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlphaQaChecklist } from "@/components/workspace/alpha-qa-checklist";

type ProjectRow = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
};

type OrgRow = { id: string; name: string; slug: string };

type DocumentRow = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type AiJobRow = {
  id: string;
  jobKind: string;
  requirementsJobId: string | null;
  status: string;
  progressPhase: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type RequirementRow = {
  id: string;
  ordinal: number;
  title: string;
  description: string;
  status: string;
};

type TestCaseRow = {
  id: string;
  ordinal: number;
  title: string;
  precondition: string;
  steps: { order: number; action: string; expected: string }[];
  expectedResult: string;
  priority: string;
  status: string;
};

type TraceRow = { requirementId: string; testCaseId: string };

async function apiJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const hasBody = init?.body !== undefined && init?.body !== null;
  let r: Response;
  try {
    r = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers as Record<string, string>),
      },
    });
  } catch {
    return {
      ok: false,
      status: 0,
      message: "Network error. Check your connection and try again.",
    };
  }

  const raw = await r.text();
  let data: Record<string, unknown> = {};
  if (raw.trim().length > 0) {
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      if (!r.ok) {
        return {
          ok: false,
          status: r.status,
          message:
            r.status >= 500
              ? `Server error (${r.status}). Try again in a moment.`
              : "The server returned data we could not read. Try again.",
        };
      }
      return {
        ok: false,
        status: r.status,
        message:
          "The app received invalid data from the server. Refresh the page or try again.",
      };
    }
  }

  if (!r.ok) {
    const fromBody =
      typeof data.error === "string" && data.error.trim().length > 0
        ? data.error
        : null;
    const fallback =
      r.status >= 500
        ? `Server error (${r.status}). Try again in a moment.`
        : r.status === 401 || r.status === 403
          ? "You may need to sign in again."
          : r.statusText || "Request failed";
    return {
      ok: false,
      status: r.status,
      message: fromBody ?? fallback,
    };
  }
  return { ok: true, data: data as T };
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return s.length > 0 ? s.slice(0, 48) : "project";
}

function sortJobsNewestFirst(a: AiJobRow, b: AiJobRow): number {
  const t = +new Date(b.createdAt) - +new Date(a.createdAt);
  if (t !== 0) return t;
  return b.id.localeCompare(a.id);
}

function latestJobByKind(jobs: AiJobRow[], kind: string): AiJobRow | undefined {
  return jobs.filter((j) => j.jobKind === kind).sort(sortJobsNewestFirst)[0];
}

/** Test-case jobs tied to the current requirements job (avoids stale job from a prior run). */
function latestTcJobForRequirementsJob(
  jobs: AiJobRow[],
  requirementsJobId: string | undefined,
): AiJobRow | undefined {
  if (!requirementsJobId) return undefined;
  return jobs
    .filter(
      (j) =>
        j.jobKind === "test_cases" &&
        j.requirementsJobId === requirementsJobId,
    )
    .sort(sortJobsNewestFirst)[0];
}

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function jobRunningLabel(status: string): string {
  if (status === "pending") return "Queued";
  if (status === "running") return "Running";
  if (status === "completed") return "Done";
  if (status === "failed") return "Failed";
  return status;
}

function chipClassForDocStatus(status: string): string {
  if (status === "parsed") return "ws-chip ws-chip-ok";
  if (status === "failed") return "ws-chip ws-chip-bad";
  if (
    status === "uploading" ||
    status === "queued" ||
    status === "parsing" ||
    status === "uploaded"
  )
    return "ws-chip ws-chip-warn";
  return "ws-chip ws-chip-neutral";
}

function chipClassForRequirementStatus(status: string): string {
  if (status === "active") return "ws-chip ws-chip-ok";
  if (status === "deprecated") return "ws-chip ws-chip-warn";
  return "ws-chip ws-chip-neutral";
}

function chipClassForJobStatus(status: string): string {
  if (status === "completed") return "ws-chip ws-chip-ok";
  if (status === "failed") return "ws-chip ws-chip-bad";
  if (status === "running" || status === "pending")
    return "ws-chip ws-chip-warn";
  return "ws-chip ws-chip-neutral";
}

function chipClassForTcStatus(status: string): string {
  if (status === "approved") return "ws-chip ws-chip-ok";
  if (status === "rejected") return "ws-chip ws-chip-bad";
  if (status === "in_review") return "ws-chip ws-chip-warn";
  return "ws-chip ws-chip-neutral";
}

function jobKindLabel(kind: string): string {
  if (kind === "requirements") return "Requirements AI";
  if (kind === "test_cases") return "Test cases AI";
  return kind;
}

export function WorkspaceApp() {
  const { isLoaded: clerkLoaded, isSignedIn } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [projectsErr, setProjectsErr] = useState<string | null>(null);
  const [loadingBoot, setLoadingBoot] = useState(true);

  const [projectId, setProjectId] = useState<string>("");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsErr, setDocsErr] = useState<string | null>(null);

  const [documentId, setDocumentId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<AiJobRow[]>([]);
  const [requirements, setRequirements] = useState<RequirementRow[]>([]);
  const [testCases, setTestCases] = useState<TestCaseRow[]>([]);
  const [links, setLinks] = useState<TraceRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const [selectedTcId, setSelectedTcId] = useState<string | null>(null);

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createOrgId, setCreateOrgId] = useState("");
  const [createName, setCreateName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detailFetchGen = useRef(0);
  const docsFetchGen = useRef(0);
  const projectIdRef = useRef(projectId);
  const documentIdRef = useRef(documentId);
  const [detailHydrated, setDetailHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  projectIdRef.current = projectId;
  documentIdRef.current = documentId;

  useEffect(() => {
    if (!clerkLoaded) {
      return;
    }
    if (!isSignedIn) {
      setLoadingBoot(false);
      setProjectsErr("You need to sign in to view your workspace.");
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoadingBoot(true);
      setProjectsErr(null);

      const doFetch = async (): Promise<number | null> => {
        try {
          const [p, o] = await Promise.all([
            apiJson<{ projects: ProjectRow[] }>("/api/me/projects"),
            apiJson<{ organizations: OrgRow[] }>("/api/me/organizations"),
          ]);
          if (!p.ok) {
            if (!cancelled) setProjectsErr(p.message);
            return null;
          }
          if (!o.ok) {
            if (!cancelled) setProjectsErr(o.message);
            return null;
          }
          const projList = p.data.projects;
          const orgList = o.data.organizations;
          if (!Array.isArray(projList) || !Array.isArray(orgList)) {
            if (!cancelled) {
              setProjectsErr(
                "Workspace data was incomplete. Refresh the page and try again.",
              );
            }
            return null;
          }
          if (cancelled) return orgList.length;
          setProjects(projList);
          setOrgs(orgList);
          setProjectId((prev) => prev || projList[0]?.id || "");
          setCreateOrgId((prev) => prev || orgList[0]?.id || "");
          return orgList.length;
        } catch {
          if (!cancelled) {
            setProjectsErr(
              "Could not load workspace. Refresh the page or try again.",
            );
          }
          return null;
        }
      };

      try {
        const orgCount = await doFetch();
        if (cancelled || orgCount === null) return;
        if (orgCount === 0) {
          await new Promise((r) => setTimeout(r, 2500));
          if (cancelled) return;
          await doFetch();
        }
      } finally {
        if (!cancelled) setLoadingBoot(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clerkLoaded, isSignedIn]);

  const loadDocuments = useCallback(async () => {
    if (!projectId) {
      docsFetchGen.current += 1;
      setDocsLoading(false);
      return;
    }
    const myGen = ++docsFetchGen.current;
    setDocsLoading(true);
    setDocsErr(null);
    try {
      const r = await apiJson<{ documents: DocumentRow[] }>(
        `/api/projects/${projectId}/documents`,
      );
      if (myGen !== docsFetchGen.current) return;
      setDocsLoading(false);
      if (!r.ok) {
        setDocsErr(r.message);
        return;
      }
      const list = r.data.documents;
      if (!Array.isArray(list)) {
        setDocsErr(
          "Could not read the document list. Click Refresh documents.",
        );
        return;
      }
      setDocuments(list);
    } catch {
      if (myGen !== docsFetchGen.current) return;
      setDocsLoading(false);
      setDocsErr("Could not load documents. Check your connection and try again.");
    }
  }, [projectId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    if (!documentId) return;
    if (!documents.some((d) => d.id === documentId)) {
      setDocumentId(null);
    }
  }, [documents, documentId]);

  const refreshDetail = useCallback(async () => {
    if (!projectId || !documentId) return;
    const gen = ++detailFetchGen.current;
    const projId = projectId;
    const docId = documentId;
    const base = `/api/projects/${projId}`;

    const applyIfCurrent = (): boolean => {
      if (gen !== detailFetchGen.current) return false;
      if (projectIdRef.current !== projId || documentIdRef.current !== docId) {
        return false;
      }
      return true;
    };

    try {
      const [j, req, tc, tr] = await Promise.all([
        apiJson<{ jobs: AiJobRow[] }>(
          `${base}/documents/${docId}/ai-jobs`,
        ),
        apiJson<{ requirements: RequirementRow[] }>(
          `${base}/requirements?documentId=${docId}`,
        ),
        apiJson<{ testCases: TestCaseRow[] }>(
          `${base}/test-cases?documentId=${docId}`,
        ),
        apiJson<{ links: TraceRow[] }>(
          `${base}/documents/${docId}/traceability`,
        ),
      ]);

      if (!applyIfCurrent()) return;

      const errs: string[] = [];
      if (!j.ok) errs.push(`Jobs: ${j.message}`);
      if (!req.ok) errs.push(`Requirements: ${req.message}`);
      if (!tc.ok) errs.push(`Test cases: ${tc.message}`);
      if (!tr.ok) errs.push(`Traceability: ${tr.message}`);
      setDetailErr(errs.length > 0 ? errs.join(" · ") : null);

      if (j.ok) {
        setJobs(Array.isArray(j.data.jobs) ? j.data.jobs : []);
      }
      if (req.ok) {
        setRequirements(
          Array.isArray(req.data.requirements) ? req.data.requirements : [],
        );
      }
      if (tc.ok) {
        setTestCases(
          Array.isArray(tc.data.testCases) ? tc.data.testCases : [],
        );
      }
      if (tr.ok) {
        setLinks(Array.isArray(tr.data.links) ? tr.data.links : []);
      }
    } catch {
      if (!applyIfCurrent()) return;
      setDetailErr(
        "Could not refresh this document. Check your connection; updates will retry automatically.",
      );
    } finally {
      if (applyIfCurrent()) {
        setDetailHydrated(true);
      }
    }
  }, [projectId, documentId]);

  useEffect(() => {
    if (!documentId || !projectId) {
      detailFetchGen.current += 1;
      docsFetchGen.current += 1;
      setJobs([]);
      setRequirements([]);
      setTestCases([]);
      setLinks([]);
      setDetailErr(null);
      setDetailHydrated(false);
      setDetailLoading(false);
      setSelectedReqId(null);
      setSelectedTcId(null);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    setDetailHydrated(false);
    setDetailLoading(true);
    const projAtStart = projectId;
    const docAtStart = documentId;
    void refreshDetail().finally(() => {
      if (
        projectIdRef.current === projAtStart &&
        documentIdRef.current === docAtStart
      ) {
        setDetailLoading(false);
      }
    });

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      void refreshDetail().catch(() => {
        /* network errors — next poll retries */
      });
    }, 2800);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [documentId, projectId, refreshDetail]);

  useEffect(() => {
    if (selectedReqId && !requirements.some((r) => r.id === selectedReqId)) {
      setSelectedReqId(null);
    }
  }, [requirements, selectedReqId]);

  useEffect(() => {
    if (selectedTcId && !testCases.some((t) => t.id === selectedTcId)) {
      setSelectedTcId(null);
    }
  }, [testCases, selectedTcId]);

  const selectedDoc = useMemo(
    () => documents.find((d) => d.id === documentId) ?? null,
    [documents, documentId],
  );

  const latestReqJob = useMemo(() => latestJobByKind(jobs, "requirements"), [jobs]);
  const latestTcJob = useMemo(
    () => latestTcJobForRequirementsJob(jobs, latestReqJob?.id),
    [jobs, latestReqJob?.id],
  );

  const selectedReq = useMemo(
    () => requirements.find((r) => r.id === selectedReqId) ?? null,
    [requirements, selectedReqId],
  );

  const selectedTc = useMemo(
    () => testCases.find((t) => t.id === selectedTcId) ?? null,
    [testCases, selectedTcId],
  );

  async function onUpload(file: File | null): Promise<void> {
    if (!file || !projectId) return;
    const targetProjectId = projectId;
    setUploadBusy(true);
    setUploadMsg(null);
    try {
      const up = await apiJson<{
        documentId: string;
        uploadUrl: string;
        method: "PUT";
        headers: Record<string, string>;
      }>(`/api/projects/${targetProjectId}/documents/upload-url`, {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || undefined,
        }),
      });
      if (targetProjectId !== projectIdRef.current) {
        setUploadMsg(
          "Upload was started in another project. Open that project’s document list to finish or retry.",
        );
        return;
      }
      if (!up.ok) throw new Error(up.message);
      const presign = up.data;
      if (
        typeof presign.uploadUrl !== "string" ||
        !presign.uploadUrl.trim() ||
        typeof presign.documentId !== "string" ||
        !presign.documentId.trim()
      ) {
        throw new Error(
          "Upload could not start (invalid response from server). Try again.",
        );
      }
      const put = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: presign.headers,
        body: file,
      });
      if (targetProjectId !== projectIdRef.current) {
        setUploadMsg(
          "Upload was interrupted because you switched projects. Check the project you started from.",
        );
        return;
      }
      if (!put.ok) {
        throw new Error(
          `The file could not be uploaded to storage (HTTP ${put.status}). Check your connection and try again.`,
        );
      }
      const done = await apiJson<unknown>(
        `/api/projects/${targetProjectId}/documents/${presign.documentId}/complete`,
        {
          method: "POST",
          body: JSON.stringify({
            sizeBytes: file.size,
            mimeType: file.type || undefined,
          }),
        },
      );
      if (targetProjectId !== projectIdRef.current) {
        setUploadMsg(
          "Upload finished, but you switched projects. Open the project you uploaded to and refresh documents.",
        );
        return;
      }
      if (!done.ok) throw new Error(done.message);
      setUploadMsg("Uploaded and queued for processing.");
      await loadDocuments();
      if (targetProjectId !== projectIdRef.current) {
        setUploadMsg(
          "Upload complete. Switch back to the project you used, then refresh documents to open the new file.",
        );
        return;
      }
      setDocumentId(presign.documentId);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setUploadMsg(
        e instanceof Error ? e.message : "Upload failed. Try again or use a smaller file.",
      );
    } finally {
      setUploadBusy(false);
    }
  }

  async function onCreateProject(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!createOrgId || !createName.trim()) return;
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const slug = slugify(createName);
      const r = await apiJson<{ project: ProjectRow }>(
        `/api/organizations/${createOrgId}/projects`,
        {
          method: "POST",
          body: JSON.stringify({ name: createName.trim(), slug }),
        },
      );
      if (!r.ok) {
        setCreateErr(r.message);
        return;
      }
      setProjects((prev) => [...prev, r.data.project]);
      setProjectId(r.data.project.id);
      setDocumentId(null);
      setDocuments([]);
      setDocsErr(null);
      setCreateName("");
      setShowCreate(false);
    } catch {
      setCreateErr("Could not create project. Check your connection and try again.");
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div>
      <h1 className="ws-page-title">Workspace</h1>
      <AlphaQaChecklist />

      {loadingBoot ? (
        <p className="ws-loading">Loading your workspace…</p>
      ) : projectsErr ? (
        <p className="ws-error" role="alert">
          {projectsErr}
        </p>
      ) : (
        <>
          <div className="ws-toolbar">
            <div className="ws-field">
              <label htmlFor="ws-project">Project</label>
              <select
                id="ws-project"
                className="ws-select"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setDocumentId(null);
                  setDocuments([]);
                  setDocsErr(null);
                }}
              >
                {projects.length === 0 ? (
                  <option value="">No projects yet</option>
                ) : (
                  projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <button
              type="button"
              className="ws-btn ws-btn-ghost"
              onClick={() => setShowCreate((s) => !s)}
            >
              {showCreate ? "Cancel" : "New project"}
            </button>
            <button
              type="button"
              className="ws-btn ws-btn-ghost"
              onClick={() => void loadDocuments()}
              disabled={!projectId || docsLoading}
            >
              Refresh documents
            </button>
          </div>

          {showCreate && (
            <div className="ws-card" style={{ marginBottom: "1rem" }}>
              <div className="ws-card-h">Create project</div>
              <div className="ws-card-b">
                <form onSubmit={(e) => void onCreateProject(e)}>
                  <div className="ws-create-grid">
                    <div className="ws-field">
                      <label htmlFor="ws-org">Organization</label>
                      <select
                        id="ws-org"
                        className="ws-select"
                        value={createOrgId}
                        onChange={(e) => setCreateOrgId(e.target.value)}
                      >
                        {orgs.length === 0 ? (
                          <option value="">No organizations</option>
                        ) : (
                          orgs.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    <div className="ws-field">
                      <label htmlFor="ws-pname">Project name</label>
                      <input
                        id="ws-pname"
                        className="ws-input"
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder="e.g. Mobile app alpha"
                      />
                    </div>
                    {createErr ? (
                      <p className="ws-error" role="alert">
                        {createErr}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      className="ws-btn ws-btn-primary"
                      disabled={
                        createBusy || !createOrgId || !createName.trim()
                      }
                    >
                      {createBusy ? "Creating…" : "Create"}
                    </button>
                  </div>
                </form>
                {orgs.length === 0 ? (
                  <p className="ws-muted" style={{ marginTop: "0.75rem" }}>
                    No Clerk organizations synced yet. Join or create an org in
                    Clerk, then reload.
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {!projectId ? (
            <p className="ws-muted">Select or create a project to continue.</p>
          ) : (
            <div className="ws-layout">
              <div className="ws-card">
                <div className="ws-card-h">Documents</div>
                <div className="ws-card-b">
                  <label className="ws-upload-label">
                    {uploadBusy ? "Uploading…" : "Upload file"}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.md,.txt,.markdown,.csv,text/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      disabled={uploadBusy}
                      onChange={(e) =>
                        void onUpload(e.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  {uploadMsg ? (
                    <p
                      className={
                        /fail|interrupted|could not|another project|unreadable/i.test(
                          uploadMsg,
                        )
                          ? "ws-error"
                          : "ws-muted"
                      }
                      style={{ marginTop: "0.5rem" }}
                    >
                      {uploadMsg}
                    </p>
                  ) : null}
                  {docsLoading ? (
                    <p className="ws-loading">Loading…</p>
                  ) : docsErr ? (
                    <p className="ws-error">{docsErr}</p>
                  ) : documents.length === 0 ? (
                    <p className="ws-muted" style={{ marginTop: "0.75rem" }}>
                      No documents yet. Upload a PDF, DOCX, or text file.
                    </p>
                  ) : (
                    <ul className="ws-list" style={{ marginTop: "0.75rem" }}>
                      {documents.map((d) => (
                        <li key={d.id}>
                          <button
                            type="button"
                            className="ws-doc-row"
                            data-active={d.id === documentId}
                            onClick={() => {
                              setDocumentId(d.id);
                              setSelectedReqId(null);
                              setSelectedTcId(null);
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{d.filename}</span>
                            <span>
                              <span className={chipClassForDocStatus(d.status)}>
                                {d.status}
                              </span>
                            </span>
                            {d.errorMessage ? (
                              <span className="ws-error" style={{ fontSize: "0.75rem" }}>
                                {d.errorMessage}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div>
                {!documentId ? (
                  <div className="ws-card">
                    <div className="ws-card-b">
                      <p className="ws-muted">
                        Select a document to see processing status, requirements,
                        and test cases.
                      </p>
                    </div>
                  </div>
                ) : !detailHydrated ? (
                  <p className="ws-loading">Loading document details…</p>
                ) : (
                  <>
                    {detailErr ? (
                      <p className="ws-error" style={{ marginBottom: "0.75rem" }}>
                        {detailErr}
                      </p>
                    ) : null}

                    <div className="ws-pipeline">
                      <div className="ws-pipeline-step">
                        <h4>1 · Document</h4>
                        <p>
                          {selectedDoc ? (
                            <>
                              <span className={chipClassForDocStatus(selectedDoc.status)}>
                                {selectedDoc.status}
                              </span>
                              <span className="ws-muted" style={{ marginLeft: "0.35rem" }}>
                                {selectedDoc.filename}
                              </span>
                              <span className="ws-pipeline-meta">
                                Updated{" "}
                                {formatShortTime(selectedDoc.updatedAt) || "—"}
                              </span>
                            </>
                          ) : (
                            <span className="ws-muted">—</span>
                          )}
                        </p>
                      </div>
                      <div className="ws-pipeline-step">
                        <h4>2 · {jobKindLabel("requirements")}</h4>
                        <p>
                          {latestReqJob ? (
                            <>
                              <span
                                className={chipClassForJobStatus(latestReqJob.status)}
                              >
                                {latestReqJob.status}
                              </span>
                              {latestReqJob.progressPhase ? (
                                <span className="ws-muted" style={{ marginLeft: "0.35rem" }}>
                                  {latestReqJob.progressPhase}
                                </span>
                              ) : null}
                              <span className="ws-pipeline-meta">
                                {jobRunningLabel(latestReqJob.status)}
                                {formatShortTime(latestReqJob.updatedAt)
                                  ? ` · ${formatShortTime(latestReqJob.updatedAt)}`
                                  : ""}
                              </span>
                              {latestReqJob.errorMessage ? (
                                <span
                                  className="ws-error"
                                  style={{
                                    display: "block",
                                    marginTop: "0.25rem",
                                    fontSize: "0.8rem",
                                  }}
                                >
                                  {latestReqJob.errorMessage}
                                </span>
                              ) : null}
                            </>
                          ) : (
                            <span className="ws-muted">
                              {selectedDoc?.status === "parsed"
                                ? "No job row yet — wait or check worker"
                                : "No job yet"}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="ws-pipeline-step">
                        <h4>3 · {jobKindLabel("test_cases")}</h4>
                        <p>
                          {latestReqJob?.status === "failed" ? (
                            <span className="ws-muted">
                              Skipped — fix requirements job first
                            </span>
                          ) : latestReqJob &&
                            latestReqJob.status !== "completed" ? (
                            <span className="ws-muted">
                              After requirements complete…
                            </span>
                          ) : latestTcJob ? (
                            <>
                              <span
                                className={chipClassForJobStatus(latestTcJob.status)}
                              >
                                {latestTcJob.status}
                              </span>
                              {latestTcJob.progressPhase ? (
                                <span className="ws-muted" style={{ marginLeft: "0.35rem" }}>
                                  {latestTcJob.progressPhase}
                                </span>
                              ) : null}
                              <span className="ws-pipeline-meta">
                                {jobRunningLabel(latestTcJob.status)}
                                {formatShortTime(latestTcJob.updatedAt)
                                  ? ` · ${formatShortTime(latestTcJob.updatedAt)}`
                                  : ""}
                              </span>
                              {latestTcJob.errorMessage ? (
                                <span
                                  className="ws-error"
                                  style={{
                                    display: "block",
                                    marginTop: "0.25rem",
                                    fontSize: "0.8rem",
                                  }}
                                >
                                  {latestTcJob.errorMessage}
                                </span>
                              ) : null}
                            </>
                          ) : latestReqJob?.status === "completed" ? (
                            <span className="ws-muted">
                              Queued or running…
                            </span>
                          ) : (
                            <span className="ws-muted">—</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="ws-split">
                      <div className="ws-card">
                        <div className="ws-card-h">
                          Requirements ({requirements.length})
                        </div>
                        <div className="ws-card-b" style={{ padding: 0 }}>
                          {requirements.length === 0 ? (
                            <p className="ws-muted" style={{ padding: "0.75rem" }}>
                              {latestReqJob?.status === "failed"
                                ? "Requirements extraction failed — see pipeline error above."
                                : latestReqJob?.status === "running" ||
                                    latestReqJob?.status === "pending"
                                  ? "Extracting requirements…"
                                  : selectedDoc?.status === "parsed"
                                    ? "No requirements yet — check the requirements AI job status above."
                                    : "Requirements appear after the document is parsed and AI extraction completes."}
                            </p>
                          ) : (
                            requirements.map((r) => (
                              <div
                                key={r.id}
                                role="button"
                                tabIndex={0}
                                className="ws-req-item"
                                data-active={r.id === selectedReqId}
                                onClick={() => {
                                  setSelectedReqId(r.id);
                                  setSelectedTcId(null);
                                }}
                                onKeyDown={(ev) => {
                                  if (ev.key === "Enter" || ev.key === " ") {
                                    ev.preventDefault();
                                    setSelectedReqId(r.id);
                                    setSelectedTcId(null);
                                  }
                                }}
                              >
                                <div style={{ fontWeight: 600 }}>
                                  {r.ordinal}. {r.title}
                                </div>
                                <span
                                  className={chipClassForRequirementStatus(r.status)}
                                >
                                  {r.status}
                                </span>
                                <div
                                  className="ws-muted"
                                  style={{
                                    fontSize: "0.8rem",
                                    marginTop: "0.25rem",
                                    maxHeight: "2.6em",
                                    overflow: "hidden",
                                  }}
                                >
                                  {r.description || "—"}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="ws-card">
                        <div className="ws-card-h">
                          Test cases ({testCases.length})
                        </div>
                        <div className="ws-card-b" style={{ padding: 0 }}>
                          {testCases.length === 0 ? (
                            <p className="ws-muted" style={{ padding: "0.75rem" }}>
                              {latestReqJob?.status === "failed"
                                ? "Blocked — requirements did not complete."
                                : latestReqJob?.status === "completed" &&
                                    latestTcJob?.status === "failed"
                                  ? "Test-case generation failed — see pipeline error above."
                                  : latestReqJob?.status === "completed"
                                    ? "No test cases yet — test-case AI may still be running."
                                    : "Test cases appear after requirements extraction completes."}
                            </p>
                          ) : (
                            testCases.map((t) => (
                              <div
                                key={t.id}
                                role="button"
                                tabIndex={0}
                                className="ws-tc-item"
                                data-active={t.id === selectedTcId}
                                onClick={() => {
                                  setSelectedTcId(t.id);
                                  setSelectedReqId(null);
                                }}
                                onKeyDown={(ev) => {
                                  if (ev.key === "Enter" || ev.key === " ") {
                                    ev.preventDefault();
                                    setSelectedTcId(t.id);
                                    setSelectedReqId(null);
                                  }
                                }}
                              >
                                <div style={{ fontWeight: 600 }}>{t.title}</div>
                                <span className="ws-chip ws-chip-neutral">
                                  {t.priority}
                                </span>{" "}
                                <span className={chipClassForTcStatus(t.status)}>
                                  {t.status}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {selectedReq ? (
                      <div className="ws-detail">
                        <h3>Requirement detail</h3>
                        <p className="ws-muted" style={{ marginBottom: "0.5rem" }}>
                          Ordinal {selectedReq.ordinal} ·{" "}
                          <span
                            className={chipClassForRequirementStatus(
                              selectedReq.status,
                            )}
                          >
                            {selectedReq.status}
                          </span>
                        </p>
                        <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>
                          {selectedReq.title}
                        </div>
                        <div style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem" }}>
                          {selectedReq.description || "—"}
                        </div>
                      </div>
                    ) : null}

                    {selectedTc && projectId ? (
                      <TestCaseEditor
                        projectId={projectId}
                        tc={selectedTc}
                        links={links}
                        requirements={requirements}
                        onSaved={refreshDetail}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function normalizeSteps(
  raw: TestCaseRow["steps"] | undefined,
): { order: number; action: string; expected: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s, i) => ({
    order: typeof s.order === "number" ? s.order : i + 1,
    action: typeof s.action === "string" ? s.action : "",
    expected: typeof s.expected === "string" ? s.expected : "",
  }));
}

function TestCaseEditor({
  projectId,
  tc,
  links,
  requirements,
  onSaved,
}: {
  projectId: string;
  tc: TestCaseRow;
  links: TraceRow[];
  requirements: RequirementRow[];
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(tc.title);
  const [precondition, setPrecondition] = useState(tc.precondition);
  const [expectedResult, setExpectedResult] = useState(tc.expectedResult);
  const [priority, setPriority] = useState(tc.priority);
  const [status, setStatus] = useState(tc.status);
  const [steps, setSteps] = useState(() => normalizeSteps(tc.steps));

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const lastTcIdRef = useRef<string | null>(null);
  const projectIdRef = useRef(projectId);
  const saveRef = useRef<() => Promise<void>>(async () => {});

  projectIdRef.current = projectId;

  function hydrateFromRow(t: TestCaseRow): void {
    setTitle(t.title);
    setPrecondition(t.precondition ?? "");
    setExpectedResult(t.expectedResult ?? "");
    setPriority(t.priority);
    setStatus(t.status);
    setSteps(normalizeSteps(t.steps));
  }

  useEffect(() => {
    if (lastTcIdRef.current !== tc.id) {
      lastTcIdRef.current = tc.id;
      hydrateFromRow(tc);
      setIsDirty(false);
      setSaveErr(null);
      setSaveOk(false);
      return;
    }
    if (!isDirty) {
      hydrateFromRow(tc);
    }
  }, [tc, isDirty]);

  useEffect(() => {
    if (!saveOk) return;
    const t = setTimeout(() => setSaveOk(false), 4000);
    return () => clearTimeout(t);
  }, [saveOk]);

  const linkedTitles = useMemo(() => {
    const reqIds = new Set(
      links.filter((l) => l.testCaseId === tc.id).map((l) => l.requirementId),
    );
    return requirements
      .filter((r) => reqIds.has(r.id))
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((r) => `${r.ordinal}. ${r.title}`);
  }, [links, requirements, tc.id]);

  function discard(): void {
    hydrateFromRow(tc);
    setIsDirty(false);
    setSaveErr(null);
    setSaveOk(false);
  }

  async function save(): Promise<void> {
    setSaveErr(null);
    setSaveOk(false);
    if (steps.length === 0) {
      setSaveErr("At least one step is required.");
      return;
    }
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!;
      if (!s.action.trim() || !s.expected.trim()) {
        setSaveErr(`Step ${i + 1}: action and expected must not be empty.`);
        return;
      }
    }
    const targetId = tc.id;
    const targetProjectId = projectId;
    setSaveBusy(true);
    try {
      const body = {
        title,
        precondition,
        expectedResult,
        priority,
        status,
        steps: steps.map((s, i) => ({
          order: i + 1,
          action: s.action.trim(),
          expected: s.expected.trim(),
        })),
      };
      const r = await apiJson<{ testCase: TestCaseRow }>(
        `/api/projects/${targetProjectId}/test-cases/${targetId}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      if (
        targetId !== lastTcIdRef.current ||
        targetProjectId !== projectIdRef.current
      ) {
        return;
      }
      if (!r.ok) {
        setSaveErr(r.message);
        return;
      }
      const row = r.data.testCase;
      if (!row || row.id !== targetId) {
        setSaveErr(
          "Save could not be confirmed. Refresh the page or reopen this test case.",
        );
        return;
      }
      hydrateFromRow(row);
      setIsDirty(false);
      setSaveOk(true);
      await onSaved();
    } finally {
      setSaveBusy(false);
    }
  }

  saveRef.current = save;

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "s") return;
      e.preventDefault();
      if (isDirty && !saveBusy && title.trim()) void saveRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDirty, saveBusy, title]);

  return (
    <div className="ws-detail">
      <h3>Edit test case</h3>
      <p className="ws-trace">
        Traceability:{" "}
        {linkedTitles.length > 0 ? linkedTitles.join(" · ") : "No links"}
      </p>
      {isDirty ? (
        <p className="ws-muted" style={{ fontSize: "0.78rem", marginBottom: "0.35rem" }}>
          Unsaved changes ·{" "}
          <kbd style={{ fontSize: "0.7rem" }}>Ctrl+S</kbd> /{" "}
          <kbd style={{ fontSize: "0.7rem" }}>⌘S</kbd> to save
        </p>
      ) : null}
      {saveErr ? (
        <p className="ws-error" role="alert">
          {saveErr}
        </p>
      ) : null}
      {saveOk ? (
        <p className="ws-success" role="status">
          Saved successfully.
        </p>
      ) : null}
      <fieldset
        disabled={saveBusy}
        style={{ border: "none", margin: 0, padding: 0 }}
      >
        <div className="ws-form-row">
          <label htmlFor="tc-title">Title</label>
          <input
            id="tc-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setIsDirty(true);
            }}
          />
        </div>
        <div className="ws-form-row">
          <label htmlFor="tc-pre">Precondition</label>
          <textarea
            id="tc-pre"
            rows={2}
            value={precondition}
            onChange={(e) => {
              setPrecondition(e.target.value);
              setIsDirty(true);
            }}
          />
        </div>
        <div className="ws-form-row">
          <label htmlFor="tc-exp">Expected result</label>
          <textarea
            id="tc-exp"
            rows={2}
            value={expectedResult}
            onChange={(e) => {
              setExpectedResult(e.target.value);
              setIsDirty(true);
            }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <div className="ws-form-row" style={{ flex: "1", minWidth: "120px" }}>
            <label htmlFor="tc-pri">Priority</label>
            <select
              id="tc-pri"
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setIsDirty(true);
              }}
            >
              {(["p0", "p1", "p2", "p3"] as const).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="ws-form-row" style={{ flex: "1", minWidth: "140px" }}>
            <label htmlFor="tc-st">Status</label>
            <select
              id="tc-st"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setIsDirty(true);
              }}
            >
              {(["draft", "in_review", "approved", "rejected"] as const).map(
                (s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>
        <div className="ws-form-row">
          <label>Steps</label>
          {steps.map((s, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: "0.5rem",
                padding: "0.5rem",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "var(--surface)",
              }}
            >
              <div className="ws-muted" style={{ marginBottom: "0.25rem" }}>
                Step {idx + 1}
              </div>
              <input
                placeholder="Action"
                value={s.action}
                onChange={(e) => {
                  const next = [...steps];
                  next[idx] = { ...next[idx]!, action: e.target.value };
                  setSteps(next);
                  setIsDirty(true);
                }}
                style={{ marginBottom: "0.25rem" }}
              />
              <input
                placeholder="Expected"
                value={s.expected}
                onChange={(e) => {
                  const next = [...steps];
                  next[idx] = { ...next[idx]!, expected: e.target.value };
                  setSteps(next);
                  setIsDirty(true);
                }}
              />
              <button
                type="button"
                className="ws-btn ws-btn-ghost"
                style={{ marginTop: "0.35rem", fontSize: "0.75rem" }}
                onClick={() => {
                  setSteps(steps.filter((_, i) => i !== idx));
                  setIsDirty(true);
                }}
              >
                Remove step
              </button>
            </div>
          ))}
          <button
            type="button"
            className="ws-btn ws-btn-ghost"
            onClick={() => {
              setSteps([
                ...steps,
                { order: steps.length + 1, action: "", expected: "" },
              ]);
              setIsDirty(true);
            }}
          >
            Add step
          </button>
        </div>
        <div className="ws-form-actions">
          <button
            type="button"
            className="ws-btn ws-btn-primary"
            disabled={saveBusy || !title.trim() || !isDirty}
            onClick={() => void save()}
          >
            {saveBusy ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className="ws-btn ws-btn-ghost"
            disabled={saveBusy || !isDirty}
            onClick={discard}
          >
            Discard
          </button>
        </div>
      </fieldset>
    </div>
  );
}
