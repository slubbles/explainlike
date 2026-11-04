# agent-browser: narration rewrite (v4 draft, text only, no render)

Facts come from:

- `/workspace/timed-run/agent-browser-v3/out/plan.json` and `architecture.json`
- the agent-browser README (re-checked 2026-11-03): client and daemon architecture, Rust CLI + Rust daemon using CDP, `agent-browser install` downloads Chrome for Testing, `snapshot` = "accessibility tree with refs", `click @e2` / `fill @e3`, auth vault "The LLM never sees passwords", daemon persists between commands.

Rules applied (see PLAYBOOK.md):

- real part names, each with a one-clause meaning
- familiar anchors (Claude Code, Cursor) as text chips, not logos
- one core path: open → snapshot → fill/click by ref → fresh snapshot
- no analogies for part names
- one visual per line, tied to the words in that line
- no stock icon row

About 215 words, about 85 s at 2.5 words/s, about 20 visual changes per minute.

## Narration and per-line visual plan

| #   | Scene | Narration (one line = one visual beat)                                                                                                   | On screen at that moment                                                                                                                                           |
| --- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | hook  | _(title card, kept from v3)_ "What if your AI could really click around the web?"                                                        | **title**: `agent-browser`, tagline "ai clicks real web pages". No icon row.                                                                                       |
| 2   | hook  | "Not guess what a page says. Actually open it, read it, and press the button."                                                           | **kinetic** black card: "open · read · press" writes on, one word per verb as spoken                                                                               |
| 3   | hook  | "That's agent-browser: a command-line tool that lets an AI agent, like Claude Code or Cursor, drive a real Chrome browser."              | **chips → board seed**: text chips "Claude Code" "Cursor" pop in on their names, arrow to a terminal `$ agent-browser`, arrow to a Chrome window                   |
| 4   | hook  | "Let's follow one job: logging you in to a site."                                                                                        | **kinetic**: "one job: log in"                                                                                                                                     |
| 5   | parts | "It starts with your AI agent. Claude Code, Cursor, anything that can run a terminal command."                                           | **board build**: node **AI agent** with the two chips as its subtitle                                                                                              |
| 6   | parts | "No special API. It just types commands, the way you would."                                                                             | **terminal**: `agent-browser open example.com/login` types out                                                                                                     |
| 7   | parts | "Those commands go to the agent-browser CLI, a small program written in Rust, so it starts fast."                                        | **board build**: node **agent-browser CLI** (sub-label "Rust"), edge from AI agent                                                                                 |
| 8   | parts | "Behind it runs the daemon: a background process that keeps the browser open between commands, so each step doesn't start from scratch." | **board build**: node **daemon** beside CLI, with a small "stays running" badge; a 2nd and 3rd command reuse the same edge                                         |
| 9   | parts | "The daemon controls Chrome through the Chrome DevTools Protocol, or CDP, the same channel Chrome's own developer tools use."            | **board build**: edge daemon → Chrome draws, labelled **CDP**; a small DevTools-panel mock flashes beside the label                                                |
| 10  | parts | "And it's a real browser: Chrome for Testing, which `agent-browser install` downloads for you."                                          | **terminal** `agent-browser install` → board node **Chrome for Testing** fills in                                                                                  |
| 11  | core  | "Now the clever part. Your agent can't see the screen."                                                                                  | **kinetic**: "Now the clever part." then a browser mock with a blank "?" over it                                                                                   |
| 12  | core  | "So it asks for a snapshot."                                                                                                             | **terminal**: `agent-browser snapshot`                                                                                                                             |
| 13  | core  | "A snapshot is the page as a short text list: every box and button, each with a tag called a ref."                                       | **output** card (accessibility tree): `textbox "Email" [ref=e3]` · `textbox "Password" [ref=e4]` · `button "Log in" [ref=e2]`; the word "ref" highlights as spoken |
| 14  | core  | "Now there's no guessing. The agent says: fill e3 with your email, click e2."                                                            | **terminal**: `fill @e3 "you@example.com"` then `click @e2`; the matching rows in the snapshot card glow                                                           |
| 15  | walk  | "The CLI hands that to the daemon, the daemon sends it over CDP, and Chrome presses the real Log in button."                             | **board pulse** CLI → daemon → CDP → Chrome, then **browser** mock: click ripple on "Log in"                                                                       |
| 16  | walk  | "Then your agent takes a fresh snapshot to see what changed, and keeps going."                                                           | **output** card refreshes: `heading "Welcome back"`; small loop arrow snapshot → act → snapshot                                                                    |
| 17  | walk  | "And the password? Save it in agent-browser's auth vault, and the AI never sees it."                                                     | **terminal** `agent-browser auth login github`; the password field fills with dots; a "never sent to the AI" label                                                 |
| 18  | recap | "So your AI agent gets a real browser it can read and click."                                                                            | **board**: full path visible, lit                                                                                                                                  |
| 19  | recap | "Claude Code types a command, the agent-browser CLI and its daemon pass it to Chrome over CDP, and a snapshot tells it what happened."   | **board pulse** in order on each spoken name, ending on the title-card style end frame                                                                             |

