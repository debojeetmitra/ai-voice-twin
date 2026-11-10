export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  source?: "gemini" | "fallback";
};

export type VoiceState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted";

export type ChatRequestBody = {
  messages: Array<{ role: ChatRole; content: string }>;
  interviewMode?: boolean;
};

export type ChatResponseBody = {
  text: string;
  source: "gemini" | "fallback";
  model?: string;
  error?: string;
};
