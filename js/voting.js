let pendingPayload = null;

const SUBMIT_FINAL_LABEL = "Send your Vote";
const SUBMIT_SENDING_LABEL = "⏳ sending...";
const VOTE_ALREADY_SUBMITTED_MSG = "You have already submitted your final vote.";
const VOTE_SHEET_ALREADY_VOTED_MSG = "This person has already submitted their vote. Reset browser voting data at the bottom of the page to choose a different name.";
const VOTE_RESUBMIT_MSG = "Your previous vote was reset. You can submit a new vote.";

function setSubmitButtonSending(isSending) {
  const btn = document.getElementById("submitBtn");
  if (!btn) return;
  if (!isSending && btn.classList.contains("completed")) return;
  btn.disabled = isSending;
  btn.textContent = isSending ? SUBMIT_SENDING_LABEL : SUBMIT_FINAL_LABEL;
}

function getStoredVoter() {
  const raw = localStorage.getItem(storageKeyVote);
  if (!raw) return "";

  try {
    return String(JSON.parse(raw).voter || "").trim();
  } catch (e) {
    return "";
  }
}

function hasLocalFinalVote() {
  return localStorage.getItem(storageKeyFinal) === "true" && !!getStoredVoter();
}

function storeFinalVote(voter, choices) {
  localStorage.setItem(storageKeyVote, JSON.stringify({ voter, choices }));
  localStorage.setItem(storageKeyFinal, "true");
}

function clearLocalVotingStorage() {
  localStorage.removeItem(storageKeyFinal);
  localStorage.removeItem(storageKeyVote);
}

function clearOrphanedLocalStorage() {
  const hasFinal = localStorage.getItem(storageKeyFinal) === "true";
  const voter = getStoredVoter();

  if (!hasFinal || !voter) {
    localStorage.removeItem(storageKeyFinal);
    localStorage.removeItem(storageKeyVote);
  }
}

function loadStoredVote() {
  if (!hasLocalFinalVote()) return;

  const raw = localStorage.getItem(storageKeyVote);
  if (!raw) return;

  try {
    const stored = JSON.parse(raw);
    const sel = document.getElementById("voterName");
    const voter = String(stored.voter || "").trim();

    if (voter && VOTERS.includes(voter)) {
      sel.value = voter;
    } else {
      sel.selectedIndex = 0;
      sel.value = "";
    }

    (stored.choices || []).forEach(c => {
      const el = document.getElementById(c.id);
      if (el) el.value = c.song || "";
    });
  } catch (e) {
    console.warn("Stored vote could not be loaded", e);
  }
}

function getChoices() {
  return ["p5","p4","p3","p2","p1"].map(id => ({
    id,
    points: pointMap[id],
    song: document.getElementById(id).value
  }));
}

function clearVoteSelections() {
  ["p5","p4","p3","p2","p1"].forEach(id => {
    document.getElementById(id).value = "";
  });
}

function lockVoteInputs() {
  ["p5","p4","p3","p2","p1"].forEach(id => {
    document.getElementById(id).disabled = true;
  });
}

function unlockVoteInputs() {
  ["p5","p4","p3","p2","p1"].forEach(id => {
    document.getElementById(id).disabled = false;
  });

  const btn = document.getElementById("submitBtn");
  btn.textContent = SUBMIT_FINAL_LABEL;
  btn.classList.remove("completed");
}

function lockVoterSelect() {
  document.getElementById("voterName").disabled = true;
}

function unlockVoterSelect() {
  document.getElementById("voterName").disabled = false;
}

function resetVotingForm() {
  const sel = document.getElementById("voterName");
  sel.selectedIndex = 0;
  sel.value = "";
  clearVoteSelections();
  unlockVoterSelect();
  unlockVoteInputs();
}

function setVotingCompletedUI() {
  lockVoteInputs();
  const btn = document.getElementById("submitBtn");
  btn.textContent = "✅ Voting complete";
  btn.classList.add("completed");
  btn.disabled = true;
}

function handleVoterSelection() {
  const voter = document.getElementById("voterName").value.trim();

  if (hasLocalFinalVote()) {
    syncLockedVotingState();
    return;
  }

  if (voter && hasVoterSubmitted(voter)) {
    clearVoteSelections();
    lockVoteInputs();
    lockVoterSelect();
    setVotingCompletedUI();
    showMsg("ok", VOTE_SHEET_ALREADY_VOTED_MSG);
    return;
  }

  unlockVoteInputs();
  unlockVoterSelect();
  hideMsg();
  validateChoices();
}

