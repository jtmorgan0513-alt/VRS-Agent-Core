# Pilot Feedback Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four remaining punch-list items from the 2026-04-23 pilot-feedback audit so the VRS Digital Authorization Platform is ready to expand past the TLT pilot.

**Architecture:** All four tasks are surgical additions to the existing Express + React codebase — no framework changes, no library additions. Tasks 1–3 are pure client/server content and UI. Task 4 adds one new table, 2 endpoints, one UI panel. Each task is independent and commits separately.

**Tech Stack:** TypeScript, React 18, Tailwind + shadcn/ui, Express 5, Drizzle ORM (PostgreSQL), TanStack Query v5, Twilio, WebSocket. No test suite — verification uses `npm run check` (tsc), `npm run build`, and manual browser testing against `npm run dev` on port 5000.

**Scope note — excluded from this plan:**
- TechHub ↔ VRS photo sync (Jira ticket filed, external team owns it)
- General refactors / unrelated cleanup

**After every commit in this plan, update:**
- `CHANGELOG.md` — add a dated entry under `[Unreleased]`
- `.claude/memory/context.md` — short session-context update
- `.claude/memory/todos.md` — check off the completed task
- `.claude/memory/decisions.md` — only if an architectural choice was made
- `../../MEMORY.md` (parent folder) — update the "Open Threads" section

This rhythm is mandated by `CLAUDE.md`; it is not optional.

---

## Task 1 — Per-file upload failure UI + retry (CRITICAL)

**Problem:** `client/src/pages/tech-submit.tsx` currently surfaces only an aggregate "N photo(s) failed to upload" toast. Techs can't see *which* file failed and have no retry button — they must reselect every photo, including the ones that already succeeded.

**Approach:** Track failed files per category (estimate vs issue). Render each failed file as a red-bordered list item with a "Retry" button directly under the photo grid. On successful retry, remove from failed list and add to the upload URL list.

**Files:**
- Modify: `client/src/pages/tech-submit.tsx` (state + UI + retry handler)

**Steps:**

- [ ] **1.1 — Add failedUpload state (near line 99)**

In `tech-submit.tsx` right after the existing `const [availableParts, setAvailableParts] = useState<string[]>([]);` line (line 99), add:

```ts
type FailedUpload = {
  id: string; // crypto.randomUUID()
  file: File;
  category: "estimate" | "issue";
  lastError: string;
  attemptsUsed: number;
};
const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);
const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
```

- [ ] **1.2 — Record failures in `handlePhotosSelect`**

In `handlePhotosSelect` (around line 178–226), modify the per-file loop so that when `uploadSinglePhoto` returns `null`, the failed file is recorded. Replace the loop starting at line 206 with:

```ts
const newFailures: FailedUpload[] = [];
const categoryForList: "estimate" | "issue" = setUrls === setEstimatePhotoUrls ? "estimate" : "issue";
for (let i = 0; i < filesToUpload.length; i++) {
  const file = filesToUpload[i];
  const localBlob = URL.createObjectURL(file);
  const url = await uploadSinglePhoto(file);
  if (url) {
    newUrls.push(url);
    newPreviews[url] = localBlob;
  } else {
    URL.revokeObjectURL(localBlob);
    newFailures.push({
      id: crypto.randomUUID(),
      file,
      category: categoryForList,
      lastError: "Upload failed after retries",
      attemptsUsed: 3,
    });
  }
  setCount({ done: i + 1, total: filesToUpload.length });
}
if (newFailures.length > 0) {
  setFailedUploads((prev) => [...prev, ...newFailures]);
}
```

Change the final toast at line 223–225 from aggregate to per-file count visible in the UI:

```ts
if (newFailures.length > 0) {
  toast({
    title: "Some photos failed",
    description: `${newFailures.length} photo(s) failed. Scroll down to retry.`,
    variant: "destructive",
  });
}
```

- [ ] **1.3 — Add `retryFailedUpload` handler**

Just below `handlePhotosSelect` (around line 227), add:

