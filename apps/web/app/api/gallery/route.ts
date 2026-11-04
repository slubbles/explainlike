import { NextResponse } from "next/server";
import { galleryItems } from "../../../lib/gallery";
import { withErrors } from "../../../lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withErrors("gallery.GET", async () => {
  return NextResponse.json({ videos: galleryItems() });
});
