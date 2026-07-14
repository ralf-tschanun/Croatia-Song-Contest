// Country by Shape — separate config (shared API only)
const COUNTRY_SHAPE_API_URL = "https://script.google.com/macros/s/AKfycbztW0CA05fRAwg9U8ijYCWukgHlJUQY4rxLIZ2wFiT5Ox_v-K_lOn43GVm5ujWYeQav/exec";
const COUNTRY_SHAPE_EVENT_ID = "country-by-shape-2026";

let COUNTRY_SHAPE_PLAYERS = [];

const COUNTRY_COUNT = 20;
const COUNTRY_POINT_POOL = 20;
const SUBMIT_COUNTRY_RESULT_LABEL = "Submit result";
const SUBMIT_COUNTRY_SENDING_LABEL = "⏳ submitting...";
const REFRESH_COUNTRY_RESULTS_LABEL = "Refresh results";
const REFRESH_COUNTRY_RESULTS_LOADING_LABEL = "⏳ loading...";
const COUNTRY_ALREADY_SUBMITTED_MSG = "This person has already submitted a result. Select the next player to continue.";

let COUNTRY_SHAPE_SUBMISSIONS = [];
let COUNTRY_SUBMITTED_VOTERS = [];

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
  document.getElementById("inputView").style.display = "block";
  document.getElementById("resultView").style.display = "none";
  setActiveTab("input");

  const currentPlayer = document.getElementById("playerName").value.trim();
  refreshCountryShapeSession({ selectedPlayerName: currentPlayer });
}

const COUNTRY_API_NOT_DEPLOYED_MSG = "Country by Shape is not active on the API yet. Open YOUR_WEB_APP_URL?action=apiInfo — you should see version \"2026-07-14-country-shape\". If not: replace ALL of Code.gs with google-apps-script/Code.gs, then Deploy → Manage deployments → Edit → New version → Deploy.";

function isCountryShapeApiActive(data) {
  return data?.ok === true && data?.action === "apiInfo" &&
    Array.isArray(data?.features) && data.features.includes("countryShapeSubmit");
}

function isCountryShapeSubmitSuccess(data) {
  return data?.ok === true && data?.action === "countryShape";
}