```ts
async function retryFailedUpload(failedId: string) {
  const failed = failedUploads.find((f) => f.id === failedId);
  if (!failed) return;
  setRetryingIds((prev) => new Set(prev).add(failedId));
  const url = await uploadSinglePhoto(failed.file);
  setRetryingIds((prev) => {
    const next = new Set(prev);
    next.delete(failedId);
    return next;
  });
  if (url) {
    const localBlob = URL.createObjectURL(failed.file);
    if (failed.category === "estimate") {
      setEstimatePhotoUrls((prev) => [...prev, url]);
      setEstimatePhotoLocalPreviews((prev) => ({ ...prev, [url]: localBlob }));
    } else {
      setIssuePhotoUrls((prev) => [...prev, url]);
      setIssuePhotoLocalPreviews((prev) => ({ ...prev, [url]: localBlob }));
    }
    setFailedUploads((prev) => prev.filter((f) => f.id !== failedId));
    toast({ title: "Retry succeeded", description: failed.file.name });
  } else {
    setFailedUploads((prev) =>
      prev.map((f) =>
        f.id === failedId
          ? { ...f, attemptsUsed: f.attemptsUsed + 3, lastError: "Retry failed" }
          : f
      )
    );
    toast({
      title: "Retry failed",
      description: `${failed.file.name} — check your connection.`,
      variant: "destructive",
    });
  }
}

function dismissFailedUpload(failedId: string) {
  setFailedUploads((prev) => prev.filter((f) => f.id !== failedId));
}
```

- [ ] **1.4 — Render failed-upload list under each photo section**

Inside `tech-submit.tsx`, find the existing estimate-photo Card and the issue-photo Card (both render the upload button + thumbnails grid). Under each grid, insert a failed-upload block filtered by category. Example for the estimate section — add immediately after the thumbnails `.map()` block:

```tsx
{failedUploads.filter((f) => f.category === "estimate").length > 0 && (
  <div className="mt-3 space-y-2" data-testid="failed-uploads-estimate">
    {failedUploads
      .filter((f) => f.category === "estimate")
      .map((f) => (
        <div
          key={f.id}
          className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm"
          data-testid={`failed-upload-${f.id}`}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{f.file.name}</div>
            <div className="text-xs text-muted-foreground">{f.lastError}</div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={retryingIds.has(f.id)}
            onClick={() => retryFailedUpload(f.id)}
            data-testid={`button-retry-${f.id}`}
          >
            {retryingIds.has(f.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : "Retry"}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => dismissFailedUpload(f.id)}
            data-testid={`button-dismiss-${f.id}`}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ))}
  </div>
)}
```

Repeat the same block under the issue-photo section, changing the filter to `f.category === "issue"` and the test-ids to `-issue`.

- [ ] **1.5 — Verify**

Run and confirm:

```bash
cd C:\Users\tyler\Documents\1Sears\VRS\VRS-Agent-Core
npm run check
```

Expected: no type errors. Then:

```bash
npm run dev
```

Open browser to http://localhost:5000, log in as a technician (see `CLAUDE.md` test credentials), navigate to `/tech/submit`, and attempt to upload a photo while offline or with the API temporarily blocked (DevTools → Network → Offline). Confirm: (a) failed file appears in red-bordered row, (b) Retry button re-attempts the upload, (c) on success the row disappears and the photo shows in the grid.

- [ ] **1.6 — Commit**

```bash
git add client/src/pages/tech-submit.tsx CHANGELOG.md .claude/memory/
git commit -m "feat(tech-submit): surface per-file upload failures with retry"
```

CHANGELOG entry:
```
### Fixed
- **Per-file upload failure visibility**: When a photo fails to upload, the file now appears in a red-bordered list under the photo grid with a Retry button, instead of only showing an aggregate toast. Techs can retry individual files without reselecting the ones that already succeeded.
```

---

## Task 2 — Wait-time expectations in SMS + Help Center

**Problem:** Techs have no guidance on wait-time variance (2 min for Sears Protect vs potentially hours for AHS/FA provider callbacks). The "don't leave the site" SMS from pilot had no context for why they might be waiting longer than expected.

**Approach:** (a) Add a "Submission received" SMS sent at creation time with wait-time context scoped to the warranty provider. (b) Add one Help Center FAQ entry explaining the variance.

**Files:**
- Modify: `server/sms.ts` (add `buildSubmissionReceivedMessage` function)
- Modify: `server/routes.ts` (call it inside the `POST /api/submissions` handler)
- Modify: `client/src/pages/help-center.tsx` (add FAQ entry)

**Steps:**

- [ ] **2.1 — Add SMS builder in `server/sms.ts`**

