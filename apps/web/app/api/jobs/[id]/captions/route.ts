import { captionsVtt } from "../../../../../lib/captions";
import { limitRequest } from "../../../../../lib/guard";
import { withErrors } from "../../../../../lib/route";

export const runtime = "nodejs";

/** The video's captions as WebVTT for the player's captions track; 404 while it renders or for old jobs. */
export const GET = withErrors("captions.GET", async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const limited = limitRequest(req, "captions");
  if (limited) return limited;
  const { id } = await ctx.params;
  const vtt = captionsVtt(id);
  if (!vtt) return new Response("not found", { status: 404 });
  return new Response(vtt, { headers: { "content-type": "text/vtt", "cache-control": "no-store" } });
});
