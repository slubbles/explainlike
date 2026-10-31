/**
 * Voice mode, the parts that are plain logic: what the assistant is told, the tool it calls to start a video,
 * and turning what it heard into a job request. No keys and no network here.
 */
import { shortLink } from "./form";

export type Turn = { role: "user" | "assistant"; content: string };
export type Depth = "overview" | "working" | "deep";
export type VoiceRequest = { input: string; goal: string; audience: string; depth: Depth; also: string };

export const START_TOOL = {
  type: "function",
  function: {
    name: "start_video",
    description: "Start making the explainer video. Call it only after you know the link and asked if there's anything else to cover.",
    parameters: {
      type: "object",
      properties: {
        link: { type: "string", description: "the GitHub repo, X post or article URL, written as a URL (https://github.com/owner/repo)" },
        goal: { type: "string", description: "what they want to understand, in a short plain phrase" },
        audience: { type: "string", description: "who the video is for, as a viewer description: 'a non-technical cofounder', 'a developer new to the project'" },
        depth: { type: "string", enum: ["overview", "working", "deep"], description: "overview: the big idea; working: how it works, the default; deep: internals and trade-offs" },
        also: { type: "string", description: "anything else they asked to cover, or empty" },
        confirm: { type: "string", description: "one short spoken line saying what you understood, e.g. 'Got it, how a message moves through openmausbot, kept simple for your cofounder. Starting now!'" },
      },
      required: ["link", "goal", "audience", "depth", "also", "confirm"],
    },
  },
} as const;

export function voiceSystem(typed?: string): string {
  return [
    "You're the voice of Explain Like, an app that turns a GitHub repo, an X post or an article into a short whiteboard explainer video.",
    "You're talking out loud with someone, in English, like a warm, casual friend who's good at this. Not an interviewer, not a form.",
    "Keep every reply short: one or two spoken sentences, under 30 words. No lists, no markdown, no emoji. Never read a full URL out loud; say 'that repo' or its name.",
    "Over the chat, find out naturally: the link (repo, X post or article) or the topic, what they want to understand about it, and who it's for or how deep to go. One question at a time, and pick up whatever they already said instead of asking again.",
    "If they only have a topic, ask for a link to a repo, post or article about it; the app needs a link. Spoken links come out like 'github dot com slash owner slash repo': write them as https://github.com/owner/repo.",
    "If they don't care who it's for, assume a curious developer new to the project and a working depth.",
    "Once you have enough, ask something like 'anything else you want me to cover?'. After they answer, call start_video right away, with no other text; its confirm line is what you say.",
    "Never say you are starting in your own words: only the confirm line, after start_video works, says that.",
    "If start_video comes back with an error, tell them briefly and ask what you need to fix it. Spoken names get misheard: if a suggestion comes back, offer it; otherwise ask them to type the link in the box under the chat.",
    typed ? `They already typed this link in the box: ${typed}. Don't ask for the link again.` : "",
  ].filter(Boolean).join("\n");
}

export function greeting(typed?: string): string {
  return typed
    ? `Hey! I see you've got ${shortLink(typed).split("/").slice(-1)[0]} there. What do you want to understand about it?`
    : "Hey! What do you want explained today? A repo, a post, an article?";
}

/** "github dot com slash slubbles slash explain like" and other spoken links, as a URL. */
export function spokenUrl(s: string): string {
  let t = s.trim().replace(/[.,!?]+$/, "");
  t = t.replace(/\s+dot\s+/gi, ".").replace(/\s*\bslash\b\s*/gi, "/").replace(/\s*\/\s*/g, "/").replace(/\s*\.\s*/g, ".");
  if (!/^https?:\/\//i.test(t)) t = `https://${t.replace(/^\/+/, "")}`;
  const [, scheme, rest] = t.match(/^(https?:\/\/)(.*)$/i)!;
  // spaces inside the path come from speech ("explain like" for explainlike); drop them
  return scheme.toLowerCase() + rest.replace(/\s+/g, "");
}

/** The tool call as a job request, or what is wrong with it (the model hears the error and asks again). */
export function readStart(args: unknown, valid: (url: string) => boolean): { ok: true; req: VoiceRequest; confirm: string } | { ok: false; error: string } {
  const a = (args ?? {}) as Record<string, unknown>;
  const str = (k: string, max: number) => (typeof a[k] === "string" ? (a[k] as string).replace(/\s+/g, " ").trim().replace(/^-+\s*/, "").slice(0, max) : "");
  const raw = str("link", 300);
  if (!raw) return { ok: false, error: "no link yet: ask for the repo, post or article link" };
  const input = spokenUrl(raw);
  if (!valid(input)) return { ok: false, error: `"${raw}" is not a public GitHub, X or article link: ask them to say or type it again` };
  const depth = (["overview", "working", "deep"] as const).find((d) => d === a.depth) ?? "working";
  return {
    ok: true,
    req: { input, goal: str("goal", 300), audience: str("audience", 160), depth, also: str("also", 300) },
    confirm: str("confirm", 240) || "Got it, starting your video now.",
  };
}

/** Split streamed text into whole sentences to voice one at a time; the tail waits for more text. */
export function takeSentences(buf: string): { done: string[]; rest: string } {
  const done: string[] = [];
  let rest = buf, m: RegExpMatchArray | null;
  // a sentence ends at . ! ? followed by a space, but not inside a link like github.com
  while ((m = rest.match(/^(.*?[.!?])\s+(?=\S)/s))) {
    done.push(m[1].trim());
    rest = rest.slice(m[0].length);
  }
  return { done, rest };
}
