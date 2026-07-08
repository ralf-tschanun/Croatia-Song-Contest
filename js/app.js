async function init() {
  if (location.protocol === "file:") {
    showMsg(
      "err",
      "This page cannot be opened directly as a file. Please start a local server (e.g. python3 -m http.server 8080) or use the GitHub Pages URL."
    );
    return;
  }

  const shouldResetBrowserVote = new URLSearchParams(location.search).get("reset") === "1";

  if (shouldResetBrowserVote) {
    localStorage.removeItem(storageKeyFinal);
    localStorage.removeItem(storageKeyVote);
    localStorage.removeItem(storageKeyBestEverFinal);
    localStorage.removeItem(storageKeyBestEver);
    history.replaceState({}, "", location.pathname + location.hash);
  }

  await loadConfig();
  ["p5","p4","p3","p2","p1"].forEach(id => fillSelect(document.getElementById(id)));
  document.querySelectorAll("select").forEach(s => {
    if (s.id !== "voterName") s.addEventListener("change", validateChoices);
  });
  document.getElementById("voterName").addEventListener("change", () => {
    handleVoterSelection();
    onVoterChangedForBestEver();
  });
  bindBestEverEvents();
  renderSongList();
  bindSongListClicks();
  await refreshVotingSession();
  await refreshBestEverSession();

  if (shouldResetBrowserVote) {
    showMsg("ok", "Browser voting data cleared. Please choose your name.");
  }
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = "acroatiaJsonp_" + Date.now() + "_" + Math.floor(Math.random() * 100000);

    window[callbackName] = function(data) {
      resolve(data);
      delete window[callbackName];
      script.remove();
    };

    const script = document.createElement("script");
    script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${callbackName}`;
    script.onerror = function() {
      reject(new Error("JSONP request failed"));
      delete window[callbackName];
      script.remove();
    };

    document.body.appendChild(script);
  });
}

async function loadVotedVoters() {
  if (!API_URL) return;

  try {
    const data = await jsonp(`${API_URL}?eventId=${encodeURIComponent(EVENT_ID)}&action=results`);
    VOTED_VOTERS = parseVotedVoters(data);
  } catch (e) {
    console.warn("Could not load submitted voters", e);
    VOTED_VOTERS = [];
  }
}

function parseVotedVoters(data) {
  const raw = data?.votedVoters ?? data?.submittedVoters ?? data?.votersVoted ?? [];
  if (!Array.isArray(raw)) return [];

  return raw
    .map(entry => (typeof entry === "string" ? entry : entry?.voter || entry?.name || ""))
    .map(name => String(name).trim())
    .filter(Boolean);
}

function normalizeVoterName(name) {
  return String(name || "").trim().toLowerCase();
}

const BROWSER_LOCKED_MSG = "This browser is locked to your selected name. Reset browser voting data at the bottom of the page to switch users.";

function getLockedBrowserVoter() {
  if (hasLocalFinalVote()) return getStoredVoter();
  if (hasLocalBestEverSubmit()) return getStoredBestEverVoter();
  return "";
}

function hasLockedBrowserVoter() {
  return !!getLockedBrowserVoter();
}

function applyBrowserVoterLock() {
  const voter = getLockedBrowserVoter();
  if (!voter) return false;

  const sel = document.getElementById("voterName");
  if (!sel) return false;

  if (VOTERS.includes(voter)) {
    sel.value = voter;
  }

  lockVoterSelect();
  return true;
}

function hasVoterSubmitted(voter) {
  const key = normalizeVoterName(voter);
  if (!key) return false;
  return VOTED_VOTERS.some(name => normalizeVoterName(name) === key);
}

function addVoterToSubmittedList(voter) {
  const name = String(voter || "").trim();
  if (!name || hasVoterSubmitted(name)) return;
  VOTED_VOTERS.push(name);
}

async function loadConfig() {
  if (!API_URL) {
    showMsg("err", "API_URL is not configured yet. Please add the Google Apps Script URL in js/config.js.");
    return;
  }

  try {
    const data = await jsonp(`${API_URL}?eventId=${encodeURIComponent(EVENT_ID)}&action=config`);
    SONGS = (data.songs || []).map(normalizeSong);
    VOTERS = data.voters || [];
    BEST_EVER_VOTERS = parseBestEverVoters(data);

    if (SONGS.length === 0) showMsg("err", "No songs found. Please fill in the 'Songs' tab in the Google Sheet.");
    if (VOTERS.length === 0) showMsg("err", "No participants found. Please fill in the 'Teilnehmer' tab in the Google Sheet.");
  } catch (e) {
    showMsg("err", "Could not load songs/participants from Google Sheets.");
    console.error(e);
  }
}

function fillVoterSelect() {
  const sel = document.getElementById("voterName");

  sel.disabled = false;
  sel.innerHTML = '<option value="">Please select your name</option>' + VOTERS.map(name =>
    `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
  ).join("");
  sel.selectedIndex = 0;
}

