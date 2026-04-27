/**
 * Smoke test for server/services/smartsheet.ts buildIntakeFormUrl().
 *
 * Run with:  npx tsx scripts/test-intake-url.ts
 *
 * No external deps. Exits with non-zero status on assertion failure so it can
 * be wired into CI later.
 */

import {
  buildIntakeFormUrl,
  detectBranch,
  VRS_INTAKE_FORM_BASE,
  applianceTypeToSmartsheet,
  lookupProcIdLabel,
} from "../server/services/smartsheet";
import type { Submission } from "../shared/schema";

let failures = 0;
function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  \u2713 ${name}`);
  } else {
    failures++;
    console.error(`  \u2717 ${name}${detail ? `\n      ${detail}` : ""}`);
  }
}

function makeSub(over: Partial<Submission>): Submission {
  return {
    id: 1,
    serviceOrder: "1234-56789012",
    technicianLdapId: "cozakig",
    procId: "SPRCLL",
    applianceType: "refrigeration",
    phone: "555-555-5555",
    phoneOverride: null,
    ...over,
  } as Submission;
}

console.log("\nbranch detection");
assert("THM* -> SHW", detectBranch("THM302") === "SHW");
assert("AHS* -> AHS", detectBranch("AHS000") === "AHS");
assert("FAA* -> AHS", detectBranch("FAA01A") === "AHS");
assert("SPR* -> SPHW", detectBranch("SPRCLL") === "SPHW");
assert("SRW* -> SRW", detectBranch("SRW000") === "SRW");
assert("unknown -> INVALID", detectBranch("ZZZ999") === "INVALID");
assert("null -> INVALID", detectBranch(null) === "INVALID");

console.log("\nlabel lookups");
assert(
  "SPRCLL label",
  lookupProcIdLabel("SPRCLL") === "SPRCLL-Sears Protect Home Warranty"
);
assert(
  "applianceType refrigeration -> Refrigerator",
  applianceTypeToSmartsheet("refrigeration") === "Refrigerator"
);

console.log("\nSPHW pre-fill (always-visible only)");
{
  const { url, params, branch, warnings } = buildIntakeFormUrl({
    submission: makeSub({}),
    payload: {},
  });
  assert("starts with form base", url.startsWith(VRS_INTAKE_FORM_BASE + "?"));
  assert("branch=SPHW", branch === "SPHW");
  assert(
    "VRS Tech ID falls back to technicianLdapId uppercased when no authUserRacId",
    params["VRS Tech ID"] === "COZAKIG"
  );
  assert(
    "IH Tech Ent ID populated from technicianLdapId uppercased",
    params["IH Tech Ent ID"] === "COZAKIG"
  );
  assert(
    "service order passed unchanged",
    params["IH Service Order Number"] === "1234-56789012"
  );
  assert(
    "Servicer Type defaults to W2",
    params["Servicer Type"] === "W2-In Home Field Tech"
  );
  assert(
    "Proc ID label resolved",
    params["Proc ID/Third Part ID"] === "SPRCLL-Sears Protect Home Warranty"
  );
  assert("no warnings", warnings.length === 0, warnings.join(" / "));
  assert(
    "URL is correctly encoded (spaces as %20)",
    url.includes("VRS%20Tech%20ID=COZAKIG")
  );
  assert(
    "URL encodes / in column label",
    url.includes("Proc%20ID%2FThird%20Part%20ID=")
  );
}

console.log("\nSPHW pre-fill (with branch payload)");
{
  const { params } = buildIntakeFormUrl({
    submission: makeSub({}),
    payload: {
      "SPHW Active Date": "2026-01-15",
      "SPHW Days Active": "31-60 Days",
      "Pre-Existing Condition SPHW": "No",
      "VRS Tech Repair/Replacement Review Decision": "Repair Product",
      "Comments to support repair or replace decision": "Compressor died at 45 days",
    },
  });
  assert(
    "SPHW Active Date passes through",
    params["SPHW Active Date"] === "2026-01-15"
  );
  assert(
    "SPHW Days Active passes through",
    params["SPHW Days Active"] === "31-60 Days"
  );
  assert(
    "Decision passes through",
    params["VRS Tech Repair/Replacement Review Decision"] === "Repair Product"
  );
}

console.log("\nSHW pre-fill auto-defaults branch fields");
{
  const { params, branch } = buildIntakeFormUrl({
    submission: makeSub({ procId: "THM302", applianceType: "laundry", phoneOverride: "919-111-2222" }),
    payload: {
      "Reason for Calling VRS Hotline SHW": "Un-economical to Repair",
      "SHW Uneconomical to Repair Calculated Amount": "1234.56",
    },
  });
  assert("branch=SHW", branch === "SHW");
  assert("Appliance Type defaulted from VRS", params["Appliance Type"] === "Laundry");
  assert(
    "Tech Cell Phone uses phoneOverride",
    params["Tech Cell Phone Number"] === "919-111-2222"
  );
  assert(
    "SHW W2/1099 defaulted",
    params["SHW W2 or 1099 Contractor"] === "W2"
  );
  assert(
    "Reason field carried through",
    params["Reason for Calling VRS Hotline SHW"] === "Un-economical to Repair"
  );
}

console.log("\nVRS Tech ID + IH Tech Ent ID source split (Tyler 2026-04-26)");
{
  // With authUserRacId provided, VRS Tech ID = agent's racId (uppercased);
  // IH Tech Ent ID = field tech's LDAP id (uppercased). Two distinct columns,
  // two distinct sources.
  const { params } = buildIntakeFormUrl({
    submission: makeSub({ technicianLdapId: "jmorga1" }),
    payload: {},
    authUserRacId: "mthoma2",
  });
  assert(
    "VRS Tech ID = authUserRacId uppercased",
    params["VRS Tech ID"] === "MTHOMA2"
  );
  assert(
    "IH Tech Ent ID = technicianLdapId uppercased",
    params["IH Tech Ent ID"] === "JMORGA1"
  );
}

console.log("\nVRS Tech ID fallback when agent racId missing");
{
  // Tyler's safety net: agent record without a racId must NOT silently blank
  // the VRS Tech ID column — fall back to the field tech's LDAP id.
  const { params } = buildIntakeFormUrl({
    submission: makeSub({ technicianLdapId: "cozakig" }),
    payload: {},
    authUserRacId: null,
  });
  assert(
    "VRS Tech ID falls back to technicianLdapId when authUserRacId is null",
    params["VRS Tech ID"] === "COZAKIG"
  );
  assert(
    "IH Tech Ent ID still populated from technicianLdapId",
    params["IH Tech Ent ID"] === "COZAKIG"
  );
}

console.log("\nVRS Tech ID fallback when agent racId is empty string");
{
  // Defence-in-depth: empty-string racId on the agent row should also fall
  // back to the field tech's LDAP — the `||` chain in buildIntakeFormUrl
  // treats "" as falsy, same as null.
  const { params } = buildIntakeFormUrl({
    submission: makeSub({ technicianLdapId: "cozakig" }),
    payload: {},
    authUserRacId: "",
  });
  assert(
    "VRS Tech ID falls back to technicianLdapId when authUserRacId is empty string",
    params["VRS Tech ID"] === "COZAKIG"
  );
}

console.log("\nlegacy submission with null technicianLdapId");
{
  // Legacy / Snowflake-only submission rows can have a null technicianLdapId.
  // Make sure the source-split degrades gracefully — VRS Tech ID still
  // populates from the agent's racId; IH Tech Ent ID is omitted (column
  // simply unavailable, agent fills it manually in the iframe).
  const { params } = buildIntakeFormUrl({
    submission: makeSub({ technicianLdapId: null as any }),
    payload: {},
    authUserRacId: "mthoma2",
  });
  assert(
    "VRS Tech ID still populated from authUserRacId",
    params["VRS Tech ID"] === "MTHOMA2"
  );
  assert(
    "IH Tech Ent ID omitted when technicianLdapId is null",
    !("IH Tech Ent ID" in params)
  );
}

console.log("\nVRS Tech ID URL encoding with alphanumeric racId");
{
  const { url } = buildIntakeFormUrl({
    submission: makeSub({}),
    payload: {},
    authUserRacId: "mthoma2",
  });
  assert(
    "URL encodes VRS Tech ID with uppercased racId",
    url.includes("VRS%20Tech%20ID=MTHOMA2")
  );
  assert(
    "URL includes IH Tech Ent ID column",
    url.includes("IH%20Tech%20Ent%20ID=COZAKIG")
  );
}

console.log("\nallow-list filtering");
{
  const { params, warnings } = buildIntakeFormUrl({
    submission: makeSub({}),
    payload: {
      "Pre-Existing Condition SPHW": "No",
      "Some Bogus Field": "should be dropped",
    },
  });
  assert(
    "bogus field dropped from params",
    !("Some Bogus Field" in params)
  );
  assert(
    "warning logged for bogus field",
    warnings.some((w) => w.includes("Some Bogus Field"))
  );
}

console.log("\nINVALID branch (procId not in PROC_ID_LABEL — verbatim passthrough)");
{
  // Tyler 2026-04-26 (post-audit fix): the live Smartsheet dropdown has
  // ~80+ options; we only enumerate ~23. Any procId we don't have a
  // label for is passed through verbatim — Smartsheet's dropdown is the
  // arbiter, not our hand-curated subset.
  const { branch, params } = buildIntakeFormUrl({
    submission: makeSub({ procId: "ZZZ999" }),
    payload: {},
  });
  assert("branch=INVALID", branch === "INVALID");
  assert(
    "Proc ID column passes through verbatim",
    params["Proc ID/Third Part ID"] === "ZZZ999"
  );
}

console.log("\nAHSCLL passthrough (real Snowflake-sourced AHS proc id, not in label table)");
{
  const { branch, params } = buildIntakeFormUrl({
    submission: makeSub({ procId: "AHSCLL" }),
    payload: {},
  });
  assert("branch=AHS", branch === "AHS");
  assert(
    "AHSCLL passes through verbatim (not silently dropped)",
    params["Proc ID/Third Part ID"] === "AHSCLL"
  );
}

console.log("\nempty payload + null procId");
{
  const { branch, params } = buildIntakeFormUrl({
    submission: makeSub({ procId: null as any }),
    payload: {},
  });
  assert("branch=INVALID for null procId", branch === "INVALID");
  assert("no Proc ID in params (nothing to pass through)", !("Proc ID/Third Part ID" in params));
}

console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("All assertions passed.");