At the end of `server/sms.ts` (after line 168), append:

```ts
export function buildSubmissionReceivedMessage(
  serviceOrder: string,
  warrantyType?: string,
  requestType?: string
): string {
  const wt = (warrantyType || "").toLowerCase();
  const isExternal = wt === "american_home_shield" || wt === "first_american";
  const isNla = requestType === "parts_nla";

  let waitCopy: string;
  if (isNla) {
    waitCopy =
      "NLA requests are researched by the VRS parts team. You will be contacted with sourcing details — typical turnaround is 1–2 business days.";
  } else if (isExternal) {
    waitCopy =
      "This is a Sears Protect external-warranty request (AHS / First American). Approvals require a provider callback and can take longer than standard Sears Protect tickets. Please remain at the site until you receive the approval/rejection text.";
  } else {
    waitCopy =
      "A VRS agent will review your request shortly. Standard turnaround is a few minutes during business hours. Please remain at the site until you receive the approval/rejection text.";
  }

  return `VRS Submission received for SO#${serviceOrder}\n\n${waitCopy}\n\nYou will receive a follow-up text when the decision is made.`;
}
```

- [ ] **2.2 — Call it from the submission-create endpoint**

In `server/routes.ts`, find the `POST /api/submissions` handler. After the submission record is created and before the WebSocket broadcast, add a non-blocking SMS send. Example (adjust to actual handler location — grep for `app.post("/api/submissions"`):

```ts
// After: const created = await storage.createSubmission(...);
try {
  const phone = created.phoneOverride || created.phone;
  if (phone) {
    const body = buildSubmissionReceivedMessage(
      created.serviceOrder,
      created.warrantyType,
      created.requestType,
    );
    await sendSms(created.id, phone, "submission_received", body);
  }
} catch (err) {
  console.error("[SMS] submission_received failed:", err);
}
```

Ensure `buildSubmissionReceivedMessage` is imported at the top of `routes.ts` alongside the existing sms imports.

- [ ] **2.3 — Add Help Center FAQ**

In `client/src/pages/help-center.tsx`, inside the `faqItems` array (line 69), replace the existing "How long does approval usually take?" item (line 75–78) with the expanded version:

```ts
{
  title: "How long does approval usually take?",
  content:
    "Wait time depends on the warranty provider.\n\n• Sears Protect / Sears PA / Sears Home Warranty (Cinch): typically 2–15 minutes during business hours.\n• American Home Shield and First American: these require VRS to call the provider for approval, which can take significantly longer — sometimes over an hour depending on their hold times. Plan to stay at the site until you receive the decision text.\n• NLA Parts requests: researched by the VRS parts team — typical turnaround is 1–2 business days.\n\nYou can check the availability banner on your home screen to see how many agents are online and how many tickets are in the queue. If your submission has been pending for an extended period, check with your supervisor.",
},
```

- [ ] **2.4 — Verify**

```bash
npm run check
```

Then `npm run dev` and submit a new ticket. Confirm (a) the console logs the `[SMS MOCK]` (or real Twilio send) of the `submission_received` body, (b) the Help Center FAQ under "FAQs" tab shows the new wait-time guidance.

- [ ] **2.5 — Commit**

```bash
git add server/sms.ts server/routes.ts client/src/pages/help-center.tsx CHANGELOG.md .claude/memory/
git commit -m "feat(sms,help): set wait-time expectations per warranty"
```

CHANGELOG entry:
```
### Added
- **"Submission received" SMS with wait-time context**: Sent to the technician immediately on submission creation. AHS/FA submissions get language about provider callbacks and extended wait times; NLA submissions get turnaround language; standard Sears Protect gets short-wait language. Help Center FAQ expanded with the same breakdown.
```

---

## Task 3 — Explicit Auth vs NLA routing guidance in-app

**Problem:** The Help Center touches on NLA routing but there is no inline guard when a tech selects an AHS/FA warranty with `parts_nla` or would benefit from routing to TechHub.

**Approach:** (a) When `requestType === "parts_nla"` AND `warrantyType` is AHS or First American, show a red banner that blocks-but-doesn't-hard-block submission and tells the tech to use TechHub. (b) Add a dedicated "Which pathway do I use?" Help Center topic.

**Files:**
- Modify: `client/src/pages/tech-submit.tsx` (warning banner)
- Modify: `client/src/pages/help-center.tsx` (new how-to item)

**Steps:**

- [ ] **3.1 — Add routing-warning banner in `tech-submit.tsx`**

In `tech-submit.tsx`, locate the existing NLA info banner around line 784 (the blue `nla-info-banner`). Directly after that closing `)}`, add:

```tsx
{watchedRequestType === "parts_nla" &&
  (watchedValues.warrantyType === "american_home_shield" ||
    watchedValues.warrantyType === "first_american") && (
  <div
    className="rounded-md border border-destructive bg-destructive/10 p-3"
    data-testid="banner-nla-wrong-warranty"
  >
    <div className="flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
      <div className="text-sm">
        <p className="font-medium text-destructive">Wrong pathway for AHS / First American</p>
        <p className="text-destructive/90 mt-0.5">
          NLA submissions in VRS are for Sears Protect / PA / Cinch only. For AHS or First American NLA situations, continue through TechHub. Switch the request type to "Authorization" if this is a coverage approval question.
        </p>
      </div>
    </div>
  </div>
)}
```

- [ ] **3.2 — Add Help Center how-to item**

In `help-center.tsx`, inside `howToGuidesItems` array (line 41), insert a new item immediately before the "Submitting an NLA Parts Request" entry:

```ts
{
  title: "Which pathway do I use? (Authorization vs NLA vs TechHub)",
  content:
    "Use the table below to decide where to submit.\n\n• Sears Protect / PA / Cinch — Authorization: submit in VRS.\n• Sears Protect / PA / Cinch — NLA: submit in VRS.\n• American Home Shield — Authorization: submit in VRS.\n• American Home Shield — NLA: handle through TechHub. VRS does not process AHS NLA.\n• First American — Authorization: submit in VRS.\n• First American — NLA: handle through TechHub. VRS does not process FA NLA.\n• B2B: handle through TechHub / call process. VRS does not process B2B tickets.\n\nIf you are not sure which pathway applies, check the TechHub work order — the warranty type is listed there.",
},
```

- [ ] **3.3 — Verify**

```bash
npm run check
```

Then `npm run dev`, log in as a technician, navigate to `/tech/submit`, pick `Parts — No Longer Available (NLA)`, then pick `American Home Shield` as the warranty. Confirm the red banner appears. Switch to Sears Protect and confirm it disappears. Check Help Center → How-To Guides for the new "Which pathway do I use?" entry.

- [ ] **3.4 — Commit**

```bash
git add client/src/pages/tech-submit.tsx client/src/pages/help-center.tsx CHANGELOG.md .claude/memory/
git commit -m "feat(submit,help): steer AHS/FA NLA and B2B to TechHub"
```

CHANGELOG entry:
```
### Added
- **Inline routing warning for AHS/FA NLA**: When a technician selects the NLA request type with an AHS or First American warranty, a red banner explains that VRS does not process AHS/FA NLA and points them to TechHub. Help Center also gained a "Which pathway do I use?" how-to covering the full Auth vs NLA vs TechHub decision grid, including B2B routing.
```

---

## Task 4 — Post-submission notes field

**Problem:** Once a ticket is submitted, the tech cannot add information (clarification, updated diagnosis, a new photo context note). They have to resubmit.

**Approach:** Add a new `submission_notes` table. Add `POST /api/submissions/:id/notes` (tech can add) and expose existing notes in `GET /api/submissions/:id` response. Show them in `submission-detail.tsx` with a text input + submit button at the bottom.

**Files:**
- Modify: `shared/schema.ts` (new table)
- Modify: `server/storage.ts` (CRUD methods)
- Modify: `server/routes.ts` (endpoint + attach notes to GET)
- Modify: `client/src/pages/submission-detail.tsx` (UI panel)

**Steps:**

- [ ] **4.1 — Add `submission_notes` table to `shared/schema.ts`**

Add below the SUBMISSIONS block (after line 159 `export type Submission = ...`), before the SMS NOTIFICATIONS block:

```ts
// ============================================================================
// SUBMISSION NOTES TABLE (technician follow-up notes after submission)
// ============================================================================
export const submissionNotes = pgTable("submission_notes", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id")
    .notNull()
    .references(() => submissions.id),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id),
  authorRole: text("author_role").notNull(), // 'technician', 'vrs_agent', 'admin'
  body: text("body").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const insertSubmissionNoteSchema = createInsertSchema(submissionNotes).omit({
  id: true,
  createdAt: true,
});

