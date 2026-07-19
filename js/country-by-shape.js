// Country by Shape — separate config (shared API only)
const COUNTRY_SHAPE_API_URL = "https://script.google.com/macros/s/AKfycbztW0CA05fRAwg9U8ijYCWukgHlJUQY4rxLIZ2wFiT5Ox_v-K_lOn43GVm5ujWYeQav/exec";
const COUNTRY_SHAPE_EVENT_ID = "country-by-shape-2026";

let COUNTRY_SHAPE_PLAYERS = [];

const COUNTRY_COUNT = 20;
const COUNTRY_POINT_POOL = 20;
const REFRESH_COUNTRY_RESULTS_LABEL = "Refresh results";
const REFRESH_COUNTRY_RESULTS_LOADING_LABEL = "⏳ loading...";

const storageKeyCountryGuessVoter = `${COUNTRY_SHAPE_EVENT_ID}:guessVoter`;
const storageKeyLocalGuessesPrefix = `${COUNTRY_SHAPE_EVENT_ID}:localGuesses`;
const SUBMIT_COUNTRY_GUESS_LABEL = "Submit guess";
const SUBMIT_COUNTRY_GUESS_SENDING_LABEL = "⏳ submitting...";
const ADMIN_START_TIMER_LABEL = "Start timer";
const ADMIN_START_TIMER_SENDING_LABEL = "⏳ starting...";
const ADMIN_END_TIMER_LABEL = "End timer";
const ADMIN_END_TIMER_SENDING_LABEL = "⏳ ending...";
const ADMIN_SUBMIT_CORRECT_LABEL = "Submit";
const ADMIN_SUBMIT_CORRECT_SENDING_LABEL = "⏳ saving...";

const COUNTRY_GUESS_WINDOW_SECONDS = 15;
const GUESS_POLL_WAITING_MS = 1000;
const GUESS_POLL_AFTER_TIMER_MS = 1000;
const GUESS_SUBMIT_JITTER_MS = 1000;
const storageKeyPendingGuessUploads = `${COUNTRY_SHAPE_EVENT_ID}:pendingGuessUploads`;

let guessCountdownIntervalId = null;
let guessStatePollIntervalId = null;
let guessSubmitInFlight = false;
let guessFlushInFlight = false;
let guessPollInFlight = false;
let adminSubmittingCountry = null;
let adminTimerStarting = false;
let pendingGuessChoices = {};
let countdownSeconds = 0;
let countdownRunning = false;
let localRoundToken = 0;
let guessAutoSubmittedForToken = 0;
let localRoundEndsAtMs = 0;

let COUNTRY_GUESS_STATE = {
  activeCountry: 1,
  guessingOpen: false,
  roundToken: 0,
  startedAt: "",
  guessCount: 0,
  totalPlayers: 0,
  guessedForActive: [],
  userGuesses: {},
  correctAnswers: {},
  countriesCompleted: 0,
  gameComplete: false
};

const COUNTRY_INPUT_PASSWORD = "Sina";
const COUNTRY_INPUT_UNLOCK_KEY = `${COUNTRY_SHAPE_EVENT_ID}:inputUnlocked`;

function hasInputAccess() {
  return sessionStorage.getItem(COUNTRY_INPUT_UNLOCK_KEY) === "true";
}

function grantInputAccess() {
  sessionStorage.setItem(COUNTRY_INPUT_UNLOCK_KEY, "true");
}

function showInputPasswordMessage(type, text) {
  const el = document.getElementById("inputPasswordMessage");
  if (!el) return;
  el.className = `msg ${type}`;
  el.textContent = text;
}

function hideInputPasswordMessage() {
  const el = document.getElementById("inputPasswordMessage");
  if (!el) return;
  el.className = "msg";
  el.textContent = "";
}

function openInputPasswordModal() {
  const overlay = document.getElementById("inputPasswordOverlay");
  const input = document.getElementById("inputPassword");
  if (!overlay) return;

  hideInputPasswordMessage();
  overlay.style.display = "flex";
  if (input) {
    input.value = "";
    input.focus();
  }
}

function closeInputPasswordModal() {
  const overlay = document.getElementById("inputPasswordOverlay");
  if (overlay) overlay.style.display = "none";
  hideInputPasswordMessage();
}

function submitInputPassword() {
  const input = document.getElementById("inputPassword");
  const password = String(input?.value || "").trim();

  if (password !== COUNTRY_INPUT_PASSWORD) {
    showInputPasswordMessage("err", "Wrong password.");
    return;
  }

  grantInputAccess();
  closeInputPasswordModal();
  openInputView();
}

function openInputView() {
  hideAllCountryViews();
  document.getElementById("inputView").style.display = "block";
  setActiveTab("input");
  refreshAdminSession();
  startGuessStatePolling();
}

const COUNTRY_API_NOT_DEPLOYED_MSG = "Country by Shape is not active on the API yet. Open YOUR_WEB_APP_URL?action=apiInfo — you should see version \"2026-07-19-country-shape-fast-pulse\". If not: replace ALL of Code.gs with google-apps-script/Code.gs, then Deploy → Manage deployments → Edit → New version → Deploy.";

function isCountryShapeVotersSuccess(data) {
  return data?.ok === true && data?.action === "voters" && Array.isArray(data?.voters);
}

function isCountryShapeApiActive(data) {
  return data?.ok === true && data?.action === "apiInfo" &&
    Array.isArray(data?.features) && data.features.includes("countryShapeGuessPulse");
}

function isCountryShapeGuessPulseSuccess(data) {
  return data?.ok === true && data?.action === "countryShapeGuessPulse";
}

function isCountryShapeGuessStateSuccess(data) {
  return data?.ok === true && data?.action === "countryShapeGuessState";
}

function isCountryShapeGuessSubmitSuccess(data) {
  return data?.ok === true && data?.action === "countryShapeGuessSubmit";
}

function isCountryShapeAdminStartTimerSuccess(data) {
  return data?.ok === true && data?.action === "countryShapeAdminStartTimer";
}

function isCountryShapeAdminSubmitCorrectSuccess(data) {
  return data?.ok === true && data?.action === "countryShapeAdminSubmitCorrect";
}

function isCountryShapeAdminEndTimerSuccess(data) {
  return data?.ok === true && data?.action === "countryShapeAdminEndTimer";
}

function isCountryShapeResultsSuccess(data) {
  return data?.ok === true && data?.action === "countryShapeResults";
}

function jsonp(url, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const callbackName = "countryShapeJsonp_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      delete window[callbackName];
      script.remove();
      reject(new Error("JSONP request timed out"));
    }, timeoutMs);

    window[callbackName] = function(data) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(data);
      delete window[callbackName];
      script.remove();
    };

    const script = document.createElement("script");
    script.src = `${url}${url.includes("?") ? "&" : "?"}callback=${callbackName}`;
    script.onerror = function() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("JSONP request failed"));
      delete window[callbackName];
      script.remove();
    };

    document.body.appendChild(script);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function normalizePlayerName(name) {
  return String(name || "").trim().toLowerCase();
}