async function refreshVotingSession() {
  await loadVotedVoters();
  clearOrphanedLocalStorage();
  fillVoterSelect();

  if (!hasLocalFinalVote()) {
    resetVotingForm();
    hideMsg();
    validateChoices();
    return;
  }

  syncLockedVotingState();
}

function syncLockedVotingState() {
  clearOrphanedLocalStorage();

  if (!hasLocalFinalVote()) {
    resetVotingForm();
    hideMsg();
    validateChoices();
    return;
  }

  const storedVoter = getStoredVoter();
  loadStoredVote();
  lockVoterSelect();

  if (hasVoterSubmitted(storedVoter)) {
    setVotingCompletedUI();
    showMsg("ok", VOTE_ALREADY_SUBMITTED_MSG);
    return;
  }

  unlockVoteInputs();
  showMsg("ok", VOTE_RESUBMIT_MSG);
  validateChoices();
}

function validateChoices() {
  if (hasLocalFinalVote() && hasVoterSubmitted(getStoredVoter())) return;

  const voter = document.getElementById("voterName").value.trim();
  if (!hasLocalFinalVote() && voter && hasVoterSubmitted(voter)) return;

  const choices = getChoices();
  const selected = choices.map(c => c.song).filter(Boolean);
  const dup = selected.find((s, i) => selected.indexOf(s) !== i);
  const allChosen = selected.length === 5;
  const nameOk = voter.length > 0;
  const configOk = SONGS.length > 0 && VOTERS.length > 0;

  document.getElementById("submitBtn").disabled = !!dup || !allChosen || !nameOk || !configOk;

  if (dup) showMsg("err", "Please select each song only once.");
  else if (!hasLocalFinalVote() || !hasVoterSubmitted(getStoredVoter())) hideMsg();
}

function submitVote() {
  const voter = document.getElementById("voterName").value.trim();
  const choices = getChoices();
  const selected = choices.map(c => c.song).filter(Boolean);

  if (!voter) return showMsg("err", "Please select your name.");
  if (hasVoterSubmitted(voter)) {
    handleVoterSelection();
    return;
  }
  if (hasLocalFinalVote() && voter !== getStoredVoter()) {
    return showMsg("err", "This browser is locked to your selected name. Clear your browser cache to switch users.");
  }
  if (selected.length !== 5) return showMsg("err", "Please assign all points.");
  if (new Set(selected).size !== 5) return showMsg("err", "Please select each song only once.");
  if (!API_URL) return showMsg("err", "API_URL is not configured yet. Please add the Google Apps Script URL in js/config.js.");

  pendingPayload = {
    eventId: EVENT_ID,
    voter,
    votes: choices.map(c => ({ song: c.song, points: c.points })),
    submittedAt: new Date().toISOString()
  };

  openConfirmModal(choices, voter);
}

function renderConfirmSummary(choices) {
  return choices.map(c => `
    <div class="confirm-vote-row">
      <span class="confirm-points">
        <span class="confirm-points-value">${c.points}</span>
        <span class="confirm-points-label">${c.points === 1 ? "point" : "points"}</span>
      </span>
      <span class="confirm-song">${escapeHtml(c.song)}</span>
    </div>
  `).join("");
}

function openConfirmModal(choices, voter) {
  const voterEl = document.getElementById("confirmVoterName");
  if (voterEl) voterEl.textContent = voter || "";
  const summary = document.getElementById("confirmVoteSummary");
  if (summary) summary.innerHTML = renderConfirmSummary(choices);
  document.getElementById("confirmOverlay").style.display = "flex";
}

function closeConfirmModal() {
  pendingPayload = null;
  document.getElementById("confirmOverlay").style.display = "none";
}

async function confirmFinalSubmit() {
  if (!pendingPayload) return;

  const payloadToSend = pendingPayload;
  closeConfirmModal();

  try {
    setSubmitButtonSending(true);

    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payloadToSend)
    });

    storeFinalVote(payloadToSend.voter, getChoices());
    addVoterToSubmittedList(payloadToSend.voter);
    lockVoterSelect();
    setVotingCompletedUI();
    showMsg("ok", "Thank you! Your vote was saved successfully.");
    validateChoices();
  } catch (e) {
    showMsg("err", "Submission failed. Please check your connection.");
    validateChoices();
  } finally {
    pendingPayload = null;
    setSubmitButtonSending(false);
  }
}
