// A'Croatia 2026 — Google Apps Script (deploy-ready)
//
// How to install:
// 1. Open your Google Sheet -> Extensions -> Apps Script
// 2. Select ALL code in Code.gs, delete it, paste this entire file
// 3. Save (Cmd+S)
// 4. Run authorizeExternalRequests once (dropdown) and approve permissions
// 5. Deploy -> Manage deployments -> Edit -> New version -> Deploy
//
// Version marker — after deploy, verify with:
// ?action=apiInfo
const API_VERSION = "2026-07-14-country-shape-getrange-fix";

const SHEET_VOTES = "Votes";
const SHEET_SONGS = "Songs";
const SHEET_VOTERS = "Teilnehmer";
const SHEET_BEST_EVER_SUBMITS = "BestEverSubmits";
const SHEET_COUNTRY_SHAPE_SUBMITS = "CountryShapeSubmits";
const SHEET_COUNTRY_SHAPE_GUESSES = "CountryShapeGuesses";
const SHEET_COUNTRY_SHAPE_GUESS_STATE = "CountryShapeGuessState";
const SHEET_COUNTRY_SHAPE_CORRECT = "CountryShapeCorrectAnswers";
const SONG_ROW_HEADERS = ["Nr", "Title", "Interpret", "Preview", "Voter"];
const BEST_EVER_SUBMIT_HEADERS = ["Nr", "Title", "Interpret", "Preview", "Voter", "Timestamp", "Event ID"];
const COUNTRY_SHAPE_SUBMIT_HEADERS = ["Timestamp", "Event ID", "Voter", "Correct Countries"];
const COUNTRY_SHAPE_COUNTRY_COUNT = 20;
const COUNTRY_SHAPE_STORAGE_PREFIX = "countries:";
const COUNTRY_SHAPE_LEGACY_PREFIX = "countries=";
const COUNTRY_SHAPE_GUESS_HEADERS = ["Timestamp", "Event ID", "Voter", "Country", "Choice"];
const COUNTRY_SHAPE_GUESS_STATE_HEADERS = ["Event ID", "Active Country", "Guessing Open", "Round Token"];
const COUNTRY_SHAPE_CORRECT_HEADERS = ["Timestamp", "Event ID", "Country", "Correct Choice"];
const COUNTRY_SHAPE_POINT_POOL = 20;
const COUNTRY_SHAPE_GUESS_CHOICES = [1, 2, 3, 4];
const COUNTRY_SHAPE_GUESS_WINDOW_SECONDS = 30;

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

    if (data.action === "countryShape") {
      return json_(submitCountryShape_(ss, data));
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

  if (action === "apiInfo") {
    return json_({
      ok: true,
      action: "apiInfo",
      version: API_VERSION,
      features: [
        "config",
        "results",
        "bestEverSubmit",
        "bestEverCheck",
        "countryShapeResults",
        "countryShapeGuessState",
        "countryShapeGuessSubmit",
        "countryShapeAdminStartTimer",
        "countryShapeAdminEndTimer",
        "countryShapeAdminSubmitCorrect"
      ]
    }, e.parameter.callback);
  }

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

  if (action === "countryShapeResults") {
    return json_(getCountryShapeResults_(ss, eventId), e.parameter.callback);
  }

  if (action === "countryShapeSubmit") {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const data = {
        eventId: eventId,
        voter: String(e.parameter.voter || "").trim(),
        correctCountries: parseCountryShapeCountries_(e.parameter.correctCountries || "")
      };
      return json_(submitCountryShape_(ss, data), e.parameter.callback);
    } catch (err) {
      return json_({ ok: false, error: String(err) }, e.parameter.callback);
    } finally {
      lock.releaseLock();
    }
  }

  if (action === "countryShapeGuessState") {
    const voter = String(e.parameter.voter || "").trim();
    return json_(getCountryShapeGuessState_(ss, eventId, voter), e.parameter.callback);
  }

  if (action === "countryShapeGuessSubmit") {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const data = {
        eventId: eventId,
        voter: String(e.parameter.voter || "").trim(),
        country: Number(e.parameter.country),
        choice: Number(e.parameter.choice)
      };
      return json_(submitCountryShapeGuess_(ss, data), e.parameter.callback);
    } catch (err) {
      return json_({ ok: false, error: String(err) }, e.parameter.callback);
    } finally {
      lock.releaseLock();
    }
  }

  if (action === "countryShapeAdminStartTimer") {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const country = Number(e.parameter.country);
      return json_(startCountryShapeGuessTimer_(ss, eventId, country), e.parameter.callback);
    } catch (err) {
      return json_({ ok: false, error: String(err) }, e.parameter.callback);
    } finally {
      lock.releaseLock();
    }
  }

  if (action === "countryShapeAdminEndTimer") {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const country = Number(e.parameter.country);
      return json_(endCountryShapeGuessTimer_(ss, eventId, country), e.parameter.callback);
    } catch (err) {
      return json_({ ok: false, error: String(err) }, e.parameter.callback);
    } finally {
      lock.releaseLock();
    }
  }

  if (action === "countryShapeAdminSubmitCorrect") {
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const country = Number(e.parameter.country);
      const choice = Number(e.parameter.choice);
      return json_(submitCountryShapeCorrectAnswer_(ss, eventId, country, choice), e.parameter.callback);
    } catch (err) {
      return json_({ ok: false, error: String(err) }, e.parameter.callback);
    } finally {
      lock.releaseLock();
    }
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
  setupCountryShapeSheets_(ss);
  setupCountryShapeGuessSheets_(ss);
}

