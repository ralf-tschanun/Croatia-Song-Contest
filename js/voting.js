let pendingPayload = null;

function getChoices() {
  return ["p5","p4","p3","p2","p1"].map(id => ({
    id,
    points: pointMap[id],
    song: document.getElementById(id).value
  }));
}

function validateChoices() {
  const choices = getChoices();
  const selected = choices.map(c => c.song).filter(Boolean);
  const dup = selected.find((s, i) => selected.indexOf(s) !== i);
  const allChosen = selected.length === 5;
  const nameOk = document.getElementById("voterName").value.trim().length > 0;
  const configOk = SONGS.length > 0 && VOTERS.length > 0;

  document.getElementById("submitBtn").disabled = !!dup || !allChosen || !nameOk || !configOk;

  if (dup) showMsg("err", "Bitte jeden Song nur einmal auswählen.");
  else hideMsg();
}

function storeFinalVote(voter, choices) {
  localStorage.setItem(storageKeyVote, JSON.stringify({ voter, choices }));
  localStorage.setItem(storageKeyFinal, "true");
}

function loadStoredFinalVote() {
  const raw = localStorage.getItem(storageKeyVote);
  if (!raw) return;

  try {
    const stored = JSON.parse(raw);
    if (stored.voter) document.getElementById("voterName").value = stored.voter;

    (stored.choices || []).forEach(c => {
      const el = document.getElementById(c.id);
      if (el) el.value = c.song || "";
    });
  } catch (e) {
    console.warn("Stored vote could not be loaded", e);
  }
}

function lockVoting() {
  document.getElementById("voterName").disabled = true;
  ["p5","p4","p3","p2","p1"].forEach(id => {
    document.getElementById(id).disabled = true;
  });
}

function setVotingCompletedUI() {
  lockVoting();
  const btn = document.getElementById("submitBtn");
  btn.textContent = "✅ Voting abgeschlossen";
  btn.classList.add("completed");
  btn.disabled = true;
}

function submitVote() {
  const voter = document.getElementById("voterName").value.trim();
  const choices = getChoices();
  const selected = choices.map(c => c.song).filter(Boolean);

  if (!voter) return showMsg("err", "Bitte wähle deinen Namen aus.");
  if (selected.length !== 5) return showMsg("err", "Bitte alle Punkte vergeben.");
  if (new Set(selected).size !== 5) return showMsg("err", "Bitte jeden Song nur einmal wählen.");
  if (!API_URL) return showMsg("err", "API_URL ist noch leer. Trage zuerst die Google-Apps-Script-URL in js/config.js ein.");

  pendingPayload = {
    eventId: EVENT_ID,
    voter,
    votes: choices.map(c => ({ song: c.song, points: c.points })),
    submittedAt: new Date().toISOString()
  };

  openConfirmModal();
}

function openConfirmModal() {
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
    document.getElementById("submitBtn").disabled = true;

    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payloadToSend)
    });

    storeFinalVote(payloadToSend.voter, getChoices());
    setVotingCompletedUI();
    showMsg("ok", "Vielen Dank! Dein Voting wurde erfolgreich gespeichert.");
  } catch (e) {
    showMsg("err", "Senden fehlgeschlagen. Bitte Verbindung prüfen.");
    validateChoices();
  } finally {
    pendingPayload = null;
  }
}
