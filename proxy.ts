import { authorized } from "@/lib/auth";

// No matcher on purpose: every route, the API and all static files sit behind the password.
export function proxy(req: Request) {
  const secret = process.env.BASIC_AUTH; // "user:password"
  if (!secret) {
    if (process.env.NODE_ENV !== "production") return; // local dev runs open
    return new Response("BASIC_AUTH is not set", { status: 503 }); // never serve a deployment unprotected
  }
  if (authorized(req.headers.get("authorization"), secret)) return;
  return new Response("Anmeldung erforderlich", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="Discount Snapper"', "x-robots-tag": "noindex, nofollow" },
  });
}
