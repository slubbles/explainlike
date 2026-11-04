import { NextResponse } from "next/server";
import { galleryItems } from "../../../lib/gallery";
import { limitRequest } from "../../../lib/guard";
import { withErrors } from "../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrors("gallery.GET", async (req: Request) => {
  const limited = limitRequest(req, "gallery");
  if (limited) return limited;
  return NextResponse.json({ videos: galleryItems() });
});