export type InsertSubmissionNote = z.infer<typeof insertSubmissionNoteSchema>;
export type SubmissionNote = typeof submissionNotes.$inferSelect;
```

- [ ] **4.2 — Push schema**

```bash
cd C:\Users\tyler\Documents\1Sears\VRS\VRS-Agent-Core
npm run db:push
```

Expected: drizzle-kit reports one new table added (no destructive changes). Confirm before applying.

- [ ] **4.3 — Add storage methods to `server/storage.ts`**

In the `IStorage` interface (around line 130 near feedback), add:

```ts
createSubmissionNote(data: InsertSubmissionNote): Promise<SubmissionNote>;
getSubmissionNotes(submissionId: number): Promise<(SubmissionNote & { authorName: string })[]>;
```

In `DatabaseStorage` class, add implementations (place near the feedback methods, around line 971):

```ts
async createSubmissionNote(data: InsertSubmissionNote): Promise<SubmissionNote> {
  const [note] = await db.insert(submissionNotes).values(data).returning();
  return note;
}

async getSubmissionNotes(
  submissionId: number
): Promise<(SubmissionNote & { authorName: string })[]> {
  const rows = await db
    .select({
      id: submissionNotes.id,
      submissionId: submissionNotes.submissionId,
      authorId: submissionNotes.authorId,
      authorRole: submissionNotes.authorRole,
      body: submissionNotes.body,
      createdAt: submissionNotes.createdAt,
      authorName: users.name,
    })
    .from(submissionNotes)
    .leftJoin(users, eq(submissionNotes.authorId, users.id))
    .where(eq(submissionNotes.submissionId, submissionId))
    .orderBy(submissionNotes.createdAt);
  return rows.map((r) => ({ ...r, authorName: r.authorName ?? "Unknown" }));
}
```

Ensure the imports at the top of `storage.ts` include `submissionNotes`, `InsertSubmissionNote`, and `SubmissionNote` from `@shared/schema`.

- [ ] **4.4 — Add API endpoints to `server/routes.ts`**

Near the submissions endpoints (grep `app.post("/api/submissions"` for a reference location), add:

```ts
app.post(
  "/api/submissions/:id/notes",
  authenticateToken,
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid submission ID" });
      const sub = await storage.getSubmission(id);
      if (!sub) return res.status(404).json({ error: "Submission not found" });

      const user = (req as any).user;
      if (user.role === "technician" && sub.technicianId !== user.id) {
        return res.status(403).json({ error: "Not your submission" });
      }

      const noteSchema = z.object({
        body: z.string().min(1, "Note cannot be empty").max(2000, "Note must be 2000 characters or less"),
      });
      const parsed = noteSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid note", details: parsed.error.flatten() });
      }

      const note = await storage.createSubmissionNote({
        submissionId: id,
        authorId: user.id,
        authorRole: user.role,
        body: parsed.data.body,
      });
      return res.status(201).json({ note });
    } catch (error) {
      console.error("Create submission note error:", error);
      return res.status(500).json({ error: "Failed to add note" });
    }
  }
);