function showInputMessage(type, text) {
  const el = document.getElementById("inputMessage");
  el.className = `msg ${type}`;
  el.textContent = text;
}

function hideInputMessage() {
  const el = document.getElementById("inputMessage");
  el.className = "msg";
  el.textContent = "";
}

function setRefreshCountryResultsButtonState(isLoading) {
  const btn = document.getElementById("refreshResultBtn");
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? REFRESH_COUNTRY_RESULTS_LOADING_LABEL : REFRESH_COUNTRY_RESULTS_LABEL;
}

async function checkCountryShapeApiDeployment() {
  if (!COUNTRY_SHAPE_API_URL) return false;

  try {
    const data = await jsonp(`${COUNTRY_SHAPE_API_URL}?action=apiInfo`);
    return isCountryShapeApiActive(data);
  } catch (e) {
    console.warn("Country by Shape API check failed", e);
    return false;
  }
}

async function loadPlayers() {
  if (!COUNTRY_SHAPE_API_URL) {
    showInputMessage("err", "API_URL is not configured yet.");
    showGuessMessage("err", "API_URL is not configured yet.");
    return false;
  }

  try {
    let data = await jsonp(`${COUNTRY_SHAPE_API_URL}?action=voters`);

    if (!isCountryShapeVotersSuccess(data)) {
      data = await jsonp(`${COUNTRY_SHAPE_API_URL}?eventId=${encodeURIComponent(COUNTRY_SHAPE_EVENT_ID)}&action=config`);
      if (!data || data.ok !== true) {
        showInputMessage("err", data?.error || "Could not load players from Google Sheets.");
        showGuessMessage("err", data?.error || "Could not load players from Google Sheets.");
        return false;
      }
    }

    COUNTRY_SHAPE_PLAYERS = data.voters || [];

    if (COUNTRY_SHAPE_PLAYERS.length === 0) {
      showInputMessage("err", "No players found. Please fill in the 'Teilnehmer' tab in the Google Sheet.");
      showGuessMessage("err", "No players found. Please fill in the 'Teilnehmer' tab in the Google Sheet.");
      return false;
    }

    return true;
  } catch (e) {
    const timedOut = String(e?.message || "").includes("timed out");
    const message = timedOut
      ? "Google Sheets API timed out. Please redeploy the latest Code.gs (version 2026-07-14-country-shape-fast-reads-v2) and reload."
      : "Could not load players from Google Sheets.";
    showInputMessage("err", message);
    showGuessMessage("err", message);
    console.error(e);
    return false;
  }
}

function clearLegacyLocalGameStorage() {
  localStorage.removeItem(storageKeyCountryGuessVoter);
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith(storageKeyLocalGuessesPrefix)) {
      localStorage.removeItem(key);
    }
  });
}

function clearGameSession() {
  sessionStorage.removeItem(storageKeyCountryGuessVoter);
  sessionStorage.removeItem(storageKeyPendingGuessUploads);
  Object.keys(sessionStorage).forEach(key => {
    if (key.startsWith(storageKeyLocalGuessesPrefix)) {
      sessionStorage.removeItem(key);
    }
  });
  pendingGuessChoices = {};
  guessAutoSubmittedForToken = 0;
  resetCountdownForNewCountry();
  COUNTRY_GUESS_STATE.userGuesses = {};
}