## Same narration as a plain script

> What if your AI could really click around the web?
> Not guess what a page says. Actually open it, read it, and press the button.
> That's agent-browser: a command-line tool that lets an AI agent, like Claude Code or Cursor, drive a real Chrome browser.
> Let's follow one job: logging you in to a site.
>
> It starts with your AI agent. Claude Code, Cursor, anything that can run a terminal command.
> No special API. It just types commands, the way you would.
> Those commands go to the agent-browser CLI, a small program written in Rust, so it starts fast.
> Behind it runs the daemon: a background process that keeps the browser open between commands, so each step doesn't start from scratch.
> The daemon controls Chrome through the Chrome DevTools Protocol, or CDP, the same channel Chrome's own developer tools use.
> And it's a real browser: Chrome for Testing, which agent-browser install downloads for you.
>
> Now the clever part. Your agent can't see the screen.
> So it asks for a snapshot.
> A snapshot is the page as a short text list: every box and button, each with a tag called a ref.
> Now there's no guessing. The agent says: fill e3 with your email, click e2.
> The CLI hands that to the daemon, the daemon sends it over CDP, and Chrome presses the real Log in button.
> Then your agent takes a fresh snapshot to see what changed, and keeps going.
> And the password? Save it in agent-browser's auth vault, and the AI never sees it.
>
> So your AI agent gets a real browser it can read and click.
> Claude Code types a command, the agent-browser CLI and its daemon pass it to Chrome over CDP, and a snapshot tells it what happened.

## What changed from v3

**Renamed to real names.** The v3 nicknames are replaced:

| v3                                             | v4                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| "fast command tool" / "terminal tool"          | **agent-browser CLI**                                                               |
| "browser-link" / "one link to chrome per page" | **daemon** + **Chrome DevTools Protocol (CDP)**                                     |
| "a short text list"                            | **snapshot** + **ref** (the short text list is now the _explanation_, not the name) |
| "real Chrome"                                  | **Chrome for Testing**                                                              |

**Anchors added.** "an AI agent, like Claude Code or Cursor", said twice: once in the hook and once at the first part.

**Scope cut to the core.** These are dropped:

- the `@agent-browser/sandbox` TS helper (an internal library)
- the dashboard "watcher" scene (could return as one optional line: "Want to watch? `agent-browser dashboard` shows a live view of the page and every command.")
- the stale-sessions → pool-sessions scale scene. This one is a plan.json claim I couldn't confirm in the README.
- MCP server, profiles, sessions, streaming, chat mode, other engines

The **auth vault** is kept as one line, because the hook is about logging in.

**Visuals.**

- The title-card icon row is gone.
- Every line's visual reuses words spoken in that line.
- The layout changes every 1–3 lines: card ↔ terminal ↔ board ↔ browser ↔ output.
- The board still builds across the video, so the fixed template stays recognisable.

**Kept.** The title card, the tagline "ai clicks real web pages", and "What if your AI could really click around the web?"
