import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const YOUTUBE_OAUTH_STATE_TTL_SECONDS = 10 * 60;

export const YOUTUBE_OAUTH_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
];

function getEncryptionKey() {
  const encodedKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encodedKey) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not configured.");
  }

  const key = Buffer.from(encodedKey, "base64");
  if (
    key.byteLength !== 32 ||
    key.toString("base64").replace(/=+$/, "") !== encodedKey.replace(/=+$/, "")
  ) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
    );
  }

  return key;
}

function getOAuthStateSigningKey() {
  return createHmac("sha256", getEncryptionKey())
    .update("youtube-oauth-state-signing-key-v1")
    .digest();
}

export function createOAuthState(ownerId: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      ownerId,
      nonce: randomBytes(32).toString("base64url"),
      issuedAt,
      expiresAt: issuedAt + YOUTUBE_OAUTH_STATE_TTL_SECONDS,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", getOAuthStateSigningKey())
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

export function verifyOAuthState(state: string | null) {
  if (!state || state.length > 4096) return null;
  const [payload, receivedSignature, ...extraParts] = state.split(".");
  if (
    !payload ||
    !receivedSignature ||
    extraParts.length > 0 ||
    !/^[A-Za-z0-9_-]+$/.test(payload) ||
    !/^[A-Za-z0-9_-]+$/.test(receivedSignature)
  ) {
    return null;
  }

  let expectedSignature: Buffer;
  try {
    expectedSignature = createHmac("sha256", getOAuthStateSigningKey())
      .update(payload)
      .digest();
  } catch (error) {
    if (error instanceof Error && error.message.includes("GOOGLE_TOKEN_ENCRYPTION_KEY")) {
      throw error;
    }
    return null;
  }

  const actualSignature = Buffer.from(receivedSignature, "base64url");
  if (
    actualSignature.byteLength !== expectedSignature.byteLength ||
    actualSignature.toString("base64url") !== receivedSignature ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    return null;
  }

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof claims !== "object" ||
    claims === null ||
    !("ownerId" in claims) ||
    typeof claims.ownerId !== "string" ||
    !claims.ownerId ||
    !("nonce" in claims) ||
    typeof claims.nonce !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(claims.nonce) ||
    !("issuedAt" in claims) ||
    typeof claims.issuedAt !== "number" ||
    !Number.isSafeInteger(claims.issuedAt) ||
    !("expiresAt" in claims) ||
    typeof claims.expiresAt !== "number" ||
    !Number.isSafeInteger(claims.expiresAt)
  ) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    claims.issuedAt > now ||
    claims.expiresAt <= now ||
    claims.expiresAt - claims.issuedAt !== YOUTUBE_OAUTH_STATE_TTL_SECONDS
  ) {
    return null;
  }

  return claims.ownerId;
}

export function encryptRefreshToken(refreshToken: string) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptRefreshToken(encryptedToken: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...extraParts] =
    encryptedToken.split(":");
  if (
    version !== "v1" ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    extraParts.length > 0
  ) {
    throw new Error("Stored YouTube refresh token has an unsupported format.");
  }

  const iv = Buffer.from(encodedIv, "base64url");
  const tag = Buffer.from(encodedTag, "base64url");
  const ciphertext = Buffer.from(encodedCiphertext, "base64url");
  if (
    iv.byteLength !== 12 ||
    tag.byteLength !== 16 ||
    ciphertext.byteLength === 0 ||
    iv.toString("base64url") !== encodedIv ||
    tag.toString("base64url") !== encodedTag ||
    ciphertext.toString("base64url") !== encodedCiphertext
  ) {
    throw new Error("Stored YouTube refresh token is malformed.");
  }

  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Stored YouTube refresh token could not be authenticated.");
  }
}
