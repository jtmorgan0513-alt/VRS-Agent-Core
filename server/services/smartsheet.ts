// =============================================================================
// Smartsheet pre-fill URL builder for "VRS Unrep Intake Form 2.0"
// =============================================================================
// See docs/intake_form_field_map.md for the verified field map and branch
// logic. This module is the single source of truth for how VRS converts a
// (submission, agent-supplied form payload) tuple into a pre-filled Smartsheet
// URL that the agent can review-and-submit inside an iframe.
//
// The form ID is hardcoded here because it is hardcoded in the Smartsheet
// product. If Smartsheet ever rotates the form, replace this constant and
// re-walk the field map.
// =============================================================================

import type { Submission } from "@shared/schema";

export const VRS_INTAKE_FORM_ID = "aa5f07c589b64ae993f5f75e20f71d5f";
export const VRS_INTAKE_FORM_BASE = `https://app.smartsheet.com/b/form/${VRS_INTAKE_FORM_ID}`;

// Map of VRS appliance keys -> the dropdown labels Smartsheet expects.
const APPLIANCE_TO_SMARTSHEET: Record<string, string> = {
  refrigeration: "Refrigerator",
  laundry: "Laundry",
  cooking: "Cooking",
  dishwasher: "Dishwasher / Compactor",
  microwave: "Microwave",
  hvac: "HVAC",
  all_other: "All Other",
};

// Lookup map: Proc ID prefix family -> { branch, optionLabel-builder }.
// For "Proc ID/Third Part ID" the dropdown option label format observed live
// is `<PROC_ID>-<DESCRIPTION>` (e.g. "SPRCLL-Sears Protect Home Warranty").
// The descriptions below mirror the live form's exact strings.
const PROC_ID_LABEL: Record<string, string> = {
  AHS000: "AHS000-American Home Shield",
  AHS00P: "AHS00P-American Home Shield",
  AHS100: "AHS100-American Home Shield",
  AHS2OP: "AHS2OP-American Home Shield",
  AHS888: "AHS888-American Home Shield",
  AHSC00: "AHSC00-American Home Shield",
  AHSF00: "AHSF00-American Home Shield",
  AHSNLA: "AHSNLA-American Home Shield",
  FAA01A: "FAA01A-First American",
  FAA03R: "FAA03R-First American",
  SPRCLL: "SPRCLL-Sears Protect Home Warranty",
  SPRC00: "SPRC00-Sears Protect Home Warranty",
  SPRCLH: "SPRCLH-Sears Protect Home Warranty",
  SPHT75: "SPHT75-Sears Protect Home Warranty",
  SRW000: "SRW000-Kenmore-IW",
  SRW001: "SRW001-Kenmore-IW",
  THM302: "THM302-Sears Home Warranty",
  THMH00: "THMH00-Sears Home Warranty",
  THMH01: "THMH01-Sears Home Warranty",
  THMH02: "THMH02-Sears Home Warranty",
  THMHV1: "THMHV1-Sears Home Warranty",
  THMPM1: "THMPM1-Sears Home Warranty",
  THMR01: "THMR01-Sears Home Warranty",
};

export type IntakeBranch = "AHS" | "SPHW" | "SHW" | "SRW" | "ISP" | "INVALID";

export function detectBranch(procId: string | null | undefined): IntakeBranch {
  if (!procId) return "INVALID";
  const p = procId.toUpperCase();
  if (p.startsWith("AHS") || p.startsWith("AHT") || p.startsWith("FAA")) return "AHS";
  if (p.startsWith("SPRC") || p.startsWith("SPR") || p.startsWith("SPH")) return "SPHW";
  if (p.startsWith("THM")) return "SHW";
  if (p.startsWith("SRW")) return "SRW";
  return "INVALID";
}

export function lookupProcIdLabel(procId: string | null | undefined): string | undefined {
  if (!procId) return undefined;
  return PROC_ID_LABEL[procId.toUpperCase()];
}

export function applianceTypeToSmartsheet(applianceType: string | null | undefined): string | undefined {
  if (!applianceType) return undefined;
  return APPLIANCE_TO_SMARTSHEET[applianceType];
}