function fillGuessPlayerSelect() {
  const sel = document.getElementById("guessPlayerName");
  if (!sel) return;

  const storedVoter = getStoredGuessVoter();
  sel.innerHTML =
    '<option value="">Please select your name</option>' +
    COUNTRY_SHAPE_PLAYERS.map(name =>
      `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
    ).join("");

  if (storedVoter && COUNTRY_SHAPE_PLAYERS.includes(storedVoter)) {
    sel.value = storedVoter;
    const hasServerGuess = Object.keys(COUNTRY_GUESS_STATE.userGuesses || {}).length > 0;
    if (hasServerGuess) {
      lockGuessPlayerSelect();
    } else {
      sel.disabled = false;
    }
  } else {
    sel.disabled = false;
    sel.selectedIndex = 0;
  }
}

function getStoredGuessVoter() {
  return String(sessionStorage.getItem(storageKeyCountryGuessVoter) || "").trim();
}

function storeGuessVoter(voter) {
  sessionStorage.setItem(storageKeyCountryGuessVoter, String(voter || "").trim());
}

function lockGuessPlayerSelect() {
  const sel = document.getElementById("guessPlayerName");
  if (sel) sel.disabled = true;
}

function showGuessMessage(type, text) {
  const el = document.getElementById("guessMessage");
  if (!el) return;
  el.className = `msg ${type}`;
  el.textContent = text;
}

function hideGuessMessage() {
  const el = document.getElementById("guessMessage");
  if (!el) return;
  el.className = "msg";
  el.textContent = "";
}

function showGuessControlMessage(type, text) {
  showInputMessage(type, text);
}

function hideGuessControlMessage() {
  hideInputMessage();
}

function getUserGuessForCountry(countryNumber) {
  const key = String(countryNumber);
  const pendingUpload = getPendingGuessUploads()[key];
  if (pendingUpload && Number.isInteger(pendingUpload.choice)) {
    return pendingUpload.choice;
  }

  const serverChoice = COUNTRY_GUESS_STATE.userGuesses[key];
  return Number.isInteger(serverChoice) ? serverChoice : null;
}

function getDisplayGuessChoice(countryNumber, status) {
  const lockedChoice = getUserGuessForCountry(countryNumber);
  if (Number.isInteger(lockedChoice)) return lockedChoice;
  if (status === "active") return getPendingGuessChoice(countryNumber);
  return null;
}

function formatGuessCountdown(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  return `0:${String(safeSeconds).padStart(2, "0")}`;
}

function isTimerRunning() {
  return countdownRunning && countdownSeconds > 0;
}

function isRoundFinishedLocally() {
  const token = Number(COUNTRY_GUESS_STATE.roundToken) || 0;
  return token > 0 && localRoundToken === token && !isTimerRunning();
}

function isLocalGuessWindowOpen() {
  return isTimerRunning();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getPendingGuessUploads() {
  try {
    const raw = sessionStorage.getItem(storageKeyPendingGuessUploads);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function savePendingGuessUploads(map) {
  sessionStorage.setItem(storageKeyPendingGuessUploads, JSON.stringify(map || {}));
}

function queuePendingGuessUpload({ voter, country, choice, roundToken }) {
  const map = getPendingGuessUploads();
  map[String(country)] = {
    eventId: COUNTRY_SHAPE_EVENT_ID,
    voter,
    country,
    choice,
    roundToken: Number(roundToken) || 0,
    queuedAt: new Date().toISOString()
  };
  savePendingGuessUploads(map);
  COUNTRY_GUESS_STATE.userGuesses[String(country)] = choice;
}

function clearPendingGuessUpload(country) {
  const map = getPendingGuessUploads();
  delete map[String(country)];
  savePendingGuessUploads(map);
}

function stopLocalCountdown() {
  countdownRunning = false;
  if (guessCountdownIntervalId) {
    clearInterval(guessCountdownIntervalId);
    guessCountdownIntervalId = null;
  }
}

function resetCountdownForNewCountry() {
  stopLocalCountdown();
  countdownSeconds = 0;
  localRoundToken = 0;
  localRoundEndsAtMs = 0;
  guessAutoSubmittedForToken = 0;
}

function getRemainingGuessSeconds(startedAt) {
  const startedMs = Date.parse(String(startedAt || ""));
  if (!Number.isFinite(startedMs)) return COUNTRY_GUESS_WINDOW_SECONDS;

  const elapsedSec = Math.floor((Date.now() - startedMs) / 1000);
  return Math.max(0, COUNTRY_GUESS_WINDOW_SECONDS - elapsedSec);
}

function startLocalCountdownForRound(roundToken, startedAt) {
  const token = Number(roundToken) || 0;
  if (token <= 0) return;

  stopLocalCountdown();
  localRoundToken = token;
  countdownSeconds = getRemainingGuessSeconds(startedAt);
  localRoundEndsAtMs = Date.now() + countdownSeconds * 1000;
  countdownRunning = countdownSeconds > 0;
  updateGuessCountdownDisplay(countdownSeconds);

  if (countdownSeconds <= 0) {
    onCountdownFinished();
    return;
  }

  guessCountdownIntervalId = setInterval(() => {
    countdownSeconds = getRemainingGuessSeconds(startedAt || COUNTRY_GUESS_STATE.startedAt);
    if (localRoundEndsAtMs && Date.now() >= localRoundEndsAtMs) {
      countdownSeconds = 0;
    }
    updateGuessCountdownDisplay(countdownSeconds);

    if (countdownSeconds <= 0) {
      onCountdownFinished();
    }
  }, 250);
}

async function onCountdownFinished() {
  stopLocalCountdown();
  countdownSeconds = 0;
  updateGuessCountdownDisplay(0);

  const token = Number(COUNTRY_GUESS_STATE.roundToken) || 0;
  if (guessAutoSubmittedForToken < token) {
    const activeCountry = COUNTRY_GUESS_STATE.activeCountry;
    const choice = getPendingGuessChoice(activeCountry) ?? getSelectedGuessChoice(activeCountry);
    const playerName = document.getElementById("guessPlayerName")?.value.trim() || getStoredGuessVoter();

    if (playerName && choice) {
      guessAutoSubmittedForToken = token;
      queuePendingGuessUpload({
        voter: playerName,
        country: activeCountry,
        choice,
        roundToken: token
      });
      clearPendingGuessChoice(activeCountry);
      storeGuessVoter(playerName);
      lockGuessPlayerSelect();
      showGuessMessage("ok", `Country ${activeCountry} locked in: option ${choice}.`);
      flushPendingGuessUploads({ withJitter: true });
    } else if (!playerName) {
      showGuessMessage("err", `Time is up for Country ${activeCountry}. Please select your name before the timer ends.`);
    } else if (!choice) {
      showGuessMessage("err", `Time is up for Country ${activeCountry}. No option was selected.`);
    }
  }

  renderGuessCountryList();
  renderAdminCountryList();
  updateGuessActiveInfo(0);
  updateAdminStatus(0);
  restartGuessStatePolling();
}

function maybeStartCountdownFromServer() {
  if (COUNTRY_GUESS_STATE.gameComplete) return;

  const token = Number(COUNTRY_GUESS_STATE.roundToken) || 0;
  if (!COUNTRY_GUESS_STATE.guessingOpen || token <= 0) return;

  if (isTimerRunning() && localRoundToken === token) return;
  if (localRoundToken === token && !isTimerRunning() && guessAutoSubmittedForToken >= token) return;

  startLocalCountdownForRound(token, COUNTRY_GUESS_STATE.startedAt);
  renderGuessCountryList();
  renderAdminCountryList();
  restartGuessStatePolling();
}

function getCountryGuessStateSignature() {
  return JSON.stringify({
    activeCountry: COUNTRY_GUESS_STATE.activeCountry,
    guessingOpen: COUNTRY_GUESS_STATE.guessingOpen,
    roundToken: COUNTRY_GUESS_STATE.roundToken,
    startedAt: COUNTRY_GUESS_STATE.startedAt,
    countriesCompleted: COUNTRY_GUESS_STATE.countriesCompleted,
    gameComplete: COUNTRY_GUESS_STATE.gameComplete,
    userGuesses: COUNTRY_GUESS_STATE.userGuesses
  });
}

function rememberPendingGuessChoice(countryNumber, choice) {
  const key = String(countryNumber);
  if (Number.isInteger(choice) && choice >= 1 && choice <= 4) {
    pendingGuessChoices[key] = choice;
    return;
  }
  delete pendingGuessChoices[key];
}

function getPendingGuessChoice(countryNumber) {
  const choice = pendingGuessChoices[String(countryNumber)];
  return Number.isInteger(choice) ? choice : null;
}

function clearPendingGuessChoice(countryNumber) {
  delete pendingGuessChoices[String(countryNumber)];
}

function trimPendingGuessChoices(activeCountry) {
  Object.keys(pendingGuessChoices).forEach(key => {
    if (Number(key) !== activeCountry) {
      delete pendingGuessChoices[key];
    }
  });
}

function isGuessViewVisible() {
  const guessView = document.getElementById("guessView");
  return !!guessView && guessView.style.display !== "none";
}

function isInputViewVisible() {
  const inputView = document.getElementById("inputView");
  return !!inputView && inputView.style.display !== "none";
}

async function pollLiveGuessState() {
  if (!isGuessViewVisible() && !isInputViewVisible()) return;
  if (COUNTRY_GUESS_STATE.gameComplete || COUNTRY_GUESS_STATE.activeCountry > COUNTRY_COUNT) {
    stopGuessStatePolling();
    return;
  }

  // During the local countdown we do not need sheet polls.
  if (isTimerRunning()) return;
  if (guessPollInFlight) return;

  guessPollInFlight = true;
  try {
    const previousSignature = getCountryGuessStateSignature();
    await loadCountryGuessPulse();
    await flushPendingGuessUploads({ withJitter: false });

    if (previousSignature === getCountryGuessStateSignature()) {
      if (isGuessViewVisible()) {
        updateGuessActiveInfo();
        updateGuessSubmitButtonState();
        maybeStartCountdownFromServer();
      }
      if (isInputViewVisible()) {
        updateAdminStatus();
      }
      return;
    }

    const previousState = JSON.parse(previousSignature);
    const parsedNext = JSON.parse(getCountryGuessStateSignature());
    if (previousState.activeCountry !== parsedNext.activeCountry) {
      trimPendingGuessChoices(parsedNext.activeCountry);
      if (!parsedNext.guessingOpen) {
        resetCountdownForNewCountry();
      }
    }

    if (isGuessViewVisible()) {
      updateGuessActiveInfo();
      renderGuessCountryList();
      maybeStartCountdownFromServer();
    }

    if (isInputViewVisible()) {
      updateAdminStatus();
      renderAdminCountryList();
    }

    restartGuessStatePolling();
  } finally {
    guessPollInFlight = false;
  }
}

function shouldStopGuessPolling() {
  return COUNTRY_GUESS_STATE.gameComplete || COUNTRY_GUESS_STATE.activeCountry > COUNTRY_COUNT;
}

function getGuessPollIntervalMs() {
  if (shouldStopGuessPolling()) return null;
  if (isTimerRunning()) return null;

  // After the local 15s window: poll every 1s until the next start/correct answer.
  if (isRoundFinishedLocally()) return GUESS_POLL_AFTER_TIMER_MS;

  // Waiting for admin to start the timer.
  return GUESS_POLL_WAITING_MS;
}

function restartGuessStatePolling() {
  stopGuessStatePolling();
  if (!isGuessViewVisible() && !isInputViewVisible()) return;
  if (shouldStopGuessPolling()) return;

  const intervalMs = getGuessPollIntervalMs();
  if (!intervalMs) return;

  guessStatePollIntervalId = setInterval(() => {
    pollLiveGuessState();
  }, intervalMs);
}

function startGuessStatePolling() {
  restartGuessStatePolling();
  if (!isTimerRunning()) {
    pollLiveGuessState();
  }
}

function stopGuessStatePolling() {
  if (guessStatePollIntervalId) {
    clearInterval(guessStatePollIntervalId);
    guessStatePollIntervalId = null;
  }
}

function updateGuessCountdownDisplay(seconds) {
  const activeCountry = COUNTRY_GUESS_STATE.activeCountry;
  document.querySelectorAll(".country-guess-countdown").forEach(el => {
    if (Number(el.dataset.country) === activeCountry || el.id === `guess-countdown-${activeCountry}` || el.id === `admin-countdown-${activeCountry}`) {
      el.textContent = seconds > 0 ? formatGuessCountdown(seconds) : "0:00";
    }
  });

  const guessCountdownEl = document.getElementById(`guess-countdown-${activeCountry}`);
  if (guessCountdownEl) {
    guessCountdownEl.textContent = seconds > 0 ? formatGuessCountdown(seconds) : "0:00";
  }

  const adminCountdownEl = document.getElementById(`admin-countdown-${activeCountry}`);
  if (adminCountdownEl) {
    adminCountdownEl.textContent = seconds > 0 ? formatGuessCountdown(seconds) : "0:00";
  }

  updateGuessActiveInfo(seconds);
  updateAdminStatus(seconds);
}

function updateAdminStatus(seconds = countdownSeconds) {
  const status = document.getElementById("adminStatus");
  if (!status) return;

  if (COUNTRY_GUESS_STATE.gameComplete || COUNTRY_GUESS_STATE.activeCountry > COUNTRY_COUNT) {
    status.textContent = `All ${COUNTRY_COUNT} countries completed.`;
    return;
  }

  const timerLabel = isTimerRunning()
    ? `${formatGuessCountdown(seconds)} left · `
    : (isRoundFinishedLocally() ? "enter correct answer · " : "ready for start · ");

  status.textContent =
    `Active country: Country ${COUNTRY_GUESS_STATE.activeCountry} · ${timerLabel}${COUNTRY_GUESS_STATE.guessCount}/${COUNTRY_GUESS_STATE.totalPlayers} guessed · ${COUNTRY_GUESS_STATE.countriesCompleted}/${COUNTRY_COUNT} completed`;
}

function updateGuessActiveInfo(seconds = countdownSeconds) {
  const info = document.getElementById("guessActiveInfo");
  if (!info) return;

  if (COUNTRY_GUESS_STATE.gameComplete || COUNTRY_GUESS_STATE.activeCountry > COUNTRY_COUNT) {
    info.textContent = `Game complete · ${COUNTRY_GUESS_STATE.countriesCompleted}/${COUNTRY_COUNT} countries resolved`;
    return;
  }

  const timerLabel = isTimerRunning()
    ? `${formatGuessCountdown(seconds)} left · guessing open`
    : (isRoundFinishedLocally()
      ? (getUserGuessForCountry(COUNTRY_GUESS_STATE.activeCountry)
        ? `locked in · option ${getUserGuessForCountry(COUNTRY_GUESS_STATE.activeCountry)}`
        : "time up · no guess")
      : "waiting for start");

  info.textContent = `Country ${COUNTRY_GUESS_STATE.activeCountry} · ${timerLabel}`;
}

async function loadCountryGuessPulse() {
  if (!COUNTRY_SHAPE_API_URL) return;

  try {
    const data = await jsonp(
      `${COUNTRY_SHAPE_API_URL}?eventId=${encodeURIComponent(COUNTRY_SHAPE_EVENT_ID)}&action=countryShapeGuessPulse`,
      15000
    );

    if (!isCountryShapeGuessPulseSuccess(data)) return;

    COUNTRY_GUESS_STATE.activeCountry = Number(data.activeCountry) || 1;
    COUNTRY_GUESS_STATE.guessingOpen = !!data.guessingOpen;
    COUNTRY_GUESS_STATE.roundToken = Number(data.roundToken) || 0;
    COUNTRY_GUESS_STATE.startedAt = String(data.startedAt || "").trim();
    COUNTRY_GUESS_STATE.countriesCompleted = Number(data.countriesCompleted) || COUNTRY_GUESS_STATE.countriesCompleted;
    COUNTRY_GUESS_STATE.gameComplete = !!data.gameComplete;

    maybeStartCountdownFromServer();
    if (shouldStopGuessPolling()) {
      stopGuessStatePolling();
    }
  } catch (e) {
    console.warn("Could not load Country by Shape pulse", e);
  }
}

async function loadCountryGuessState() {
  if (!COUNTRY_SHAPE_API_URL) return;

  const voter = getStoredGuessVoter() || document.getElementById("guessPlayerName")?.value.trim() || "";
  const voterParam = voter ? `&voter=${encodeURIComponent(voter)}` : "";

  try {
    const data = await jsonp(
      `${COUNTRY_SHAPE_API_URL}?eventId=${encodeURIComponent(COUNTRY_SHAPE_EVENT_ID)}&action=countryShapeGuessState${voterParam}`
    );

    if (!isCountryShapeGuessStateSuccess(data)) {
      return;
    }

    COUNTRY_GUESS_STATE = {
      activeCountry: Number(data.activeCountry) || 1,
      guessingOpen: !!data.guessingOpen,
      roundToken: Number(data.roundToken) || 0,
      startedAt: String(data.startedAt || "").trim(),
      guessCount: Number(data.guessCount) || 0,
      totalPlayers: Number(data.totalPlayers) || COUNTRY_SHAPE_PLAYERS.length,
      guessedForActive: Array.isArray(data.guessedForActive) ? data.guessedForActive : [],
      userGuesses: { ...(data.userGuesses || {}) },
      correctAnswers: data.correctAnswers || {},
      countriesCompleted: Number(data.countriesCompleted) || 0,
      gameComplete: !!data.gameComplete
    };

    // Keep locally queued guesses visible even before the sheet confirms them.
    const pendingUploads = getPendingGuessUploads();
    Object.keys(pendingUploads).forEach(key => {
      const entry = pendingUploads[key];
      if (entry && Number.isInteger(entry.choice)) {
        COUNTRY_GUESS_STATE.userGuesses[key] = entry.choice;
      }
    });

    maybeStartCountdownFromServer();
    if (shouldStopGuessPolling()) {
      stopGuessStatePolling();
    }
  } catch (e) {
    console.warn("Could not load Country by Shape guess state", e);
  }
}

function getSelectedGuessChoice(countryNumber) {
  const selected = document.querySelector(`input[name="guess-country-${countryNumber}"]:checked`);
  if (selected) {
    return Number(selected.value);
  }
  return getPendingGuessChoice(countryNumber);
}

function getCountryGuessRowStatus(countryNumber) {
  const userChoice = getUserGuessForCountry(countryNumber);
  const activeCountry = COUNTRY_GUESS_STATE.activeCountry;

  if (COUNTRY_GUESS_STATE.correctAnswers[String(countryNumber)]) {
    return userChoice ? "done" : "closed";
  }

  if (userChoice && countryNumber <= activeCountry) return "done";

  if (countryNumber === activeCountry + 1 && isRoundFinishedLocally()) {
    return "up-next";
  }

  if (countryNumber === activeCountry) {
    if (isTimerRunning()) return "active";
    if (isRoundFinishedLocally()) return userChoice ? "done" : "missed";
    return "waiting";
  }

  if (countryNumber < activeCountry) return userChoice ? "done" : "missed";
  return "locked";
}

function getCountryGuessStatusLabel(status, countryNumber) {
  const userChoice = getUserGuessForCountry(countryNumber);
  const pendingChoice = getPendingGuessChoice(countryNumber);

  if (status === "active") {
    return pendingChoice
      ? `Open · selected ${pendingChoice}`
      : "Open · pick 1–4";
  }
  if (status === "done" && userChoice) return `Locked in · option ${userChoice}`;
  if (status === "done") return "Locked in";
  if (status === "waiting") return "Waiting to start";
  if (status === "up-next") return "Next";
  if (status === "closed" && userChoice) return `Resolved · your option ${userChoice}`;
  if (status === "closed") return "Resolved";
  if (status === "missed" && userChoice) return `Locked in · option ${userChoice}`;
  if (status === "missed") return "No guess";
  return "Locked";
}

function renderGuessCountryList() {
  const container = document.getElementById("guessCountryList");
  if (!container) return;

  container.innerHTML = Array.from({ length: COUNTRY_COUNT }, (_, index) => {
    const countryNumber = index + 1;
    const status = getCountryGuessRowStatus(countryNumber);
    const userChoice = getUserGuessForCountry(countryNumber);
    const displayChoice = getDisplayGuessChoice(countryNumber, status);
    const isInteractive = status === "active";
    const options = [1, 2, 3, 4];
    const showCountdown = status === "active";
    const countdownHtml = showCountdown
      ? `<span class="country-guess-countdown" id="guess-countdown-${countryNumber}" data-country="${countryNumber}">${formatGuessCountdown(countdownSeconds)}</span>`
      : "";

    return `
      <div class="country-guess-row country-guess-row-${status}">
        <div class="country-guess-row-head">
          <span class="country-label">Country ${countryNumber}</span>
          <span class="country-guess-status-wrap">
            ${countdownHtml}
            <span class="country-guess-status">${getCountryGuessStatusLabel(status, countryNumber)}</span>
          </span>
        </div>
        <div class="country-guess-options">
          ${options.map(choice => {
            const isCurrentChoice = displayChoice === choice;
            const isLockedChoice = !isInteractive && userChoice === choice;
            const labelClass = [
              "country-guess-option-label",
              isLockedChoice ? "country-guess-option-label-saved" : ""
            ].filter(Boolean).join(" ");

            return `
            <label class="${labelClass}">
              <input
                type="radio"
                name="guess-country-${countryNumber}"
                class="country-guess-option"
                value="${choice}"
                ${isCurrentChoice ? "checked" : ""}
                ${isInteractive ? "" : "disabled"}
              />
              <span>${choice}</span>
            </label>
          `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");

  updateGuessSubmitButtonState();
}

function updateGuessSubmitButtonState() {
  const btn = document.getElementById("submitCountryGuessBtn");
  const playerName = document.getElementById("guessPlayerName")?.value.trim() || getStoredGuessVoter();
  const activeCountry = COUNTRY_GUESS_STATE.activeCountry;
  const hasSubmittedActive = !!getUserGuessForCountry(activeCountry);
  const selectedChoice = getSelectedGuessChoice(activeCountry);
  const windowOpen = isLocalGuessWindowOpen();

  if (!btn) return;
  btn.textContent = SUBMIT_COUNTRY_GUESS_LABEL;
  btn.disabled = !playerName || hasSubmittedActive || !selectedChoice || !windowOpen;
}

function setSubmitCountryGuessButtonState(isSending) {
  const btn = document.getElementById("submitCountryGuessBtn");
  if (!btn) return;
  btn.disabled = isSending;
  btn.textContent = isSending ? SUBMIT_COUNTRY_GUESS_SENDING_LABEL : SUBMIT_COUNTRY_GUESS_LABEL;
}

function buildCountryShapeGuessSubmitUrl(payload) {
  return `${COUNTRY_SHAPE_API_URL}?eventId=${encodeURIComponent(payload.eventId)}&action=countryShapeGuessSubmit&voter=${encodeURIComponent(payload.voter)}&country=${encodeURIComponent(payload.country)}&choice=${encodeURIComponent(payload.choice)}`;
}

function buildCountryShapeAdminStartTimerUrl(country, startedAt) {
  return `${COUNTRY_SHAPE_API_URL}?eventId=${encodeURIComponent(COUNTRY_SHAPE_EVENT_ID)}&action=countryShapeAdminStartTimer&country=${encodeURIComponent(country)}&startedAt=${encodeURIComponent(startedAt || "")}`;
}

function buildCountryShapeAdminSubmitCorrectUrl(country, choice) {
  return `${COUNTRY_SHAPE_API_URL}?eventId=${encodeURIComponent(COUNTRY_SHAPE_EVENT_ID)}&action=countryShapeAdminSubmitCorrect&country=${encodeURIComponent(country)}&choice=${encodeURIComponent(choice)}`;
}

function buildCountryShapeAdminEndTimerUrl(country) {
  return `${COUNTRY_SHAPE_API_URL}?eventId=${encodeURIComponent(COUNTRY_SHAPE_EVENT_ID)}&action=countryShapeAdminEndTimer&country=${encodeURIComponent(country)}`;
}

async function refreshGuessSession() {
  await loadCountryGuessState();
  trimPendingGuessChoices(COUNTRY_GUESS_STATE.activeCountry);
  await flushPendingGuessUploads({ withJitter: false });
  updateAdminStatus();
  updateGuessActiveInfo();
  renderGuessCountryList();
  renderAdminCountryList();
  restartGuessStatePolling();
}

async function refreshAdminSession() {
  await loadCountryGuessState();
  await flushPendingGuessUploads({ withJitter: false });
  updateAdminStatus();
  renderAdminCountryList();
  restartGuessStatePolling();
}

async function flushPendingGuessUploads({ withJitter = false } = {}) {
  if (guessFlushInFlight || guessSubmitInFlight) return;
  if (!COUNTRY_SHAPE_API_URL) return;

  const pending = getPendingGuessUploads();
  const entries = Object.values(pending);
  if (!entries.length) return;

  guessFlushInFlight = true;

  try {
    if (withJitter) {
      await sleep(Math.floor(Math.random() * (GUESS_SUBMIT_JITTER_MS + 1)));
    }

    for (const entry of entries) {
      if (!entry?.voter || !Number.isInteger(entry.country) || !Number.isInteger(entry.choice)) {
        clearPendingGuessUpload(entry?.country);
        continue;
      }

      try {
        const data = await jsonp(buildCountryShapeGuessSubmitUrl(entry));
        if (isCountryShapeGuessSubmitSuccess(data)) {
          clearPendingGuessUpload(entry.country);
          COUNTRY_GUESS_STATE.userGuesses[String(entry.country)] = entry.choice;
          continue;
        }

        // Round already closed without our guess — keep local display, stop retrying.
        if (String(data?.error || "").toLowerCase().includes("already closed")) {
          console.warn("Guess upload rejected because round closed", entry, data);
          clearPendingGuessUpload(entry.country);
        }
      } catch (e) {
        console.warn("Pending guess upload failed, will retry", entry, e);
      }
    }
  } finally {
    guessFlushInFlight = false;
  }
}

async function autoSubmitCountryGuess(forcedChoice = null) {
  const activeCountry = COUNTRY_GUESS_STATE.activeCountry;
  const playerName = document.getElementById("guessPlayerName")?.value.trim() || getStoredGuessVoter();
  const choice = forcedChoice ?? getSelectedGuessChoice(activeCountry);

  if (!playerName) {
    showGuessMessage("err", `Time is up for Country ${activeCountry}. Please select your name before the timer ends.`);
    await refreshGuessSession();
    return;
  }

  if (!choice) {
    showGuessMessage("err", `Time is up for Country ${activeCountry}. No option was selected.`);
    await refreshGuessSession();
    return;
  }

  const token = Number(COUNTRY_GUESS_STATE.roundToken) || 0;
  queuePendingGuessUpload({
    voter: playerName,
    country: activeCountry,
    choice,
    roundToken: token
  });
  clearPendingGuessChoice(activeCountry);
  storeGuessVoter(playerName);
  lockGuessPlayerSelect();
  showGuessMessage("ok", `Country ${activeCountry} locked in: option ${choice}.`);
  renderGuessCountryList();
  await flushPendingGuessUploads({ withJitter: true });
}

async function submitCountryGuess({ auto = false, choice: forcedChoice = null } = {}) {
  if (guessSubmitInFlight) return false;

  const playerName = document.getElementById("guessPlayerName")?.value.trim() || getStoredGuessVoter();
  const activeCountry = COUNTRY_GUESS_STATE.activeCountry;
  const choice = forcedChoice ?? getSelectedGuessChoice(activeCountry);

  if (!playerName) {
    if (!auto) showGuessMessage("err", "Please select your name before submitting.");
    return false;
  }

  if (COUNTRY_GUESS_STATE.userGuesses[String(activeCountry)] && !getPendingGuessUploads()[String(activeCountry)]) {
    if (!auto) showGuessMessage("ok", `Country ${activeCountry} already locked in: option ${COUNTRY_GUESS_STATE.userGuesses[String(activeCountry)]}.`);
    updateGuessSubmitButtonState();
    return false;
  }

  if (!choice) {
    if (!auto) showGuessMessage("err", "Please choose one option (1, 2, 3 or 4).");
    return false;
  }

  if (!auto && !isLocalGuessWindowOpen()) {
    showGuessMessage("err", "The guessing window for this country has closed.");
    return false;
  }

  if (!COUNTRY_SHAPE_API_URL) {
    if (!auto) showGuessMessage("err", "API_URL is not configured yet.");
    return false;
  }

  const token = Number(COUNTRY_GUESS_STATE.roundToken) || 0;
  queuePendingGuessUpload({
    voter: playerName,
    country: activeCountry,
    choice,
    roundToken: token
  });
  clearPendingGuessChoice(activeCountry);
  storeGuessVoter(playerName);
  lockGuessPlayerSelect();
  renderGuessCountryList();
  showGuessMessage("ok", `Country ${activeCountry} locked in: option ${choice}.`);

  await flushPendingGuessUploads({ withJitter: auto });
  return true;
}

function getAdminCountryRowStatus(countryNumber) {
  const savedChoice = COUNTRY_GUESS_STATE.correctAnswers[String(countryNumber)];
  if (savedChoice) return "done";
  if (countryNumber === COUNTRY_GUESS_STATE.activeCountry) {
    if (isTimerRunning()) return "active";
    return "waiting";
  }
  if (countryNumber === COUNTRY_GUESS_STATE.activeCountry + 1 && isRoundFinishedLocally()) {
    return "up-next";
  }
  return "locked";
}

function getAdminCountryStatusLabel(status, countryNumber) {
  if (status === "done") {
    return "";
  }
  if (status === "active") return "Timer running";
  if (status === "waiting" && isRoundFinishedLocally() && countryNumber === COUNTRY_GUESS_STATE.activeCountry) {
    return "Enter correct answer";
  }
  if (status === "waiting") return "Start timer";
  if (status === "up-next") return "Next · waiting for timer";
  return "Locked";
}

function getSelectedAdminChoice(countryNumber) {
  const selected = document.querySelector(`input[name="admin-country-${countryNumber}"]:checked`);
  return selected ? Number(selected.value) : null;
}

function renderAdminCountryList() {
  const container = document.getElementById("adminCountryList");
  if (!container) return;

  container.innerHTML = Array.from({ length: COUNTRY_COUNT }, (_, index) => {
    const countryNumber = index + 1;
    const status = getAdminCountryRowStatus(countryNumber);
    const savedChoice = COUNTRY_GUESS_STATE.correctAnswers[String(countryNumber)];
    const isActiveRow = countryNumber === COUNTRY_GUESS_STATE.activeCountry;
    const timerRunning = isActiveRow && isTimerRunning();
    const roundFinished = isActiveRow && isRoundFinishedLocally();
    const canStartTimer = isActiveRow && !savedChoice && !timerRunning && !roundFinished;
    const canSubmitCorrect = isActiveRow && !savedChoice && roundFinished;
    const showCountdown = isActiveRow && isTimerRunning();
    const countdownHtml = showCountdown
      ? `<span class="country-guess-countdown" id="admin-countdown-${countryNumber}" data-country="${countryNumber}">${formatGuessCountdown(countdownSeconds)}</span>`
      : "";

    return `
      <div class="country-guess-row country-guess-row-${status}">
        <div class="country-guess-row-head">
          <span class="country-label">Country ${countryNumber}</span>
          <span class="country-guess-status-wrap">
            ${countdownHtml}
            <span class="country-guess-status">${getAdminCountryStatusLabel(status, countryNumber)}</span>
          </span>
        </div>
        <div class="country-guess-options">
          ${[1, 2, 3, 4].map(choice => {
            const isSavedChoice = savedChoice === choice;
            return `
            <label class="country-guess-option-label${isSavedChoice ? " country-guess-option-label-saved" : ""}">
              <input
                type="radio"
                name="admin-country-${countryNumber}"
                class="country-admin-option"
                value="${choice}"
                data-country="${countryNumber}"
                ${savedChoice === choice ? "checked" : ""}
                ${canSubmitCorrect ? "" : "disabled"}
              />
              <span>${choice}</span>
            </label>
          `;
          }).join("")}
        </div>
        ${isActiveRow && !savedChoice ? `
          <div class="country-admin-actions">
            <button
              type="button"
              class="secondary"
              id="admin-start-timer-${countryNumber}"
              onclick="adminStartTimer(${countryNumber})"
              ${canStartTimer ? "" : "disabled"}
            >${ADMIN_START_TIMER_LABEL}</button>
            <button
              type="button"
              id="admin-submit-${countryNumber}"
              onclick="adminSubmitCorrect(${countryNumber})"
              ${canSubmitCorrect ? "" : "disabled"}
            >${ADMIN_SUBMIT_CORRECT_LABEL}</button>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");
}

async function adminStartTimer(countryNumber) {
  if (adminTimerStarting) return;

  if (!COUNTRY_SHAPE_API_URL) {
    showInputMessage("err", "API_URL is not configured yet.");
    return;
  }

  adminTimerStarting = true;
  hideInputMessage();

  const startedAt = new Date().toISOString();
  const optimisticToken = (Number(COUNTRY_GUESS_STATE.roundToken) || 0) + 1;
  const previousSnapshot = {
    activeCountry: COUNTRY_GUESS_STATE.activeCountry,
    guessingOpen: COUNTRY_GUESS_STATE.guessingOpen,
    roundToken: COUNTRY_GUESS_STATE.roundToken,
    startedAt: COUNTRY_GUESS_STATE.startedAt
  };

  // Optimistic UI: start the local countdown immediately.
  COUNTRY_GUESS_STATE.activeCountry = countryNumber;
  COUNTRY_GUESS_STATE.guessingOpen = true;
  COUNTRY_GUESS_STATE.roundToken = optimisticToken;
  COUNTRY_GUESS_STATE.startedAt = startedAt;
  startLocalCountdownForRound(optimisticToken, startedAt);
  renderAdminCountryList();
  renderGuessCountryList();
  updateAdminStatus();
  updateGuessActiveInfo();
  restartGuessStatePolling();
  showInputMessage("ok", `Timer started for Country ${countryNumber}. ${COUNTRY_GUESS_WINDOW_SECONDS} seconds.`);

  try {
    const data = await jsonp(buildCountryShapeAdminStartTimerUrl(countryNumber, startedAt));
    if (!isCountryShapeAdminStartTimerSuccess(data)) {
      stopLocalCountdown();
      COUNTRY_GUESS_STATE.activeCountry = previousSnapshot.activeCountry;
      COUNTRY_GUESS_STATE.guessingOpen = previousSnapshot.guessingOpen;
      COUNTRY_GUESS_STATE.roundToken = previousSnapshot.roundToken;
      COUNTRY_GUESS_STATE.startedAt = previousSnapshot.startedAt;
      resetCountdownForNewCountry();
      showInputMessage("err", data?.error || "Could not start timer.");
      renderAdminCountryList();
      renderGuessCountryList();
      updateAdminStatus();
      updateGuessActiveInfo();
      restartGuessStatePolling();
      return;
    }

    COUNTRY_GUESS_STATE.activeCountry = Number(data.activeCountry) || countryNumber;
    COUNTRY_GUESS_STATE.guessingOpen = true;
    COUNTRY_GUESS_STATE.roundToken = Number(data.roundToken) || optimisticToken;
    COUNTRY_GUESS_STATE.startedAt = String(data.startedAt || startedAt);

    // Keep the same wall-clock end time via startedAt (no full restart flash).
    if (localRoundToken !== COUNTRY_GUESS_STATE.roundToken) {
      startLocalCountdownForRound(COUNTRY_GUESS_STATE.roundToken, COUNTRY_GUESS_STATE.startedAt);
    }
  } catch (e) {
    stopLocalCountdown();
    COUNTRY_GUESS_STATE.activeCountry = previousSnapshot.activeCountry;
    COUNTRY_GUESS_STATE.guessingOpen = previousSnapshot.guessingOpen;
    COUNTRY_GUESS_STATE.roundToken = previousSnapshot.roundToken;
    COUNTRY_GUESS_STATE.startedAt = previousSnapshot.startedAt;
    resetCountdownForNewCountry();
    showInputMessage("err", "Could not start timer. Please check your connection.");
    console.error(e);
    renderAdminCountryList();
    renderGuessCountryList();
    updateAdminStatus();
    updateGuessActiveInfo();
    restartGuessStatePolling();
  } finally {
    adminTimerStarting = false;
  }
}

async function adminEndTimer(countryNumber, { auto = false } = {}) {
  if (!COUNTRY_SHAPE_API_URL) {
    if (!auto) showInputMessage("err", "API_URL is not configured yet.");
    return;
  }

  try {
    if (!auto) hideInputMessage();

    const data = await jsonp(buildCountryShapeAdminEndTimerUrl(countryNumber));
    if (!isCountryShapeAdminEndTimerSuccess(data)) {
      if (!auto) showInputMessage("err", data?.error || "Could not end timer.");
      renderAdminCountryList();
      return;
    }

    COUNTRY_GUESS_STATE.guessingOpen = false;
    stopLocalCountdown();
    countdownSeconds = 0;
    await loadCountryGuessState();
    updateAdminStatus(0);
    updateGuessActiveInfo(0);
    renderAdminCountryList();
    renderGuessCountryList();

    if (!auto) {
      showInputMessage("ok", `Guessing closed for Country ${countryNumber}. Final choices are being submitted.`);
    }
  } catch (e) {
    if (!auto) showInputMessage("err", "Could not end timer. Please check your connection.");
    console.error(e);
    renderAdminCountryList();
  }
}

async function adminSubmitCorrect(countryNumber) {
  const choice = getSelectedAdminChoice(countryNumber);

  if (!choice) {
    showInputMessage("err", "Please choose the correct option (1, 2, 3 or 4).");
    return;
  }

  if (!COUNTRY_SHAPE_API_URL) {
    showInputMessage("err", "API_URL is not configured yet.");
    return;
  }

  try {
    hideInputMessage();
    adminSubmittingCountry = countryNumber;
    renderAdminCountryList();

    const data = await jsonp(buildCountryShapeAdminSubmitCorrectUrl(countryNumber, choice));
    if (!isCountryShapeAdminSubmitCorrectSuccess(data)) {
      showInputMessage("err", data?.error || "Could not save correct answer.");
      adminSubmittingCountry = null;
      renderAdminCountryList();
      return;
    }

    adminSubmittingCountry = null;
    resetCountdownForNewCountry();
    COUNTRY_GUESS_STATE.guessingOpen = false;
    COUNTRY_GUESS_STATE.startedAt = "";
    await loadCountryGuessState();
    await flushPendingGuessUploads({ withJitter: false });
    updateAdminStatus();
    renderAdminCountryList();
    renderGuessCountryList();
    restartGuessStatePolling();

    if (data.gameComplete) {
      stopGuessStatePolling();
      showInputMessage("ok", `Country ${countryNumber} saved (option ${choice}). All countries are complete.`);
    } else {
      showInputMessage("ok", `Country ${countryNumber} saved (option ${choice}). Country ${data.activeCountry} is now active.`);
    }
  } catch (e) {
    adminSubmittingCountry = null;
    showInputMessage("err", "Could not save correct answer. Please check your connection.");
    console.error(e);
    renderAdminCountryList();
  }
}

function bindAdminEvents() {
  const list = document.getElementById("adminCountryList");
  if (!list || list.dataset.bound === "true") return;
  list.dataset.bound = "true";

  list.addEventListener("change", () => {
    hideInputMessage();
  });
}

function bindGuessEvents() {
  const playerSel = document.getElementById("guessPlayerName");
  if (playerSel) {
    playerSel.addEventListener("change", async () => {
      hideGuessMessage();
      await refreshGuessSession();
    });
  }

  const list = document.getElementById("guessCountryList");
  if (list) {
    list.addEventListener("change", (event) => {
      const input = event.target;
      if (input?.classList?.contains("country-guess-option")) {
        const countryNumber = Number(String(input.name || "").replace("guess-country-", ""));
        rememberPendingGuessChoice(countryNumber, Number(input.value));
        const playerName = document.getElementById("guessPlayerName")?.value.trim() || getStoredGuessVoter();
        if (!playerName) {
          showGuessMessage("err", "Please select your name before the timer ends.");
        } else {
          hideGuessMessage();
        }
        renderGuessCountryList();
        updateGuessActiveInfo();
        return;
      }
      hideGuessMessage();
      updateGuessSubmitButtonState();
    });
  }
}

function formatCountryPoints(points) {
  const rounded = Math.round(points * 100) / 100;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2);
}

function renderCountryResults(data) {
  const container = document.getElementById("countryResults");
  const rankings = Array.isArray(data.rankings) ? data.rankings : [];
  const countriesCompleted = Number(data.countriesCompleted) || 0;
  const countryCount = Number(data.countryCount) || COUNTRY_COUNT;
  const pointPool = Number(data.pointPool) || COUNTRY_POINT_POOL;
  const maxPoints = Math.max(1, ...rankings.map(entry => entry.points || 0));

  container.innerHTML = `
    <div class="result-stats">
      <div class="stat">
        <div class="stat-inline">
          <b>${countriesCompleted} / ${countryCount}</b>
          <span class="stat-label">Countries resolved</span>
        </div>
      </div>
      <div class="stat">
        <div class="stat-inline">
          <b>${pointPool}</b>
          <span class="stat-label">Points per country (shared)</span>
        </div>
      </div>
    </div>
    <table class="country-results-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Name</th>
          <th>Points</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rankings.map((entry, index) => `
          <tr>
            <td class="rank">${index + 1}</td>
            <td>
              <span class="country-result-name">${escapeHtml(entry.playerName)}</span>
              <span class="small country-result-meta">${entry.correctCount || 0}/${countriesCompleted || countryCount} correct · ${entry.guessedCount || 0} guesses</span>
            </td>
            <td><b>${formatCountryPoints(entry.points)}</b></td>
            <td><div class="bar"><span style="width:${Math.round((entry.points / maxPoints) * 100)}%"></span></div></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function loadCountryResults() {
  if (!COUNTRY_SHAPE_API_URL) {
    document.getElementById("countryResults").innerHTML =
      `<p class="msg err" style="display:block">API_URL is not configured yet.</p>`;
    return;
  }

  setRefreshCountryResultsButtonState(true);

  jsonp(`${COUNTRY_SHAPE_API_URL}?eventId=${encodeURIComponent(COUNTRY_SHAPE_EVENT_ID)}&action=countryShapeResults`)
    .then(data => {
      if (!isCountryShapeResultsSuccess(data)) {
        if (data?.ok === true && data?.results) {
          document.getElementById("countryResults").innerHTML =
            `<p class="msg err" style="display:block">${escapeHtml(COUNTRY_API_NOT_DEPLOYED_MSG.replace("YOUR_WEB_APP_URL", COUNTRY_SHAPE_API_URL))}</p>`;
          return;
        }

        document.getElementById("countryResults").innerHTML =
          `<p class="msg err" style="display:block">${escapeHtml(data?.error || "Results could not be loaded.")}</p>`;
        return;
      }

      renderCountryResults(data || {});
    })
    .catch(() => {
      document.getElementById("countryResults").innerHTML =
        `<p class="msg err" style="display:block">Results could not be loaded.</p>`;
    })
    .finally(() => setRefreshCountryResultsButtonState(false));
}

function hideAllCountryViews() {
  stopGuessStatePolling();
  document.getElementById("guessView").style.display = "none";
  document.getElementById("inputView").style.display = "none";
  document.getElementById("resultView").style.display = "none";
}

function showGuess() {
  hideAllCountryViews();
  document.getElementById("guessView").style.display = "block";
  setActiveTab("guess");
  refreshGuessSession();
  startGuessStatePolling();
}

function setActiveTab(tab) {
  document.getElementById("tabGuessBtn").classList.toggle("active", tab === "guess");
  document.getElementById("tabInputBtn").classList.toggle("active", tab === "input");
  document.getElementById("tabResultBtn").classList.toggle("active", tab === "result");
}

function showInput() {
  if (!hasInputAccess()) {
    openInputPasswordModal();
    return;
  }

  openInputView();
}

function showResult() {
  hideAllCountryViews();
  document.getElementById("resultView").style.display = "block";
  setActiveTab("result");
}

async function init() {
  if (location.protocol === "file:") {
    showInputMessage(
      "err",
      "This page cannot be opened directly as a file. Please start a local server (e.g. python3 -m http.server 8080) or use the GitHub Pages URL."
    );
    return;
  }

  clearLegacyLocalGameStorage();

  if (new URLSearchParams(location.search).get("reset") === "1") {
    clearGameSession();
    history.replaceState({}, "", location.pathname);
  }

  const [playersLoaded, apiReady] = await Promise.all([
    loadPlayers(),
    checkCountryShapeApiDeployment()
  ]);

  if (!playersLoaded && !apiReady) {
    showInputMessage("err", COUNTRY_API_NOT_DEPLOYED_MSG.replace("YOUR_WEB_APP_URL", COUNTRY_SHAPE_API_URL));
  } else if (!apiReady) {
    console.warn("Country by Shape API version check failed, continuing with loaded data.");
  }

  bindGuessEvents();
  bindAdminEvents();
  await refreshGuessSession();
  fillGuessPlayerSelect();
  showGuess();
}

init();
