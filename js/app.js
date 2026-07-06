async function init() {
  await loadConfig();

  fillVoterSelect();
  ["p5","p4","p3","p2","p1"].forEach(id => fillSelect(document.getElementById(id)));
  document.querySelectorAll("select").forEach(s => s.addEventListener("change", validateChoices));
  renderSongList();
  loadStoredFinalVote();
  validateChoices();

  if (localStorage.getItem(storageKeyFinal) === "true") {
    loadStoredFinalVote();
    setVotingCompletedUI();
    showMsg("ok", "Du hast dein Voting bereits final abgeschickt.");
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
    showMsg("err", "API_URL ist noch leer. Trage zuerst die Google-Apps-Script-URL in js/config.js ein.");
    return;
  }

  try {
    const data = await jsonp(`${API_URL}?eventId=${encodeURIComponent(EVENT_ID)}&action=config`);
    SONGS = data.songs || [];
    VOTERS = data.voters || [];

    if (SONGS.length === 0) showMsg("err", "Keine Songs gefunden. Bitte im Google Sheet den Tab 'Songs' befüllen.");
    if (VOTERS.length === 0) showMsg("err", "Keine Teilnehmer gefunden. Bitte im Google Sheet den Tab 'Teilnehmer' befüllen.");
  } catch (e) {
    showMsg("err", "Songs/Teilnehmer konnten nicht aus Google Sheets geladen werden.");
    console.error(e);
  }
}

function fillVoterSelect() {
  const sel = document.getElementById("voterName");
  sel.innerHTML = '<option value="">Bitte Namen auswählen</option>' + VOTERS.map(name =>
    `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
  ).join("");
}

function fillSelect(sel) {
  sel.innerHTML =
    '<option value="">Bitte wählen</option>' +
    SONGS.map((song,i)=>
      `<option value="${escapeHtml(song.title)}">${i+1}. ${escapeHtml(song.title)}</option>`
    ).join("");
}

function renderSongList() {
  document.getElementById("songList").innerHTML =
  SONGS.map((song,i)=>`

  <div class="song">
    <b>${i+1}.</b>

    ${escapeHtml(song.title)}

    ${
        song.spotify
        ? `<a class="spotifyLink"
             href="${song.spotify}"
             target="_blank"
             title="Auf Spotify öffnen">🎧</a>`
        : ""
    }

  </div>

  `).join("");
}

function showVote(){
  document.getElementById("voteView").style.display="block";
  document.getElementById("resultsView").style.display="none";
}

function showResults(){
  document.getElementById("voteView").style.display="none";
  document.getElementById("resultsView").style.display="block";
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