function setupCountryShapeGuessSheets_(ss) {
  let guesses = ss.getSheetByName(SHEET_COUNTRY_SHAPE_GUESSES);
  if (!guesses) {
    guesses = ss.insertSheet(SHEET_COUNTRY_SHAPE_GUESSES);
    guesses.appendRow(COUNTRY_SHAPE_GUESS_HEADERS);
    guesses.getRange(1, 1, 1, COUNTRY_SHAPE_GUESS_HEADERS.length).setFontWeight("bold");
  }

  let state = ss.getSheetByName(SHEET_COUNTRY_SHAPE_GUESS_STATE);
  if (!state) {
    state = ss.insertSheet(SHEET_COUNTRY_SHAPE_GUESS_STATE);
    state.appendRow(COUNTRY_SHAPE_GUESS_STATE_HEADERS);
    state.getRange(1, 1, 1, COUNTRY_SHAPE_GUESS_STATE_HEADERS.length).setFontWeight("bold");
  }

  setupCountryShapeCorrectSheet_(ss);
  normalizeCountryShapeGuessStateSheet_(ss);
}

function getSheetDataRange_(sheet, startRow, startCol, endRow, endCol) {
  const numRows = endRow - startRow + 1;
  const numCols = endCol - startCol + 1;
  return sheet.getRange(startRow, startCol, numRows, numCols);
}

function normalizeCountryShapeGuessStateSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET_COUNTRY_SHAPE_GUESS_STATE);
  if (!sheet) return;

  sheet.getRange(1, 1, 1, COUNTRY_SHAPE_GUESS_STATE_HEADERS.length)
    .setValues([COUNTRY_SHAPE_GUESS_STATE_HEADERS]);
  sheet.getRange(1, 1, 1, COUNTRY_SHAPE_GUESS_STATE_HEADERS.length).setFontWeight("bold");

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const rows = getSheetDataRange_(sheet, 2, 1, lastRow, 4).getValues();

  rows.forEach((row, index) => {
    const sheetRow = index + 2;
    let activeCountry = Number(row[1]);
    let guessingOpen = row[2];
    let roundToken = row[3];

    if (!Number.isInteger(activeCountry) || activeCountry < 1) {
      activeCountry = 1;
    }

    if (guessingOpen instanceof Date) {
      guessingOpen = "";
    } else {
      guessingOpen = String(guessingOpen || "").trim().toLowerCase() === "open" ? "open" : "";
    }

    if (!Number.isInteger(Number(roundToken)) || roundToken === "" || roundToken === null) {
      if (Number.isInteger(Number(row[2])) && String(row[2]).trim() !== "open") {
        roundToken = Number(row[2]);
        guessingOpen = "";
      } else {
        roundToken = 0;
      }
    } else {
      roundToken = Number(roundToken);
    }

    getSheetDataRange_(sheet, sheetRow, 1, sheetRow, 4).setValues([
      [String(row[0] || "").trim(), activeCountry, guessingOpen, roundToken]
    ]);
  });

  SpreadsheetApp.flush();
}

