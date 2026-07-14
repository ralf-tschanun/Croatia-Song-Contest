const BEST_EVER_SUBMIT_LABEL = "Submit Best Ever Song";
const BEST_EVER_SENDING_LABEL = "⏳ sending...";
const BEST_EVER_COMPLETE_LABEL = "✅ Best Ever Song saved";
const BEST_EVER_ALREADY_MSG = "You have already submitted your Best Ever Song.";
const BEST_EVER_SHEET_ALREADY_MSG = "This person has already submitted a Best Ever Song. Reset browser voting data at the bottom of the page to choose a different name.";
const BEST_EVER_DUPLICATE_MSG = "This song has already been submitted by another participant. Please choose a different song.";
const BEST_EVER_SEARCH_MIN = 2;

let bestEverSearchTimer = null;
let bestEverSelectedTrack = null;
let pendingBestEverPayload = null;

function formatBestEverSongTitle(title, artist) {
  return `${String(title || "").trim()} - ${String(artist || "").trim()}`;
}

function getStoredBestEverVoter() {
  const raw = localStorage.getItem(storageKeyBestEver);
  if (!raw) return "";

  try {
    return String(JSON.parse(raw).voter || "").trim();
  } catch (e) {
    return "";
  }
}

function hasLocalBestEverSubmit() {
  return localStorage.getItem(storageKeyBestEverFinal) === "true" && !!getStoredBestEverVoter();
}

function storeBestEverSubmit(voter, track) {
  localStorage.setItem(storageKeyBestEver, JSON.stringify({ voter, track }));
  localStorage.setItem(storageKeyBestEverFinal, "true");
}

function clearLocalBestEverStorage() {
  localStorage.removeItem(storageKeyBestEverFinal);
  localStorage.removeItem(storageKeyBestEver);
}

function hasBestEverSubmitted(voter) {
  const key = normalizeVoterName(voter);
  if (!key) return false;
  return BEST_EVER_VOTERS.some(name => normalizeVoterName(name) === key);
}

function addVoterToBestEverList(voter) {
  const name = String(voter || "").trim();
  if (!name || hasBestEverSubmitted(name)) return;
  BEST_EVER_VOTERS.push(name);
}

async function loadBestEverVoters() {
  if (!API_URL) return;

  try {
    const data = await jsonp(`${API_URL}?eventId=${encodeURIComponent(EVENT_ID)}&action=config`);
    BEST_EVER_VOTERS = parseBestEverVoters(data);
  } catch (e) {
    console.warn("Could not load Best Ever submitters", e);
    BEST_EVER_VOTERS = [];
  }
}

function parseBestEverVoters(data) {
  const raw = data?.bestEverVoters ?? [];
  if (!Array.isArray(raw)) return [];

  return raw
    .map(entry => (typeof entry === "string" ? entry : entry?.voter || entry?.name || ""))
    .map(name => String(name).trim())
    .filter(Boolean);
}

function showBestEverMsg(type, text) {
  const el = document.getElementById("bestEverMessage");
  if (!el) return;
  el.className = `msg ${type}`;
  el.textContent = text;
}

function hideBestEverMsg() {
  const el = document.getElementById("bestEverMessage");
  if (!el) return;
  el.className = "msg";
  el.textContent = "";
}

function setBestEverSubmitSending(isSending) {
  const btn = document.getElementById("bestEverSubmitBtn");
  if (!btn) return;
  if (!isSending && btn.classList.contains("completed")) return;
  btn.disabled = isSending;
  btn.textContent = isSending ? BEST_EVER_SENDING_LABEL : BEST_EVER_SUBMIT_LABEL;
}

function setBestEverCompletedUI(track) {
  const search = document.getElementById("bestEverSearch");
  const results = document.getElementById("bestEverResults");
  const btn = document.getElementById("bestEverSubmitBtn");

  if (search) {
    search.value = "";
    search.disabled = true;
  }
  if (results) results.innerHTML = "";
  if (btn) {
    btn.textContent = BEST_EVER_COMPLETE_LABEL;
    btn.classList.add("completed");
    btn.disabled = true;
  }

  renderBestEverSelected(track, true);
}

function unlockBestEverInputs() {
  const search = document.getElementById("bestEverSearch");
  const btn = document.getElementById("bestEverSubmitBtn");

  if (search) search.disabled = false;
  if (btn) {
    btn.textContent = BEST_EVER_SUBMIT_LABEL;
    btn.classList.remove("completed");
  }
}

