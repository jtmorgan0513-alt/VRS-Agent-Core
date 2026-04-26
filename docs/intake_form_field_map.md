# Smartsheet "VRS Unrep Intake Form 2.0" — Field Map

> Source: Live Smartsheet form walk on 2026-04-25 by Tyler (verified via Playwright).
> Form ID: `aa5f07c589b64ae993f5f75e20f71d5f`
> Form URL: `https://app.smartsheet.com/b/form/aa5f07c589b64ae993f5f75e20f71d5f`
>
> This is the contract for the agent-side intake-form panel and the Smartsheet pre-fill URL builder.
> If the Smartsheet form is edited, this map MUST be regenerated and Task 3's `client/src/lib/intake-form-config.ts` updated to match.

---

## Always-visible fields (5, all required, in display order)

| # | Smartsheet Label                | Type                          | Required | Conditional on | VRS source                                 |
|---|---------------------------------|-------------------------------|----------|----------------|--------------------------------------------|
| 1 | `VRS Tech ID`                   | combobox / dropdown (LDAP)    | yes      | always         | `submissions.technicianLdapId` (uppercase) |
| 2 | `IH Unit Number`                | combobox / dropdown           | yes      | always         | `technicians.techUnNo`                     |
| 3 | `IH Service Order Number`       | text input                    | yes      | always         | `submissions.serviceOrder` (no hyphen)     |
| 4 | `Servicer Type`                 | radio                         | yes      | always         | new agent input (default `W2-In Home Field Tech` for current pilot) |
| 5 | `Proc ID/Third Part ID`         | combobox / dropdown (~80+)    | yes      | always         | `submissions.procId` + lookup label        |

`Servicer Type` options: `W2-In Home Field Tech` | `1099-ISP Contractor`
**Pilot is W2-only** — 1099-ISP branch NOT WALKED, see "Branches NOT WALKED" below.

`IH Service Order Number` helper text: *"Please Copy and Paste from Service Pro or WOM"*

---

## Proc ID prefix → branch routing

