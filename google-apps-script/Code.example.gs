// Full merge reference for your deployed Apps Script.
// Replace your existing doPost / doGet / setupSheets_ with the versions below,
// or merge the marked Best Ever blocks into your current script.

const SHEET_VOTES = "Votes";
const SHEET_SONGS = "Songs";
const SHEET_VOTERS = "Teilnehmer";
const SHEET_BEST_EVER_SUBMITS = "BestEverSubmits";
const SONG_ROW_HEADERS = ["Nr", "Title", "Interpret", "Preview", "Voter"];
const BEST_EVER_SUBMIT_HEADERS = ["Nr", "Title", "Interpret", "Preview", "Voter", "Timestamp", "Event ID"];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    setupSheets_(ss);

    const data = JSON.parse(e.postData.contents);

    if (data.action === "bestEver") {
      return json_(submitBestEver_(ss, data));
    }

    const votesSheet = ss.getSheetByName(SHEET_VOTES);

    if (!data.eventId || !data.voter || !Array.isArray(data.votes)) {
      return json_({ ok: false, error: "Invalid payload" });
    }

    const validSongKeys = [];
    getSongs_(ss).forEach(song => {
      if (song.label) validSongKeys.push(song.label);
      if (song.title) validSongKeys.push(song.title);
    });
    const validSongs = validSongKeys;
    const validVoters = getVoters_(ss);

    if (!validVoters.includes(data.voter)) return json_({ ok: false, error: "Unknown voter" });

    const songs = data.votes.map(v => v.song);
    const uniqueSongs = [...new Set(songs)];
    if (data.votes.length !== 5 || uniqueSongs.length !== 5) {
      return json_({ ok: false, error: "Each voter must vote for five different songs." });
    }

    const invalidSong = songs.find(song => !validSongs.includes(song));
    if (invalidSong) return json_({ ok: false, error: "Invalid song: " + invalidSong });

    const allowedPoints = [5, 4, 3, 2, 1];
    const points = data.votes.map(v => Number(v.points)).sort((a, b) => b - a);
    if (JSON.stringify(points) !== JSON.stringify(allowedPoints)) {
      return json_({ ok: false, error: "Invalid points." });
    }

    const existing = votesSheet.getDataRange().getValues().slice(1);
    const alreadyVoted = existing.some(r =>
      r[1] === data.eventId &&
      String(r[2]).trim().toLowerCase() === String(data.voter).trim().toLowerCase()
    );
    if (alreadyVoted) return json_({ ok: false, error: "This voter has already submitted a final vote." });

    data.votes.forEach(v => {
      votesSheet.appendRow([new Date(), data.eventId, data.voter, v.song, Number(v.points)]);
    });

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  setupSheets_(ss);

  const action = e.parameter.action || "results";
  const eventId = e.parameter.eventId || "acroatia-2026";

  if (action === "config") {
    return json_({
      ok: true,
      songs: getSongs_(ss),
      voters: getVoters_(ss),
      bestEverVoters: getBestEverVoters_(ss, eventId)
    }, e.parameter.callback);
  }

  if (action === "itunesSearch") {
    return json_(searchItunesTracks_(e.parameter.q || ""), e.parameter.callback);
  }

  if (action === "bestEverSubmit") {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const data = {
        eventId: eventId,
        voter: String(e.parameter.voter || "").trim(),
        title: String(e.parameter.title || "").trim(),
        artist: String(e.parameter.artist || "").trim(),
        previewLink: String(e.parameter.previewLink || "").trim()
      };
      return json_(submitBestEver_(ss, data), e.parameter.callback);
    } catch (err) {
      return json_({ ok: false, error: String(err) }, e.parameter.callback);
    } finally {
      lock.releaseLock();
    }
  }

  if (action === "bestEverCheck") {
    const title = String(e.parameter.title || "").trim();
    const artist = String(e.parameter.artist || "").trim();
    return json_({
      ok: true,
      action: "bestEverCheck",
      duplicate: hasBestEverSongDuplicate_(ss, title, artist)
    }, e.parameter.callback);
  }

  const votesSheet = ss.getSheetByName(SHEET_VOTES);
  const rows = votesSheet.getDataRange().getValues().slice(1).filter(r => r[1] === eventId);

  const totals = {};
  getSongs_(ss).forEach(song => totals[song.label] = 0);

  const voterSet = {};
  rows.forEach(r => {
    const voter = String(r[2] || "").trim();
    const song = r[3];
    const points = Number(r[4]) || 0;
    if (song) totals[song] = (totals[song] || 0) + points;
    if (voter) voterSet[voter.toLowerCase()] = voter;
  });

  const results = Object.entries(totals)
    .map(([song, points]) => ({ song, points }))
    .sort((a, b) => b.points - a.points || a.song.localeCompare(b.song));

  const votedVoters = Object.values(voterSet).sort((a, b) => a.localeCompare(b, "de"));

  return json_({
    ok: true,
    votingCount: votedVoters.length,
    votedVoters: votedVoters,
    results: results
  }, e.parameter.callback);
}

function setupSheets_(ss) {
  let songs = ss.getSheetByName(SHEET_SONGS);
  if (!songs) {
    songs = ss.insertSheet(SHEET_SONGS);
    songs.appendRow(SONG_ROW_HEADERS);
    songs.getRange(1, 1, 1, SONG_ROW_HEADERS.length).setFontWeight("bold");
  }

  let voters = ss.getSheetByName(SHEET_VOTERS);
  if (!voters) {
    voters = ss.insertSheet(SHEET_VOTERS);
    voters.appendRow(["Name"]);
    voters.getRange(1, 1, 1, 1).setFontWeight("bold");
  }

  let votes = ss.getSheetByName(SHEET_VOTES);
  if (!votes) {
    votes = ss.insertSheet(SHEET_VOTES);
    votes.appendRow(["Timestamp", "Event ID", "Voter", "Song", "Points"]);
    votes.getRange(1, 1, 1, 5).setFontWeight("bold");
  }

  setupBestEverSheets_(ss);
}

