// =============================================================================
// Intake-form field config — drives <IntakeFormFieldset>.
// =============================================================================
// Mirrors docs/intake_form_field_map.md. When the Smartsheet form changes,
// Tyler must:
//   1. Re-run the Playwright walk and regenerate docs/intake_form_field_map.md
//   2. Update this file to match
//   3. Update server/services/smartsheet.ts ALLOWED_COLUMN_LABELS to match
// =============================================================================

export type IntakeBranch = "AHS" | "SPHW" | "SHW" | "SRW" | "ISP" | "INVALID";

export type FieldType =
  | "radio"
  | "select"
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "date"
  | "phone";

export interface IntakeFieldConfig {
  /** Smartsheet column label — used as the URL pre-fill query param key. */
  key: string;
  /** Label shown to the agent in VRS. */
  label: string;
  type: FieldType;
  required: boolean;
  /** When set, the field renders only if this predicate over the current
   *  payload returns true (e.g. depends on another radio choice). */
  showWhen?: (values: Record<string, string>) => boolean;
  /** Options for radio/select. */
  options?: { value: string; label: string }[];
  /** Helper text shown under the field. */
  helper?: string;
  /** Placeholder for text-like inputs. */
  placeholder?: string;
}

export interface IntakeBranchConfig {
  branch: IntakeBranch;
  /** Banner text shown when this branch is detected. */
  description: string;
  /** Whether this branch is fully verified — used to relax hard-block
   *  validation for NOT_WALKED branches (AHS downstream / SRW / ISP / INVALID). */
  verified: boolean;
  fields: IntakeFieldConfig[];
}

// ---------------------------------------------------------------------------
// SHW branch (THM* prefix) — VERIFIED
// ---------------------------------------------------------------------------
const SHW_REASONS = [
  "Un-economical to Repair",
  "Un-repairable Sealed System",
  "Un-Repairable Structural",
  "Un-repairable Electrical",
  "Customer Abuse/Neglect Not Covered.",
  "Other-Invalid Review Request",
];

const SHW: IntakeBranchConfig = {
  branch: "SHW",
  description: "Sears Home Warranty (THM* Proc ID).",
  verified: true,
  fields: [
    {
      key: "Reason for Calling VRS Hotline SHW",
      label: "Reason for calling VRS Hotline (SHW)",
      type: "radio",
      required: true,
      options: SHW_REASONS.map((r) => ({ value: r, label: r })),
      helper: "Use the Online Repair/Replace Calculator if needed.",
    },
    {
      key: "SHW Uneconomical to Repair Calculated Amount",
      label: "Uneconomical to Repair — calculator amount ($)",
      type: "currency",
      required: true,
      showWhen: (v) =>
        v["Reason for Calling VRS Hotline SHW"] === "Un-economical to Repair",
      placeholder: "e.g. 1234.56",
    },
    {
      key: "SHW W2 or 1099 Contractor",
      label: "W2 or 1099 contractor",
      type: "radio",
      required: true,
      options: [
        { value: "W2", label: "W2" },
        { value: "1099 Contractor", label: "1099 Contractor" },
      ],
    },
    {
      key: "Appliance Type",
      label: "Appliance type",
      type: "select",
      required: true,
      options: [
        { value: "Refrigerator", label: "Refrigerator" },
        { value: "Laundry", label: "Laundry" },
        { value: "Cooking", label: "Cooking" },
        { value: "Dishwasher / Compactor", label: "Dishwasher / Compactor" },
        { value: "Microwave", label: "Microwave" },
        { value: "HVAC", label: "HVAC" },
        { value: "All Other", label: "All Other" },
      ],
      helper: "Auto-detected from VRS — override only if wrong.",
    },
    {
      key: "Tech Cell Phone Number",
      label: "Tech cell phone number",
      type: "phone",
      required: true,
      placeholder: "555-555-5555",
      helper: "Auto-pulled from the technician profile — override if needed.",
    },
  ],
};

// ---------------------------------------------------------------------------
// SPHW branch (SPR* / SPRC* prefix) — VERIFIED for SPRCLL
// ---------------------------------------------------------------------------
const SPHW_DAYS_OPTIONS = [
  "Less than 14 Days",
  "15-30 Days",
  "31-60 Days",
  "Greater than 61 Days",
];

const SPHW_DECISION_OPTIONS = [
  "Repair Product",
  "Product Placed in Replacement Review",
  "Repair/Replacement Not Covered",
];