function isCountryShapeResultsSuccess(data) {
  return data?.ok === true && data?.action === "countryShapeResults";
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = "countryShapeJsonp_" + Date.now() + "_" + Math.floor(Math.random() * 100000);

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

function setSubmitCountryButtonState(isSending) {
  const btn = document.getElementById("submitCountryResultBtn");
  if (!btn) return;
  if (!isSending && btn.classList.contains("completed")) return;
  btn.disabled = isSending;
  btn.textContent = isSending ? SUBMIT_COUNTRY_SENDING_LABEL : SUBMIT_COUNTRY_RESULT_LABEL;
}

function setRefreshCountryResultsButtonState(isLoading) {
  const btn = document.getElementById("refreshResultBtn");
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? REFRESH_COUNTRY_RESULTS_LOADING_LABEL : REFRESH_COUNTRY_RESULTS_LABEL;
}

function getSelectedCorrectCountries() {
  return Array.from(document.querySelectorAll(".country-correct-checkbox:checked"))
    .map(checkbox => Number(checkbox.dataset.country))
    .filter(country => Number.isInteger(country) && country >= 1 && country <= COUNTRY_COUNT)
    .sort((a, b) => a - b);
}

function hasCountryShapePlayerSubmitted(playerName) {
  const key = normalizePlayerName(playerName);
  if (!key) return false;
  return COUNTRY_SUBMITTED_VOTERS.some(name => normalizePlayerName(name) === key);
}

function getCountryShapeSubmission(playerName) {
  const key = normalizePlayerName(playerName);
  return COUNTRY_SHAPE_SUBMISSIONS.find(entry => normalizePlayerName(entry.voter) === key) || null;
}

function addCountryShapeSubmission(submission) {
  const voter = String(submission?.voter || "").trim();
  if (!voter) return;

  COUNTRY_SHAPE_SUBMISSIONS = COUNTRY_SHAPE_SUBMISSIONS.filter(
    entry => normalizePlayerName(entry.voter) !== normalizePlayerName(voter)
  );
  COUNTRY_SHAPE_SUBMISSIONS.push({
    voter,
    correctCountries: Array.isArray(submission.correctCountries) ? submission.correctCountries : []
  });

  if (!hasCountryShapePlayerSubmitted(voter)) {
    COUNTRY_SUBMITTED_VOTERS.push(voter);
    COUNTRY_SUBMITTED_VOTERS.sort((a, b) => a.localeCompare(b, "de"));
  }
}

function getNextPendingPlayer(currentPlayerName = "") {
  const startIndex = currentPlayerName
    ? Math.max(0, COUNTRY_SHAPE_PLAYERS.findIndex(name => name === currentPlayerName) + 1)
    : 0;

  for (let index = startIndex; index < COUNTRY_SHAPE_PLAYERS.length; index++) {
    const playerName = COUNTRY_SHAPE_PLAYERS[index];
    if (!hasCountryShapePlayerSubmitted(playerName)) return playerName;
  }

  for (let index = 0; index < startIndex; index++) {
    const playerName = COUNTRY_SHAPE_PLAYERS[index];
    if (!hasCountryShapePlayerSubmitted(playerName)) return playerName;
  }

  return "";
}

function resetCountryShapeForm({ playerName = "" } = {}) {
  document.querySelectorAll(".country-correct-checkbox").forEach(checkbox => {
    checkbox.checked = false;
    checkbox.disabled = false;
  });

  const btn = document.getElementById("submitCountryResultBtn");
  btn.textContent = SUBMIT_COUNTRY_RESULT_LABEL;
  btn.classList.remove("completed");
  btn.disabled = false;

  document.getElementById("playerName").disabled = false;
  document.getElementById("playerName").value = playerName;
  updateCorrectCounter();
}

function setCountryShapeReadOnlyUI(playerName) {
  const submission = getCountryShapeSubmission(playerName);
  const selected = new Set((submission?.correctCountries || []).map(Number));

  document.querySelectorAll(".country-correct-checkbox").forEach(checkbox => {
    checkbox.checked = selected.has(Number(checkbox.dataset.country));
    checkbox.disabled = true;
  });

  const btn = document.getElementById("submitCountryResultBtn");
  btn.textContent = "✅ Already submitted";
  btn.classList.add("completed");
  btn.disabled = true;

  document.getElementById("playerName").disabled = false;
  updateCorrectCounter();
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
    return;
  }

  try {
    const data = await jsonp(`${COUNTRY_SHAPE_API_URL}?eventId=${encodeURIComponent(COUNTRY_SHAPE_EVENT_ID)}&action=config`);
    COUNTRY_SHAPE_PLAYERS = data.voters || [];

    if (COUNTRY_SHAPE_PLAYERS.length === 0) {
      showInputMessage("err", "No players found. Please fill in the 'Teilnehmer' tab in the Google Sheet.");
    }
  } catch (e) {
    showInputMessage("err", "Could not load players from Google Sheets.");
    console.error(e);
  }
}

async function loadCountryShapeSubmissions() {
  if (!COUNTRY_SHAPE_API_URL) return;

  try {
    const data = await jsonp(`${COUNTRY_SHAPE_API_URL}?eventId=${encodeURIComponent(COUNTRY_SHAPE_EVENT_ID)}&action=countryShapeResults`);

    if (!isCountryShapeResultsSuccess(data)) {
      console.warn("Country by Shape results endpoint is not available on the deployed API.", data);
      COUNTRY_SHAPE_SUBMISSIONS = [];
      COUNTRY_SUBMITTED_VOTERS = [];
      return;
    }

    COUNTRY_SHAPE_SUBMISSIONS = Array.isArray(data.submissions) ? data.submissions : [];
    COUNTRY_SUBMITTED_VOTERS = Array.isArray(data.submittedVoters) ? data.submittedVoters : [];
  } catch (e) {
    console.warn("Could not load Country by Shape submissions", e);
    COUNTRY_SHAPE_SUBMISSIONS = [];
    COUNTRY_SUBMITTED_VOTERS = [];
  }
}

function renderCountryList() {
  const container = document.getElementById("countryList");

  container.innerHTML = Array.from({ length: COUNTRY_COUNT }, (_, index) => {
    const countryNumber = index + 1;
    const countryId = `country-${countryNumber}`;
    const checkboxId = `country-correct-${countryNumber}`;

    return `
      <div class="country-row">
        <span class="country-label" id="${countryId}">Country ${countryNumber}</span>
        <label class="country-correct-label" for="${checkboxId}">
          <input type="checkbox" id="${checkboxId}" class="country-correct-checkbox" data-country="${countryNumber}" />
          <span>correct</span>
        </label>
      </div>
    `;
  }).join("");

  bindCountryCheckboxEvents();
  updateCorrectCounter();
}