function clearBestEverSelection() {
  bestEverSelectedTrack = null;
  const selected = document.getElementById("bestEverSelected");
  if (selected) {
    selected.style.display = "none";
    selected.innerHTML = "";
  }
  validateBestEverSubmit();
}

function renderBestEverSelected(track, locked) {
  const selected = document.getElementById("bestEverSelected");
  if (!selected || !track) return;

  const preview = track.preview ? `
    <a class="best-ever-preview" href="${escapeHtml(track.preview)}" target="_blank" rel="noopener noreferrer" title="Preview on iTunes">🎧 Preview</a>
  ` : "";

  selected.innerHTML = `
    <div class="best-ever-selected-row">
      <div class="best-ever-selected-text">
      <strong class="song-title">${escapeHtml(track.title)}</strong>
      <span class="song-artist">${escapeHtml(track.artist)}</span>
      </div>
      ${preview}
    </div>
  `;
  selected.style.display = "block";

  if (locked) {
    const search = document.getElementById("bestEverSearch");
    if (search) search.disabled = true;
  }
}

function renderBestEverResults(tracks) {
  const results = document.getElementById("bestEverResults");
  if (!results) return;

  if (!tracks.length) {
    results.innerHTML = '<p class="small best-ever-empty">No songs found. Try another search.</p>';
    return;
  }

  results.innerHTML = tracks.map(track => `
    <button type="button" class="best-ever-result" data-track-id="${track.id}">
      <span class="best-ever-result-title">${escapeHtml(track.title)}</span>
      <span class="best-ever-result-artist">${escapeHtml(track.artist)}</span>
    </button>
  `).join("");

  results.querySelectorAll(".best-ever-result").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-track-id"));
      const track = tracks.find(item => item.id === id);
      if (!track) return;
      bestEverSelectedTrack = track;
      renderBestEverSelected(track, false);
      results.innerHTML = "";
      validateBestEverSubmit();
    });
  });
}

function isExternalRequestPermissionError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  return msg.includes("urlfetchapp") ||
    msg.includes("external_request") ||
    msg.includes("script.external_request") ||
    msg.includes("berechtigung") ||
    msg.includes("permission") ||
    msg.includes("authorization");
}

function buildBestEverSearchUrl(query) {
  return `${API_URL}?eventId=${encodeURIComponent(EVENT_ID)}&action=itunesSearch&q=${encodeURIComponent(query)}`;
}

function formatBestEverSearchError(error) {
  const raw = String(error?.message || error || "").trim();
  const message = raw.toLowerCase();

  if (isExternalRequestPermissionError(raw)) {
    return "Song search is not available yet. Please ask the admin to authorize external requests in Google Apps Script.";
  }
  if (!message || message === "load failed" || message === "failed to fetch") {
    return "Song search failed. Please check your connection and try again.";
  }
  return raw || "Song search failed. Please try again.";
}

async function searchBestEverTracksViaApi(query) {
  const data = await jsonp(buildBestEverSearchUrl(query));
  if (data?.ok && Array.isArray(data.tracks)) return data.tracks;
  throw new Error(data?.error || "itunesSearch failed");
}

