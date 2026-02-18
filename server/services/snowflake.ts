import snowflake from "snowflake-sdk";

interface SnowflakeTechRow {
  TECH_ID: string;
  TECH_NAME: string;
  PHONE_NUMBER: string;
  MGR_NM: string;
  TECH_UN_NO: string;
  DISTRICT_ID: string;
  STATE: string;
}

export interface SyncedTechnician {
  ldapId: string;
  name: string;
  phone: string;
  district: string;
  state: string;
  managerName: string;
  techUnNo: string;
}

const TECH_SYNC_QUERY = `
WITH filtered_techs AS (
  SELECT 
    TECH_UN_NO, 
    TECH_AIM_ID, 
    LDAP_ID, 
    FIRST_NM, 
    LAST_NM, 
    MBL_PH_NO,
    DIST_UN_NO, 
    TECH_STS_CD, 
    ACTIVE_IND, 
    MGR_NM
  FROM PRD_TPMS.HSTECH.COMTTU_TECH_UN
  WHERE MBL_PH_NO IS NOT NULL
    AND MBL_PH_NO <> ' '
    AND TECH_STS_CD = 'A'
    AND ACTIVE_IND = 'Y'
),
primary_tech_assignment AS (
  SELECT 
    t.*,
    ROW_NUMBER() OVER (PARTITION BY LDAP_ID ORDER BY TECH_UN_NO) AS primary_rank
  FROM filtered_techs t
),
tech_map_deduped AS (
  SELECT 
    UPPER(TRIM(TECH_ID)) AS tid,
    UPPER(TRIM(STATE)) AS STATE,
    ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(TECH_ID)) ORDER BY TECH_ID) AS rn
  FROM PRD_TPMS.HSTECH.TECH_MAP
)
SELECT 
  p.LDAP_ID AS TECH_ID,
  p.FIRST_NM || ' ' || p.LAST_NM AS TECH_NAME,
  p.MBL_PH_NO AS PHONE_NUMBER,
  p.MGR_NM,
  p.TECH_UN_NO,
  p.DIST_UN_NO AS DISTRICT_ID,
  tm.STATE
FROM primary_tech_assignment p
LEFT JOIN tech_map_deduped tm 
  ON UPPER(TRIM(p.LDAP_ID)) = tm.tid AND tm.rn = 1
WHERE p.primary_rank = 1
ORDER BY p.LDAP_ID
`;

function normalizePrivateKey(key: string): string {
  let normalized = key.trim();
  normalized = normalized.replace(/\\n/g, "\n");

  const headerRe = /-----BEGIN (RSA )?PRIVATE KEY-----/;
  const footerRe = /-----END (RSA )?PRIVATE KEY-----/;
  const headerMatch = normalized.match(headerRe);
  const footerMatch = normalized.match(footerRe);

  if (headerMatch && footerMatch) {
    const header = headerMatch[0];
    const footer = footerMatch[0];
    let body = normalized
      .replace(header, "")
      .replace(footer, "")
      .replace(/[\s\r\n]+/g, "");
    const lines = body.match(/.{1,64}/g) || [];
    normalized = header + "\n" + lines.join("\n") + "\n" + footer + "\n";
  } else if (!headerMatch) {
    const body = normalized.replace(/[\s\r\n]+/g, "");
    const lines = body.match(/.{1,64}/g) || [];
    normalized =
      "-----BEGIN PRIVATE KEY-----\n" +
      lines.join("\n") +
      "\n-----END PRIVATE KEY-----\n";
  }

  return normalized;
}

function getConnection(): Promise<snowflake.Connection> {
  return new Promise((resolve, reject) => {
    const rawKey = process.env.SNOWFLAKE_PRIVATE_KEY;
    if (!rawKey) {
      reject(new Error("SNOWFLAKE_PRIVATE_KEY not configured"));
      return;
    }

    const privateKey = normalizePrivateKey(rawKey);

    const connection = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT!,
      username: process.env.SNOWFLAKE_USERNAME!,
      authenticator: "SNOWFLAKE_JWT",
      privateKey,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
      database: "PRD_TPMS",
      schema: "HSTECH",
    });

    connection.connect((err, conn) => {
      if (err) {
        console.error("Snowflake connection error:", err.message);
        reject(err);
      } else {
        resolve(conn);
      }
    });
  });
}

function executeQuery(connection: snowflake.Connection, query: string): Promise<SnowflakeTechRow[]> {
  return new Promise((resolve, reject) => {
    connection.execute({
      sqlText: query,
      complete: (err, stmt, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve((rows || []) as SnowflakeTechRow[]);
        }
      },
    });
  });
}

export async function fetchTechniciansFromSnowflake(): Promise<SyncedTechnician[]> {
  const connection = await getConnection();

  try {
    const rows = await executeQuery(connection, TECH_SYNC_QUERY);

    return rows.map((row) => ({
      ldapId: (row.TECH_ID || "").trim().toLowerCase(),
      name: (row.TECH_NAME || "").trim(),
      phone: (row.PHONE_NUMBER || "").trim(),
      district: (row.DISTRICT_ID || "").trim(),
      state: (row.STATE || "").trim(),
      managerName: (row.MGR_NM || "").trim(),
      techUnNo: (row.TECH_UN_NO || "").trim(),
    })).filter((t) => t.ldapId.length > 0);
  } finally {
    connection.destroy((err) => {
      if (err) console.error("Snowflake disconnect error:", err.message);
    });
  }
}