function fillSelect(sel) {
  sel.innerHTML =
    '<option value="">Please choose</option>' +
    SONGS.map((song, i) => {
      const label = getSongVoteKey(song);
      const value = getSongApiKey(song);
      return `<option value="${escapeHtml(value)}">${i + 1}. ${escapeHtml(label)}</option>`;
    }).join("");
}

function renderSongList() {
  document.getElementById("songList").innerHTML =
  SONGS.map((song, i) => {
    const key = getSongVoteKey(song);
    const preview = song.preview || song.spotify || "";

    return `
  <div class="song">
  <b>${i + 1}.</b>
  ${renderSongLineHtml(song)}
  ${
    preview
      ? `<a class="spotifyLink" href="${escapeHtml(preview)}" target="_blank" rel="noopener noreferrer" title="Preview song" data-song="${escapeHtml(key)}">🎧</a>`
      : ""
  }
</div>
    `;
  }).join("");
}

function bindSongListClicks() {
  document.getElementById("songList").addEventListener("click", (e) => {
    const link = e.target.closest(".spotifyLink");
    if (!link) return;

    document.querySelectorAll(".spotifyLink.active").forEach(el => el.classList.remove("active"));
    link.classList.add("active");
  });
}

function setActiveTab(tab) {
  document.getElementById("tabVoteBtn").classList.toggle("active", tab === "vote");
  document.getElementById("tabResultsBtn").classList.toggle("active", tab === "results");
}

function openRulesModal() {
  document.getElementById("rulesOverlay").style.display = "flex";
}

function closeRulesModal() {
  document.getElementById("rulesOverlay").style.display = "none";
}

function showVote(){
  document.getElementById("voteView").style.display="block";
  document.getElementById("resultsView").style.display="none";
  setActiveTab("vote");
  refreshVotingSession();
  refreshBestEverSession();
}

function showResults(){
  document.getElementById("voteView").style.display="none";
  document.getElementById("resultsView").style.display="block";
  setActiveTab("results");
  loadResults();
}

function showMsg(type, text){
  const el=document.getElementById("message");
  el.className=`msg ${type}`;
  el.textContent=text;
}

function hideMsg(){
  const el=document.getElementById("message");
  el.className="msg";
  el.textContent="";
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function formatSongDisplayTitle(title, artist) {
  const songTitle = String(title || "").trim();
  const songArtist = String(artist || "").trim();
  if (songTitle && songArtist) return `${songTitle} - ${songArtist}`;
  return songTitle || songArtist;
}

function normalizeSong(song) {
  let title = String(song?.title || "").trim();
  let artist = String(song?.artist || song?.interpret || "").trim();
  let preview = String(song?.preview || "").trim();
  const voter = String(song?.voter || "").trim();
  const nr = song?.nr;
  const spotifyRaw = String(song?.spotify || "").trim();

  // Old API mapped the Interpret column into spotify when the sheet already used Title + Interpret.
  if (!artist && spotifyRaw && !/^https?:\/\//i.test(spotifyRaw)) {
    artist = spotifyRaw;
  }

  // Legacy combined value in one field: "Title - Interpret"
  if (!artist && title.includes(" - ")) {
    const parts = title.split(" - ");
    title = String(parts[0] || "").trim();
    artist = String(parts.slice(1).join(" - ") || "").trim();
  }

  if (!preview && /^https?:\/\//i.test(spotifyRaw)) {
    preview = spotifyRaw;
  }

  const label = String(song?.label || "").trim() || formatSongDisplayTitle(title, artist);

  return {
    ...song,
    nr,
    title,
    artist,
    preview,
    voter,
    label,
    spotify: preview || spotifyRaw
  };
}

function getSongVoteKey(song) {
  return normalizeSong(song).label;
}

function getSongApiKey(song) {
  const parsed = normalizeSong(song);
  // New API returns an explicit label; legacy API validates against title only.
  if (String(song?.label || "").trim()) return parsed.label;
  return parsed.title;
}

function getSongDisplayLabel(apiKey) {
  const match = SONGS.find(song => getSongApiKey(song) === apiKey);
  return match ? getSongVoteKey(match) : apiKey;
}

function renderSongLineHtml(song) {
  const parsed = normalizeSong(song);
  const title = parsed.title;
  const artist = parsed.artist;

  if (!title && !artist) {
    return `<span class="song-title">${escapeHtml(parsed.label)}</span>`;
  }

  return `
    <span class="song-line">
      <strong class="song-title">${escapeHtml(title)}</strong>
      ${artist ? `<span class="song-artist">${escapeHtml(artist)}</span>` : ""}
    </span>
  `;
}

let initComplete = false;

async function boot() {
  await init();
  initComplete = true;
}

boot();

window.addEventListener("pageshow", () => {
  if (!initComplete) return;
  refreshVotingSession();
  refreshBestEverSession();
});
