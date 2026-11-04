# Explainer playbook v2: how the best channels explain things (for Explanimate)

Written 2026-11-03. Research only: no repo changes and no paid API calls.
This builds on `docs/explaining-playbook.md` (Nov 1) and **replaces its "one analogy world / analogy first, then real name" rule.**
The maintainer's v3 feedback rules that out: use real part names, anchor to tools people already use, cover the core, and stop repeating the same visual formula.

## 0. Evidence used

The study worked from YouTube captions and local whisper transcripts of the videos below, plus per-line frame sheets for the Crayon videos. That source material is not kept in the repo.

| Channel                | Videos analysed this round (full length unless noted)                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fireship               | Docker in 100 Seconds (Gjnup-PuquQ); Claude Code source leak (mBHRPeg8zPU, 3.3M views); OpenClaw (ssYt09bCgUY); MCP (HyzlYwjoXOQ)                                                                 |
| Caleb Writes Code      | Agent Harness in 8 min (1a1VXDdIyrk, 802k); Loop Engineering (4biXYSNkn9Y; the captions are a machine re-translation, so I don't quote them word for word); PVe-ibLRLaw and 0SVpmARc90o (whisper) |
| KodeKloud              | RAG Explained (_HQ2H_0Ayy0, 902k); Kubernetes Architecture (8C_SCDbUJTg); Kafka in 10 min (5dmQxG-2pgQ, whisper); E60Fs-DQQOg (whisper)                                                           |
| Crayon Capital         | TSMC (aDCKVS8aA8E) and Anthropic (H5GYXhpE5yI), full whisper plus per-line frames; Palantir ELI5 (GSkySDNmjV8, captions)                                                                          |
| Sean AI Stories        | Agent System Design (CyLYY_xb5bQ); Harness & Loop Eng (GrNbuWWJYiI, partly machine-translated captions); 0sI0MbCt4f4 (whisper)                                                                    |
| CNBC / BI / Vox / Alux | Nov 1 full captions (CNBC ZYsP8qM6bPE and Wh1zlJXKy1M, BI 62VYumto5Jc, Vox KVYNwthBcgM), Alux whisper, and Nov 1 first-150 s notes for the rest                                                   |

YouTube's subtitle endpoint returned HTTP 429 for about 60% of requests. I got the rest by transcribing locally the mp4s that were already downloaded on Nov 1.

---

## 1. Naming parts: real names, explained right where they first appear

The pros never rename a part. They say the real name, then one plain clause saying what it does. There are three patterns, and all three keep the real name.

**A. Name, then what it does (the most common).**

- Fireship (Docker): "the docker file … it's just code that tells docker how to build an image which itself is a snapshot of your software along with all of its dependencies"
- Fireship (MCP): "model context protocol … which is basically a new standard for building apis"
- Fireship (OpenClaw): "Hooks allow you to tap into different life cycle events that happen as this tool runs"

**B. Show the behaviour, then say "This is called <real name>".** Crayon uses this pattern for every jargon term.

- Crayon (Anthropic): "show people two AI answers. Ask which one is better. Repeat this thousands of times until it stops behaving like an idiot. **This is called reinforcement learning from human feedback, or R-L-H-F.**"
- Crayon (TSMC): "Companies like Intel, Texas Instruments, Samsung, they design and manufacture their own chips. **It's called the IDM model, integrated device manufacturer.**"
- KodeKloud (RAG): after building the idea step by step, "**This method is called rag or retrieval augmented generation.**"

**C. "This thing called X".** This is Sean's soft version for a non-technical audience.

- "these things will be loaded into **this thing called working memory**"
- "**another thing we need is called episodic memory**, and it includes things like past events"

**Acronyms are spelled out once and then used freely:**

- "Chrome DevTools Protocol, or CDP"
- "R-L-H-F"
- "LLMOps (large language model operations)" (Sean)

## 2. Anchor to products the viewer already uses

Every AI channel names real tools the viewer has open in another tab:

- Caleb: "**Cursor, WinServe, Cline, Rue, and Aider** are all examples of early players that adopted tool calling"
- Caleb (Loop Eng.) builds the whole explanation on "ChatGPT and Claude Code, as this is something we all have practical experience with"
- Sean: "For example, you ask a question to **ChatGPT or DeepSeek**"
- KodeKloud: "connect an AI assistant **just like chatgpt**"
- Fireship (OpenClaw): "a tool written in TypeScript that **wraps Claude and GPT-5**" and "a messenger app, **like Telegram, Slack, WhatsApp, Discord**"
- Crayon contrasts against the familiar product: "Ma'am, just another chat GPT." It also sizes things against it: "three times bigger than chat GPT"

**Rule:** for the actor in a repo explainer ("AI agent", "client", "caller"), name 2–3 real products: "an AI agent like Claude Code or Cursor". Put them on screen as **text chips, not logos** (no trademarks).

## 3. Analogies: one sentence, pinned to a real name, never a replacement

- Fireship: "the docker file **is like dna**"
- Fireship: "an access token, **which is like a password**"
- Fireship: MCP is "like a **USB-C port** for AI applications"

In each case the analogy is a tag on the real name. It is not a new name for the part.

Crayon draws its analogy and labels the drawing with the real term:

- context memory is a bowl of numbered balls labelled **"CHATBOTS MEMORY"**
- the balls that spill out are labelled **"Old Data"**
- the bowl is then relabelled **"9,000 Tokens"** as the narration says "from around 9,000 tokens to 100,000" (`crayon-frames/anth_mem_0.jpg`)

Counter-example: KodeKloud's Kubernetes and Kafka lessons run one analogy for 10 minutes ("cargo ships … control ships"; "I am the producer … the post office"). Even there, each analogy part is mapped back at once: "These relate to the cargo ships … **the control ships relate to the master node**." That format works for a long course. It is exactly what the maintainer said felt wrong in a 90-second repo explainer.

**Rule:** use at most one or two analogies per video, each a single clause attached to a real name, and only for a _behaviour_ that is hard to picture (persistence, a protocol, memory limits). Never use one for a part's name. Never repeat it as a running metaphor.

## 4. Scope: the core path, plus only what's needed to understand it

- Fireship's Docker video names exactly three things: "there are three fundamental elements in the universe of docker: the docker file, the image and the container". Compose, volumes, networking and Swarm are all left out. It runs 2 minutes and is still the canonical Docker explainer.
- Fireship's OpenClaw walk-through covers install, model, messenger, skills, hooks and dashboard in one line each, then gives one real example (stock alert). It skips config detail: "tons of config settings to customize basically everything."
- KodeKloud RAG splits the name into its parts, "Retrieval, augmented, and generation", and explains just those three.
- Crayon's Anthropic video skips most of the company history and picks the three or four decisions that explain "how did it get this big".

**Rule (the maintainer's own words):** "cover everything relevant and necessary, not every feature every time."

- Explain the one path a request takes.
- Explain any part the viewer must know to follow that path.
- Give side features at most one line, and only if they serve the hook. For a login hook, the auth vault qualifies; the MCP server does not.
- Internal helper libraries are never explained.

## 5. Hooks and openings

Patterns that work:

- **"This is <concrete thing>." plus a surprising fact, then the question.**
  - "This is Anthropic. Soon it will go public at a $2 trillion valuation … But how did it actually get this big?" (Crayon)
  - "This is an Airbus A320 neo. It's less than six years old…" (CNBC)
  - "This is the Bed Scrunchie…" (BI)
- **A vivid present-tense scene.** "Right now, somewhere in Taiwan, a machine the size of a school bus is printing circuits thinner than a strand of DNA." (Crayon)
- **Name plus a one-line definition plus "but what is X and why do you need one?"** "docker, a tool that can package software into containers that run reliably in any environment, but what is a container and why do you need one" (Fireship)
- **The viewer's own problem.** "So, your company has 500 gigabytes of documents … and you're asked to connect an AI assistant just like chatgpt" (KodeKloud)

**Our proven opener stays fixed**:

1. title card `agent-browser`
2. tagline "ai clicks real web pages"
3. the line "What if your AI could really click around the web?"

The maintainer loved it. It is a CNBC/Crayon-style "this is X" combined with a "what if" question. Within the next two lines, follow it with the real name, a one-clause definition and the product anchors, as Fireship does.

## 6. Pacing, sentence length, humour, recaps

**Pace**

| Channel           | Pace                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Crayon            | about 150 wpm. Lines are 2–4 s, usually 5–10 words ("Forget black holes." "That thought never leaves him."). |
| Fireship          | about 190 wpm, the fastest. Long, rolling sentences with jokes inside them.                                  |
| Caleb / KodeKloud | about 160 wpm, more connective ("So, the question is…").                                                     |

**Pivots are short standalone lines:**

- "Here's the thing." / "Anyway, back to Morris Chang." (Crayon)
- "Okay, let's zoom back out a little bit" (Caleb)
- "Let's take it step by step" (Sean)

**Problem before the fix.** Each new idea opens with what breaks without it:

- Docker brings in VMs as the "bulky and slow" alternative first.
- KodeKloud's RAG tries two naive approaches and rejects them ("this is a very inefficient way") before naming RAG.
- Caleb's harness video goes prompt, then context, then harness, each one introduced by the limit of the last.

**Numbers become human-sized.** "from around 9,000 tokens to 100,000. **In human language, that means** Claude can process roughly 75,000 words at once. About the length of an entire book" (Crayon)

**Humour:** one dry aside per scene at most, and never at the cost of the explanation.

- Crayon: "This chip, not that one. But what is it? A kind of cereal? Says the voice in your head."
- Fireship: "deploy broken code with absolute confidence"

The existing Explanimate rule of "one short, dry aside" matches the pros.

**Recaps are one sentence of payoff, not a list:**

- "We went from zero to working rag system backed by real tests" (KodeKloud)
- "a principle isn't a principle until it costs you money" (Crayon)
- Fireship has no recap at all. Its ending is the last fact plus a punchline: "your top secret application is just one NPM publish away from becoming open source"

## 7. Visual variety: what Crayon actually puts on screen per line

I measured this from the per-line frame sheets in `crayon-frames/` (two frames per whisper line, captioned).

**Rate:**

| Video (first 120 s) | Hard cuts | Narration lines | Cuts/min | Words/min | Rate                                             |
| ------------------- | --------- | --------------- | -------- | --------- | ------------------------------------------------ |
| Anthropic           | 66        | 43              | 33       | about 150 | about 1.5 new pictures per line, one every 1.8 s |
| TSMC                | 40        | 19 longer lines | 20       | n/a       | about 2 per line                                 |

In-shot builds come on top of the hard cuts: a ball drops, a label rewrites, a diagram node appears.

**Rule:** the picture is the literal noun or claim of the line being spoken _right now_. Examples from TSMC 0–25 s (`tsmc_0.jpg`):

| Narration                                                                   | On screen                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| "somewhere in Taiwan"                                                       | a Taipei street with Taipei 101 and a "TAIPEI" road sign                       |
| "a machine the size of a school bus is printing circuits"                   | the lithography machine with a technician                                      |
| "thinner than a strand of DNA"                                              | close-up of the wafer under a needle                                           |
| "It costs $200 million"                                                     | a browser news page, "$200 Million Semiconductor Machine"                      |
| "almost all of them are in one place. 100 miles from the Chinese coastline" | world map with dots, then zoom to Taiwan                                       |
| "Every iPhone"                                                              | a pile of phones                                                               |
| "every modern fighter jet"                                                  | a jet streaking past                                                           |
| "This is the story of TSMC"                                                 | tweezers holding a chip with the TSMC mark, then the chip alone on a dark card |

**Visual vocabulary Crayon reuses** (fixed style, free content):

1. **Concrete-noun picture.** Whatever object the line names.
2. **Numbers as documents or UI.**
   - The two job offers are drawn as letters reading "$479/mo" and "$480/mo".
   - "75,000 words" is a word-processor window whose word counter ticks up.
   - "three times bigger than chat GPT" is bars labelled ChatGPT and Claude next to a book.
3. **Product as a drawn UI mock with its name in text.**
   - RLHF is shown as a "WHICH RESPONSE DO YOU PREFER?" two-card UI, then a "GPT-2" chat window.
   - Claude is a dark app window with "CLAUDE" written in it, and files are dragged in from a folder window.
4. **The real name as a title that writes itself on a plain card while it is spoken, and the diagram builds under it.**
   - At "This is called reinforcement learning from human feedback", the words "Reinforcement Learning from Human Feedback" write on.
   - A 4-node loop then builds under it: AI answer → human rates → AI learns → AI improves (`anth_rlhf_0.jpg`).
5. **An analogy object labelled with the real term.** The "CHATBOTS MEMORY" bowl becomes "9,000 Tokens".
6. **Black kinetic-text cards** for pivots and punchlines, with the words writing on: "Anyway", "Spoiler", "In human language, that…", "Yes. Your bank account?"
7. **Speech bubbles** that echo the line word for word ("This will change everything.", "Are you slow?").
8. **Maps and blueprints** for places and plans. A blue "MASTER PLAN" blueprint becomes a chalk-line org chart labelled "Industrial Technology Research Institute".

**What stays fixed for Crayon:** art style, character designs, palette, font, black pivot card, and sponsor-segment format.
**What's free:** what each shot shows. No two consecutive lines share a composition unless it is the same scene continuing (a dialogue, or the bowl filling).

**Other channels** (Nov 1 cut counts, cuts/min):

| Channel   | Cuts/min | Style                                                                                       |
| --------- | -------- | ------------------------------------------------------------------------------------------- |
| Vox       | 26       | archival footage, highlighted documents, maps                                               |
| BI        | 11–20    | real footage and real documents with highlights ("An email from December 8th, 2021 shows…") |
| Fireship  | 13–18    | real code or terminal, memes, product screenshots for every named product                   |
| CNBC      | 11–14    | footage, interviews, number cards                                                           |
| Caleb     | 4        | one evolving diagram; slow but the diagram changes per sentence                             |
| KodeKloud | 1–3      | one canvas that builds per sentence                                                         |
| Sean      | 1        | one canvas that builds per sentence                                                         |
| Alux      | 0–1      | stock footage loop; the weakest visually                                                    |

Takeaway: **"visual change" doesn't have to mean a hard cut.** Diagram channels change the canvas on every sentence (a new node, a highlighted edge, a new label). What none of the good channels do is show the **same decorative element every video regardless of the words**. That is exactly the v3 title-card icon row (person, λ, laptop, network, browser) the maintainer called formulaic.

## 8. Fixed template vs per-video visual freedom (recommendation: hybrid)

**Fixed:** the brand.

- Palette and chalk-dark board style, fonts.
- Title card layout: name plus lowercase tagline. Keep the opener the maintainer loved.
- Black pivot card style.
- Board look: node and edge style, real-name labels.
- Recap layout (the full path lights up in order).
- Caption style and end card.
- The scene order: hook → parts on the path → one walkthrough → (optional) scale or side note → recap.

**Free, chosen per line:** _what_ is on screen. The planner picks one item per narration line from a visual library, driven by what that line says. Nothing appears that isn't being said within ±1 line.

### Visual library (each has a fixed look, free content)

| Type                                  | Use when the line…                                         | Content comes from                                                     |
| ------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `title`                               | opens or closes the video                                  | product name + tagline                                                 |
| `kinetic` (black card)                | is a pivot, question or punchline ("Now the clever part.") | 2–6 words of the line                                                  |
| `chips`                               | names familiar products ("like Claude Code or Cursor")     | product names as text chips, no logos                                  |
| `terminal`                            | mentions a command or install step                         | the exact command from README or code, with real output when available |
| `output` (snapshot / JSON / log card) | describes what a tool returns                              | a real or faithful sample of the output format                         |
| `browser`                             | describes something happening on a web page                | page mock + cursor + click ripple on the named element                 |
| `board` (build)                       | introduces or uses a real part                             | node with the **real name**, plus edge labelled with the real protocol |
| `board` (pulse)                       | follows a request along the path                           | highlight the moving edge or node only                                 |
| `number`                              | contains a figure                                          | the figure in human terms (a book, a count, a bar)                     |
| `contrast`                            | before/after or with/without                               | split screen                                                           |
| `doodle`                              | (rare) carries the single allowed analogy                  | a small drawing **labelled with the real term**                        |
| `ui`                                  | mentions a dashboard or app screen                         | a drawn mock of that screen                                            |

### Picking rules (per line)

1. Split narration into lines: one sentence or clause, about 2–4 s, 5–14 words.
2. Each line gets one visual. Its on-screen text must reuse words actually spoken in that line. This extends the existing `syncPhrases` check to visuals.
3. Priority: exact command → `terminal`; real part name → `board`; product names → `chips`; page action → `browser`; returned data → `output`; number → `number`; pivot or question → `kinetic`.
4. Never use the same visual type 3 lines in a row, except board builds/pulses inside a walkthrough. Every 3–5 lines, change layout: full-screen card ↔ board ↔ split.
5. Target 15–25 visual changes per minute, counting board builds. That sits between Crayon (33) and Caleb (4), which fits a technical whiteboard style.
6. Remove the generic title-card icon row. If icons appear, each must be a noun from the current line and appear _when it is spoken_. "AI agent" → chips "Claude Code · Cursor"; "real Chrome" → browser window.
7. Board parts are always labelled with real names: "agent-browser CLI", "daemon", "CDP", "Chrome for Testing". The planner's `keyword` should be the real name, not a nickname like "terminal tool" or "browser-link".

---

## 9. Do / Don't

**Do**

- Open with the proven title card plus a "what if" question. Within two lines, give the real name, a one-clause definition and the familiar-product anchor.
- Say the real name of every part; explain it in one plain clause at first mention ("…, which…" or "This is called X").
- Spell out acronyms once ("Chrome DevTools Protocol, or CDP").
- Name tools the viewer uses ("an AI agent like Claude Code or Cursor").
- Follow one concrete task end to end (log in to a site), with real commands and real output on screen.
- Show the problem before the part that fixes it.
- Turn numbers into human-sized things.
- Keep lines short and one idea each; use short pivots ("Now the clever part.").
- Make each line's visual show what that line says.
- End with a one-sentence payoff plus a one-sentence retrace.

**Don't**

- Rename parts with analogies or nicknames ("terminal tool", "browser-link", "a watcher").
- Run one metaphor through the video.
- Tour every feature (MCP, profiles, streaming, sandbox libs) when the hook is one job.
- Explain internal helper libraries the viewer will never touch.
- Show a decorative icon row or any visual that isn't tied to the spoken line.
- Use the same layout for 3+ lines in a row.
- Use logos or trademarks; use text chips instead.
- Write a recap that is a list of steps.

## 10. Narration skeleton for a repo explainer (about 60–100 s)

```
HOOK (fixed title card)       "What if <your AI / your app> could <the one job>?"            [title]
                               One line of contrast: what it does today without this.        [kinetic]
                               "That's <real name>: a <kind of thing> that lets <actor like
                                Product A or Product B> <do the job>."                        [chips → board seed]
                               "Let's follow one <job>: <concrete example>."                  [kinetic]
PARTS ON THE PATH (one beat each, in path order; only parts the path needs)
  for each part:  "<Real name>, <what it does in one clause>." (+ why it exists, if not obvious)
                               visual: board build with the real name; terminal if a command  [board / terminal]
CORE IDEA (the one clever thing; 2–4 lines)
                               "Now the clever part." → the idea shown with real I/O          [kinetic → output → terminal]
WALKTHROUGH (the request moving, 3–5 lines)
                               Each line = one hop, naming the parts it passes through.       [board pulse / browser]
OPTIONAL ONE-LINER(S)          Only features that serve the hook (e.g., credentials for login). [ui / output]
RECAP (2 sentences)            Payoff for "you" + one-sentence retrace by real names.        [board lights in order → end card]
```
