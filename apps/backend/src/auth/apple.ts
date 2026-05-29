import { isRecord } from "@karabiner/shared";
import type { Env } from "../types";

interface AppleJwk extends JsonWebKey {
  kid: string;
  alg: "ES256";
}

interface AppleClaims {
  sub: string;
  email?: string;
  aud: string | string[];
  iss: string;
  exp: number;
  iat: number;
}

const appleKeysUrl = "https://appleid.apple.com/auth/keys";

export async function verifyAppleIdentityToken(identityToken: string, env: Env): Promise<AppleClaims> {
  const parts = identityToken.split(".");

  if (parts.length !== 3) {
    throw new Error("Invalid Apple identity token.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
  const header = parseJwtPart(encodedHeader);
  const payload = parseJwtPart(encodedPayload);

  if (!isRecord(header) || header.alg !== "ES256" || typeof header.kid !== "string") {
    throw new Error("Unsupported Apple identity token header.");
  }

  if (!isAppleClaims(payload)) {
    throw new Error("Invalid Apple identity token claims.");
  }

  const jwk = await findAppleKey(header.kid);
  const verified = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
      "verify"
    ]),
    decodeBase64Url(encodedSignature),
    encodeUtf8(`${encodedHeader}.${encodedPayload}`)
  );

  if (!verified) {
    throw new Error("Apple identity token signature verification failed.");
  }

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];

  if (payload.iss !== "https://appleid.apple.com") {
    throw new Error("Unexpected Apple token issuer.");
  }

  if (!audiences.includes(env.APPLE_BUNDLE_ID)) {
    throw new Error("Apple token audience does not match this app.");
  }

  if (payload.exp <= now || payload.iat > now + 300) {
    throw new Error("Apple token is expired or not yet valid.");
  }

  return payload;
}

async function findAppleKey(kid: string): Promise<AppleJwk> {
  const response = await fetch(appleKeysUrl, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error("Unable to fetch Apple public keys.");
  }

  const body: unknown = await response.json();

  if (!isRecord(body) || !Array.isArray(body.keys)) {
    throw new Error("Unexpected Apple public keys response.");
  }

  const key = body.keys.find((candidate): candidate is AppleJwk => {
    return (
      isRecord(candidate) &&
      candidate.kid === kid &&
      candidate.alg === "ES256" &&
      typeof candidate.kty === "string"
    );
  });

  if (!key) {
    throw new Error("No matching Apple public key found.");
  }

  return key;
}

function isAppleClaims(value: unknown): value is AppleClaims {
  return (
    isRecord(value) &&
    typeof value.sub === "string" &&
    (typeof value.email === "string" || value.email === undefined) &&
    (typeof value.aud === "string" ||
      (Array.isArray(value.aud) && value.aud.every((item) => typeof item === "string"))) &&
    typeof value.iss === "string" &&
    typeof value.exp === "number" &&
    typeof value.iat === "number"
  );
}

function parseJwtPart(part: string): unknown {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(part))) as unknown;
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodeUtf8(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value);
  const bytes = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  bytes.set(encoded);
  return bytes;
}