function getCountryShapeGuessStateSheet_(ss) {
  setupCountryShapeGuessSheets_(ss);
  return ss.getSheetByName(SHEET_COUNTRY_SHAPE_GUESS_STATE);
}

function setupCountryShapeCorrectSheet_(ss) {
  let correct = ss.getSheetByName(SHEET_COUNTRY_SHAPE_CORRECT);
  if (!correct) {
    correct = ss.insertSheet(SHEET_COUNTRY_SHAPE_CORRECT);
    correct.appendRow(COUNTRY_SHAPE_CORRECT_HEADERS);
    correct.getRange(1, 1, 1, COUNTRY_SHAPE_CORRECT_HEADERS.length).setFontWeight("bold");
  }
}

function findCountryShapeStateRowIndexes_(sheet, eventId) {
  const rows = sheet.getDataRange().getValues();
  const indexes = [];

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || "").trim() === String(eventId).trim()) {
      indexes.push(i + 1);
    }
  }

  return indexes;
}

function getCountryShapeActiveState_(ss, eventId) {
  const sheet = getCountryShapeGuessStateSheet_(ss);
  const rows = sheet.getDataRange().getValues().slice(1);
  const match = rows.find(row => String(row[0] || "").trim() === String(eventId).trim());

  if (!match) {
    return { activeCountry: 1, guessingOpen: false, roundToken: 0, initialized: false };
  }

  const country = Number(match[1]);
  const guessingOpen = String(match[2] || "").trim().toLowerCase() === "open";
  const roundToken = Number(match[3]) || 0;
  const activeCountry = (!Number.isInteger(country) || country < 1) ? 1 : country;

  return {
    activeCountry: activeCountry,
    guessingOpen: guessingOpen,
    roundToken: roundToken,
    initialized: true
  };
}

function updateCountryShapeState_(ss, eventId, activeCountry, guessingOpen, roundToken) {
  const sheet = getCountryShapeGuessStateSheet_(ss);
  const openValue = guessingOpen ? "open" : "";
  const tokenValue = Number(roundToken) || 0;
  const indexes = findCountryShapeStateRowIndexes_(sheet, eventId);

  if (indexes.length > 0) {
    getSheetDataRange_(sheet, indexes[0], 2, indexes[0], 4).setValues([[activeCountry, openValue, tokenValue]]);

    for (let i = indexes.length - 1; i >= 1; i--) {
      sheet.deleteRow(indexes[i]);
    }
  } else {
    sheet.appendRow([eventId, activeCountry, openValue, tokenValue]);
  }

  SpreadsheetApp.flush();
}

function getCountryShapeActiveCountry_(ss, eventId) {
  return getCountryShapeActiveState_(ss, eventId).activeCountry;
}

function getCountryShapeCorrectAnswers_(ss, eventId) {
  setupCountryShapeCorrectSheet_(ss);
  const sheet = ss.getSheetByName(SHEET_COUNTRY_SHAPE_CORRECT);
  if (!sheet) return {};

  const answers = {};
  sheet.getDataRange().getValues().slice(1).forEach(row => {
    if (String(row[1] || "").trim() !== String(eventId).trim()) return;

    const country = Number(row[2]);
    const choice = Number(row[3]);
    if (Number.isInteger(country) && country >= 1 && country <= COUNTRY_SHAPE_COUNTRY_COUNT &&
        COUNTRY_SHAPE_GUESS_CHOICES.indexOf(choice) >= 0) {
      answers[String(country)] = choice;
    }
  });

  return answers;
}

function hasCountryShapeCorrectAnswer_(ss, eventId, country) {
  return !!getCountryShapeCorrectAnswers_(ss, eventId)[String(country)];
}