function getCorrectCount() {
  return getSelectedCorrectCountries().length;
}

function updateCorrectCounter() {
  const counter = document.getElementById("correctCounter");
  if (!counter) return;

  const correctCount = getCorrectCount();
  counter.textContent = `${correctCount}/${COUNTRY_COUNT} correct`;
}

function bindCountryCheckboxEvents() {
  document.querySelectorAll(".country-correct-checkbox").forEach(checkbox => {
    checkbox.addEventListener("change", updateCorrectCounter);
  });
}

function fillPlayerSelect(selectedPlayerName = "") {
  const sel = document.getElementById("playerName");
  const pendingPlayers = COUNTRY_SHAPE_PLAYERS.filter(name => !hasCountryShapePlayerSubmitted(name));
  const defaultPlayer = selectedPlayerName || pendingPlayers[0] || "";

  sel.disabled = false;
  sel.innerHTML =
    '<option value="">Please select a player</option>' +
    COUNTRY_SHAPE_PLAYERS.map(name => {
      const submitted = hasCountryShapePlayerSubmitted(name);
      const suffix = submitted ? " ✅" : "";
      return `<option value="${escapeHtml(name)}">${escapeHtml(name)}${suffix}</option>`;
    }).join("");

  sel.value = defaultPlayer;
  handlePlayerSelection();
}

function handlePlayerSelection() {
  const playerName = document.getElementById("playerName").value.trim();

  if (!playerName) {
    resetCountryShapeForm();
    hideInputMessage();
    return;
  }

  if (hasCountryShapePlayerSubmitted(playerName)) {
    setCountryShapeReadOnlyUI(playerName);
    showInputMessage("ok", COUNTRY_ALREADY_SUBMITTED_MSG);
    return;
  }

  resetCountryShapeForm({ playerName });
  hideInputMessage();
}

async function refreshCountryShapeSession({ selectedPlayerName = "" } = {}) {
  await loadCountryShapeSubmissions();
  fillPlayerSelect(selectedPlayerName);
}

function buildCountryShapeSubmitUrl(payload) {
  const countries = (payload.correctCountries || []).join(",");
  return `${COUNTRY_SHAPE_API_URL}?eventId=${encodeURIComponent(payload.eventId)}&action=countryShapeSubmit&voter=${encodeURIComponent(payload.voter)}&correctCountries=${encodeURIComponent(countries)}`;
}

async function submitCountryResult() {
  const playerName = document.getElementById("playerName").value.trim();
  const correctCountries = getSelectedCorrectCountries();

  if (!playerName) {
    showInputMessage("err", "Please select a player before submitting.");
    return;
  }

  if (hasCountryShapePlayerSubmitted(playerName)) {
    handlePlayerSelection();
    return;
  }

  if (!COUNTRY_SHAPE_API_URL) {
    showInputMessage("err", "API_URL is not configured yet.");
    return;
  }

  const payload = {
    eventId: COUNTRY_SHAPE_EVENT_ID,
    voter: playerName,
    correctCountries
  };

  try {
    setSubmitCountryButtonState(true);

    const data = await jsonp(buildCountryShapeSubmitUrl(payload));

    if (!isCountryShapeSubmitSuccess(data)) {
      if (data?.ok === true && data?.results) {
        showInputMessage("err", COUNTRY_API_NOT_DEPLOYED_MSG.replace("YOUR_WEB_APP_URL", COUNTRY_SHAPE_API_URL));
        return;
      }

      showInputMessage("err", data?.error || "Submission failed.");
      return;
    }

    await loadCountryShapeSubmissions();

    if (!hasCountryShapePlayerSubmitted(playerName)) {
      showInputMessage("err", "Submission was accepted by the API but not stored. Please redeploy google-apps-script/Code.gs and try again.");
      return;
    }

    const nextPlayer = getNextPendingPlayer(playerName);
    const submitCount = COUNTRY_SUBMITTED_VOTERS.length;
    const playerTotal = COUNTRY_SHAPE_PLAYERS.length;

    if (nextPlayer) {
      fillPlayerSelect(nextPlayer);
      showInputMessage(
        "ok",
        `${playerName} saved (${correctCountries.length}/${COUNTRY_COUNT} correct). ${submitCount}/${playerTotal} done — continue with ${nextPlayer}.`
      );
    } else {
      setCountryShapeReadOnlyUI(playerName);
      showInputMessage(
        "ok",
        `${playerName} saved (${correctCountries.length}/${COUNTRY_COUNT} correct). All ${playerTotal} players are done.`
      );
    }

  } catch (e) {
    showInputMessage("err", "Submission failed. Please check your connection.");
    console.error(e);
  } finally {
    setSubmitCountryButtonState(false);
  }
}

