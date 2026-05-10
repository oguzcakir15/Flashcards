const state = {
  decks: {},
  deckName: "",
  cards: [],
  current: null,
  currentChoices: [],
  selectedChoice: null,
  queue: [],
  retryQueue: [],
  answerChecked: false,
  attempted: 0,
  correct: 0,
  deferredInstallPrompt: null
};

const els = {
  deckSelect: document.querySelector("#deckSelect"),
  deckSubtitle: document.querySelector("#deckSubtitle"),
  cardCount: document.querySelector("#cardCount"),
  dueCount: document.querySelector("#dueCount"),
  correctCount: document.querySelector("#correctCount"),
  cardList: document.querySelector("#cardList"),
  studyDueButton: document.querySelector("#studyDueButton"),
  studyAllButton: document.querySelector("#studyAllButton"),
  resetProgressButton: document.querySelector("#resetProgressButton"),
  modeText: document.querySelector("#modeText"),
  sessionStats: document.querySelector("#sessionStats"),
  accuracyBadge: document.querySelector("#accuracyBadge"),
  promptText: document.querySelector("#promptText"),
  answerModeText: document.querySelector("#answerModeText"),
  answerInput: document.querySelector("#answerInput"),
  choiceList: document.querySelector("#choiceList"),
  feedbackText: document.querySelector("#feedbackText"),
  expectedPanel: document.querySelector("#expectedPanel"),
  expectedAnswer: document.querySelector("#expectedAnswer"),
  checkButton: document.querySelector("#checkButton"),
  againButton: document.querySelector("#againButton"),
  gotItButton: document.querySelector("#gotItButton"),
  skipButton: document.querySelector("#skipButton"),
  installButton: document.querySelector("#installButton")
};

const stopWords = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "are", "was", "were",
  "you", "your", "have", "has", "had", "not", "but", "can", "often", "then"
]);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function keyForDeck(deckName) {
  return `recallforge-web:${deckName}`;
}

function wordCount(text) {
  return (text.match(/[A-Za-z0-9]+/g) || []).length;
}

function shouldUseMultipleChoice(card) {
  return card.kind !== "fillBlank" && wordCount(card.answer) > 10;
}

function loadProgress(deckName) {
  try {
    return JSON.parse(localStorage.getItem(keyForDeck(deckName)) || "{}");
  } catch {
    return {};
  }
}

function saveProgress() {
  const progress = {};
  for (const card of state.cards) {
    progress[card.id] = {
      lastResult: card.lastResult || "",
      correctStreak: card.correctStreak || 0,
      nextReview: card.nextReview || todayIso(),
      timesReviewed: card.timesReviewed || 0
    };
  }
  localStorage.setItem(keyForDeck(state.deckName), JSON.stringify(progress));
}

function hydrateCards(deckName) {
  const progress = loadProgress(deckName);
  state.cards = state.decks[deckName].map((card, index) => {
    const id = `${deckName}:${index}:${card.prompt}`;
    return {
      ...card,
      id,
      lastResult: progress[id]?.lastResult || "",
      correctStreak: progress[id]?.correctStreak || 0,
      nextReview: progress[id]?.nextReview || todayIso(),
      timesReviewed: progress[id]?.timesReviewed || 0
    };
  });
}

function setDeck(deckName) {
  state.deckName = deckName;
  hydrateCards(deckName);
  state.queue = [];
  state.retryQueue = [];
  state.current = null;
  state.attempted = 0;
  state.correct = 0;
  els.deckSubtitle.textContent = `${deckName}: active recall, fill blanks, multiple choice, and retry rounds.`;
  els.modeText.textContent = "Study session";
  els.promptText.textContent = "Start a session to begin.";
  resetAnswerArea();
  render();
}

function render() {
  const due = state.cards.filter(card => card.nextReview <= todayIso()).length;
  const correct = state.cards.filter(card => card.lastResult === "correct").length;
  els.cardCount.textContent = String(state.cards.length);
  els.dueCount.textContent = String(due);
  els.correctCount.textContent = String(correct);
  els.accuracyBadge.textContent = state.attempted === 0
    ? "Accuracy: --"
    : `Accuracy: ${Math.round((state.correct / state.attempted) * 100)}%`;
  els.sessionStats.textContent = state.current
    ? `${state.queue.length + 1} cards remaining, ${state.retryQueue.length} queued for retry`
    : `${state.attempted} checked this session`;

  els.cardList.replaceChildren(...state.cards.map(renderCardItem));
}

