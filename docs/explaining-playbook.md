# Explaining playbook

How two channels that explain hard tech well actually do it, and what Explanimate takes from them.
These notes come from the auto-captions of 10 videos. Each quote is short and backs one pattern.

Sources:

- Caleb Writes Code (C):
  - [Inference Engines explained in 10min](https://www.youtube.com/watch?v=_xM8scs4_x4)
  - [Jev explained in 7min](https://www.youtube.com/watch?v=vj7hysh0mOI)
  - [High Bandwidth Flash explained in 7min](https://www.youtube.com/watch?v=ZxBRtRjMU88)
  - [CUDA is hard..](https://www.youtube.com/watch?v=s48xeUP_2qI)
  - [RL is not what I thought it was..](https://www.youtube.com/watch?v=0SVpmARc90o)
- Crayon Capital (K):
  - [NVIDIA Explained Like You're 5](https://www.youtube.com/watch?v=1GowFTjbUnk)
  - [Bitcoin ELI5](https://www.youtube.com/watch?v=_pUOpoihjA4)
  - [Palantir ELI5](https://www.youtube.com/watch?v=GSkySDNmjV8)
  - [The AI Bubble ELI5](https://www.youtube.com/watch?v=kx_okFl98Vw)
  - [Petrodollar ELI5](https://www.youtube.com/watch?v=9r-45QPLl-Y)

## What they do

1. **Open with a tension, not a definition.**
   - Caleb opens with a question the topic has to answer. HBF opens: "why can't we just bring SSD directly into the fabric of GPU?"
   - Crayon opens on stakes or a paradox, then names the thing within about 20 s. Petrodollar opens: "$3 trillion worth of oil… paid in one currency."
   - In both, the first 20 s tell you why you should care.
2. **Start from what the viewer already knows.**
   - Caleb's CUDA video starts at the SSD → RAM → GPU memory chain "because we've all used these before".
   - Only after that does he show the same chain inside the GPU.
3. **Follow one concrete thing through the system.**
   - Caleb follows one model, with real numbers, from disk to GPU: 2 TB model, 141 GB on the GPU, 14.8 GB/s, so "more than 2 minutes" (HBF, 0:43).
   - Crayon follows one character and one transaction in time order.
   - The flow is the story. Each part is introduced at the moment the thing reaches it.
4. **Give the analogy first, then the real name.**
   - "Imagine a notebook… copied across every computer on Earth. Tear out a page, 10,000 others call you a liar. That's the blockchain" (K, Bitcoin 2:26).
   - "A CPU is like one very smart employee… a GPU is like 10,000 interns" (K, NVIDIA 7:15).
   - Analogies come from everyday life (notebook, pizza, employees). Each is one or two sentences, then the video moves on.
5. **Define jargon in the same breath, or don't use it.**
   - Crayon spells out every acronym the first time it comes up.
   - Caleb gives a term only after showing the behaviour: "it could keep working through the new batch coming in, which is what we call continuous batching" (C, Inference 6:54). He shows the thing first and names it second.
6. **Each part answers a "why".**
   - Each part is set up as a problem with its fix: "But why?", "And here's why" (C, HBF).
   - A part with no reason to exist doesn't get airtime.
7. **Signpost, then zoom out.**
   - Caleb uses short turns like "Okay, let's zoom back out a little bit" (Inference 6:54).
   - He ends by naming the thread that tied it together: "what I tried to focus on is really what problem each inference engine tried to optimize for" (Inference 9:02).
   - Crayon ends on a one-line thesis that calls back to the hook.
8. **Pace: one idea per beat.**
   - Crayon speaks at 128–160 wpm with one idea per sentence and humour between dense parts.
   - Caleb is denser at 182–188 wpm but still makes one claim per sentence.
   - Details (internals, edge cases) come after the main path is clear, never before.

## How Explanimate applies it to a repo

- **Hook (≤3 sentences).** Say what the project is, in plain words anyone can follow. Say what it lets you do and why you'd care. Introduce the one everyday analogy, then promise the story: "let's follow one message".
- **The journey.** Draw the boxes in the order one request meets them. For each stop, give the plain job of the box and its analogy role, and say why it's there. Define each technical term when it first comes up, or use the plain word instead.
- **The core flow, told once, end to end.** One walkthrough scene replays the trip hop by hop, all the way to what the user gets back. It comes right after the path is drawn, before anything deep.
- **Side parts after the flow.** Components the request doesn't touch get one sentence each, tied back to the flow.
- **Deep parts are optional and short.** Add at most one scale risk and one list, and only when the brief says the topic needs depth.
- **Recap.** Retell the flow in one breath, A → B → C → back to you, plus the one-line why.
- **Self-check before rendering:**
  - the flow is narrated hop by hop, early
  - the analogy is present
  - no term reaches the viewer undefined
  - The planner re-asks once if any of these fails.

## Lessons from nine channels (November 2026)

Notes from 19 recent videos on nine channels.
For each one I read the description, transcribed the first 150 s on the box (local Whisper, `base.en`), and looked at frames: the first 30 s every 2 s, plus 16 frames spread over the whole video.
I also counted cuts in the first 2 minutes with ffmpeg scene detection (`scene > 0.3`) and drew spectrograms of the first 40 s to see how the sound was built.
Nothing from these videos is reused. Only the techniques are.

Sources:

- Fireship: [Did the AI bubble just pop?](https://www.youtube.com/watch?v=nEaJMdM1djM), [The runtime wars are over... and Node won](https://www.youtube.com/watch?v=l3L_lETiSzc), [China just dropped a new frontier model...](https://www.youtube.com/watch?v=G_em1hHPnXY)
- Crayon Capital: [The Rise of Anthropic ELI5](https://www.youtube.com/watch?v=H5GYXhpE5yI), [TSMC ELI5](https://www.youtube.com/watch?v=aDCKVS8aA8E)
- SeanAIStories: [Pi coding agent harness in 22 min](https://www.youtube.com/watch?v=0sI0MbCt4f4), [Agent observability & eval in 20 min](https://www.youtube.com/watch?v=YkhmBOctzWE)
- Caleb Writes Code: [Haiku 5.5 explained in 7min](https://www.youtube.com/watch?v=PVe-ibLRLaw), [Reinforcement Learning is hard..](https://www.youtube.com/watch?v=0SVpmARc90o)
- Business Insider: [How Amazon's low prices raised prices](https://www.youtube.com/watch?v=62VYumto5Jc), [Inside America's only internet sea cable maker](https://www.youtube.com/watch?v=cKnwkxItL2M)
- CNBC: [Why young airplanes are being torn apart for scrap](https://www.youtube.com/watch?v=ZYsP8qM6bPE), [The race to power AI is reshaping the grid](https://www.youtube.com/watch?v=Wh1zlJXKy1M)
- KodeKloud: [Apache Kafka explained in 6 mins](https://www.youtube.com/watch?v=5dmQxG-2pgQ), [System design explained in 6 mins](https://www.youtube.com/watch?v=E60Fs-DQQOg)
- Alux: [How much money do you need to stop working?](https://www.youtube.com/watch?v=8brPnApuYjE), [No revenue. No product. Worth billions.](https://www.youtube.com/watch?v=nyUCVI_JHvQ)
- Vox: [Elite universities are losing Black students](https://www.youtube.com/watch?v=KVYNwthBcgM), [Why younger Americans can't get ahead](https://www.youtube.com/watch?v=9ensf6V2Uyk) (the second is a long interview, so it was used only for pacing)

### Hooks: the first five seconds

- **A concrete object, then the twist.**
  - "This is an Airbus A320 neo. It's less than six years old and it was built to fly for decades. But..." (CNBC)
  - "This is the Bed Scrunchie, and it's sold online at three different stores for nearly identical prices." (BI)
  - "This is Anthropic. Soon, it will go public at a $2 trillion valuation... But how did it actually get this big?" (Crayon)
  - Pattern: name one real thing, give a surprising fact about it, then ask the question the video answers.
- **A big claim made concrete.** "Somewhere in Taiwan, a machine the size of a school bus is printing circuits thinner than a strand of DNA." (Crayon, TSMC)
- **The viewer's own situation.** "You might enjoy your job a lot more if you knew you could leave it." (Alux)
- **A problem in one line, then a promise.** "I want to send this envelope to my friend in Berlin. How do I do that?" Kafka is then told as a post office (KodeKloud).
- **Open questions said out loud.**
  - BI and Alux list two or three questions right after the hook: "who decides these prices? What exactly are investors buying?" (Alux)
  - The video then answers them in order, and that is the open loop.
- **Stakes are named early.**
  - "My biggest concern is my electric bill is going to go up." (CNBC)
  - "Every iPhone, every AI chip... depends on what comes out of that building." (Crayon)

### Script

- No warm-up and no "in this video". Sentence one is already the story. (Sean is the exception: he opens with "Hi everyone", but straight away lists what the tool _doesn't_ have, and that is the surprise.)
- **One analogy world, kept all the way through.** KodeKloud's post office: envelope → producer, post office → broker, sorting shelves → topics, the friend in Berlin → consumer. Every new term lands on a place already drawn.
- **Humour comes in small, dry asides, not as a set piece.**
  - "Kibitz is the Yiddish word for that guy standing behind you at a chess game... the perfect analogy for a coding agent." (Fireship)
  - "Microsoft offered a quarter of its employees money to leave so it can afford more of them." (Fireship, said about GPUs)
  - Crayon uses a one-line character gag ("Hey nerd, give me your lunch money").
  - Each aside takes about one sentence, then the video moves on.
- **Contrast and turns.**
  - Fireship uses "on paper, it looks like... but if you think about it, it's a little weird that...".
  - Caleb uses "as much as this seems pretty big on face value... it's more or less negligible".
  - The turn word ("But", "And yet") is where attention comes back.
- **Signposted structure.** Alux: "There are five stages... and here they are. Stage 1." A numbered promise tells the viewer how far along they are.
- **Callbacks.** Crayon's TSMC video ends on "next time someone says a dollar won't change anything, you know exactly what to say", which ties back to an earlier scene.

### Visuals

- **Two families of cut rate.** Average cuts per minute in the first 2 minutes:

  | Channel   | Cuts/min |
  | --------- | -------- |
  | Crayon    | 20–33    |
  | Vox       | 26       |
  | BI        | 11–20    |
  | Fireship  | 13–18    |
  | CNBC      | 11–14    |
  | Caleb     | 4        |
  | KodeKloud | 1–3      |
  | Sean      | 1        |
  | Alux      | 0–1      |

  The channels that draw or build a diagram (KodeKloud, Caleb, Sean, Alux) barely cut. Instead they **add to one canvas** and move attention with an arrow, a marker stroke or a highlight. That is the family Explanimate belongs to. Motion comes from things being drawn and the camera moving, not from cuts.

- **Kinetic and title type.**
  - Alux uses full-screen chapter cards ("STAGE 1 · ENOUGH TO LEAVE YOUR JOB") in the brand colour.
  - KodeKloud uses a full-screen title card.
  - Crayon uses black cards with a single line of text as a pattern interrupt, and the music stops under them.
- **Highlight on the key words.**
  - Vox and BI highlight one phrase in a document with a yellow highlighter swipe.
  - Caleb circles or arrows the one point on a chart that matters while he says it ("This is Haiku", with a red arrow on the dot).
- **Reveal by building.**
  - KodeKloud draws the envelope, then the post office, then the shelves, then the van, each as it is named.
  - Alux grows a decision tree (YOU → STAY / LEAVE) one node at a time.
- **Numbers become a picture.**
  - Vox draws a bar chart of the percentage change, and icons with "75%".
  - BI shows three price tags side by side with the store logos.
  - Crayon shows a magnifying glass over a chip.
- **Consistent brand.** Each channel keeps one palette and one type family for the whole video (Alux: navy and cyan; Vox: cream and black serif). Logos stay small in a corner.

### Sound

From the spectrograms and listening:

- **A music bed sits under the voice the whole time and steps back while someone speaks.** The bed is clearly louder in gaps and in title moments (Crayon, Vox, BI).
- **Short, soft transients on visual events.**
  - Crayon and Fireship show many short broadband ticks lined up with cuts and pop-ins: a whoosh on a move, a pop or click on a reveal.
  - They are quieter than the voice and very short (under about 0.3 s).
- **Silence used as punctuation.** Crayon drops nearly everything to silence for about a second before a chapter card. A riser or a sweep runs into it, then the music comes back in.
- **Diagram channels are dry.** KodeKloud and Sean have long stretches with no music bed at all (22–28 s of near-silence per 2 minutes for KodeKloud). The voice carries the video, and that works because the drawing keeps changing.

### What Explanimate takes from this

Everything below fits a hand-drawn whiteboard. None of it adds fast cuts, stock footage or photos.

1. **Hook within 5 s, shown as kinetic type.**
   - The first sentence of the narration is a question or one surprising, concrete claim of 14 words or fewer, about the project or its problem.
   - It is drawn big, word by word as it is spoken, with the key word in the brand orange and underlined.
   - The subtitle bar hides while those words are already on the board.
   - Then the title card and the preview icons draw in as before.
2. **Open loop and stakes.** Right after the hook, say what goes wrong without the project, or ask the question the video answers. The recap answers it again (callback).
3. **One analogy world, plus small dry humour.** The planner keeps one everyday analogy from the hook to the recap. One or two short, friendly asides are allowed. Jokes about people are not.
4. **No filler.** A banned-phrase list ("you'll meet", "let's take a look", "basically", "it's special", ...) is checked before the voice is recorded.
5. **Build on one canvas, and point.** Boxes still draw in the order the request meets them. The recap sends a dot along the same path again, hop by hop, timed to when each part is named. The camera rule stays: it holds still while marks are drawn, and shots last at least about 3–4 s.
6. **Soft sound effects under the voice.**
   - A quiet pop when a component appears and a soft whoosh when a request dot starts moving.
   - They are short and written at fixed levels (a pop peaks near -25 dBFS, a whoosh near -28) and join the mix after the bed's ducking, about 18 dB under the voice. A burst of parts drawn together makes one pop, not a rattle.
   - All sounds are synthesised on the box from sine waves and filtered noise (`packages/render/src/music.ts`). No samples, so there is nothing to license or credit.
   - `--no-sfx` turns them off.
