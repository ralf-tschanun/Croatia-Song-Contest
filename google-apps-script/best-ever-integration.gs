// Best Ever Song integration for your existing Google Apps Script.
// Merge these constants, setupSheets_ additions, doPost branch, and doGet extensions.

const SHEET_BEST_EVER_SUBMITS = "BestEverSubmits";
const SONG_ROW_HEADERS = ["Nr", "Title", "Interpret", "Preview", "Voter"];
const BEST_EVER_SUBMIT_HEADERS = ["Nr", "Title", "Interpret", "Preview", "Voter", "Timestamp", "Event ID"];

// --- Add at the start of doPost, after parsing JSON: ---
//
// if (data.action === "bestEver") {
//   return handleBestEverPost_(ss, data);
// }

function handleBestEverPost_(ss, data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    setupSheets_(ss);

    if (!data.eventId || !data.voter || !data.title || !data.artist) {
      return json_({ ok: false, error: "Invalid Best Ever payload" });
    }

    const validVoters = getVoters_(ss);
    if (!validVoters.includes(data.voter)) {
      return json_({ ok: false, error: "Unknown voter" });
    }

    const title = String(data.title).trim();
    const artist = String(data.artist).trim();
    const previewLink = String(data.previewLink || "").trim();

    if (hasBestEverVoterSubmitted_(ss, data.eventId, data.voter)) {
      return json_({ ok: false, error: "This voter has already submitted a Best Ever Song." });
    }

    if (hasBestEverSongDuplicate_(ss, title, artist)) {
      return json_({ ok: false, error: "This song has already been submitted by another participant." });
    }

    const submitsSheet = ss.getSheetByName(SHEET_BEST_EVER_SUBMITS);
    const nextNr = getNextBestEverNumber_(submitsSheet);
    const songRow = [nextNr, title, artist, previewLink, data.voter];

    submitsSheet.appendRow(songRow.concat([new Date(), data.eventId]));

    return json_({ ok: true, nr: nextNr });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function setupBestEverSheets_(ss) {
  let submits = ss.getSheetByName(SHEET_BEST_EVER_SUBMITS);
  if (!submits) {
    submits = ss.insertSheet(SHEET_BEST_EVER_SUBMITS);
    submits.appendRow(BEST_EVER_SUBMIT_HEADERS);
    submits.getRange(1, 1, 1, BEST_EVER_SUBMIT_HEADERS.length).setFontWeight("bold");
  }
}

// Call setupBestEverSheets_(ss) inside your existing setupSheets_(ss).

function getNextBestEverNumber_(sheet) {
  const rows = sheet.getDataRange().getValues().slice(1).filter(row =>
    row.some(cell => String(cell || "").trim() !== "")
  );
  return rows.length + 1;
}

function normalizeBestEverKey_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hasBestEverVoterSubmitted_(ss, eventId, voter) {
  const sheet = ss.getSheetByName(SHEET_BEST_EVER_SUBMITS);
  if (!sheet) return false;

  const rows = sheet.getDataRange().getValues().slice(1);
  const voterKey = normalizeBestEverKey_(voter);

  return rows.some(row =>
    String(row[6] || "").trim() === String(eventId).trim() &&
    normalizeBestEverKey_(row[4]) === voterKey
  );
}

function hasBestEverSongDuplicate_(ss, title, artist) {
  const sheet = ss.getSheetByName(SHEET_BEST_EVER_SUBMITS);
  if (!sheet) return false;

  const rows = sheet.getDataRange().getValues().slice(1);
  const titleKey = normalizeBestEverKey_(title);
  const artistKey = normalizeBestEverKey_(artist);

  return rows.some(row =>
    normalizeBestEverKey_(row[1]) === titleKey &&
    normalizeBestEverKey_(row[2]) === artistKey
  );
}

function getBestEverVoters_(ss, eventId) {
  const sheet = ss.getSheetByName(SHEET_BEST_EVER_SUBMITS);
  if (!sheet) return [];

  const rows = sheet.getDataRange().getValues().slice(1);
  const voters = new Set();

  rows.forEach(row => {
    if (String(row[6] || "").trim() !== String(eventId).trim()) return;
    const voter = String(row[4] || "").trim();
    if (voter) voters.add(voter);
  });

  return Array.from(voters).sort((a, b) => a.localeCompare(b, "de"));
}

function searchDeezerTracks_(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return { ok: true, tracks: [] };

  try {
    const url = "https://api.deezer.com/search?q=" + encodeURIComponent(q) + "&limit=10";
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const status = response.getResponseCode();

    if (status < 200 || status >= 300) {
      return { ok: false, error: "Deezer search failed (" + status + ")" };
    }

    const data = JSON.parse(response.getContentText());
    const tracks = (data.data || [])
      .map(track => ({
        id: track.id,
        title: String(track.title || "").trim(),
        artist: String((track.artist && track.artist.name) || "").trim(),
        preview: String(track.preview || "").trim(),
        link: String(track.link || "").trim()
      }))
      .filter(track => track.title && track.artist);

    return { ok: true, tracks: tracks };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function searchItunesTracks_(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return { ok: true, tracks: [] };

  try {
    const url = "https://itunes.apple.com/search?term=" + encodeURIComponent(q) + "&media=music&entity=song&limit=10";
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const status = response.getResponseCode();

    if (status < 200 || status >= 300) {
      return { ok: false, error: "iTunes search failed (" + status + ")" };
    }

    const data = JSON.parse(response.getContentText());
    const tracks = (data.results || [])
      .map(function(track, index) {
        return {
          id: track.trackId || ("itunes-" + index + "-" + track.trackName),
          title: String(track.trackName || "").trim(),
          artist: String(track.artistName || "").trim(),
          preview: String(track.previewUrl || "").trim(),
          link: String(track.trackViewUrl || "").trim()
        };
      })
      .filter(function(track) { return track.title && track.artist; });

    return { ok: true, tracks: tracks };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// --- Extend doGet: ---
//
// if (action === "deezerSearch") {
//   return json_(searchDeezerTracks_(e.parameter.q || ""), e.parameter.callback);
// }
//
// if (action === "itunesSearch") {
//   return json_(searchItunesTracks_(e.parameter.q || ""), e.parameter.callback);
// }
//
// return json_({
//   ok: true,
//   songs: getSongs_(ss),
//   voters: getVoters_(ss),
//   bestEverVoters: getBestEverVoters_(ss, eventId)
// }, e.parameter.callback);
