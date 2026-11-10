import { getApiKey } from "@/lib/gemini";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    liveModel: Boolean(getApiKey()),
    provider: "gemini",
  });
}
