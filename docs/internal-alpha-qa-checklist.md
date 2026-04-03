# Internal Alpha — manual QA checklist

Use this for demo readiness and regression checks. All steps assume Clerk sign-in, env vars set (DB, Redis, S3, OpenAI), and worker running.

**Pass/fail gate:** use the **Alpha QA gate** panel at the top of `/workspace` (checkboxes persist in `localStorage` for this browser). Treat **all items checked** as the alpha sign-off for that environment.

## 1. Workspace & project

- [ ] Open `/workspace` while signed in; header and layout load without console errors.
- [ ] Projects dropdown lists at least one project you are a member of (or empty state is clear).
- [ ] **New project**: choose organization, enter name, create; new project appears and selects automatically.
- [ ] **No orgs**: message explains Clerk org sync; no crash.

## 2. Document ingest

- [ ] Upload a supported file (PDF, DOCX, or `.md`/`.txt`); success message and document appears in list.
- [ ] Document status moves: `uploading` → `queued` → `parsing` → `parsed` (polls in UI).
- [ ] Pipeline strip shows **Document**, **Requirements AI**, **Test cases AI** with sensible statuses.
- [ ] Invalid or oversized storage upload shows a clear error (not a blank failure).

## 3. AI jobs

- [ ] Requirements job reaches `completed` or shows `failed` with **errorMessage** visible in pipeline.
- [ ] After requirements complete, test-case job appears and progresses (or fails with message).
- [ ] **Failed** document (e.g. bad file type) shows `failed` and error on document row.

## 4. Requirements

- [ ] Requirements list populates after successful extraction; empty state matches “still running” vs “none yet”.
- [ ] Select a requirement: detail shows title, description, ordinal, status chip.
- [ ] `active` / `deprecated` chips look distinct.

## 5. Test cases & traceability

- [ ] Test cases list populates after test-case job completes; empty state is accurate while jobs run.
- [ ] Select a test case: **Traceability** line lists linked requirement titles/ordinals.
- [ ] Edit title, steps, priority, status; **Save** persists (refresh or wait for poll).
- [ ] Validation: cannot save with empty step action/expected (inline error).

## 6. Resilience

- [ ] Change project: document selection clears; lists match new project.
- [ ] Refresh page: same project (if any) and data reload.
- [ ] Worker stopped: jobs stay `pending`/`running`; UI does not crash; errors understandable when jobs `failed` after timeout/restart policy (if any).

## 7. Demo script (5 min)

1. Sign in → Workspace.  
2. Pick project → Upload one real spec PDF or DOCX.  
3. Wait for green **parsed** → **Requirements AI** `completed` → **Test cases AI** `completed`.  
4. Open one requirement and one test case; show trace line and save an edit.  

Record any UI copy or status that confuses viewers and file as polish feedback.