function renderCardItem(card) {
  const item = document.createElement("article");
  item.className = `deck-card ${card.lastResult || ""}`;
  const title = document.createElement("strong");
  title.textContent = card.prompt;
  const details = document.createElement("span");
  const mode = card.kind === "fillBlank" ? "Blank" : shouldUseMultipleChoice(card) ? "Choice" : "Recall";
  const due = card.nextReview <= todayIso() ? "Due now" : `Due ${card.nextReview}`;
  details.textContent = `${due} - Streak ${card.correctStreak || 0} - ${mode} - ${card.tags}`;
  item.append(title, details);
  return item;
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function startSession(onlyDue) {
  state.attempted = 0;
  state.correct = 0;
  state.retryQueue = [];
  state.queue = shuffle(state.cards.filter(card => !onlyDue || card.nextReview <= todayIso()));
  els.modeText.textContent = onlyDue ? "Due review session" : "Full deck session";
  drawNextCard();
}

function drawNextCard() {
  resetAnswerArea();

  if (state.queue.length === 0 && state.retryQueue.length > 0) {
    const count = state.retryQueue.length;
    state.queue = shuffle([...new Set(state.retryQueue)]);
    state.retryQueue = [];
    els.modeText.textContent = `Retry round - ${count} to correct`;
  }

  if (state.queue.length === 0) {
    state.current = null;
    els.promptText.textContent = state.cards.length === 0
      ? "Choose a deck to begin."
      : "Session complete. Every card in this session was answered correctly.";
    els.answerInput.disabled = true;
    els.checkButton.disabled = true;
    els.skipButton.textContent = "Next";
    render();
    return;
  }

  state.current = state.queue.shift();
  els.promptText.textContent = state.current.prompt;
  els.expectedAnswer.textContent = state.current.answer;
  els.skipButton.textContent = "Skip";

  if (state.current.kind === "fillBlank") {
    els.answerModeText.textContent = "Fill in the blank";
    els.checkButton.textContent = "Check blank";
    els.answerInput.classList.remove("hidden");
    els.answerInput.disabled = false;
    els.answerInput.focus();
  } else if (shouldUseMultipleChoice(state.current)) {
    els.answerModeText.textContent = "Choose the best answer";
    els.checkButton.textContent = "Check choice";
    els.answerInput.classList.add("hidden");
    els.choiceList.classList.remove("hidden");
    buildChoices(state.current);
    els.checkButton.disabled = true;
  } else {
    els.answerModeText.textContent = "Your recall";
    els.checkButton.textContent = "Check recall";
    els.answerInput.classList.remove("hidden");
    els.answerInput.disabled = false;
    els.answerInput.focus();
  }

  render();
}

function resetAnswerArea() {
  state.answerChecked = false;
  state.selectedChoice = null;
  state.currentChoices = [];
  els.answerInput.value = "";
  els.answerInput.disabled = false;
  els.answerInput.classList.remove("hidden");
  els.choiceList.classList.add("hidden");
  els.choiceList.replaceChildren();
  els.feedbackText.textContent = "";
  els.feedbackText.className = "feedback";
  els.expectedPanel.classList.add("hidden");
  els.checkButton.disabled = false;
  els.againButton.disabled = true;
  els.gotItButton.disabled = true;
}

function buildChoices(card) {
  const distractors = state.cards
    .filter(candidate => candidate.id !== card.id && candidate.answer.toLowerCase() !== card.answer.toLowerCase())
    .sort((a, b) => distractorScore(card, b) - distractorScore(card, a))
    .slice(0, 3)
    .map(candidate => ({ text: candidate.answer, correct: false }));

  while (distractors.length < 3) {
    distractors.push({ text: createFallbackDistractor(card, distractors.length), correct: false });
  }

  state.currentChoices = shuffle([...distractors, { text: card.answer, correct: true }]);
  els.choiceList.replaceChildren(...state.currentChoices.map((choice, index) => {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.type = "button";
    button.textContent = choice.text;
    button.addEventListener("click", () => {
      state.selectedChoice = index;
      document.querySelectorAll(".choice-button").forEach(el => el.classList.remove("selected"));
      button.classList.add("selected");
      els.checkButton.disabled = false;
    });
    return button;
  }));
}

function splitTags(tags) {
  return new Set(tags.split(",").map(tag => tag.trim().toLowerCase()).filter(Boolean));
}

function identifyDeck(tags) {
  for (const deck of ["researches p1", "social influence", "memory", "attachment", "psychopathology"]) {
    if (tags.has(deck)) return deck;
  }
  return "";
}

function promptType(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes("ao3") || lower.includes("peel")) return "evaluation";
  if (lower.includes("procedure") || lower.includes("describe")) return "procedure";
  if (lower.includes("finding") || lower.includes("percentage") || lower.includes("what happened")) return "findings";
  if (lower.includes("conclusion") || lower.includes("why") || lower.includes("explain")) return "explanation";
  if (lower.includes("define") || lower.includes("what is")) return "definition";
  return "general";
}

