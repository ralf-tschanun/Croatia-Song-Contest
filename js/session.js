// Shared login across all A'Croatia 2026 pages/games.
// Persists in localStorage until the user clears site data or uses ?reset=1.

const ACROATIA_LOGGED_IN_VOTER_KEY = "acroatia-2026:loggedInVoter";

let pendingLoginVoter = "";
let loginConfirmCallback = null;

function getLoggedInVoter() {
  return String(localStorage.getItem(ACROATIA_LOGGED_IN_VOTER_KEY) || "").trim();
}

function hasLoggedInVoter() {
  return !!getLoggedInVoter();
}

function setLoggedInVoter(name) {
  const voter = String(name || "").trim();
  if (!voter) return;
  localStorage.setItem(ACROATIA_LOGGED_IN_VOTER_KEY, voter);
}

function clearLoggedInVoter() {
  localStorage.removeItem(ACROATIA_LOGGED_IN_VOTER_KEY);
}

function migrateLegacyLoggedInVoter() {
  if (hasLoggedInVoter()) return;

  try {
    if (typeof hasLocalFinalVote === "function" && hasLocalFinalVote() && typeof getStoredVoter === "function") {
      const voter = getStoredVoter();
      if (voter) {
        setLoggedInVoter(voter);
        return;
      }
    }
    if (typeof hasLocalBestEverSubmit === "function" && hasLocalBestEverSubmit() && typeof getStoredBestEverVoter === "function") {
      const voter = getStoredBestEverVoter();
      if (voter) setLoggedInVoter(voter);
    }
  } catch (e) {
    console.warn("Could not migrate legacy logged-in voter", e);
  }
}

function openLoginConfirmModal(voterName, onResult) {
  pendingLoginVoter = String(voterName || "").trim();
  loginConfirmCallback = typeof onResult === "function" ? onResult : null;

  const nameEl = document.getElementById("loginConfirmVoterName");
  if (nameEl) nameEl.textContent = pendingLoginVoter;

  const overlay = document.getElementById("loginConfirmOverlay");
  if (overlay) overlay.style.display = "flex";
}

function closeLoginConfirmModal() {
  const overlay = document.getElementById("loginConfirmOverlay");
  if (overlay) overlay.style.display = "none";
  pendingLoginVoter = "";
  loginConfirmCallback = null;
}

function confirmLoginYes() {
  const voter = pendingLoginVoter;
  const callback = loginConfirmCallback;
  if (!voter) {
    closeLoginConfirmModal();
    return;
  }

  setLoggedInVoter(voter);
  closeLoginConfirmModal();
  if (callback) callback(true, voter);
}

function cancelLoginConfirm() {
  const callback = loginConfirmCallback;
  closeLoginConfirmModal();
  if (callback) callback(false, "");
}

function applyLoggedInVoterToSelect(selectId, voters) {
  migrateLegacyLoggedInVoter();

  const sel = document.getElementById(selectId);
  if (!sel) return false;

  const voter = getLoggedInVoter();
  if (!voter) return false;

  const list = Array.isArray(voters) ? voters : [];
  if (!list.includes(voter)) return false;

  sel.value = voter;
  sel.disabled = true;
  return true;
}

function bindLoginSelect(selectId, { onLocked } = {}) {
  const sel = document.getElementById(selectId);
  if (!sel || sel.dataset.loginBound === "true") return;
  sel.dataset.loginBound = "true";

  sel.addEventListener("change", () => {
    const name = String(sel.value || "").trim();
    if (!name) return;

    if (hasLoggedInVoter()) {
      sel.value = getLoggedInVoter();
      sel.disabled = true;
      return;
    }

    openLoginConfirmModal(name, (ok, voter) => {
      if (ok && voter) {
        sel.value = voter;
        sel.disabled = true;
        if (typeof onLocked === "function") onLocked(voter);
        return;
      }

      sel.selectedIndex = 0;
      sel.value = "";
    });
  });
}