| Prefix family | Examples                                                 | Warranty / Program           | Branch    |
|---------------|----------------------------------------------------------|------------------------------|-----------|
| `AHS*`        | AHS000, AHS00P, AHS100, AHS2OP, AHS888, AHSC00, AHSF00, AHSNLA | American Home Shield         | **AHS**   |
| `AHT*`        | (treat same as AHS family)                               | AHS-related                  | **AHS**   |
| `FAA*`        | FAA01A, FAA03R                                           | First American               | **AHS** (verified — uses identical "Reason for calling the VRS Hotline AHS" field as AHS proc IDs) |
| `SPR*` / `SPRC*` | SPRCLL, SPRC00, SPRCLH, SPHT75                       | Sears Protect Home Warranty (PA / SPHW) | **SPHW** (verified for SPRCLL; **presumed identical** for other SPR\* — re-walk in follow-up) |
| `SRW*`        | SRW000, SRW001                                           | Kenmore-IW                   | **SRW** (NOT WALKED — likely SPHW or its own branch) |
| `THM*`        | THM302, THMH00, THMH01, THMH02, THMHV1, THMPM1, THMR01   | Sears Home Warranty          | **SHW**   |
| any (with `1099-ISP Contractor` Servicer Type) | —                                       | Independent Service Provider | **ISP** (NOT WALKED) |
| Invalid Proc ID | (no match in form's dropdown)                          | —                            | **INVALID** (NOT WALKED) |

> Note: there may be a distinct "Reason for Calling PA/SPHW" dropdown for Sears PA-specific proc IDs that differs from SPHW. The 2026-04-25 walk selected SPRCLL specifically and got the SPHW field set. Until a Sears PA-specific proc ID is walked separately, treat **all SPR\* / SPRC\* as SPHW branch**.

---

## SHW branch (THM\* prefix) — VERIFIED

| Smartsheet Label                                  | Type                  | Required | Conditional on (within branch)              | VRS source / value space |
|---------------------------------------------------|-----------------------|----------|----------------------------------------------|--------------------------|
| `Reason for Calling VRS Hotline SHW`              | radio                 | yes      | branch=SHW                                   | new agent input — see options |
| `SHW Uneconomical to Repair Calculated Amount`    | number / currency     | yes      | Reason = `Un-economical to Repair`           | new agent input (calculator-derived dollar amount) |
| `SHW W2 or 1099 Contractor`                       | radio                 | yes      | branch=SHW                                   | options: `W2` / `1099 Contractor` (default `W2`) |
| `Appliance Type`                                  | dropdown              | yes      | branch=SHW                                   | mapped from `submissions.applianceType` |
| `Tech Cell Phone Number`                          | text / phone          | yes      | branch=SHW                                   | `submissions.phoneOverride` ?? `submissions.phone` |

`Reason for Calling VRS Hotline SHW` options (radio):
- `Un-economical to Repair`
- `Un-repairable Sealed System`
- `Un-Repairable Structural`
- `Un-repairable Electrical`
- `Customer Abuse/Neglect Not Covered.`
- `Other-Invalid Review Request`

Helper text on the Reason field: *"Use Online Repair/Replace Calculator-"* with link `https://repairreplacecalculator.replit.app/`.

---

## SPHW branch (SPR\*/SPRC\* prefix) — VERIFIED for SPRCLL

| Smartsheet Label                                       | Type                  | Required | Conditional on (within branch)                                    | VRS source / value space |
|--------------------------------------------------------|-----------------------|----------|--------------------------------------------------------------------|--------------------------|
| `SPHW Active Date`                                     | date `mm/dd/yyyy`     | yes      | branch=SPHW                                                        | new agent input |
| `SPHW Days Active`                                     | radio                 | yes      | branch=SPHW                                                        | new agent input — see options |
| `Pre-Existing Condition SPHW`                          | radio                 | yes      | branch=SPHW                                                        | options: `Yes` / `No` |
| `Pre-existing Issue Comments SPHW`                     | text                  | yes      | `Pre-Existing Condition SPHW = Yes`                                | new agent input |
| `File Upload`                                          | file drop zone        | no       | shown when `Days Active = Greater than 61 Days` OR `Pre-Existing = Yes` (combination not fully nailed down) | optional file uploads (photos illustrating pre-existing or abuse claims) |
| `VRS Tech Repair/Replacement Review Decision`          | radio                 | yes      | branch=SPHW                                                        | options below |
| `Comments to support repair or replace decision`       | text                  | yes      | branch=SPHW                                                        | auto-paste from agent's existing notes field |

`SPHW Days Active` options:
- `Less than 14 Days`
- `15-30 Days`
- `31-60 Days`
- `Greater than 61 Days`

Helper texts:
- `SPHW Active Date`: *"Look up on SPHW Member Data Excel File"*
- `SPHW Days Active`: *"Lookup on SPHW Member Data File and Approximate"* (link `https://routing.uat.tellurideplatform.com/`)
- `Pre-Existing Condition SPHW`: *"Is the current failure the result of a condition that existed prior to the active date of the SPHW?"*
- `File Upload`: *"Add Pictures to Illustrate Pre Existing or Abuse Neglect Claims"*

`VRS Tech Repair/Replacement Review Decision` options (radio):
- `Repair Product`
- `Product Placed in Replacement Review`
- `Repair/Replacement Not Covered`

---

## AHS branch (AHS\*/AHT\*/FAA\* prefix) — INCOMPLETE

| Smartsheet Label                                  | Type     | Required | Conditional on  | Status |
|---------------------------------------------------|----------|----------|------------------|--------|
| `Reason for calling the VRS Hotline AHS`          | dropdown | yes      | branch=AHS       | **OPTIONS NOT FULLY ENUMERATED.** Helper text includes calculator link. Likely cascades into more conditional fields similar to SHW. |
| _(downstream conditional fields)_                 | _various_ | _various_ | _various_       | **NOT WALKED.** Stub in resolution-panel form: collect "Reason for calling" only, then let the agent finish the rest of the AHS conditional fields manually inside the iframe. |

---

## Branches NOT WALKED (treat as INCOMPLETE)

These branches must be enriched in a follow-up Playwright walk before the resolution-panel form can hard-block-validate them:

- **AHS branch downstream fields** — `Reason for calling the VRS Hotline AHS` is verified to exist; its option list and any cascading conditional fields are not captured.
- **SRW branch** (Kenmore-IW, `SRW*` prefix) — branch identity unconfirmed; may share SPHW or be its own.
- **ISP branch** (`Servicer Type = 1099-ISP Contractor`) — proposal scope is W2-only for Phase 1, ISP fields not captured.
- **INVALID branch** (Proc ID not in form's dropdown / "Other-Invalid Review Request" reasons) — not walked.

For NOT-WALKED branches the resolution-panel form will:
1. Collect only the always-visible fields (5) plus any verified branch-1 field.
2. NOT block on missing conditional fields.
3. Open the live Smartsheet iframe pre-filled with what we know and let the agent fill the rest manually.
4. Still create the `intake_forms` row when the agent confirms Smartsheet submission, so the claim gate releases.

---

## URL pre-fill encoding

Smartsheet pre-fill works via column-label query params on the form URL, URL-encoded. Verified live 2026-04-25 — `?IH Service Order Number=1234-56789012` populates the corresponding input.

**Pattern:**
```
https://app.smartsheet.com/b/form/aa5f07c589b64ae993f5f75e20f71d5f
  ?VRS%20Tech%20ID=COZAKIG
  &IH%20Unit%20Number=7108
  &IH%20Service%20Order%20Number=12345678
  &Servicer%20Type=W2-In%20Home%20Field%20Tech
  &Proc%20ID%2FThird%20Part%20ID=SPRCLL-Sears%20Protect%20Home%20Warranty
  &SPHW%20Active%20Date=01%2F15%2F2026
  &Pre-Existing%20Condition%20SPHW=No
  ...
```

Encoding rules:
- `encodeURIComponent` on every value
- spaces → `%20`
- `/` in column labels (e.g. `Proc ID/Third Part ID`) → `%2F`
- date values: `MM/DD/YYYY` → `%2F`-encoded slashes
- radio / dropdown values: pass the **option label exactly as displayed** (case- and punctuation-sensitive)
- `Proc ID/Third Part ID` value format: `<PROC_ID>-<DESCRIPTION>` (e.g. `SPRCLL-Sears Protect Home Warranty`) — Smartsheet matches the dropdown option by full label

---

## Service order encoding caveat

VRS stores `serviceOrder` as `DDDD-SSSSSSSS` (district-hyphen-order, e.g. `1234-56789012`). The Smartsheet form's `IH Service Order Number` field accepts the value as-is when pasted (helper text confirms "Copy and Paste from Service Pro or WOM"). The `?IH Service Order Number=1234-56789012` format with the hyphen has been verified to populate the field. Pre-fill builder passes the value unmodified.

---

## Out-of-scope notes

- **Calculator URL pre-fill (`?username=&password=`)**: ❌ verified non-functional — the Streamlit calc author did not wire URL-param auth. See D3=(b) `agent_external_credentials` table + postMessage injection for the workaround.
- **`Send me a copy of my responses` checkbox**: present at the bottom of the form, optional, NOT pre-filled by VRS.