function startCountryShapeGuessTimer_(ss, eventId, country) {
  if (!Number.isInteger(country) || country < 1 || country > COUNTRY_SHAPE_COUNTRY_COUNT) {
    return { ok: false, error: "Invalid country." };
  }

  const state = getCountryShapeActiveState_(ss, eventId);
  if (country !== state.activeCountry) {
    return { ok: false, error: "Only the active country can start the timer." };
  }

  if (hasCountryShapeCorrectAnswer_(ss, eventId, country)) {
    return { ok: false, error: "The correct answer for this country is already saved." };
  }

  if (state.guessingOpen) {
    return { ok: false, error: "Guessing is already open for this country." };
  }

  const newToken = state.roundToken + 1;
  updateCountryShapeState_(ss, eventId, country, true, newToken);
  const updated = getCountryShapeActiveState_(ss, eventId);

  return {
    ok: true,
    action: "countryShapeAdminStartTimer",
    activeCountry: country,
    guessingOpen: true,
    roundToken: updated.roundToken,
    guessWindowSeconds: COUNTRY_SHAPE_GUESS_WINDOW_SECONDS
  };
}

function endCountryShapeGuessTimer_(ss, eventId, country) {
  if (!Number.isInteger(country) || country < 1 || country > COUNTRY_SHAPE_COUNTRY_COUNT) {
    return { ok: false, error: "Invalid country." };
  }

  const state = getCountryShapeActiveState_(ss, eventId);
  if (country !== state.activeCountry) {
    return { ok: false, error: "Only the active country can end guessing." };
  }

  if (!state.guessingOpen) {
    return { ok: false, error: "Guessing is not open." };
  }

  updateCountryShapeState_(ss, eventId, country, false, state.roundToken);
  const updated = getCountryShapeActiveState_(ss, eventId);

  return {
    ok: true,
    action: "countryShapeAdminEndTimer",
    activeCountry: country,
    guessingOpen: false,
    roundToken: updated.roundToken,
    guessWindowSeconds: COUNTRY_SHAPE_GUESS_WINDOW_SECONDS
  };
}

function submitCountryShapeCorrectAnswer_(ss, eventId, country, choice) {
  setupCountryShapeCorrectSheet_(ss);

  if (!Number.isInteger(country) || country < 1 || country > COUNTRY_SHAPE_COUNTRY_COUNT) {
    return { ok: false, error: "Invalid country." };
  }

  if (COUNTRY_SHAPE_GUESS_CHOICES.indexOf(choice) < 0) {
    return { ok: false, error: "Invalid choice." };
  }

  const state = getCountryShapeActiveState_(ss, eventId);
  if (country !== state.activeCountry) {
    return { ok: false, error: "Only the active country can be submitted." };
  }

  if (hasCountryShapeCorrectAnswer_(ss, eventId, country)) {
    return { ok: false, error: "The correct answer for this country is already saved." };
  }

  const correctSheet = ss.getSheetByName(SHEET_COUNTRY_SHAPE_CORRECT);
  correctSheet.appendRow([new Date(), eventId, country, choice]);
  SpreadsheetApp.flush();

  const nextCountry = country + 1;
  const gameComplete = nextCountry > COUNTRY_SHAPE_COUNTRY_COUNT;
  updateCountryShapeState_(ss, eventId, gameComplete ? COUNTRY_SHAPE_COUNTRY_COUNT + 1 : nextCountry, false, state.roundToken);

  const correctAnswers = getCountryShapeCorrectAnswers_(ss, eventId);
  const newActive = getCountryShapeActiveState_(ss, eventId);

  return {
    ok: true,
    action: "countryShapeAdminSubmitCorrect",
    country: country,
    choice: choice,
    activeCountry: newActive.activeCountry,
    countriesCompleted: Object.keys(correctAnswers).length,
    gameComplete: gameComplete
  };
}

function getCountryShapeGuessRows_(ss, eventId) {
  setupCountryShapeGuessSheets_(ss);
  const sheet = ss.getSheetByName(SHEET_COUNTRY_SHAPE_GUESSES);
  if (!sheet) return [];

  return sheet.getDataRange().getValues().slice(1)
    .filter(row => String(row[1] || "").trim() === String(eventId).trim())
    .map(row => ({
      voter: String(row[2] || "").trim(),
      country: Number(row[3]),
      choice: Number(row[4])
    }))
    .filter(entry => entry.voter && Number.isInteger(entry.country) && COUNTRY_SHAPE_GUESS_CHOICES.indexOf(entry.choice) >= 0);
}