const SPHW: IntakeBranchConfig = {
  branch: "SPHW",
  description: "Sears Protect Home Warranty (SPR* / SPRC* Proc ID).",
  verified: true,
  fields: [
    {
      key: "SPHW Active Date",
      label: "SPHW Active Date",
      type: "date",
      required: true,
      helper: "Look up on SPHW Member Data Excel File.",
    },
    {
      key: "SPHW Days Active",
      label: "SPHW Days Active",
      type: "radio",
      required: true,
      options: SPHW_DAYS_OPTIONS.map((d) => ({ value: d, label: d })),
      helper: "Lookup on SPHW Member Data File and approximate.",
    },
    {
      key: "Pre-Existing Condition SPHW",
      label: "Is the failure a pre-existing condition?",
      type: "radio",
      required: true,
      options: [
        { value: "Yes", label: "Yes" },
        { value: "No", label: "No" },
      ],
      helper:
        "Is the current failure the result of a condition that existed prior to the active date of the SPHW?",
    },
    {
      key: "Pre-existing Issue Comments SPHW",
      label: "Pre-existing issue comments",
      type: "textarea",
      required: true,
      showWhen: (v) => v["Pre-Existing Condition SPHW"] === "Yes",
    },
    {
      key: "VRS Tech Repair/Replacement Review Decision",
      label: "VRS Tech Repair/Replacement Review Decision",
      type: "radio",
      required: true,
      options: SPHW_DECISION_OPTIONS.map((d) => ({ value: d, label: d })),
    },
    {
      key: "Comments to support repair or replace decision",
      label: "Comments to support repair or replace decision",
      type: "textarea",
      required: true,
      helper: "Auto-pasted from your agent notes — edit if needed.",
    },
  ],
};

// ---------------------------------------------------------------------------
// AHS branch (AHS* / AHT* / FAA* prefix) — INCOMPLETE walk
// ---------------------------------------------------------------------------
const AHS: IntakeBranchConfig = {
  branch: "AHS",
  description:
    "American Home Shield / First American (AHS* / AHT* / FAA* Proc ID). Downstream conditional fields are NOT WALKED — finish them in the iframe.",
  verified: false,
  fields: [
    {
      key: "Reason for calling the VRS Hotline AHS",
      label: "Reason for calling VRS Hotline (AHS)",
      type: "text",
      required: false,
      helper:
        "Free-text fallback — the live Smartsheet dropdown options were not enumerated. Type the reason or finish in the iframe.",
    },
  ],
};

// ---------------------------------------------------------------------------
// Branches we do not gate on (intentionally empty so the iframe modal is the
// agent's only data-entry surface for these).
// ---------------------------------------------------------------------------
const SRW: IntakeBranchConfig = {
  branch: "SRW",
  description: "Kenmore-IW (SRW* Proc ID). Branch fields not walked — finish in the iframe.",
  verified: false,
  fields: [],
};

const ISP: IntakeBranchConfig = {
  branch: "ISP",
  description: "1099-ISP Contractor — out of scope for Phase 1. Finish in the iframe.",
  verified: false,
  fields: [],
};

const INVALID: IntakeBranchConfig = {
  branch: "INVALID",
  description: "Proc ID is not in the form's dropdown. Pick a Proc ID manually in the iframe.",
  verified: false,
  fields: [],
};

export const INTAKE_BRANCHES: Record<IntakeBranch, IntakeBranchConfig> = {
  SHW,
  SPHW,
  AHS,
  SRW,
  ISP,
  INVALID,
};

export function detectBranch(procId: string | null | undefined): IntakeBranch {
  if (!procId) return "INVALID";
  const p = procId.toUpperCase();
  if (p.startsWith("AHS") || p.startsWith("AHT") || p.startsWith("FAA")) return "AHS";
  if (p.startsWith("SPRC") || p.startsWith("SPR") || p.startsWith("SPH")) return "SPHW";
  if (p.startsWith("THM")) return "SHW";
  if (p.startsWith("SRW")) return "SRW";
  return "INVALID";
}

/**
 * Returns the list of REQUIRED field keys (within the active branch) that the
 * payload is missing or empty. Visibility-conditional fields are skipped when
 * their `showWhen` predicate is false.
 */
export function findMissingRequired(
  branch: IntakeBranch,
  values: Record<string, string>
): string[] {
  const cfg = INTAKE_BRANCHES[branch];
  if (!cfg) return [];
  const missing: string[] = [];
  for (const f of cfg.fields) {
    if (!f.required) continue;
    if (f.showWhen && !f.showWhen(values)) continue;
    const v = values[f.key];
    if (v === undefined || v === null || String(v).trim() === "") {
      missing.push(f.key);
    }
  }
  return missing;
}