function keywordSet(text) {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(word => word.length > 3 && !stopWords.has(word)));
}

function overlapCount(a, b) {
  let count = 0;
  for (const value of a) if (b.has(value)) count++;
  return count;
}

function distractorScore(card, candidate) {
  const cardTags = splitTags(card.tags);
  const candidateTags = splitTags(candidate.tags);
  const sharedTags = overlapCount(cardTags, candidateTags);
  let score = sharedTags * 14;

  const deckA = identifyDeck(cardTags);
  const deckB = identifyDeck(candidateTags);
  if (deckA && deckB && deckA !== deckB) score -= 80;
  if (deckA && deckA === deckB) score += 35;
  if (sharedTags >= 2) score += 24;
  if (sharedTags >= 3) score += 24;
  if (card.prompt.split(":")[0] === candidate.prompt.split(":")[0]) score += 35;
  if (promptType(card.prompt) === promptType(candidate.prompt)) score += 22;
  score += overlapCount(keywordSet(card.prompt), keywordSet(candidate.prompt)) * 5;

  const difference = Math.abs(wordCount(card.answer) - wordCount(candidate.answer));
  if (difference <= 5) score += 8;
  else if (difference <= 12) score += 5;
  else if (difference <= 22) score += 2;
  return score;
}

function createFallbackDistractor(card, index) {
  const type = promptType(card.prompt);
  const bank = {
    findings: [
      "The study found a reduced rate in the changed condition, suggesting the social or cognitive variable affected behaviour.",
      "Most participants showed mixed responses, with some following the pressure and others resisting it.",
      "The findings showed the predicted effect was present but depended on the situation and task demands."
    ],
    procedure: [
      "Participants completed a controlled task while the researcher manipulated a key situational variable and recorded behaviour.",
      "Participants were placed in a structured setting and their responses were measured after a specific change was introduced.",
      "The researcher compared behaviour across conditions to test whether the key variable affected recall or social behaviour."
    ],
    evaluation: [
      "The study provides controlled support, but artificial tasks may reduce ecological validity.",
      "The evidence supports the theory, although demand characteristics or sampling issues may limit the conclusion.",
      "The findings have practical value because they help explain or improve real-world behaviour."
    ],
    general: [
      "The concept explains behaviour through situational pressure, cognition, learning, or attachment experience.",
      "The explanation focuses on how a key psychological process changes behaviour or emotional response.",
      "The answer links the behaviour to a specific mechanism, study, or theory from Paper 1."
    ]
  };
  return (bank[type] || bank.general)[index] || bank.general[0];
}

function checkAnswer() {
  if (!state.current || state.answerChecked) return;

  if (shouldUseMultipleChoice(state.current) && state.selectedChoice === null) {
    setFeedback("Choose one answer before checking.", "warn");
    return;
  }

  let score;
  if (shouldUseMultipleChoice(state.current)) {
    score = state.currentChoices[state.selectedChoice]?.correct ? 1 : 0;
  } else if (state.current.kind === "fillBlank") {
    score = scoreFillBlank(els.answerInput.value, state.current.answer);
  } else {
    score = scoreRecall(els.answerInput.value, state.current.answer);
  }

  state.answerChecked = true;
  state.attempted++;
  state.current.timesReviewed = (state.current.timesReviewed || 0) + 1;
  els.expectedPanel.classList.remove("hidden");
  els.checkButton.disabled = true;
  els.againButton.disabled = false;
  els.gotItButton.disabled = score < 0.95 && (shouldUseMultipleChoice(state.current) || state.current.kind === "fillBlank");

  if (score >= 0.95) {
    setFeedback(shouldUseMultipleChoice(state.current) ? "Correct. That is the best answer." : "Strong recall.", "good");
  } else if (score >= 0.62 && state.current.kind !== "fillBlank" && !shouldUseMultipleChoice(state.current)) {
    setFeedback(`Partial recall: ${Math.round(score * 100)}% match. Check the missing details.`, "warn");
  } else {
    setFeedback("Not quite. This card will come back in the retry round.", "bad");
  }

  render();
}