// Canonical column-label keys recognised by `buildIntakeFormUrl`. Anything not
// in this list is silently dropped by the URL builder so that bogus payloads
// can't smuggle arbitrary query params into Smartsheet.
export const ALLOWED_COLUMN_LABELS: readonly string[] = [
  // Always-visible
  "VRS Tech ID",
  "IH Unit Number",
  "IH Service Order Number",
  "Servicer Type",
  "Proc ID/Third Part ID",
  // SHW branch
  "Reason for Calling VRS Hotline SHW",
  "SHW Uneconomical to Repair Calculated Amount",
  "SHW W2 or 1099 Contractor",
  "Appliance Type",
  "Tech Cell Phone Number",
  // SPHW branch
  "SPHW Active Date",
  "SPHW Days Active",
  "Pre-Existing Condition SPHW",
  "Pre-existing Issue Comments SPHW",
  "VRS Tech Repair/Replacement Review Decision",
  "Comments to support repair or replace decision",
  // AHS branch (verified field only — downstream not walked)
  "Reason for calling the VRS Hotline AHS",
];

const ALLOWED_SET = new Set(ALLOWED_COLUMN_LABELS);

export interface BuildIntakeFormUrlInput {
  submission: Pick<
    Submission,
    | "serviceOrder"
    | "technicianLdapId"
    | "procId"
    | "applianceType"
    | "phone"
    | "phoneOverride"
    | "estimateAmount"
    | "agentNotes"
    | "requestType"
    | "issueDescription"
  > & { ihUnitNumber?: string | null };
  /** Agent-supplied conditional fields, keyed by Smartsheet column label. */
  payload: Record<string, string | number | undefined | null>;
}

export interface BuildIntakeFormUrlResult {
  url: string;
  /** Resolved param map (post-defaulting, post-allow-list filtering). */
  params: Record<string, string>;
  /**
   * Subset of `params` that came from server-side derivation (not from the
   * agent payload). Used by the client to seed the fallback fieldset state
   * so an agent who closes the auto-opened modal sees the same pre-fill
   * when re-opening. Strictly an additive surface — does not affect URL.
   */
  derivedDefaults: Record<string, string>;
  branch: IntakeBranch;
  warnings: string[];
}

/**
 * Builds a Smartsheet pre-fill URL for the VRS Unrep Intake Form 2.0.
 *
 * The 5 always-visible fields are auto-populated from the submission row when
 * the agent didn't override them in `payload`. Branch-conditional fields are
 * passed through from `payload` after allow-list filtering.
 */
