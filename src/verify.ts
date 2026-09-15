import { VerificationFailed } from "./errors.js";

function decodeHex(value: string, what: string): Uint8Array {
  if (value.length % 2 !== 0 || /[^0-9a-fA-F]/.test(value)) {
    throw new VerificationFailed(`failed to parse ${what} from hex`);
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Verifies Discord's Ed25519 interaction signature over `timestamp + body`.
 *
 * Uses the runtime's native Ed25519 WebCrypto support, so no userland crypto
 * dependency is needed.
 */
export async function verifySignature(
  publicKey: string,
  signature: string,
  timestamp: string,
  body: string,
): Promise<void> {
  const keyBytes = decodeHex(publicKey, "public key");
  const signatureBytes = decodeHex(signature, "signature");

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("raw", keyBytes, { name: "Ed25519" }, false, ["verify"]);
  } catch {
    throw new VerificationFailed("invalid public key provided");
  }

  const verified = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    signatureBytes,
    new TextEncoder().encode(timestamp + body),
  );

  if (!verified) throw new VerificationFailed("invalid signature provided");
}
