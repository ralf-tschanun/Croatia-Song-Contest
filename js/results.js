function loadResults() {
  if (!API_URL) {
    document.getElementById("results").innerHTML = `<p class="msg err" style="display:block">API_URL ist noch leer.</p>`;
    return;
  }

  jsonp(`${API_URL}?eventId=${encodeURIComponent(EVENT_ID)}&action=results`)
    .then(data => renderResults(data || {}))
    .catch(() => {
      document.getElementById("results").innerHTML = `<p class="msg err" style="display:block">Ergebnisse konnten nicht geladen werden.</p>`;
    });
}

function renderResults(data) {
  const rows = Array.isArray(data) ? data : (data.results || []);
  const pointsBySong = {};

  rows.forEach(r => {
    if (r.song) pointsBySong[r.song] = Number(r.points) || 0;
  });

  const ordered = SONGS.map((song, idx) => ({
    song,
    points: pointsBySong[song] || 0,
    originalIndex: idx
  }))
  .sort((a,b) => b.points - a.points || a.originalIndex - b.originalIndex);

  const totalPoints = ordered.reduce((sum, r) => sum + (Number(r.points) || 0), 0);
  const calculatedVotingCount = totalPoints > 0 ? Math.round(totalPoints / 15) : 0;
  const votingCount = Number(data.votingCount ?? data.voterCount ?? calculatedVotingCount) || 0;
  const max = Math.max(1, ...ordered.map(r => r.points || 0));

  document.getElementById("results").innerHTML = `
    <div class="result-stats">
      <div class="stat"><b>${votingCount}</b><span>Votings eingegangen</span></div>
      <div class="stat"><b>${ordered[0]?.points || 0}</b><span>Punkte für Platz 1</span></div>
    </div>
    <table>
      <thead><tr><th>Rang</th><th>Song</th><th>Punkte</th><th></th></tr></thead>
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