app.get(
  "/api/submissions/:id/notes",
  authenticateToken,
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid submission ID" });
      const notes = await storage.getSubmissionNotes(id);
      return res.status(200).json({ notes });
    } catch (error) {
      console.error("Get submission notes error:", error);
      return res.status(500).json({ error: "Failed to get notes" });
    }
  }
);
```

- [ ] **4.5 — Add notes UI to `submission-detail.tsx`**

In `client/src/pages/submission-detail.tsx`, add a new query and panel. Near the top (after `historyQuery` around line 47), add:

```ts
const notesQuery = useQuery<{ notes: Array<{ id: number; body: string; authorName: string; authorRole: string; createdAt: string }> }>({
  queryKey: ["/api/submissions", id, "notes"],
  enabled: !!id,
});

const [noteDraft, setNoteDraft] = useState("");
const [postingNote, setPostingNote] = useState(false);

async function postNote() {
  if (!noteDraft.trim() || !id) return;
  setPostingNote(true);
  try {
    await apiRequest(`/api/submissions/${id}/notes`, {
      method: "POST",
      body: { body: noteDraft.trim() },
    });
    setNoteDraft("");
    await queryClient.invalidateQueries({ queryKey: ["/api/submissions", id, "notes"] });
    toast({ title: "Note added" });
  } catch (err: any) {
    toast({ title: "Failed to add note", description: String(err?.message || err), variant: "destructive" });
  } finally {
    setPostingNote(false);
  }
}
```

Add required imports at the top of the file:

```ts
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Textarea } from "@/components/ui/textarea";
```

Inside the main return (before the closing `</div>` of the detail container, after the existing history section), add:

```tsx
<Card className="mt-4" data-testid="card-submission-notes">
  <CardContent className="p-4 space-y-3">
    <h3 className="font-semibold flex items-center gap-2">
      <ScrollText className="w-4 h-4" /> Notes
    </h3>
    {notesQuery.data?.notes.length === 0 && (
      <p className="text-sm text-muted-foreground">No notes yet.</p>
    )}
    {notesQuery.data?.notes.map((n) => (
      <div key={n.id} className="rounded-md border p-2 text-sm" data-testid={`note-${n.id}`}>
        <div className="flex items-center justify-between">
          <span className="font-medium">{n.authorName}</span>
          <span className="text-xs text-muted-foreground">
            {formatDate(n.createdAt)}
          </span>
        </div>
        <div className="whitespace-pre-wrap mt-1">{n.body}</div>
      </div>
    ))}
    <div className="space-y-2">
      <Textarea
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        placeholder="Add a note — clarification, new info, updated diagnosis…"
        rows={3}
        maxLength={2000}
        data-testid="input-note-body"
      />
      <Button
        size="sm"
        onClick={postNote}
        disabled={!noteDraft.trim() || postingNote}
        data-testid="button-post-note"
      >
        {postingNote ? "Posting…" : "Add note"}
      </Button>
    </div>
  </CardContent>
