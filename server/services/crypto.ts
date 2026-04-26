// =============================================================================
// AES-256-GCM symmetric encryption helpers
// =============================================================================
// Used by server/routes.ts to encrypt agent-supplied credentials for external
// tools (e.g. the Streamlit Repair/Replace Calculator) before persisting them
// to `agent_external_credentials`.
//
// Key derivation: scrypt(SESSION_SECRET, perRowSalt, 32 bytes). SESSION_SECRET
// is already required at app boot (server/routes.ts:29). The per-row salt is
// generated fresh on each save and stored alongside the ciphertext, so a leaked
// SESSION_SECRET would still require offline scrypt work to decrypt each row.
//
// Cleartext is never logged or written to disk by these helpers. Callers must
// avoid logging the cleartext anywhere else.
// =============================================================================

import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "crypto";

const ALGO = "aes-256-gcm" as const;
const KEY_LEN = 32;
const IV_LEN = 12;
const SALT_LEN = 16;

function getMasterSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required for credential encryption");
  }
  return secret;
}

export interface EncryptedField {
  cipher: string; // base64
  iv: string; // base64
  authTag: string; // base64
  salt: string; // base64
}

export interface EncryptedCredential {
  usernameCipher: string;
  passwordCipher: string;
  iv: string;
  authTag: string;
  scryptSalt: string;
}

/**
 * Encrypts a {username, password} pair under one shared salt + IV. Returns
 * base64-encoded ciphertexts and the salt/IV/authTag needed to decrypt later.
 */
export function encryptCredential(
  username: string,
  password: string
): EncryptedCredential {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = scryptSync(getMasterSecret(), salt, KEY_LEN);

  // Same key+iv pair MUST NOT be reused across two cipher operations under
  // GCM. We derive two distinct IVs by xor-ing the last byte (cheap + safe
  // because the salt is unique per row and key is salt-derived).
  const ivPwd = Buffer.from(iv);
  ivPwd[ivPwd.length - 1] = ivPwd[ivPwd.length - 1] ^ 0x01;

  const userCipher = createCipheriv(ALGO, key, iv);
  const userCt = Buffer.concat([userCipher.update(username, "utf8"), userCipher.final()]);
  const userTag = userCipher.getAuthTag();

  const pwdCipher = createCipheriv(ALGO, key, ivPwd);
  const pwdCt = Buffer.concat([pwdCipher.update(password, "utf8"), pwdCipher.final()]);
  const pwdTag = pwdCipher.getAuthTag();

  // Pack both auth tags into a single base64 blob (16 bytes user + 16 bytes pwd).
  const combinedTag = Buffer.concat([userTag, pwdTag]);

  return {
    usernameCipher: userCt.toString("base64"),
    passwordCipher: pwdCt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: combinedTag.toString("base64"),
    scryptSalt: salt.toString("base64"),
  };
}

/**
 * Decrypts a credential previously produced by `encryptCredential`. Throws on
 * tampering (auth tag mismatch). Caller must scope the cleartext lifetime as
 * narrowly as possible and never log it.
 */
export function decryptCredential(
  enc: EncryptedCredential
): { username: string; password: string } {
  const salt = Buffer.from(enc.scryptSalt, "base64");
  const iv = Buffer.from(enc.iv, "base64");
  const key = scryptSync(getMasterSecret(), salt, KEY_LEN);

  const ivPwd = Buffer.from(iv);
  ivPwd[ivPwd.length - 1] = ivPwd[ivPwd.length - 1] ^ 0x01;

  const combinedTag = Buffer.from(enc.authTag, "base64");
  if (combinedTag.length !== 32) {
    throw new Error("Invalid auth tag length");
  }
  const userTag = combinedTag.subarray(0, 16);
  const pwdTag = combinedTag.subarray(16, 32);

  const userCt = Buffer.from(enc.usernameCipher, "base64");
  const userDecipher = createDecipheriv(ALGO, key, iv);
  userDecipher.setAuthTag(userTag);
  const username = Buffer.concat([userDecipher.update(userCt), userDecipher.final()]).toString("utf8");

  const pwdCt = Buffer.from(enc.passwordCipher, "base64");
  const pwdDecipher = createDecipheriv(ALGO, key, ivPwd);
  pwdDecipher.setAuthTag(pwdTag);
  const password = Buffer.concat([pwdDecipher.update(pwdCt), pwdDecipher.final()]).toString("utf8");

  return { username, password };
}
