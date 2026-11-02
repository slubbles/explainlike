import { NextResponse } from "next/server";
import { galleryItems } from "../../../lib/gallery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ videos: galleryItems() });
}
