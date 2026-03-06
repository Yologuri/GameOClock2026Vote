// ── Google Apps Script Backend for Vote Board ──
// Paste this entire file into your Apps Script editor

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    const year = data.year || new Date().getFullYear();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let result;

    if (action === "addOption") {
      result = addOption(ss, data.option, year);
    } else if (action === "submitVotes") {
      result = submitVotes(ss, data.votes, year);
    } else if (action === "updateParticipant") {
      result = updateParticipant(ss, data.gamertag, data.completedGames, year);
    } else {
      result = { success: false, error: "Unknown action" };
    }

    return jsonResponse(result);
  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    const callback = e.parameter.callback; // JSONP callback name
    const year = e.parameter.year || new Date().getFullYear();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let result;

    if (action === "getOptions") {
      result = getOptions(ss, year);
    } else if (action === "getResults") {
      result = getResults(ss, year);
    } else if (action === "getParticipants") {
      result = getParticipants(ss, year);
    } else {
      result = { success: false, error: "Unknown action" };
    }

    // If a JSONP callback was requested, wrap in it -- this bypasses CORS
    if (callback) {
      return ContentService
        .createTextOutput(callback + "(" + JSON.stringify(result) + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResponse(result);
  } catch(err) {
    const callback = e.parameter.callback;
    const errResult = { success: false, error: err.message };
    if (callback) {
      return ContentService
        .createTextOutput(callback + "(" + JSON.stringify(errResult) + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResponse(errResult);
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Options ──

function addOption(ss, option, year) {
  if (!option || option.trim() === "") {
    return { success: false, error: "Empty option" };
  }
  const sheet = getOrCreateSheet(ss, "Options_" + year);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Timestamp", "Option"]);
  }
  sheet.appendRow([new Date(), option.trim()]);
  return { success: true };
}

function getOptions(ss, year) {
  const sheet = getOrCreateSheet(ss, "Options_" + year);
  const last = sheet.getLastRow();
  if (last <= 1) return { success: true, options: [] };
  const data = sheet.getRange(2, 2, last - 1, 1).getValues();
  const options = data.map(r => r[0]).filter(v => v !== "");
  return { success: true, options };
}

// ── Votes ──

function submitVotes(ss, votes, year) {
  const sheet = getOrCreateSheet(ss, "Votes_" + year);
  if (sheet.getLastRow() === 0) {
    const headers = ["Timestamp", ...votes.map(v => v.name)];
    sheet.appendRow(headers);
  }
  const row = [new Date(), ...votes.map(v => v.votes)];
  sheet.appendRow(row);
  return { success: true };
}

function getResults(ss, year) {
  const sheet = getOrCreateSheet(ss, "Votes_" + year);
  const last = sheet.getLastRow();
  if (last <= 1) return { success: true, results: [] };
  const headers = sheet.getRange(1, 2, 1, sheet.getLastColumn() - 1).getValues()[0];
  const totals = new Array(headers.length).fill(0);
  if (last >= 2) {
    const voteData = sheet.getRange(2, 2, last - 1, headers.length).getValues();
    voteData.forEach(row => {
      row.forEach((v, i) => { totals[i] += Number(v) || 0; });
    });
  }
  const results = headers.map((name, i) => ({ name, votes: totals[i] }));
  return { success: true, results };
}

// ── Participants ──

function updateParticipant(ss, gamertag, completedGames, year) {
  if (!gamertag || gamertag.trim() === "") {
    return { success: false, error: "Empty gamertag" };
  }
  gamertag = gamertag.trim();
  completedGames = completedGames || [];

  const sheet = getOrCreateSheet(ss, "Participants_" + year);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["Gamertag", "CompletedGames", "LastUpdated"]);
  }

  // Find existing row for this gamertag (upsert)
  const last = sheet.getLastRow();
  let existingRow = -1;
  if (last >= 2) {
    const tags = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < tags.length; i++) {
      if (String(tags[i][0]).toLowerCase() === gamertag.toLowerCase()) {
        existingRow = i + 2; // 1-indexed, skip header
        break;
      }
    }
  }

  const gamesJson = JSON.stringify(completedGames);

  if (existingRow > 0) {
    // Update existing row
    sheet.getRange(existingRow, 1, 1, 3).setValues([[gamertag, gamesJson, new Date()]]);
  } else {
    // Append new row
    sheet.appendRow([gamertag, gamesJson, new Date()]);
  }

  return { success: true };
}

function getParticipants(ss, year) {
  const sheet = getOrCreateSheet(ss, "Participants_" + year);
  const last = sheet.getLastRow();
  if (last <= 1) return { success: true, participants: [] };

  const data = sheet.getRange(2, 1, last - 1, 2).getValues();
  const participants = data
    .filter(r => r[0] !== "")
    .map(r => {
      let completedGames = [];
      try {
        completedGames = JSON.parse(r[1]) || [];
      } catch(e) {
        completedGames = [];
      }
      return { gamertag: String(r[0]), completedGames };
    });

  return { success: true, participants };
}

// ── Utility ──

function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}
