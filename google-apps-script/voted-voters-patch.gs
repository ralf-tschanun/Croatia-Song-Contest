// Paste into your existing Google Apps Script and include votedVoters in the results response.
// Example:
// return json_({
//   ok: true,
//   votingCount: votingCount,
//   votedVoters: getVotedVoters_(eventId),
//   results: results
// });

function getVotedVoters_(eventId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Votes");
  if (!sheet) return [];

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => String(h).trim().toLowerCase());
  const voterIdx = headers.indexOf("voter");
  const eventIdx = headers.indexOf("eventid");
  if (voterIdx < 0) return [];

  const voters = new Set();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (eventIdx >= 0 && String(row[eventIdx]).trim() !== String(eventId).trim()) continue;

    const voter = String(row[voterIdx] || "").trim();
    if (voter) voters.add(voter);
  }

  return Array.from(voters).sort((a, b) => a.localeCompare(b, "de"));
}