function hasCountryShapeGuess_(ss, eventId, voter, country) {
  const voterKey = normalizeCountryShapeVoterKey_(voter);
  return getCountryShapeGuessRows_(ss, eventId).some(entry =>
    normalizeCountryShapeVoterKey_(entry.voter) === voterKey &&
    entry.country === country
  );
}

function getCountryShapeGuessesForVoter_(ss, eventId, voter) {
  const voterKey = normalizeCountryShapeVoterKey_(voter);
  const guesses = {};

  getCountryShapeGuessRows_(ss, eventId).forEach(entry => {
    if (normalizeCountryShapeVoterKey_(entry.voter) !== voterKey) return;
    guesses[String(entry.country)] = entry.choice;
  });

  return guesses;
}

function submitCountryShapeGuess_(ss, data) {
  setupCountryShapeGuessSheets_(ss);

  if (!data.eventId || !data.voter || !Number.isInteger(data.country) || !Number.isInteger(data.choice)) {
    return { ok: false, error: "Invalid Country by Shape guess payload." };
  }

  const validVoters = getVoters_(ss);
  if (!validVoters.includes(data.voter)) {
    return { ok: false, error: "Unknown voter" };
  }

  if (data.country < 1 || data.country > COUNTRY_SHAPE_COUNTRY_COUNT) {
    return { ok: false, error: "Invalid country." };
  }

  if (COUNTRY_SHAPE_GUESS_CHOICES.indexOf(data.choice) < 0) {
    return { ok: false, error: "Invalid choice." };
  }

  const activeState = getCountryShapeActiveState_(ss, data.eventId);
  if (data.country !== activeState.activeCountry) {
    return { ok: false, error: "This country is not open for guessing yet." };
  }

  if (activeState.activeCountry > COUNTRY_SHAPE_COUNTRY_COUNT) {
    return { ok: false, error: "All countries are complete." };
  }

  if (hasCountryShapeCorrectAnswer_(ss, data.eventId, data.country)) {
    return { ok: false, error: "This country round is already closed." };
  }

  if (hasCountryShapeGuess_(ss, data.eventId, data.voter, data.country)) {
    return { ok: false, error: "This voter has already submitted a guess for this country." };
  }

  const guessesSheet = ss.getSheetByName(SHEET_COUNTRY_SHAPE_GUESSES);
  guessesSheet.appendRow([new Date(), data.eventId, data.voter, data.country, data.choice]);
  SpreadsheetApp.flush();

  return {
    ok: true,
    action: "countryShapeGuessSubmit",
    country: data.country,
    choice: data.choice
  };
}

function getCountryShapeGuessState_(ss, eventId, voter) {
  setupCountryShapeGuessSheets_(ss);

  const activeState = getCountryShapeActiveState_(ss, eventId);
  const activeCountry = activeState.activeCountry;
  const correctAnswers = getCountryShapeCorrectAnswers_(ss, eventId);
  const countriesCompleted = Object.keys(correctAnswers).length;
  const gameComplete = countriesCompleted >= COUNTRY_SHAPE_COUNTRY_COUNT;
  const allGuesses = getCountryShapeGuessRows_(ss, eventId);
  const guessedForActive = allGuesses
    .filter(entry => entry.country === activeCountry)
    .map(entry => entry.voter)
    .sort((a, b) => a.localeCompare(b, "de"));
  const totalPlayers = getVoters_(ss).length;
  const userGuesses = voter ? getCountryShapeGuessesForVoter_(ss, eventId, voter) : {};

  return {
    ok: true,
    action: "countryShapeGuessState",
    activeCountry: activeCountry,
    guessingOpen: activeState.guessingOpen,
    roundToken: activeState.roundToken,
    guessWindowSeconds: COUNTRY_SHAPE_GUESS_WINDOW_SECONDS,
    totalPlayers: totalPlayers,
    guessCount: guessedForActive.length,
    guessedForActive: guessedForActive,
    userGuesses: userGuesses,
    correctAnswers: correctAnswers,
    countriesCompleted: countriesCompleted,
    gameComplete: gameComplete
  };
}

