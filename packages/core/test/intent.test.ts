import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLanguage, isAnatomyQuestion, isThisFeatureQuestion, isVagueQuestion, narrationLanguage } from "../src/intent.ts";

test("questions about the current checkout's own changes are recognised", () => {
  for (const q of [
    "what is this feature we are working on about?",
    "explain my current changes",
    "what does this branch do",
    "summarize my working changes",
    "tell me about my uncommitted changes",
    "what's changed?",
    "what has changed",
    "what's new",
    "what are we working on",
    "what have I been working on",
    "explain this branch",
    "my staged changes",
    "WIP summary please",
    "is there anything in the working tree",
  ])
    assert.equal(isThisFeatureQuestion(q), true, q);
});

test("comparisons, release history and general topics are not working-change questions", () => {
  for (const q of [
    "how DNS works",
    "photosynthesis",
    "explain the diff between TCP and UDP",
    "what is the difference between my branch and main",
    "what changed in v2",
    "what changed in version 3",
    "how does auth work",
    "explain this repo",
  ])
    assert.equal(isThisFeatureQuestion(q), false, q);
});

test("tour questions ask for the anatomy format", () => {
  for (const q of [
    "give me the anatomy of this codebase",
    "how does the codebase fit together",
    "how do the parts fit together",
    "give me a tour of the project",
    "tour, please",
    "what are the parts of the project",
    "what are the parts of this codebase",
    "walk me through the codebase",
    "walk through the repo",
    "how is this project organized",
    "how is the codebase structured",
    "show me the codebase structure",
    "map of the repo",
    "show me around the codebase",
    "codebase tour for a new contributor",
  ])
    assert.equal(isAnatomyQuestion(q), true, q);
});

test("one feature, the working tree, comparisons and topics are not tours", () => {
  for (const q of [
    "how DNS works",
    "photosynthesis",
    "how does auth work",
    "explain this repo",
    "explain my current changes",
    "what does this branch do",
    "what changed in v2",
    "explain the diff between TCP and UDP",
    "the difference between a tour and a deep dive",
    "why is the sky blue",
  ])
    assert.equal(isAnatomyQuestion(q), false, q);
});

test("a vague question is recognised, but never a real topic", () => {
  for (const q of ["explain", "?", "???", "!", "explain this", "explain this repo", "summarize", "what is this about", "tell me more", "x"])
    assert.equal(isVagueQuestion(q), true, q);
  for (const q of [
    "how DNS works",
    "photosynthesis",
    "DNS",
    "explain my current changes",
    "how does auth work",
    "what does this branch do",
    "why is the sky blue",
  ])
    assert.equal(isVagueQuestion(q), false, q);
});

test("non-English questions are detected by script or stopwords; English is undefined", () => {
  assert.deepEqual(detectLanguage("¿Puedes explicar cómo funciona la autenticación en este repositorio?"), {
    code: "es",
    name: "Spanish",
  });
  assert.deepEqual(detectLanguage("Explique-moi comment fonctionne ce dépôt"), { code: "fr", name: "French" });
  assert.deepEqual(detectLanguage("Erkläre mir, wie dieses Repository funktioniert"), { code: "de", name: "German" });
  assert.deepEqual(detectLanguage("Spiegami come funziona questo repository"), { code: "it", name: "Italian" });
  assert.deepEqual(detectLanguage("Explique como funciona este repositório, você pode?"), { code: "pt", name: "Portuguese" });
  assert.deepEqual(detectLanguage("Leg uit hoe dit werkt en wat er is veranderd"), { code: "nl", name: "Dutch" });
  assert.deepEqual(detectLanguage("このリポジトリは何をしますか"), { code: "ja", name: "Japanese" });
  assert.deepEqual(detectLanguage("解释一下这个仓库是做什么的"), { code: "zh", name: "Chinese" });
  assert.deepEqual(detectLanguage("اشرح ماذا يفعل هذا المستودع"), { code: "ar", name: "Arabic" });
  // "репозиторий" with U+0438 (1080) is Russian; with U+0456 (1110) it is Ukrainian
  const repoWord = (i: number) => String.fromCharCode(1088, 1077, 1087, 1086, 1079, 1080, 1090, 1086, 1088, i, 1081);
  assert.deepEqual(detectLanguage(`explain this ${repoWord(1080)}`), { code: "ru", name: "Russian" });
  assert.deepEqual(detectLanguage(`explain this ${repoWord(1110)}`), { code: "uk", name: "Ukrainian" });
  assert.equal(detectLanguage("explain my current changes"), undefined);
  assert.equal(detectLanguage("What was changed in this repo?"), undefined, "'was' alone does not make it German");
  assert.equal(detectLanguage(""), undefined);
  assert.equal(detectLanguage("hi"), undefined);
});

test("narration follows the question's language when the voice speaks it, else English", () => {
  assert.deepEqual(narrationLanguage(undefined, "silent"), { code: "en", name: "English", supported: true });
  assert.deepEqual(narrationLanguage({ goal: "how does auth work" }, "aura-2-arcas-en"), {
    code: "en",
    name: "English",
    supported: true,
  });
  const silent = narrationLanguage({ goal: "¿Cómo funciona esto?" }, "silent");
  assert.equal(silent.code, "es");
  assert.equal(silent.supported, true);
  assert.match(silent.instruction ?? "", /in Spanish/);
  const matched = narrationLanguage({ goal: "¿Cómo funciona esto?" }, "aura-2-celeste-es");
  assert.equal(matched.supported, true);
  const englishOnly = narrationLanguage({ goal: "¿Cómo funciona esto?" }, "aura-2-arcas-en");
  assert.equal(englishOnly.code, "en");
  assert.equal(englishOnly.supported, false);
  assert.match(englishOnly.note ?? "", /Spanish.*English/);
});