export function buildIntakeFormUrl(
  input: BuildIntakeFormUrlInput
): BuildIntakeFormUrlResult {
  const { submission, payload } = input;
  const branch = detectBranch(submission.procId);
  const warnings: string[] = [];

  // Strip "1234-" district prefix when present? Tyler verified the live form
  // accepts the value as-is (helper text says "Copy and Paste from Service
  // Pro or WOM"), so we pass it unmodified.
  const serviceOrder = submission.serviceOrder ?? "";

  // Tyler 2026-04-26 (post-audit fix): the live Smartsheet dropdown has
  // ~80+ options; PROC_ID_LABEL only enumerates 23 of them. Filtering the
  // ticket's procId through that subset caused real Snowflake-sourced
  // values (e.g. AHSCLL) to be silently dropped from the prefill, leaving
  // the required dropdown blank for the agent every time.
  //
  // The procId comes from the real service order (Snowflake CMB_THD_PTY_ID)
  // — by definition a value Smartsheet's own data accepts. We pass it
  // through verbatim and only prefer the richer label when our hand-curated
  // table happens to know one. PROC_ID_LABEL / lookupProcIdLabel stay in
  // the file (still used for branch-routing nuance, future label
  // enrichment, and existing call sites).
  const procIdLabel = lookupProcIdLabel(submission.procId);
  const procIdValue = procIdLabel ?? (submission.procId || undefined);

  const applianceLabel = applianceTypeToSmartsheet(submission.applianceType);

  // Always-visible defaults — agent-provided value in payload wins.
  const defaults: Record<string, string | undefined> = {
    "VRS Tech ID": (submission.technicianLdapId || "").toUpperCase() || undefined,
    "IH Unit Number": submission.ihUnitNumber || undefined,
    "IH Service Order Number": serviceOrder || undefined,
    "Servicer Type": "W2-In Home Field Tech", // Phase 1 = W2 only
    "Proc ID/Third Part ID": procIdValue,
  };

  // Branch-defaults (only for verified fields where the answer is mechanically
  // determined by the submission row; everything else must come from payload).
  if (branch === "SHW") {
    if (applianceLabel) defaults["Appliance Type"] = applianceLabel;
    const phone = submission.phoneOverride || submission.phone;
    if (phone) defaults["Tech Cell Phone Number"] = phone;
    defaults["SHW W2 or 1099 Contractor"] = "W2";

    // Tyler 2026-04-26 (D4 max-derivation): pre-select the dominant SHW
    // reason. Agent overrides in the modal if the situation differs.
    //   - authorization (most common) → "Un-economical to Repair"
    //   - infestation_non_accessible  → "Customer Abuse/Neglect Not Covered."
    //   - parts_nla                   → "Un-Repairable Sealed System"
    if (submission.requestType === "authorization") {
      defaults["Reason for Calling VRS Hotline SHW"] = "Un-economical to Repair";
    } else if (submission.requestType === "infestation_non_accessible") {
      defaults["Reason for Calling VRS Hotline SHW"] = "Customer Abuse/Neglect Not Covered.";
    } else if (submission.requestType === "parts_nla") {
      defaults["Reason for Calling VRS Hotline SHW"] = "Un-Repairable Sealed System";
    }

    // Pre-fill the calculator amount from the technician's estimate when
    // the dominant "Un-economical to Repair" reason is selected. The
    // showWhen predicate on the client mirrors this so the field renders.
    if (submission.estimateAmount && submission.requestType === "authorization") {
      const cleaned = String(submission.estimateAmount).replace(/[^0-9.]/g, "");
      if (cleaned) defaults["SHW Uneconomical to Repair Calculated Amount"] = cleaned;
    }
  }

  if (branch === "SPHW") {
    // Default decision: post-Authorize means we approved a repair; agent
    // overrides to "Product Placed in Replacement Review" if appropriate.
    defaults["VRS Tech Repair/Replacement Review Decision"] = "Repair Product";
    // Pre-existing condition default — vast majority is "No". Agent
    // overrides if the field tech flagged it during the call.
    defaults["Pre-Existing Condition SPHW"] = "No";
    // Fulfill the existing "Auto-pasted from your agent notes" promise on
    // the client config — the textarea was previously labeled but unfilled.
    if (submission.agentNotes) {
      defaults["Comments to support repair or replace decision"] = submission.agentNotes;
    }
  }

  if (branch === "AHS") {
    // AHS branch downstream is not walked, but pre-fill the free-text
    // reason starter from the issue description so the agent has something
    // to edit instead of a blank field. Truncated to keep the URL sane.
    if (submission.issueDescription) {
      defaults["Reason for calling the VRS Hotline AHS"] =
        submission.issueDescription.length > 200
          ? submission.issueDescription.slice(0, 197) + "..."
          : submission.issueDescription;
    }
  }

  // Merge: payload overrides defaults, allow-list filters out unknown keys.
  // Track which keys came from defaults so we can emit derivedDefaults for
  // the client to seed its fallback fieldset.
  const merged: Record<string, string> = {};
  const derivedDefaults: Record<string, string> = {};
  for (const key of ALLOWED_COLUMN_LABELS) {
    const overridden = payload[key];
    const fallback = defaults[key];
    let value: string | undefined;
    let fromDefault = false;
    if (overridden !== undefined && overridden !== null && overridden !== "") {
      value = String(overridden);
    } else if (fallback !== undefined && fallback !== "") {
      value = fallback;
      fromDefault = true;
    }
    if (value !== undefined && value !== "") {
      merged[key] = value;
      if (fromDefault) derivedDefaults[key] = value;
    }
  }

  // Drop any payload keys not on the allow-list (silently — log warning).
  for (const key of Object.keys(payload)) {
    if (!ALLOWED_SET.has(key)) {
      warnings.push(`Unknown column "${key}" was dropped from the pre-fill URL.`);
    }
  }

  const qs = Object.entries(merged)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const url = qs ? `${VRS_INTAKE_FORM_BASE}?${qs}` : VRS_INTAKE_FORM_BASE;

  return { url, params: merged, derivedDefaults, branch, warnings };
}