function setupCountryShapeSheets_(ss) {
  let submits = ss.getSheetByName(SHEET_COUNTRY_SHAPE_SUBMITS);
  if (!submits) {
    submits = ss.insertSheet(SHEET_COUNTRY_SHAPE_SUBMITS);
    submits.appendRow(COUNTRY_SHAPE_SUBMIT_HEADERS);
    submits.getRange(1, 1, 1, COUNTRY_SHAPE_SUBMIT_HEADERS.length).setFontWeight("bold");
  }

  // Keep country lists as plain text so values like "1,2,3" are never auto-converted to dates.
  const lastRow = Math.max(submits.getLastRow(), 1);
  submits.getRange(1, 4, lastRow, 1).setNumberFormat("@");
}

function formatCountryShapeCountriesForSheet_(countries) {
  return COUNTRY_SHAPE_STORAGE_PREFIX + countries.join("|");
}

function normalizeCountryShapeVoterKey_(value) {
  return String(value || "").trim().toLowerCase();
}

function extractCountryShapeCountryList_(text) {
  const normalized = String(text || "").trim();
  const lower = normalized.toLowerCase();

  if (lower.indexOf(COUNTRY_SHAPE_STORAGE_PREFIX) === 0) {
    return normalized.slice(COUNTRY_SHAPE_STORAGE_PREFIX.length);
  }

  if (lower.indexOf(COUNTRY_SHAPE_LEGACY_PREFIX) === 0) {
    return normalized.slice(COUNTRY_SHAPE_LEGACY_PREFIX.length);
  }

  return normalized;
}

function parseCountryShapeCountries_(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map(value => Number(value))
      .filter(value => Number.isInteger(value) && value >= 1 && value <= COUNTRY_SHAPE_COUNTRY_COUNT);
  }

  if (raw instanceof Date) {
    return [];
  }

  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= COUNTRY_SHAPE_COUNTRY_COUNT) {
    return [raw];
  }

  const text = String(raw || "").trim();
  if (!text) return [];

  const countryList = extractCountryShapeCountryList_(text);
  if (countryList && (text.toLowerCase().indexOf("countries:") === 0 || text.toLowerCase().indexOf("countries=") === 0)) {
    if (!countryList) return [];
    return countryList
      .split("|")
      .map(value => Number(String(value).trim()))
      .filter(value => Number.isInteger(value) && value >= 1 && value <= COUNTRY_SHAPE_COUNTRY_COUNT);
  }

  if (text.charAt(0) === "[") {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed
          .map(value => Number(value))
          .filter(value => Number.isInteger(value) && value >= 1 && value <= COUNTRY_SHAPE_COUNTRY_COUNT);
      }
    } catch (err) {
      // Fall through to legacy parsing.
    }
  }

  return text
    .split(/[,;|]/)
    .map(value => Number(String(value).trim()))
    .filter(value => Number.isInteger(value) && value >= 1 && value <= COUNTRY_SHAPE_COUNTRY_COUNT);
}

function appendCountryShapeRow_(sheet, eventId, voter, countries) {
  const nextRow = Math.max(sheet.getLastRow(), 1) + 1;
  const storageValue = formatCountryShapeCountriesForSheet_(countries);

  sheet.getRange(nextRow, 1, 1, 3).setValues([[new Date(), eventId, voter]]);

  const countriesCell = sheet.getRange(nextRow, 4);
  countriesCell.setNumberFormat("@");
  countriesCell.setValue(storageValue);
  SpreadsheetApp.flush();
}

function hasCountryShapeVoterSubmitted_(ss, eventId, voter) {
  const sheet = ss.getSheetByName(SHEET_COUNTRY_SHAPE_SUBMITS);
  if (!sheet) return false;

  const rows = sheet.getDataRange().getValues().slice(1);
  const voterKey = normalizeCountryShapeVoterKey_(voter);

  return rows.some(row =>
    String(row[1] || "").trim() === String(eventId).trim() &&
    normalizeCountryShapeVoterKey_(row[2]) === voterKey
  );
}