async function searchBestEverTracksItunesClient(query) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=10`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Song search failed");

  const data = await response.json();
  return (data.results || [])
    .map((track, index) => ({
      id: track.trackId || `itunes-${index}-${track.trackName}`,
      title: String(track.trackName || "").trim(),
      artist: String(track.artistName || "").trim(),
      preview: String(track.previewUrl || "").trim(),
      link: String(track.trackViewUrl || "").trim()
    }))
    .filter(track => track.title && track.artist);
}

async function searchBestEverTracks(query) {
  let lastError = null;

  try {
    const tracks = await searchBestEverTracksViaApi(query);
    if (tracks.length) return tracks;
  } catch (e) {
    lastError = e;
    console.warn("iTunes proxy search failed", e);
  }

  try {
    return await searchBestEverTracksItunesClient(query);
  } catch (e) {
    throw new Error(formatBestEverSearchError(e.message || lastError?.message));
  }
}

function handleBestEverSearchInput() {
  if (hasLocalBestEverSubmit() || isBestEverBlockedForCurrentVoter()) return;

  const input = document.getElementById("bestEverSearch");
  const query = input?.value.trim() || "";

  clearTimeout(bestEverSearchTimer);

  if (query.length < BEST_EVER_SEARCH_MIN) {
    const results = document.getElementById("bestEverResults");
    if (results) results.innerHTML = "";
    return;
  }

  bestEverSearchTimer = setTimeout(async () => {
    try {
      const tracks = await searchBestEverTracks(query);
      renderBestEverResults(tracks);
    } catch (e) {
      showBestEverMsg("err", formatBestEverSearchError(e));
      console.error(e);
    }
  }, 300);
}

function getCurrentVoterName() {
  return document.getElementById("voterName")?.value.trim() || "";
}

function isBestEverBlockedForCurrentVoter() {
  const voter = getCurrentVoterName();
  if (!voter) return false;
  if (hasLocalBestEverSubmit() && voter === getStoredBestEverVoter()) return hasBestEverSubmitted(voter);
  return hasBestEverSubmitted(voter);
}

function resetBestEverForm() {
  clearBestEverSelection();
  unlockBestEverInputs();
  hideBestEverMsg();

  const search = document.getElementById("bestEverSearch");
  if (search) {
    search.value = "";
    search.disabled = false;
  }
}

function loadStoredBestEverTrack() {
  if (!hasLocalBestEverSubmit()) return null;

  const raw = localStorage.getItem(storageKeyBestEver);
  if (!raw) return null;

  try {
    return JSON.parse(raw).track || null;
  } catch (e) {
    return null;
  }
}

function syncBestEverState() {
  const voter = getCurrentVoterName();

  if (hasLocalBestEverSubmit()) {
    const storedVoter = getStoredBestEverVoter();
    const storedTrack = loadStoredBestEverTrack();

    applyBrowserVoterLock();

    if (voter && storedVoter && voter !== storedVoter) {
      resetBestEverForm();
      return;
    }

    if (storedTrack) {
      bestEverSelectedTrack = storedTrack;
      setBestEverCompletedUI(storedTrack);
      showBestEverMsg("ok", BEST_EVER_ALREADY_MSG);
      return;
    }
  }

  if (voter && hasBestEverSubmitted(voter)) {
    lockVoterSelect();
    clearBestEverSelection();
    unlockBestEverInputs();
    const search = document.getElementById("bestEverSearch");
    if (search) search.disabled = true;
    const btn = document.getElementById("bestEverSubmitBtn");
    if (btn) {
      btn.textContent = BEST_EVER_COMPLETE_LABEL;
      btn.classList.add("completed");
      btn.disabled = true;
    }
    showBestEverMsg("ok", BEST_EVER_SHEET_ALREADY_MSG);
    return;
  }

  resetBestEverForm();
}

function validateBestEverSubmit() {
  const btn = document.getElementById("bestEverSubmitBtn");
  if (!btn || btn.classList.contains("completed")) return;

  const voter = getCurrentVoterName();
  const hasTrack = !!bestEverSelectedTrack;
  btn.disabled = !voter || !hasTrack || isBestEverBlockedForCurrentVoter();
}

async function refreshBestEverSession() {
  await loadBestEverVoters();
  syncBestEverState();
  validateBestEverSubmit();
}

function bindBestEverEvents() {
  const search = document.getElementById("bestEverSearch");
  if (search) {
    search.addEventListener("input", handleBestEverSearchInput);
  }
}

function renderBestEverConfirmSummary(track) {
  return `
    <div class="confirm-vote-row">
      <span class="confirm-song confirm-song-stack">
        <strong class="song-title">${escapeHtml(track.title)}</strong>
        <span class="song-artist">${escapeHtml(track.artist)}</span>
      </span>
    </div>
  `;
}

function openBestEverConfirmModal(voter, track) {
  const voterEl = document.getElementById("bestEverConfirmVoterName");
  if (voterEl) voterEl.textContent = voter || "";

  const summary = document.getElementById("bestEverConfirmSummary");
  if (summary) summary.innerHTML = renderBestEverConfirmSummary(track);

  document.getElementById("bestEverConfirmOverlay").style.display = "flex";
}

function closeBestEverConfirmModal() {
  pendingBestEverPayload = null;
  document.getElementById("bestEverConfirmOverlay").style.display = "none";
}

async function submitBestEver() {
  const voter = getCurrentVoterName();

  if (!voter) return showBestEverMsg("err", "Please select your name first.");
  if (!bestEverSelectedTrack) return showBestEverMsg("err", "Please search and select a song.");
  if (hasBestEverSubmitted(voter)) {
    syncBestEverState();
    return;
  }
  if (hasLockedBrowserVoter() && voter !== getLockedBrowserVoter()) {
    return showBestEverMsg("err", BROWSER_LOCKED_MSG);
  }
  if (hasLocalBestEverSubmit() && voter !== getStoredBestEverVoter()) {
    return showBestEverMsg("err", BROWSER_LOCKED_MSG);
  }
  if (!API_URL) return showBestEverMsg("err", "API_URL is not configured yet.");

  const track = bestEverSelectedTrack;
  pendingBestEverPayload = {
    action: "bestEver",
    eventId: EVENT_ID,
    voter,
    title: track.title,
    artist: track.artist,
    previewLink: track.preview || track.link || "",
    songTitle: formatBestEverSongTitle(track.title, track.artist),
    submittedAt: new Date().toISOString()
  };

  openBestEverConfirmModal(voter, track);
}

function buildBestEverSubmitUrl(payload) {
  return `${API_URL}?eventId=${encodeURIComponent(payload.eventId)}&action=bestEverSubmit&voter=${encodeURIComponent(payload.voter)}&title=${encodeURIComponent(payload.title)}&artist=${encodeURIComponent(payload.artist)}&previewLink=${encodeURIComponent(payload.previewLink || "")}`;
}

function buildBestEverCheckUrl(title, artist) {
  return `${API_URL}?eventId=${encodeURIComponent(EVENT_ID)}&action=bestEverCheck&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;
}