</Card>
```

- [ ] **4.6 — Verify**

```bash
npm run check
npm run dev
```

In the browser, submit a ticket as a technician, open its detail page, and confirm: (a) empty-state "No notes yet" shows, (b) typing and clicking "Add note" creates a note that appears in the list, (c) refreshing the page shows persisted notes, (d) the note reflects the correct author name and timestamp.

- [ ] **4.7 — Commit**

```bash
git add shared/schema.ts server/storage.ts server/routes.ts client/src/pages/submission-detail.tsx CHANGELOG.md .claude/memory/
git commit -m "feat(submissions): add post-submission notes"
```

CHANGELOG entry:
```
### Added
- **Post-submission notes**: New `submission_notes` table + `POST|GET /api/submissions/:id/notes` endpoints. Technicians can add follow-up notes (clarification, updated diagnosis, additional context) from the submission detail page without creating a new ticket. Notes are scoped so a technician can only post to their own submissions; agents and admins can post without that restriction.
```

---

## Rollup Verification

After all four tasks land on the same branch, run once more:

- [ ] **R.1** — `npm run check` (no type errors)
- [ ] **R.2** — `npm run build` (clean production build)
- [ ] **R.3** — `npm run dev` smoke test: submit a ticket, confirm the received-SMS log, add a note, trigger an upload failure and retry, try NLA + AHS to see the warning banner.
- [ ] **R.4** — Update parent-folder `../../MEMORY.md` to move all four items from **Open Threads** → **Current State** and note the commit SHAs.
- [ ] **R.5** — Update the Reply email draft to reflect "all four items delivered" if Tyler still wants to send a follow-up.

## Self-Review Notes

- **Spec coverage:** Maps to the 4 remaining punch-list items verbatim (upload UI, wait-time messaging, Auth-vs-NLA guidance, post-submit notes). TechHub sync explicitly deferred. Every other pilot-feedback item was already implemented (verified 2026-04-23 audit).
- **Placeholder scan:** Each step shows the actual code to add/modify, not a description.
- **Type consistency:** `FailedUpload`, `buildSubmissionReceivedMessage`, `submissionNotes`, `createSubmissionNote`, `getSubmissionNotes`, and the endpoint paths are the same across every task that references them.
- **Risk:** Task 2's SMS send is fire-and-forget wrapped in try/catch so it cannot fail the submission create. Task 4's schema change is purely additive (new table, no renames or type changes) — Drizzle strict mode will not prompt about destructive changes.
