import { galleryCaptionsVtt } from "../../../../../lib/gallery";
import { limitRequest } from "../../../../../lib/guard";
import { withErrors } from "../../../../../lib/route";

export const runtime = "nodejs";

/** A gallery video's captions as WebVTT for the player's captions track; 404 when the folder holds none. */
export const GET = withErrors("gallery-captions.GET", async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const limited = limitRequest(req, "gallery-captions");
  if (limited) return limited;
  const { id } = await ctx.params;
  const vtt = galleryCaptionsVtt(id);
  if (!vtt) return new Response("not found", { status: 404 });
  return new Response(vtt, { headers: { "content-type": "text/vtt" } });
});
