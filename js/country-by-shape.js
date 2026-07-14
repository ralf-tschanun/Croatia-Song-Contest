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

const COUNTRY_GUESS_WINDOW_SECONDS = 20;
let guessCountdownIntervalId = null;
let guessStatePollIntervalId = null;
let guessSubmitInFlight = false;
let adminSubmittingCountry = null;
let adminTimerStarting = false;
let pendingGuessChoices = {};
let countdownSeconds = 0;
let countdownRunning = false;
let localRoundToken = 0;
let guessAutoSubmittedForToken = 0;

let COUNTRY_GUESS_STATE = {
  activeCountry: 1,
  guessingOpen: false,
  roundToken: 0,
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

const COUNTRY_API_NOT_DEPLOYED_MSG = "Country by Shape is not active on the API yet. Open YOUR_WEB_APP_URL?action=apiInfo — you should see version \"2026-07-15-remove-country-shape-submits\". If not: replace ALL of Code.gs with google-apps-script/Code.gs, then Deploy → Manage deployments → Edit → New version → Deploy.";

function isCountryShapeVotersSuccess(data) {
  return data?.ok === true && data?.action === "voters" && Array.isArray(data?.voters);
}

function isCountryShapeApiActive(data) {
  return data?.ok === true && data?.action === "apiInfo" &&
    Array.isArray(data?.features) && data.features.includes("countryShapeAdminEndTimer");
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
  const serverChoice = COUNTRY_GUESS_STATE.userGuesses[String(countryNumber)];
  return Number.isInteger(serverChoice) ? serverChoice : null;
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
  guessAutoSubmittedForToken = 0;
}

function startLocalCountdownForRound(roundToken) {
  const token = Number(roundToken) || 0;
  if (token <= 0) return;

  stopLocalCountdown();
  localRoundToken = token;
  countdownSeconds = COUNTRY_GUESS_WINDOW_SECONDS;
  countdownRunning = true;
  updateGuessCountdownDisplay(countdownSeconds);

  guessCountdownIntervalId = setInterval(() => {
    countdownSeconds = Math.max(0, countdownSeconds - 1);
    updateGuessCountdownDisplay(countdownSeconds);

    if (countdownSeconds <= 0) {
      onCountdownFinished();
    }
  }, 1000);
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

    if (playerName && choice && !COUNTRY_GUESS_STATE.userGuesses[String(activeCountry)]) {
      guessAutoSubmittedForToken = token;
      await autoSubmitCountryGuess(choice);
    }
  }

  renderGuessCountryList();
  renderAdminCountryList();
  updateGuessActiveInfo(0);
  updateAdminStatus(0);
}

function maybeStartCountdownFromServer() {
  if (isTimerRunning()) return;

  const token = Number(COUNTRY_GUESS_STATE.roundToken) || 0;
  if (!COUNTRY_GUESS_STATE.guessingOpen || token <= 0) return;
  if (localRoundToken === token) return;

  startLocalCountdownForRound(token);
  renderGuessCountryList();
  renderAdminCountryList();
}