function formatCountryPoints(points) {
  const rounded = Math.round(points * 100) / 100;
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2);
}

function buildCountryCorrectCounts(submissions) {
  const counts = {};
  for (let country = 1; country <= COUNTRY_COUNT; country++) {
    counts[country] = 0;
  }

  submissions.forEach(submission => {
    (submission.correctCountries || []).forEach(country => {
      const countryNumber = Number(country);
      if (countryNumber >= 1 && countryNumber <= COUNTRY_COUNT) {
        counts[countryNumber]++;
      }
    });
  });

  return counts;
}

function calculateCountryShapeRankings(submissions) {
  const countryCorrectCounts = buildCountryCorrectCounts(submissions);
  const allPlayers = COUNTRY_SHAPE_PLAYERS.map(name => String(name).trim()).filter(Boolean);
  const submissionByPlayer = {};

  submissions.forEach(submission => {
    submissionByPlayer[submission.voter] = submission;
  });

  const rankings = allPlayers.map(playerName => {
    const submission = submissionByPlayer[playerName];
    let points = 0;

    if (submission) {
      (submission.correctCountries || []).forEach(country => {
        const countryNumber = Number(country);
        const correctCount = countryCorrectCounts[countryNumber] || 0;
        if (correctCount > 0) {
          points += COUNTRY_POINT_POOL / correctCount;
        }
      });
    }

    return {
      playerName,
      points,
      submitted: !!submission,
      correctCount: submission ? submission.correctCountries.length : 0
    };
  });

  rankings.sort((a, b) => b.points - a.points || a.playerName.localeCompare(b.playerName, "de"));
  return rankings;
}

function renderCountryResults(data) {
  const container = document.getElementById("countryResults");
  const submissions = Array.isArray(data.submissions) ? data.submissions : [];
  const rankings = calculateCountryShapeRankings(submissions);
  const submitCount = Number(data.submitCount ?? submissions.length) || 0;
  const playerTotal = COUNTRY_SHAPE_PLAYERS.length;
  const maxPoints = Math.max(1, ...rankings.map(entry => entry.points || 0));

  container.innerHTML = `
    <div class="result-stats">
      <div class="stat">
        <div class="stat-inline">
          <b>${submitCount} / ${playerTotal}</b>
          <span class="stat-label">Results submitted</span>
        </div>
      </div>
      <div class="stat">
        <div class="stat-inline">
          <b>${COUNTRY_POINT_POOL}</b>
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
              ${entry.submitted ? `<span class="small country-result-meta">${entry.correctCount}/${COUNTRY_COUNT} correct</span>` : `<span class="small country-result-meta">not submitted</span>`}
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

      COUNTRY_SHAPE_SUBMISSIONS = Array.isArray(data.submissions) ? data.submissions : [];
      COUNTRY_SUBMITTED_VOTERS = Array.isArray(data.submittedVoters) ? data.submittedVoters : [];
      renderCountryResults(data || {});
    })
    .catch(() => {
      document.getElementById("countryResults").innerHTML =
        `<p class="msg err" style="display:block">Results could not be loaded.</p>`;
    })
    .finally(() => setRefreshCountryResultsButtonState(false));
}

function setActiveTab(tab) {
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
  document.getElementById("inputView").style.display = "none";
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

  await loadPlayers();

  const apiReady = await checkCountryShapeApiDeployment();
  if (!apiReady) {
    showInputMessage("err", COUNTRY_API_NOT_DEPLOYED_MSG.replace("YOUR_WEB_APP_URL", COUNTRY_SHAPE_API_URL));
  }

  renderCountryList();
  document.getElementById("playerName").addEventListener("change", handlePlayerSelection);
  await refreshCountryShapeSession();
}

init();