function setupBestEverSheets_(ss) {
  let submits = ss.getSheetByName(SHEET_BEST_EVER_SUBMITS);
  if (!submits) {
    submits = ss.insertSheet(SHEET_BEST_EVER_SUBMITS);
    submits.appendRow(BEST_EVER_SUBMIT_HEADERS);
    submits.getRange(1, 1, 1, BEST_EVER_SUBMIT_HEADERS.length).setFontWeight("bold");
  }
}

function submitBestEver_(ss, data) {
  if (!data.eventId || !data.voter || !data.title || !data.artist) {
    return { ok: false, error: "Invalid Best Ever payload" };
  }

  const validVoters = getVoters_(ss);
  if (!validVoters.includes(data.voter)) {
    return { ok: false, error: "Unknown voter" };
  }

  const title = String(data.title).trim();
  const artist = String(data.artist).trim();
  const previewLink = String(data.previewLink || "").trim();

  if (hasBestEverVoterSubmitted_(ss, data.eventId, data.voter)) {
    return { ok: false, error: "This voter has already submitted a Best Ever Song." };
  }

  if (hasBestEverSongDuplicate_(ss, title, artist)) {
    return { ok: false, error: "This song has already been submitted by another participant." };
  }

  const submitsSheet = ss.getSheetByName(SHEET_BEST_EVER_SUBMITS);
  const nextNr = getNextBestEverNumber_(submitsSheet);
  const songRow = [nextNr, title, artist, previewLink, data.voter];

  submitsSheet.appendRow(songRow.concat([new Date(), data.eventId]));

  return { ok: true, action: "bestEver", nr: nextNr };
}

function handleBestEverPost_(ss, data) {
  return json_(submitBestEver_(ss, data));
}

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

function formatSongLabel_(title, artist) {
  const songTitle = String(title || "").trim();
  const songArtist = String(artist || "").trim();
  if (songTitle && songArtist) return songTitle + " - " + songArtist;
  return songTitle || songArtist;
}

function headerIndex_(headers, names) {
  for (let i = 0; i < names.length; i++) {
    const idx = headers.indexOf(String(names[i]).toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function getSongs_(ss) {
  const sheet = ss.getSheetByName(SHEET_SONGS);
  if (!sheet) return [];

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => String(h).trim().toLowerCase());
  const nrIdx = headerIndex_(headers, ["nr"]);
  const titleIdx = headerIndex_(headers, ["title"]);
  const interpretIdx = headerIndex_(headers, ["interpret", "artist"]);
  const previewIdx = headerIndex_(headers, ["preview", "previewlink", "spotify"]);
  const voterIdx = headerIndex_(headers, ["voter"]);
  const legacySongIdx = headerIndex_(headers, ["song"]);

  return rows.slice(1).map((row, index) => {
    let nr = nrIdx >= 0 ? Number(row[nrIdx]) : index + 1;
    let title = "";
    let artist = "";
    let preview = "";
    let voter = "";

    if (titleIdx >= 0 || interpretIdx >= 0) {
      title = String(titleIdx >= 0 ? row[titleIdx] : "").trim();
      artist = String(interpretIdx >= 0 ? row[interpretIdx] : "").trim();
      preview = String(previewIdx >= 0 ? row[previewIdx] : "").trim();
      voter = String(voterIdx >= 0 ? row[voterIdx] : "").trim();
    } else if (legacySongIdx >= 0) {
      const combined = String(row[legacySongIdx] || "").trim();
      const parts = combined.split(" - ");
      title = String(parts[0] || combined).trim();
      artist = String(parts.slice(1).join(" - ") || "").trim();
      preview = String(previewIdx >= 0 ? row[previewIdx] : row[2] || "").trim();
      voter = String(voterIdx >= 0 ? row[voterIdx] : "").trim();
    }

    if (!title && !artist) return null;

    return {
      nr: !isNaN(nr) && nr > 0 ? nr : index + 1,
      title: title,
      artist: artist,
      preview: preview,
      voter: voter,
      label: formatSongLabel_(title, artist),
      spotify: preview
    };
  }).filter(Boolean);
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

function getVoters_(ss) {
  const sheet = ss.getSheetByName(SHEET_VOTERS);
  if (!sheet) return [];
  return sheet.getDataRange().getValues().slice(1).map(r => String(r[0] || "").trim()).filter(Boolean).slice(0, 25);
}

function json_(obj, callback) {
  const json = JSON.stringify(obj);
  const output = callback ? `${callback}(${json});` : json;
  return ContentService
    .createTextOutput(output)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

// Run once in the Apps Script editor to grant iTunes search permission:
// 1. Select authorizeExternalRequests in the function dropdown (no trailing _)
// 2. Click Run and approve the permission dialog
// 3. Deploy -> Manage deployments -> New version
//
// Note: Functions ending with _ are hidden from the editor Run menu by Google Apps Script.
function authorizeExternalRequests() {
  const response = UrlFetchApp.fetch("https://itunes.apple.com/search?term=test&media=music&entity=song&limit=1", {
    muteHttpExceptions: true
  });
  Logger.log(response.getResponseCode());
  Logger.log(response.getContentText());
}