function getCountryGuessStateSignature() {
  return JSON.stringify({
    activeCountry: COUNTRY_GUESS_STATE.activeCountry,
    guessingOpen: COUNTRY_GUESS_STATE.guessingOpen,
    roundToken: COUNTRY_GUESS_STATE.roundToken,
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

  const previousSignature = getCountryGuessStateSignature();
  await loadCountryGuessState();

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
  const nextState = getCountryGuessStateSignature();
  const parsedNext = JSON.parse(nextState);
  if (previousState.activeCountry !== parsedNext.activeCountry) {
    trimPendingGuessChoices(parsedNext.activeCountry);
    resetCountdownForNewCountry();
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
}

function getGuessPollIntervalMs() {
  return isTimerRunning() || COUNTRY_GUESS_STATE.guessingOpen ? 3000 : 12000;
}

function restartGuessStatePolling() {
  stopGuessStatePolling();
  if (!isGuessViewVisible() && !isInputViewVisible()) return;

  guessStatePollIntervalId = setInterval(() => {
    pollLiveGuessState();
  }, getGuessPollIntervalMs());
}

function startGuessStatePolling() {
  restartGuessStatePolling();
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
    ? `${formatGuessCountdown(seconds)} left · `
    : (isRoundFinishedLocally() ? "locked · " : "waiting for admin start · ");

  info.textContent =
    `Open country: Country ${COUNTRY_GUESS_STATE.activeCountry} · ${timerLabel}${COUNTRY_GUESS_STATE.guessCount}/${COUNTRY_GUESS_STATE.totalPlayers} guessed`;
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
      guessCount: Number(data.guessCount) || 0,
      totalPlayers: Number(data.totalPlayers) || COUNTRY_SHAPE_PLAYERS.length,
      guessedForActive: Array.isArray(data.guessedForActive) ? data.guessedForActive : [],
      userGuesses: data.userGuesses || {},
      correctAnswers: data.correctAnswers || {},
      countriesCompleted: Number(data.countriesCompleted) || 0,
      gameComplete: !!data.gameComplete
    };

    maybeStartCountdownFromServer();
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
  if (status === "done" && userChoice) return "";
  if (status === "done") return "Submitted";
  if (status === "active") return "Change anytime";
  if (status === "waiting") return "Waiting for timer";
  if (status === "up-next") return "Next · waiting for timer";
  if (status === "closed") return "Resolved";
  if (status === "missed" && userChoice) return "";
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
    const pendingChoice = getPendingGuessChoice(countryNumber);
    const displayChoice = userChoice || (status === "active" ? pendingChoice : null);
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
            const isSavedChoice = userChoice === choice && status !== "active";
            return `
            <label class="country-guess-option-label${isSavedChoice ? " country-guess-option-label-saved" : ""}">
              <input
                type="radio"
                name="guess-country-${countryNumber}"
                class="country-guess-option"
                value="${choice}"
                ${displayChoice === choice ? "checked" : ""}
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

function buildCountryShapeAdminStartTimerUrl(country) {
  return `${COUNTRY_SHAPE_API_URL}?eventId=${encodeURIComponent(COUNTRY_SHAPE_EVENT_ID)}&action=countryShapeAdminStartTimer&country=${encodeURIComponent(country)}`;
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
  updateAdminStatus();
  updateGuessActiveInfo();
  renderGuessCountryList();
  renderAdminCountryList();
}

async function refreshAdminSession() {
  await loadCountryGuessState();
  updateAdminStatus();
  renderAdminCountryList();
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

  if (COUNTRY_GUESS_STATE.userGuesses[String(activeCountry)]) {
    return;
  }

  if (!choice) {
    showGuessMessage("err", `Time is up for Country ${activeCountry}. No option was selected.`);
    await refreshGuessSession();
    return;
  }

  await submitCountryGuess({ auto: true, choice });
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

  if (COUNTRY_GUESS_STATE.userGuesses[String(activeCountry)]) {
    if (!auto) showGuessMessage("ok", "You have already submitted your guess for this country.");
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

  const payload = {
    eventId: COUNTRY_SHAPE_EVENT_ID,
    voter: playerName,
    country: activeCountry,
    choice
  };

  try {
    guessSubmitInFlight = true;
    setSubmitCountryGuessButtonState(true);
    if (!auto) hideGuessMessage();

    const data = await jsonp(buildCountryShapeGuessSubmitUrl(payload));
    if (!isCountryShapeGuessSubmitSuccess(data)) {
      delete COUNTRY_GUESS_STATE.userGuesses[String(activeCountry)];
      showGuessMessage("err", data?.error || (auto ? "Auto-submit failed." : "Guess submission failed."));
      return false;
    }

    clearPendingGuessChoice(activeCountry);
    COUNTRY_GUESS_STATE.userGuesses[String(activeCountry)] = choice;

    storeGuessVoter(playerName);
    lockGuessPlayerSelect();
    renderGuessCountryList();

    if (auto) {
      showGuessMessage("ok", `Final choice submitted for Country ${activeCountry}: option ${choice}.`);
    } else {
      showGuessMessage("ok", `Guess saved for Country ${activeCountry}: option ${choice}.`);
    }

    return true;
  } catch (e) {
    if (!auto) showGuessMessage("err", "Guess submission failed. Please check your connection.");
    console.error(e);
    return false;
  } finally {
    guessSubmitInFlight = false;
    setSubmitCountryGuessButtonState(false);
    updateGuessSubmitButtonState();
  }
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

  try {
    adminTimerStarting = true;
    hideInputMessage();
    const btn = document.getElementById(`admin-start-timer-${countryNumber}`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = ADMIN_START_TIMER_SENDING_LABEL;
    }

    const data = await jsonp(buildCountryShapeAdminStartTimerUrl(countryNumber));
    if (!isCountryShapeAdminStartTimerSuccess(data)) {
      showInputMessage("err", data?.error || "Could not start timer.");
      renderAdminCountryList();
      return;
    }

    COUNTRY_GUESS_STATE.activeCountry = Number(data.activeCountry) || countryNumber;
    COUNTRY_GUESS_STATE.guessingOpen = true;
    COUNTRY_GUESS_STATE.roundToken = Number(data.roundToken) || 0;
    startLocalCountdownForRound(COUNTRY_GUESS_STATE.roundToken);
    renderAdminCountryList();
    renderGuessCountryList();
    updateAdminStatus();
    updateGuessActiveInfo();
    restartGuessStatePolling();
    showInputMessage("ok", `Timer started for Country ${countryNumber}. ${COUNTRY_GUESS_WINDOW_SECONDS} seconds.`);
  } catch (e) {
    showInputMessage("err", "Could not start timer. Please check your connection.");
    console.error(e);
    renderAdminCountryList();
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
    await loadCountryGuessState();
    updateAdminStatus();
    renderAdminCountryList();
    renderGuessCountryList();

    if (data.gameComplete) {
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
        updateGuessSubmitButtonState();
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