function setFeedback(text, tone) {
  els.feedbackText.textContent = text;
  els.feedbackText.className = `feedback ${tone}`;
}

function scoreFillBlank(submitted, expected) {
  const submittedValue = normalizeBlank(submitted);
  const answers = expected.split(/[;|/]/).map(normalizeBlank).filter(Boolean);
  if (!submittedValue || answers.length === 0) return 0;
  if (answers.includes(submittedValue)) return 1;
  if (answers.some(answer => answer.includes(submittedValue) || submittedValue.includes(answer))) return 0.95;
  return scoreRecall(submitted, expected);
}

function normalizeBlank(text) {
  return (text.toLowerCase().replaceAll("+", " plus ").replaceAll("-", " ").match(/[a-z0-9]+/g) || []).join(" ");
}

function scoreRecall(submitted, expected) {
  const submittedTokens = tokenize(submitted);
  const expectedTokens = tokenize(expected);
  if (expectedTokens.size === 0) return submittedTokens.size === 0 ? 1 : 0;
  if (submittedTokens.size === 0) return 0;
  const overlap = overlapCount(expectedTokens, submittedTokens);
  const precision = overlap / submittedTokens.size;
  const recall = overlap / expectedTokens.size;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function tokenize(text) {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(word => word.length > 2 && !stopWords.has(word)));
}

function gradeCurrent(remembered) {
  if (!state.current) return;
  if (!state.answerChecked) checkAnswer();
  if (!state.answerChecked) return;

  if (remembered) {
    state.correct++;
    state.current.lastResult = "correct";
    state.current.correctStreak = (state.current.correctStreak || 0) + 1;
    const streak = state.current.correctStreak;
    const delay = streak === 1 ? 1 : streak === 2 ? 3 : streak === 3 ? 7 : streak === 4 ? 14 : 30;
    state.current.nextReview = addDays(delay);
  } else {
    state.current.lastResult = "incorrect";
    state.current.correctStreak = 0;
    state.current.nextReview = todayIso();
    queueForRetry(state.current);
  }

  saveProgress();
  drawNextCard();
}

function queueForRetry(card) {
  if (!state.retryQueue.includes(card)) state.retryQueue.push(card);
}

function skipCurrent() {
  if (state.current && !state.answerChecked) {
    state.current.lastResult = "incorrect";
    state.current.correctStreak = 0;
    state.current.nextReview = todayIso();
    queueForRetry(state.current);
    saveProgress();
  }
  drawNextCard();
}

async function init() {
  const response = await fetch("decks.json", { cache: "no-store" });
  const payload = await response.json();
  state.decks = payload.decks;

  for (const deckName of Object.keys(state.decks)) {
    const option = document.createElement("option");
    option.value = deckName;
    option.textContent = deckName;
    els.deckSelect.append(option);
  }

  const preferred = localStorage.getItem("recallforge-web:lastDeck");
  setDeck(preferred && state.decks[preferred] ? preferred : Object.keys(state.decks)[0]);
  els.deckSelect.value = state.deckName;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

els.deckSelect.addEventListener("change", event => {
  localStorage.setItem("recallforge-web:lastDeck", event.target.value);
  setDeck(event.target.value);
});

els.studyDueButton.addEventListener("click", () => startSession(true));
els.studyAllButton.addEventListener("click", () => startSession(false));
els.checkButton.addEventListener("click", checkAnswer);
els.againButton.addEventListener("click", () => gradeCurrent(false));
els.gotItButton.addEventListener("click", () => gradeCurrent(true));
els.skipButton.addEventListener("click", skipCurrent);
els.resetProgressButton.addEventListener("click", () => {
  if (!confirm(`Reset progress for ${state.deckName}?`)) return;
  localStorage.removeItem(keyForDeck(state.deckName));
  setDeck(state.deckName);
});
els.answerInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    checkAnswer();
  }
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  els.installButton.classList.remove("hidden");
});

els.installButton.addEventListener("click", async () => {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  els.installButton.classList.add("hidden");
});

init().catch(error => {
  els.promptText.textContent = "The deck data could not be loaded.";
  setFeedback(error.message, "bad");
});
