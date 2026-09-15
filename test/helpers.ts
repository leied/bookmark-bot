import { env } from "cloudflare:test";

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generates an Ed25519 keypair, points the worker's DISCORD_PUBLIC_KEY at it,
 * and returns a signer that produces the headers Discord would send.
 */
export async function useSigningKey() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;

  env.DISCORD_PUBLIC_KEY = toHex(
    (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer,
  );

  return async function signedRequest(body: unknown, path = "/"): Promise<Request> {
    const payload = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await crypto.subtle.sign(
      { name: "Ed25519" },
      pair.privateKey,
      encoder.encode(timestamp + payload),
    );

    return new Request(`https://bot.example.com${path}`, {
      method: "POST",
      headers: {
        "x-signature-ed25519": toHex(signature),
        "x-signature-timestamp": timestamp,
        "Content-Type": "application/json",
      },
      body: payload,
    });
  };
}