function isBestEverSubmitSuccess(data) {
  return data?.ok === true &&
    data?.action === "bestEver" &&
    typeof data.nr === "number";
}

function isBestEverDuplicateError(error) {
  const msg = String(error || "").toLowerCase();
  return msg.includes("already been submitted by another participant");
}

function handleBestEverSubmitFailure(error) {
  const message = String(error || "").trim();

  if (isBestEverDuplicateError(message)) {
    clearBestEverSelection();
    unlockBestEverInputs();

    const search = document.getElementById("bestEverSearch");
    const results = document.getElementById("bestEverResults");
    if (search) {
      search.disabled = false;
      search.focus();
    }
    if (results) results.innerHTML = "";

    showBestEverMsg("err", BEST_EVER_DUPLICATE_MSG);
    validateBestEverSubmit();
    return;
  }

  showBestEverMsg("err", message || "Submission failed. Please try again.");
  validateBestEverSubmit();
}

async function confirmBestEverSubmit() {
  if (!pendingBestEverPayload) return;

  const payloadToSend = pendingBestEverPayload;
  closeBestEverConfirmModal();

  try {
    setBestEverSubmitSending(true);

    const check = await jsonp(buildBestEverCheckUrl(payloadToSend.title, payloadToSend.artist));
    if (check?.action === "bestEverCheck" && check.duplicate) {
      handleBestEverSubmitFailure("This song has already been submitted by another participant.");
      return;
    }

    const data = await jsonp(buildBestEverSubmitUrl(payloadToSend));
    if (!isBestEverSubmitSuccess(data)) {
      handleBestEverSubmitFailure(
        data?.error ||
        (data?.ok ? "Submission could not be confirmed. Please try again." : "Submission failed. Please try again.")
      );
      return;
    }

    await loadBestEverVoters();
    if (!hasBestEverSubmitted(payloadToSend.voter)) {
      handleBestEverSubmitFailure("Submission could not be confirmed. Please try again.");
      return;
    }

    storeBestEverSubmit(payloadToSend.voter, bestEverSelectedTrack);
    addVoterToBestEverList(payloadToSend.voter);
    applyBrowserVoterLock();
    setBestEverCompletedUI(bestEverSelectedTrack);
    showBestEverMsg("ok", "Thank you! Your Best Ever Song was saved.");
    validateBestEverSubmit();
  } catch (e) {
    showBestEverMsg("err", "Submission failed. Please check your connection.");
    validateBestEverSubmit();
  } finally {
    setBestEverSubmitSending(false);
  }
}

function onVoterChangedForBestEver() {
  if (hasLockedBrowserVoter()) {
    const lockedVoter = getLockedBrowserVoter();
    const voter = getCurrentVoterName();
    if (voter !== lockedVoter) {
      applyBrowserVoterLock();
      showBestEverMsg("err", BROWSER_LOCKED_MSG);
    }
  }
  syncBestEverState();
  validateBestEverSubmit();
}
