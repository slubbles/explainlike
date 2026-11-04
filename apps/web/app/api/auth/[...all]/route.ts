import { authEnabled, ensureAuthSchema, getAuth } from "../../../../lib/auth";
import { limitRequest } from "../../../../lib/guard";
import { withErrors } from "../../../../lib/route";

export const runtime = "nodejs";

/** Better Auth (email codes only), or a 404 when sign-in is off. Tables are created on first use. */
async function handle(req: Request): Promise<Response> {
  if (!authEnabled()) return Response.json({ error: "Not found." }, { status: 404 });
  const limited = limitRequest(req, "auth");
  if (limited) return limited;
  try {
    await ensureAuthSchema();
  } catch {
    return Response.json({ error: "Sign-in is unavailable right now. Try again in a moment." }, { status: 500 });
  }
  return getAuth().handler(req);
}

export const GET = withErrors("auth.GET", handle);
export const POST = withErrors("auth.POST", handle);
