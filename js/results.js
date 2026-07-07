const REFRESH_RESULTS_LABEL = "Refresh results";
const REFRESH_RESULTS_LOADING_LABEL = "⏳ loading...";
const POINTS_PER_VOTE = 15;

function setRefreshResultsButtonState(isLoading) {
  const btn = document.getElementById("refreshResultsBtn");
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? REFRESH_RESULTS_LOADING_LABEL : REFRESH_RESULTS_LABEL;
}

function getVotedVoters(data) {
  const raw = data.votedVoters ?? data.submittedVoters ?? data.votersVoted ?? [];
  if (!Array.isArray(raw)) return [];

  return raw
    .map(entry => (typeof entry === "string" ? entry : entry?.voter || entry?.name || ""))
    .map(name => String(name).trim())
    .filter(Boolean);
}

function buildVoterLists(votedVoters, totalVoters) {
  const allVoters = VOTERS.map(name => String(name).trim()).filter(Boolean);
  const voterTotal = totalVoters || allVoters.length;
  const votedSet = new Set(votedVoters);
  const voted = allVoters.filter(name => votedSet.has(name));
  const pending = allVoters.filter(name => !votedSet.has(name));

  return { voterTotal, voted, pending };
}

function renderVoterItems(names, emptyLabel) {
  if (!names.length) {
    return `<li class="empty">${escapeHtml(emptyLabel)}</li>`;
  }

  return names.map(name => `<li>${escapeHtml(name)}</li>`).join("");
}

function toggleVoterDetails() {
  const panel = document.getElementById("voterDetailsPanel");
  const btn = document.getElementById("voterDetailsToggle");
  if (!panel || !btn) return;

  const isOpen = !panel.hidden;
  panel.hidden = isOpen;
  btn.setAttribute("aria-expanded", String(!isOpen));
  btn.textContent = isOpen ? "▼" : "▲";
}

function loadResults() {
  if (!API_URL) {
    document.getElementById("results").innerHTML = `<p class="msg err" style="display:block">API_URL is not configured yet.</p>`;
    return;
  }

  setRefreshResultsButtonState(true);

  jsonp(`${API_URL}?eventId=${encodeURIComponent(EVENT_ID)}&action=results`)
    .then(data => renderResults(data || {}))
    .catch(() => {
      document.getElementById("results").innerHTML = `<p class="msg err" style="display:block">Results could not be loaded.</p>`;
    })
    .finally(() => setRefreshResultsButtonState(false));
}

function renderResults(data) {
  const rows = Array.isArray(data) ? data : (data.results || []);
  const pointsBySong = {};

  rows.forEach(r => {
    if (r.song) pointsBySong[r.song] = Number(r.points) || 0;
  });

  const ordered = SONGS.map((song, idx) => ({
    song: song.title,
    points: pointsBySong[song.title] || 0,
    originalIndex: idx
  }))
  .sort((a,b) => b.points - a.points || a.originalIndex - b.originalIndex);

  const totalPoints = ordered.reduce((sum, r) => sum + (Number(r.points) || 0), 0);
  const calculatedVotingCount = totalPoints > 0 ? Math.round(totalPoints / POINTS_PER_VOTE) : 0;
  const votingCount = Number(data.votingCount ?? data.voterCount ?? calculatedVotingCount) || 0;
  const votedVoters = getVotedVoters(data);
  const { voterTotal, voted, pending } = buildVoterLists(votedVoters, VOTERS.length);
  const maxPossiblePoints = voterTotal * POINTS_PER_VOTE;
  const max = Math.max(1, ...ordered.map(r => r.points || 0));

  document.getElementById("results").innerHTML = `
    <div class="result-stats">
      <div class="stat">
        <div class="stat-head">
          <div class="stat-inline">
            <b>${votingCount} / ${voterTotal}</b>
            <span class="stat-label">Votes received</span>
          </div>
          <button
            type="button"
            id="voterDetailsToggle"
            class="stat-expand-btn secondary"
            onclick="toggleVoterDetails()"
            aria-expanded="false"
            aria-controls="voterDetailsPanel"
            title="Show voter list"
          >▼</button>
        </div>
        <div id="voterDetailsPanel" class="stat-details" hidden>
          <div class="voter-group">
            <h4>Already voted</h4>
            <ul>${renderVoterItems(voted, "Nobody yet")}</ul>
          </div>
          <div class="voter-group">
            <h4>Still pending</h4>
            <ul>${renderVoterItems(pending, "Everyone has voted")}</ul>
          </div>
        </div>
      </div>
      <div class="stat">
        <div class="stat-inline">
          <b>${totalPoints} / ${maxPossiblePoints}</b>
          <span class="stat-label">Points awarded</span>
        </div>
      </div>
    </div>
    <table>
      <thead><tr><th>Rank</th><th>Song</th><th>Points</th><th></th></tr></thead>
      <tbody>
        ${ordered.map((r,i)=>`
          <tr>
            <td class="rank">${i+1}</td>
            <td>${escapeHtml(r.song)}</td>
            <td><b>${r.points}</b></td>
            <td><div class="bar"><span style="width:${Math.round((r.points/max)*100)}%"></span></div></td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}
