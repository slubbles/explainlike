# Explaining playbook

How two channels that explain hard tech well actually do it, and what Explain Like takes from them.
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

## How Explain Like applies it to a repo

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
