# Intake form + calculator manual smoke checklist

Run after every meaningful change to:
- `client/src/components/intake-form-fieldset.tsx`
- `client/src/components/intake-form-review-modal.tsx`
- `client/src/components/calculator-iframe.tsx`
- `client/src/components/calculator-settings-dialog.tsx`
- `client/src/lib/intake-form-config.ts`
- `client/src/pages/agent-dashboard.tsx` (right-panel + resolution-panel sections)
- `server/services/smartsheet.ts`
- `server/services/crypto.ts`
- `server/routes.ts` (intake form / credentials / claim gate routes)

## Pre-flight (env)

- [ ] `npm run check` is clean
- [ ] `npx tsx scripts/test-intake-url.ts` exits 0
- [ ] `npm run db:push` has been run (Tyler) and the new `intake_forms` + `agent_external_credentials` tables exist
- [ ] At least one queued non-NLA submission with a valid Proc ID is available for testing (THM* for SHW, SPR* for SPHW)

## Right panel — tab switcher

- [ ] Open agent dashboard, claim a non-NLA ticket — right panel shows the **Service Order History** tab by default
- [ ] Click the **Calculator** tab — calculator iframe loads, no console errors
- [ ] Reload the page — selected tab is restored from localStorage
- [ ] `button-show-shsai` and `button-hide-shsai` test IDs still exist (search the DOM)
- [ ] Hide the right panel via `button-hide-shsai`, then reveal — tab selection persists

## Resolution-panel intake fieldset

- [ ] Open a SHW (THM*) submission — the Smartsheet Intake card shows **SHW** badge with verified description
- [ ] Pick `Un-economical to Repair` — the calculated-amount field appears
- [ ] Pick another reason — calculated-amount field disappears
- [ ] Open a SPHW (SPR*/SPRC*) submission — branch shows **SPHW**, all 6 base fields render
- [ ] Tick `Pre-Existing Condition SPHW = Yes` — comments field appears, marked required
- [ ] Open an AHS (AHS*/FAA*) submission — branch shows **AHS · INCOMPLETE** banner
- [ ] Open a submission with no Proc ID match — branch shows **INVALID · INCOMPLETE** banner, no fields
- [ ] Required-field count chip updates as you fill fields

## Intake review modal

- [ ] Click an "Open intake form" / "Submit intake" trigger — modal opens with iframe loaded
- [ ] Iframe URL params include `VRS%20Tech%20ID`, `IH%20Service%20Order%20Number`, etc.
- [ ] Click **Open in new tab** — opens the same Smartsheet URL in a new tab
- [ ] Click **Cancel** — modal closes without creating an intake_forms row (verify in DB)
- [ ] Submit the Smartsheet form inside the iframe (use a test sheet if available), then click **I submitted Smartsheet**
- [ ] Toast confirms intake recorded. Check DB: `SELECT * FROM intake_forms ORDER BY id DESC LIMIT 1;`

## Server-side claim gate

- [ ] Process a non-NLA submission (approve / reject / invalid) WITHOUT confirming intake
- [ ] Try to claim a new queued ticket — receive a toast / 409 with `code: "INTAKE_REQUIRED"` and the modal auto-opens for the blocking submission
- [ ] Confirm intake — gate releases, claiming the next ticket succeeds
- [ ] Process an NLA (`parts_nla`) submission — claim gate does NOT trigger (NLA is excluded from the gate)

## Calculator credentials & auto-login

- [ ] Open the Calculator tab on a fresh agent account — banner shows "No saved credentials"
- [ ] Click **Settings** (or open via sidebar) — the dialog opens
- [ ] Save username `mthoma2` + dummy password — toast confirms, status banner shows the username
- [ ] Reopen settings — banner says "Currently saved as mthoma2"
- [ ] Verify in DB: `SELECT id, user_id, service, username_hint, length(password_cipher) FROM agent_external_credentials;` — only ciphertext + auth tag visible, no plaintext anywhere
- [ ] Click **Remove** — toast confirms, status banner returns to "No saved credentials"
- [ ] Re-save and switch back to Calculator tab — `Auto-login as mthoma2` banner appears
- [ ] Network tab: confirm `/api/agent/credentials/calculator/reveal` returns the cleartext only over HTTPS
- [ ] Manual paste from the **Copy username** / **Copy password** buttons works

## Negative tests

- [ ] `npx tsx scripts/test-intake-url.ts` is committed as part of the test plan and passes
- [ ] Tampering with `auth_tag` directly in DB then reloading the calculator iframe -> reveal endpoint returns a 500 (not the cleartext)
- [ ] DELETE `/api/agent/credentials/calculator` for a user who never saved any returns `{ ok: true }` without error
- [ ] POST `/api/submissions/:id/intake-form/preview` for someone else's submission (when not admin) returns 403
- [ ] POST `/api/submissions/:id/intake-form/confirm` twice for the same submission returns 409 (one row only)

## Observability

- [ ] Browser console clean during all flows (no React warnings, no postMessage cross-origin errors logged as ERROR)
- [ ] Server logs do NOT contain plaintext credentials or pre-fill payload values
