"use client";

import { SUGGESTED_QUESTIONS } from "@/lib/persona";
import type { ChatMessage, ChatResponseBody, VoiceState } from "@/lib/types";
import {
  ArrowUp,
  Bot,
  Mic,
  MicOff,
  RotateCcw,
  Square,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

const WELCOME =
  "Hi — I am Debojeet. Ask me anything you would ask in an interview. You can tap the microphone and talk, or type below. I will answer as myself.";

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getRecognition(): SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  return recognition;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined") return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /en-IN/i.test(v.lang) && /male|ravi|google/i.test(v.name)) ||
    voices.find((v) => /en-GB/i.test(v.lang) && /male|daniel|google/i.test(v.name)) ||
    voices.find((v) => /en-US/i.test(v.lang) && /male|david|google/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0] ||
    null
  );
}

export default function VoiceTwinApp() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", content: WELCOME, createdAt: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [muted, setMuted] = useState(false);
  const [interviewMode, setInterviewMode] = useState(false);
  const [liveModel, setLiveModel] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micSupported, setMicSupported] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastSpoken, setLastSpoken] = useState(WELCOME);
  const [levels, setLevels] = useState<number[]>(() => Array.from({ length: 24 }, () => 0.18));

  const scrollerRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldListenRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMicSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    setSpeechSupported("speechSynthesis" in window);
    fetch("/api/status")
      .then((r) => r.json())
      .then((d: { liveModel?: boolean }) => setLiveModel(Boolean(d.liveModel)))
      .catch(() => setLiveModel(false));
  }, []);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, interim, busy]);

  useEffect(() => {
    if (voiceState !== "listening" && voiceState !== "speaking") {
      setLevels(Array.from({ length: 24 }, () => 0.18));
      return;
    }
    const timer = window.setInterval(() => {
      setLevels(Array.from({ length: 24 }, () => 0.2 + Math.random() * 0.8));
    }, 90);
    return () => window.clearInterval(timer);
  }, [voiceState]);

  const statusLabel = useMemo(() => {
    if (error) return error;
    if (voiceState === "listening") return "Listening… speak naturally";
    if (voiceState === "thinking") return "Thinking…";
    if (voiceState === "speaking") return "Speaking…";
    if (muted) return "Voice output muted";
    return "Ready — tap the orb or type a question";
  }, [error, muted, voiceState]);

  function stopSpeaking() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  function speak(text: string) {
    setLastSpoken(text);
    if (muted || !("speechSynthesis" in window)) {
      setVoiceState("idle");
      return;
    }
    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.lang = "en-US";
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setVoiceState("speaking");
    utterance.onend = () => setVoiceState("idle");
    utterance.onerror = () => setVoiceState("idle");
    setVoiceState("speaking");
    window.speechSynthesis.speak(utterance);
  }

  async function sendConversation(nextMessages: ChatMessage[], speakReply: boolean) {
    setBusy(true);
    setVoiceState("thinking");
    setError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          interviewMode,
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = (await response.json()) as ChatResponseBody;
      const reply: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: data.text,
        createdAt: Date.now(),
        source: data.source,
      };
      setMessages((prev) => [...prev, reply]);
      if (data.source === "fallback") {
        setLiveModel(false);
      } else {
        setLiveModel(true);
      }
      if (response.status === 429) {
        setError("Too many requests. Wait a moment, then try again.");
      }
      if (speakReply) speak(data.text);
      else setVoiceState("idle");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError("I could not reach the assistant. Check your connection and try again.");
      setVoiceState("idle");
    } finally {
      setBusy(false);
    }
  }

  async function ask(text: string, speakReply = true) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    stopSpeaking();
    const userMessage: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput("");
    setInterim("");
    await sendConversation(next, speakReply);
  }

  function startListening() {
    setError(null);
    stopSpeaking();
    const recognition = getRecognition();
    if (!recognition) {
      setMicSupported(false);
      setError("Voice input is not supported in this browser. Please type instead. Chrome or Edge work best.");
      return;
    }

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => stream.getTracks().forEach((t) => t.stop()))
      .catch(() => {
        setError("Microphone permission is blocked. Allow the mic in your browser, or type your question.");
      });

    recognitionRef.current?.abort();
    recognitionRef.current = recognition;
    shouldListenRef.current = true;
    setVoiceState("listening");
    setInterim("");

    recognition.onresult = (event) => {
      let finalText = "";
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) finalText += chunk;
        else live += chunk;
      }
      if (live) setInterim(live);
      if (finalText.trim()) {
        shouldListenRef.current = false;
        recognition.stop();
        void ask(finalText);
      }
    };

    recognition.onerror = (event) => {
      shouldListenRef.current = false;
      if (event.error === "not-allowed") {
        setError("Microphone permission is blocked. Allow the mic, or use the text box.");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setError("I could not hear that clearly. Try again, or type the question.");
      }
      setVoiceState("idle");
    };

    recognition.onend = () => {
      if (shouldListenRef.current) {
        try {
          recognition.start();
        } catch {
          setVoiceState("idle");
        }
      } else if (voiceState === "listening") {
        setVoiceState("idle");
      }
    };

    try {
      recognition.start();
    } catch {
      setError("Could not start the microphone. Try again.");
      setVoiceState("idle");
    }
  }

  function stopListening() {
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
    setVoiceState((prev) => (prev === "listening" ? "idle" : prev));
  }

  function toggleMic() {
    if (voiceState === "listening") {
      stopListening();
      return;
    }
    startListening();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(input, !muted);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(input, !muted);
    }
  }

  function clearChat() {
    stopSpeaking();
    stopListening();
    setMessages([{ id: "welcome", role: "assistant", content: WELCOME, createdAt: Date.now() }]);
    setError(null);
    setVoiceState("idle");
  }

  async function toggleInterview(next: boolean) {
    setInterviewMode(next);
    if (next) {
      await ask("Let's start interview mode. Greet me as Debojeet and ask me your first question.", !muted);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 md:py-8">
      <header className="glass mb-5 flex flex-col gap-4 rounded-3xl px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="orb grid h-12 w-12 place-items-center rounded-2xl text-sm font-semibold">DM</div>
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">AI Voice Twin</p>
            <h1 className="font-[family-name:var(--font-display)] text-3xl leading-none md:text-4xl">Debojeet Mitra</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">AI Agent Team Candidate · 100x</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)]">
            {liveModel === null ? "Checking model…" : liveModel ? "Live Gemini" : "Offline persona"}
          </span>
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1 text-xs">
            <input
              type="checkbox"
              className="accent-[#7c9cff]"
              checked={interviewMode}
              onChange={(e) => void toggleInterview(e.target.checked)}
            />
            Interview mode
          </label>
        </div>
      </header>

      <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="glass flex min-h-[62vh] flex-col rounded-3xl p-4 md:p-6">
          <div ref={scrollerRef} className="scrollbar-thin mb-4 flex-1 space-y-4 overflow-y-auto pr-1">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-xs font-semibold ${
                    message.role === "assistant" ? "orb" : "bg-white/10"
                  }`}
                >
                  {message.role === "assistant" ? "DM" : "You"}
                </div>
                <div
                  className={`max-w-[min(100%,42rem)] rounded-3xl px-4 py-3 text-sm leading-6 ${
                    message.role === "assistant"
                      ? "bg-white/5 border border-[var(--line)]"
                      : "bg-[#1b2a55] border border-white/10"
                  }`}
                >
                  <p>{message.content}</p>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--muted)]">
                    <span>{formatTime(message.createdAt)}</span>
                    {message.role === "assistant" && message.source === "fallback" && (
                      <span>Prepared persona · not a live model</span>
                    )}
                    {message.role === "assistant" && message.source === "gemini" && <span>Live model</span>}
                  </div>
                </div>
              </article>
            ))}
            {interim && (
              <p className="text-sm text-[var(--muted)] italic">Hearing: {interim}</p>
            )}
            {busy && voiceState === "thinking" && (
              <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <Bot className="h-4 w-4 animate-pulse" />
                Debojeet is thinking…
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-[var(--line)] bg-black/20 p-4">
            <div className="mb-4 flex h-12 items-end justify-center gap-1">
              {levels.map((level, index) => (
                <span
                  key={index}
                  className="w-1.5 rounded-full bg-gradient-to-t from-[#5b8cff] to-[#c4b5fd]"
                  style={{ height: `${Math.max(8, level * 48)}px`, opacity: voiceState === "idle" ? 0.35 : 1 }}
                />
              ))}
            </div>
            <p className="mb-4 text-center text-sm text-[var(--muted)]">{statusLabel}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={toggleMic}
                disabled={busy && voiceState !== "listening"}
                className={`orb relative grid h-20 w-20 place-items-center rounded-full text-white transition ${
                  voiceState === "listening"
                    ? "orb-listening"
                    : voiceState === "speaking"
                      ? "orb-speaking"
                      : voiceState === "thinking"
                        ? "orb-thinking"
                        : ""
                }`}
                aria-label={voiceState === "listening" ? "Stop listening" : "Start listening"}
              >
                {voiceState === "listening" ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopListening();
                  stopSpeaking();
                  setVoiceState("idle");
                }}
                className="grid h-12 w-12 place-items-center rounded-full border border-[var(--line)] bg-white/5"
                aria-label="Stop"
              >
                <Square className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => speak(lastSpoken)}
                className="grid h-12 w-12 place-items-center rounded-full border border-[var(--line)] bg-white/5"
                aria-label="Replay last answer"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  if (next) stopSpeaking();
                }}
                className="grid h-12 w-12 place-items-center rounded-full border border-[var(--line)] bg-white/5"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={clearChat}
                className="grid h-12 w-12 place-items-center rounded-full border border-[var(--line)] bg-white/5"
                aria-label="Clear conversation"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {!micSupported && (
              <p className="mt-3 text-center text-xs text-amber-200">
                This browser cannot transcribe speech. Use Chrome or Edge for voice, or type below.
              </p>
            )}
            {!speechSupported && (
              <p className="mt-3 text-center text-xs text-amber-200">
                Spoken replies are unavailable here. You can still read answers in the chat.
              </p>
            )}
          </div>

          <form onSubmit={onSubmit} className="mt-4 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder="Type a question. Enter to send, Shift+Enter for a new line."
              className="min-h-[72px] flex-1 resize-y rounded-2xl border border-[var(--line)] bg-black/25 px-4 py-3 text-sm outline-none placeholder:text-[var(--muted)]"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#7c9cff] text-[#070b16] disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </form>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="glass rounded-3xl p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">How to use</p>
            <ol className="mt-3 space-y-2 text-sm text-[var(--muted)]">
              <li>1. Tap the glowing microphone.</li>
              <li>2. Allow the browser to use your mic if asked.</li>
              <li>3. Ask a question. Debojeet will reply in chat and out loud.</li>
              <li>4. Prefer typing? Use the box under the controls.</li>
            </ol>
          </div>
          <div className="glass rounded-3xl p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Suggested questions</p>
            <div className="mt-3 flex flex-col gap-2">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => void ask(question, !muted)}
                  className="rounded-2xl border border-[var(--line)] bg-white/5 px-3 py-2 text-left text-sm leading-5 hover:bg-white/10"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
