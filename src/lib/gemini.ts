import { INTERVIEW_MODE_ADDENDUM, SYSTEM_PROMPT } from "./persona";
import type { ChatRole } from "./types";

const DEFAULT_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-2.5-flash-preview",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
];

type GeminiPart = { text?: string };
type GeminiContent = { role?: string; parts?: GeminiPart[] };

export function getApiKey(): string | undefined {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key || undefined;
}

function modelList(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const list = preferred ? [preferred, ...DEFAULT_MODELS] : DEFAULT_MODELS;
  return [...new Set(list)];
}

function toGeminiRole(role: ChatRole): "user" | "model" {
  return role === "assistant" ? "model" : "user";
}

export async function generateWithGemini(
  messages: Array<{ role: ChatRole; content: string }>,
  interviewMode: boolean,
): Promise<{ text: string; model: string }> {
  const key = getApiKey();
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const systemInstruction = interviewMode
    ? `${SYSTEM_PROMPT}\n${INTERVIEW_MODE_ADDENDUM}`
    : SYSTEM_PROMPT;

  const rawContents: GeminiContent[] = messages
    .filter((m) => m.content.trim())
    .slice(-24)
    .map((m) => ({
      role: toGeminiRole(m.role),
      parts: [{ text: m.content.slice(0, 4000) }],
    }));

  const contents: GeminiContent[] = [];
  for (const item of rawContents) {
    const last = contents[contents.length - 1];
    if (last && last.role === item.role) {
      last.parts = [{ text: `${last.parts?.[0]?.text ?? ""}\n\n${item.parts?.[0]?.text ?? ""}`.trim() }];
    } else {
      contents.push({ role: item.role, parts: [{ text: item.parts?.[0]?.text ?? "" }] });
    }
  }

  if (contents.length === 0 || contents[0].role !== "user") {
    contents.unshift({
      role: "user",
      parts: [{ text: interviewMode ? "Let's start interview mode." : "Hello." }],
    });
  }

  if (contents.length > 0 && contents[contents.length - 1].role !== "user") {
    contents.push({
      role: "user",
      parts: [{ text: "Please continue and answer." }],
    });
  }

  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.75,
      topP: 0.9,
      maxOutputTokens: 512,
    },
  };

  let lastError = "Gemini request failed";

  for (const model of modelList()) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(body),
    });

    const json = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: Array<{ content?: GeminiContent }>;
    };

    if (!response.ok) {
      lastError = json.error?.message || `Gemini HTTP ${response.status}`;
      if (
        response.status === 404 ||
        response.status === 400 ||
        response.status === 429 ||
        response.status >= 500
      ) {
        continue;
      }
      throw new Error(lastError);
    }

    const text = json.candidates
      ?.flatMap((c) => c.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();

    if (!text) {
      lastError = "Gemini returned an empty response";
      continue;
    }

    return { text, model };
  }

  throw new Error(lastError);
}
