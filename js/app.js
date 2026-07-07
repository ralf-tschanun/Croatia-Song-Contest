async function init() {
  if (location.protocol === "file:") {
    showMsg(
      "err",
      "This page cannot be opened directly as a file. Please start a local server (e.g. python3 -m http.server 8080) or use the GitHub Pages URL."
    );
    return;
  }

  await loadConfig();

  fillVoterSelect();
  ["p5","p4","p3","p2","p1"].forEach(id => fillSelect(document.getElementById(id)));
  document.querySelectorAll("select").forEach(s => s.addEventListener("change", validateChoices));
  renderSongList();
  bindSongListClicks();
  loadStoredFinalVote();
  validateChoices();

  if (localStorage.getItem(storageKeyFinal) === "true") {
    loadStoredFinalVote();
    setVotingCompletedUI();
    showMsg("ok", "You have already submitted your final vote.");
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

async function loadConfig() {
  if (!API_URL) {
    showMsg("err", "API_URL is not configured yet. Please add the Google Apps Script URL in js/config.js.");
    return;
  }

  try {
    const data = await jsonp(`${API_URL}?eventId=${encodeURIComponent(EVENT_ID)}&action=config`);
    SONGS = data.songs || [];
    VOTERS = data.voters || [];

    if (SONGS.length === 0) showMsg("err", "No songs found. Please fill in the 'Songs' tab in the Google Sheet.");
    if (VOTERS.length === 0) showMsg("err", "No participants found. Please fill in the 'Teilnehmer' tab in the Google Sheet.");
  } catch (e) {
    showMsg("err", "Could not load songs/participants from Google Sheets.");
    console.error(e);
  }
}

function fillVoterSelect() {
  const sel = document.getElementById("voterName");
  sel.innerHTML = '<option value="">Please select your name</option>' + VOTERS.map(name =>
    `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
  ).join("");
}

function fillSelect(sel) {
  sel.innerHTML =
    '<option value="">Please choose</option>' +
    SONGS.map((song,i)=>
      `<option value="${escapeHtml(song.title)}">${i+1}. ${escapeHtml(song.title)}</option>`
    ).join("");
}

function renderSongList() {
  document.getElementById("songList").innerHTML =
  SONGS.map((song,i)=>`

  <div class="song">
  <b>${i+1}.</b>
  <span class="songTitle">${escapeHtml(song.title)}</span>
  ${
    song.spotify
    ? `<a class="spotifyLink" href="${escapeHtml(song.spotify)}" target="_blank" rel="noopener noreferrer" title="Open on Spotify" data-song="${escapeHtml(song.title)}">🎧</a>`
    : ""
  }
</div>

  `).join("");
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

function showVote(){
  document.getElementById("voteView").style.display="block";
  document.getElementById("resultsView").style.display="none";
  setActiveTab("vote");
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

init();
