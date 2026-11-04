/**
 * What the viewer is asking for, read from their own words. The engine has no LLM intent router
 * (the MCP prompt lets the calling agent pass `question` through), so these are small heuristics
 * with deliberately narrow patterns: a false positive would explain the wrong thing.
 */

/** Lowercase, straight quotes, single spaces: the form every matcher below reads. */
const clean = (text: string) => ` ${text.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim()} `;

const HAS = (t: string, re: RegExp) => re.test(t);

/**
 * Is this a question about the current checkout's own working changes ("what is this feature we are
 * working on about?", "explain my current changes", "what does this branch do")? True means the
 * video's subject is the branch, the diff, new files and recent commits, not the repo in general.
 */
export function isThisFeatureQuestion(text: string): boolean {
  const t = clean(text);
  // a comparison ("the diff between X and Y") is not the working tree
  if (HAS(t, /\bbetween\b/)) return false;
  // release history ("what changed in v2") is not the working tree either
  if (HAS(t, /\bchang(e|ed|es) in (the )?(v\d|version \d)/)) return false;
  return (
    HAS(t, /\bthis feature\b/) ||
    HAS(t, /\bthis branch\b/) ||
    HAS(t, /\bcurrent branch\b/) ||
    HAS(t, /\bmy branch\b/) ||
    HAS(t, /\bmy changes\b/) ||
    HAS(t, /\bcurrent changes\b/) ||
    HAS(t, /\bthese changes\b/) ||
    HAS(t, /\bworking changes\b/) ||
    HAS(t, /\buncommitted\b/) ||
    HAS(t, /\bunstaged\b/) ||
    HAS(t, /\bstaged changes\b/) ||
    HAS(t, /\bmy diff\b/) ||
    HAS(t, /\bthis diff\b/) ||
    HAS(t, /\bthe working tree\b/) ||
    HAS(t, /\bwork in progress\b/) ||
    HAS(t, /\bw-ip\b/) ||
    HAS(t, /\bwip\b/) ||
    HAS(t, /\bwhat (are|'re|r) we working on\b/) ||
    HAS(t, /\bbeen working on\b/) ||
    HAS(t, /\bwhat does this branch\b/) ||
    HAS(t, /\bwhat's new\b/) ||
    HAS(t, /\bwhat is new\b/) ||
    HAS(t, /\bwhat('s| is| has)? changed\b/)
  );
}

/**
 * Is this asking for a tour of the codebase itself ("give me the anatomy", "how does the codebase
 * fit together", "walk me through the parts")? True picks the anatomy format for repos: the parts
 * layer by layer, anchored on one request traced end to end. One feature, the working tree, or a
 * comparison ("the diff between X and Y") is never a tour.
 */
export function isAnatomyQuestion(text: string): boolean {
  const t = clean(text);
  if (HAS(t, /\bbetween\b/)) return false;
  return (
    HAS(t, /\banatomy\b/) ||
    HAS(t, /\btour\b/) ||
    HAS(t, /\bfits? together\b/) ||
    HAS(t, /\b(parts|pieces) of (this|the|your) (project|codebase|code|repo|repository|app|system)\b/) ||
    HAS(t, /\bwhat are the (parts|pieces|components|modules|layers|packages)\b/) ||
    HAS(
      t,
      /\bhow (is|does) (this|the|your) (codebase|project|repo|repository|code|app) (organized|organised|structured|laid out|put together|fit together)\b/,
    ) ||
    HAS(t, /\bhow the (pieces|parts|components|modules|packages|layers) (fit|come|work) together\b/) ||
    HAS(t, /\b(codebase|project|repo|repository) (tour|structure|layout|organization|organisation|map|anatomy|overview)\b/) ||
    HAS(t, /\b(structure|layout|organization|organisation|map) of (this|the|your) (codebase|project|repo|repository|code)\b/) ||
    HAS(t, /\bwalk( me)? through (this|the|your) (codebase|project|repo|repository|code)\b/) ||
    (HAS(t, /\bshow me around\b/) && HAS(t, /\b(codebase|project|repo|repository|code)\b/))
  );
}

/**
 * Is this too vague to explain ("explain", "?", "what is this about")? A vague goal is dropped and
 * the video explains the source in general; a vague input on its own is refused with a friendly
 * message. Real topics ("photosynthesis", "how DNS works") are never vague.
 */
export function isVagueQuestion(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t || t.length < 2 || /^[?.!…]+$/.test(t)) return true;
  const bare = t.replace(/[?.!…]+$/, "").trim();
  return /^(please )?(explain|describe|summarise|summarize|overview|video|make a video|tell me more|do it|what is this( all)?( about)?|what's this( all)?( about)?|explain this( repo(sitory)?| project)?|describe this( repo(sitory)?| project)?)(\s+(this|that|it|please))?$/.test(
    bare,
  );
}

export interface DetectedLanguage {
  /** short code, e.g. "es" */
  code: string;
  /** name for sentences, e.g. "Spanish" */
  name: string;
}

/**
 * The language a question is written in, or undefined for English (and for text too short to tell).
 * Non-Latin scripts decide on their own; Latin-script languages need distinctive stopwords, so an
 * English question never misfires ("was" alone does not make it German).
 */
export function detectLanguage(text: string): DetectedLanguage | undefined {
  const t = ` ${text} `;
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(t)) return { code: "ja", name: "Japanese" };
  if (/[\uac00-\ud7af]/.test(t)) return { code: "ko", name: "Korean" };
  if (/[\u4e00-\u9fff]/.test(t)) return { code: "zh", name: "Chinese" };
  if (/[\u0600-\u06ff]/.test(t))
    return /[\u06af\u067e\u0686\u0698]/.test(t) ? { code: "fa", name: "Persian" } : { code: "ar", name: "Arabic" };
  if (/[\u0900-\u097f]/.test(t)) return { code: "hi", name: "Hindi" };
  if (/[\u0400-\u04ff]/.test(t)) return /[іїєґІЇЄҐ]/.test(t) ? { code: "uk", name: "Ukrainian" } : { code: "ru", name: "Russian" };
  if (/[\u0590-\u05ff]/.test(t)) return { code: "he", name: "Hebrew" };
  if (/[\u0e00-\u0e7f]/.test(t)) return { code: "th", name: "Thai" };
  const words = new Set(
    t
      .toLowerCase()
      .split(/[^a-zà-ÿ'’]+/)
      .filter(Boolean),
  );
  const hits = (...ws: string[]) => ws.filter((w) => words.has(w));
  const accent = (...res: RegExp[]) => res.some((re) => re.test(t));
  const scored: { lang: DetectedLanguage; n: number; sure: boolean }[] = [
    {
      lang: { code: "es", name: "Spanish" },
      n: hits(
        "que",
        "qué",
        "cómo",
        "como",
        "porque",
        "explica",
        "explícame",
        "explicame",
        "este",
        "esta",
        "estos",
        "estas",
        "sobre",
        "una",
        "los",
        "las",
        "del",
        "funciona",
        "repositorio",
      ).length,
      sure: hits("qué", "cómo", "explícame", "explicame", "por qué").length > 0 || accent(/[¿¡]/, /ñ/),
    },
    {
      lang: { code: "fr", name: "French" },
      n: hits(
        "quoi",
        "comment",
        "pourquoi",
        "explique",
        "explique-moi",
        "cette",
        "ces",
        "les",
        "des",
        "une",
        "dans",
        "sur",
        "fonctionne",
        "dépôt",
      ).length,
      sure: hits("quoi", "comment", "pourquoi", "explique").length > 0,
    },
    {
      lang: { code: "de", name: "German" },
      n: hits(
        "was",
        "wie",
        "warum",
        "erklärt",
        "erklart",
        "erkläre",
        "erklar",
        "dieses",
        "diese",
        "dieser",
        "einer",
        "einem",
        "einen",
        "und",
        "über",
        "nicht",
        "funktioniert",
        "aktuellen",
      ).length,
      sure: hits("warum", "erklärt", "erklart", "erkläre", "erklar", "funktioniert").length > 0 || accent(/[äöüß]/),
    },
    {
      lang: { code: "it", name: "Italian" },
      n: hits(
        "cosa",
        "come",
        "perché",
        "perche",
        "spiega",
        "spiegami",
        "questo",
        "questa",
        "questi",
        "della",
        "nella",
        "sono",
        "funziona",
        "correnti",
      ).length,
      sure: hits("cosa", "perché", "perche", "spiega", "spiegami").length > 0,
    },
    {
      lang: { code: "pt", name: "Portuguese" },
      n: hits("como", "porque", "explique", "este", "esta", "você", "voce", "não", "nao", "uma", "sobre", "funciona", "repositório").length,
      sure: hits("você", "voce", "não", "nao", "explique").length > 0 || accent(/ão/, /ç/),
    },
    {
      lang: { code: "nl", name: "Dutch" },
      n: hits("wat", "hoe", "waarom", "legt", "leg", "deze", "dit", "een", "van", "werkt", "huidige").length,
      sure: hits("waarom").length > 0,
    },
  ];
  const best = scored.filter((s) => s.n >= 2 || (s.n >= 1 && s.sure)).sort((a, b) => b.n - a.n)[0];
  return best?.lang;
}

export interface NarrationLanguage {
  /** ISO-ish code the narration is written in ("en" unless the voice speaks the question's language) */
  code: string;
  name: string;
  /** true when the narration may be written in the question's language */
  supported: boolean;
  /** an instruction appended to the planner's voice when supported */
  instruction?: string;
  /** a manifest note explaining what was decided, when the question was not English */
  note?: string;
}

/**
 * Which language the narration is written in. The question's language wins when the voice can speak
 * it: the silent voice keeps any language (it only times captions), a Deepgram voice only the one
 * its model targets (its id ends in that language, e.g. "-es"). Otherwise the video narrates in
 * English but keeps the viewer's goal, so it stays relevant.
 */
export function narrationLanguage(
  ask: { goal?: string; audience?: string; also?: string } | undefined,
  voiceModel: string,
): NarrationLanguage {
  const det = detectLanguage([ask?.goal, ask?.audience, ask?.also].filter(Boolean).join("\n"));
  if (!det) return { code: "en", name: "English", supported: true };
  const speaks = voiceModel === "silent" || new RegExp(`-${det.code}\\b`, "i").test(voiceModel);
  if (speaks)
    return {
      code: det.code,
      name: det.name,
      supported: true,
      instruction: `Write every line of narration in ${det.name}.`,
      note: `the question is in ${det.name}; narrating in ${det.name}`,
    };
  return {
    code: "en",
    name: "English",
    supported: false,
    note: `the question is in ${det.name}, which the ${voiceModel} voice does not speak; narrating in English`,
  };
}
