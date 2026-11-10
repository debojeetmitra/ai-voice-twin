import { fallbackReply } from "@/lib/fallback";
import { generateWithGemini, getApiKey } from "@/lib/gemini";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import type { ChatRequestBody, ChatResponseBody, ChatRole } from "@/lib/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRole(value: unknown): value is ChatRole {
  return value === "user" || value === "assistant";
}

export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request));
  const headers = {
    "X-RateLimit-Remaining": String(limited.remaining),
    "X-RateLimit-Reset": String(limited.resetAt),
  };

  if (!limited.ok) {
    const body: ChatResponseBody = {
      text: "I am getting a lot of questions at once. Give me about a minute and ask again.",
      source: "fallback",
      error: "rate_limited",
    };
    return NextResponse.json(body, { status: 429, headers });
  }

  let payload: ChatRequestBody;
  try {
    payload = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json(
      { text: "I could not read that message.", source: "fallback", error: "invalid_json" } satisfies ChatResponseBody,
      { status: 400, headers },
    );
  }

  const messages = Array.isArray(payload.messages)
    ? payload.messages
        .filter((m) => m && isRole(m.role) && typeof m.content === "string")
        .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 4000) }))
        .filter((m) => m.content.length > 0)
        .slice(-24)
    : [];

  const interviewMode = Boolean(payload.interviewMode);

  if (!getApiKey()) {
    const body: ChatResponseBody = {
      text: fallbackReply(messages, interviewMode),
      source: "fallback",
      error: "missing_credentials",
    };
    return NextResponse.json(body, { headers });
  }

  try {
    const result = await generateWithGemini(messages, interviewMode);
    const body: ChatResponseBody = {
      text: result.text,
      source: "gemini",
      model: result.model,
    };
    return NextResponse.json(body, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown model error";
    const body: ChatResponseBody = {
      text: fallbackReply(messages, interviewMode),
      source: "fallback",
      error: message,
    };
    return NextResponse.json(body, { headers });
  }
}