function getCountryShapeSubmissions_(ss, eventId) {
  const sheet = ss.getSheetByName(SHEET_COUNTRY_SHAPE_SUBMITS);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const numRows = lastRow - 1;
  const rows = sheet.getRange(2, 1, numRows, 4).getValues();
  const displayRows = sheet.getRange(2, 1, numRows, 4).getDisplayValues();

  return rows
    .map((row, index) => {
      if (String(row[1] || "").trim() !== String(eventId).trim()) return null;

      let rawCountries = row[3];
      if (rawCountries instanceof Date) {
        rawCountries = displayRows[index][3];
      }

      return {
        voter: String(row[2] || "").trim(),
        correctCountries: parseCountryShapeCountries_(rawCountries)
      };
    })
    .filter(entry => entry && entry.voter);
}

function submitCountryShape_(ss, data) {
  setupCountryShapeSheets_(ss);

  if (!data.eventId || !data.voter || !Array.isArray(data.correctCountries)) {
    return { ok: false, error: "Invalid Country by Shape payload" };
  }

  const validVoters = getVoters_(ss);
  if (!validVoters.includes(data.voter)) {
    return { ok: false, error: "Unknown voter" };
  }

  const correctCountries = parseCountryShapeCountries_(data.correctCountries);
  const uniqueCountries = [...new Set(correctCountries)].sort((a, b) => a - b);

  if (hasCountryShapeVoterSubmitted_(ss, data.eventId, data.voter)) {
    return { ok: false, error: "This voter has already submitted a Country by Shape result." };
  }

  const submitsSheet = ss.getSheetByName(SHEET_COUNTRY_SHAPE_SUBMITS);
  appendCountryShapeRow_(submitsSheet, data.eventId, data.voter, uniqueCountries);

  return { ok: true, action: "countryShape", correctCount: uniqueCountries.length };
}

function getCountryShapeResults_(ss, eventId) {
  setupCountryShapeGuessSheets_(ss);
  setupCountryShapeCorrectSheet_(ss);

  const allGuesses = getCountryShapeGuessRows_(ss, eventId);
  const correctAnswers = getCountryShapeCorrectAnswers_(ss, eventId);
  const allPlayers = getVoters_(ss);
  const correctCounts = {};
  const playerCorrectCountries = {};

  allPlayers.forEach(playerName => {
    playerCorrectCountries[playerName] = [];
  });

  for (let country = 1; country <= COUNTRY_SHAPE_COUNTRY_COUNT; country++) {
    const correctChoice = correctAnswers[String(country)];
    if (!correctChoice) continue;

    let count = 0;
    allGuesses.forEach(entry => {
      if (entry.country !== country || entry.choice !== correctChoice) return;
      count++;
      if (playerCorrectCountries[entry.voter]) {
        playerCorrectCountries[entry.voter].push(country);
      }
    });
    correctCounts[country] = count;
  }

  const countriesCompleted = Object.keys(correctAnswers).length;

  const rankings = allPlayers.map(playerName => {
    let points = 0;
    const correctCountries = playerCorrectCountries[playerName] || [];

    correctCountries.forEach(country => {
      const count = correctCounts[country] || 0;
      if (count > 0) {
        points += COUNTRY_SHAPE_POINT_POOL / count;
      }
    });

    return {
      playerName: playerName,
      points: points,
      correctCount: correctCountries.length,
      guessedCount: allGuesses.filter(entry => entry.voter === playerName).length
    };
  }).sort((a, b) => b.points - a.points || a.playerName.localeCompare(b, "de"));

  return {
    ok: true,
    action: "countryShapeResults",
    countriesCompleted: countriesCompleted,
    countryCount: COUNTRY_SHAPE_COUNTRY_COUNT,
    pointPool: COUNTRY_SHAPE_POINT_POOL,
    rankings: rankings
  };
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
  const output = callback ? callback + "(" + json + ");" : json;
  return ContentService
    .createTextOutput(output)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function authorizeExternalRequests() {
  const response = UrlFetchApp.fetch("https://itunes.apple.com/search?term=test&media=music&entity=song&limit=1", {
    muteHttpExceptions: true
  });
  Logger.log(response.getResponseCode());
  Logger.log(response.getContentText());
}
