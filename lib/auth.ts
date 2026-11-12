import { createHash, timingSafeEqual } from "node:crypto";

const sha = (s: string) => createHash("sha256").update(s).digest();

// secret is "user:password"; hashed first so the comparison takes the same time for any input.
export function authorized(header: string | null, secret: string) {
  return timingSafeEqual(sha(header ?? ""), sha("Basic " + Buffer.from(secret).toString("base64")));
}
