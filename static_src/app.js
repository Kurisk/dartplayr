// ES5 POLYFILLS FOR OLD IPADS
if (!Array.prototype.find) {
  Array.prototype.find = function(predicate) {
    if (this == null) throw new TypeError('Array.prototype.find called on null or undefined');
    if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
    var list = Object(this);
    var length = list.length >>> 0;
    var thisArg = arguments[1];
    var value;
    for (var i = 0; i < length; i++) {
      value = list[i];
      if (predicate.call(thisArg, value, i, list)) {
        return value;
      }
    }
    return undefined;
  };
}

if (!Array.prototype.findIndex) {
  Array.prototype.findIndex = function(predicate) {
    if (this == null) throw new TypeError('Array.prototype.findIndex called on null or undefined');
    if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');
    var list = Object(this);
    var length = list.length >>> 0;
    var thisArg = arguments[1];
    var value;
    for (var i = 0; i < length; i++) {
      value = list[i];
      if (predicate.call(thisArg, value, i, list)) {
        return i;
      }
    }
    return -1;
  };
}

if (!Array.prototype.includes) {
  Array.prototype.includes = function(searchElement, fromIndex) {
    var O = Object(this);
    var len = O.length >>> 0;
    if (len === 0) return false;
    var n = fromIndex | 0;
    var k = n >= 0 ? n : Math.max(0, len + n);
    while (k < len) {
      if (O[k] === searchElement || (searchElement !== searchElement && O[k] !== O[k])) {
        return true;
      }
      k++;
    }
    return false;
  };
}

// APPLICATION STATE
var state = {
  gameMode: 'cricket', // '01' or 'cricket'
  players: [],
  activePlayerIndex: 0,
  turnDarts: [], // Max 3 darts per turn: e.g. [{ value: 60, label: 'T20', multiplier: 3, num: 20 }]
  currentMultiplier: 1, // 1 = Single, 2 = Double, 3 = Triple
  isGameOver: false,
  winnerIndex: -1,
  
  // Game Configuration Options
  gameOptions: {
    startScore: 301,
    outRule: 'double-out' // 'double-out', 'straight-out', 'double-in-out'
  }
};

// UNDO/REDO HISTORIES
var undoStack = [];
var redoStack = [];

// CRICKET TARGET SEGS
var CRICKET_TARGETS = [20, 19, 18, 17, 16, 15, 25]; // 25 is Bullseye

// COMPATIBILITY LOGGING
function log(msg) {
  console.log("[Scoreboard] " + msg);
}

// ACCOUNT SYSTEM
var APP_STORAGE_PREFIX = "dartplayr";
var currentUser = null;
var authMode = "login";
var guestPlayers = [];
var guestMatches = [];

function normalizeAccountName(name) {
  return (name || "").trim().replace(/\s+/g, " ");
}

function setAuthMode(mode) {
  authMode = mode === "signup" ? "signup" : "login";
  var loginTab = document.getElementById("auth-tab-login");
  var signupTab = document.getElementById("auth-tab-signup");
  var submit = document.getElementById("auth-submit");
  var msg = document.getElementById("auth-message");
  if (loginTab) loginTab.className = authMode === "login" ? "auth-tab active" : "auth-tab";
  if (signupTab) signupTab.className = authMode === "signup" ? "auth-tab active" : "auth-tab";
  if (submit) submit.textContent = authMode === "login" ? "Log In" : "Create Account";
  if (msg) msg.textContent = "";
}

function setAuthMessage(message) {
  var msg = document.getElementById("auth-message");
  if (msg) msg.textContent = message || "";
}

function getCookie(name) {
  var parts = document.cookie ? document.cookie.split(";") : [];
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (part.substring(0, name.length + 1) === name + "=") {
      return decodeURIComponent(part.substring(name.length + 1));
    }
  }
  return "";
}

function apiRequest(url, options) {
  options = options || {};
  var headers = options.headers || {};
  headers["Content-Type"] = "application/json";
  headers["X-CSRFToken"] = getCookie("csrftoken");
  return fetch(url, {
    method: options.method || "GET",
    credentials: "same-origin",
    headers: headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  }).then(function(response) {
    return response.json().then(function(data) {
      if (!response.ok) {
        throw new Error(data.error || "Request failed.");
      }
      return data;
    });
  });
}

function applyServerData(data) {
  dbPlayers = data.profiles || [];
  dbMatches = data.matches || [];
  updateAutocompleteDatalist();
}

function handleAuthSubmit() {
  var nameInput = document.getElementById("auth-name");
  var passwordInput = document.getElementById("auth-password");
  var name = normalizeAccountName(nameInput ? nameInput.value : "");
  var password = passwordInput ? passwordInput.value : "";

  if (!name) {
    setAuthMessage("Enter a player name.");
    return;
  }

  if (password.length < 8) {
    setAuthMessage("Use a password with at least 8 characters.");
    return;
  }

  setAuthMessage("");
  apiRequest(authMode === "signup" ? "/api/register/" : "/api/login/", {
    method: "POST",
    body: { username: name, password: password }
  }).then(function(data) {
    activateAccount({ id: data.user.id, name: data.user.name });
    applyServerData(data);
    ensureAccountProfile();
    updateCurrentAccountLabel();
    populateDefaultPlayerName();
    showScreen("setup-screen");
  }).catch(function(error) {
    setAuthMessage(error.message);
  });
}

function continueAsGuest() {
  guestPlayers = [];
  guestMatches = [];
  activateAccount({
    id: "guest",
    name: "Guest",
    isGuest: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  });
}

function activateAccount(account) {
  currentUser = account;
  selectedProfileId = null;
  loadDatabase();
  updateCurrentAccountLabel();
  populateDefaultPlayerName();
  showScreen("setup-screen");
}

function logoutUser() {
  saveDatabase();
  if (!isGuestUser()) {
    apiRequest("/api/logout/", { method: "POST", body: {} }).catch(function(error) {
      log("Logout error: " + error.message);
    });
  }
  currentUser = null;
  selectedProfileId = null;
  showScreen("auth-screen");
}

function restoreActiveAccount() {
  apiRequest("/api/session/").then(function(data) {
    if (!data.authenticated) {
      showScreen("auth-screen");
      return;
    }
    currentUser = { id: data.user.id, name: data.user.name };
    applyServerData(data);
    ensureAccountProfile();
    updateCurrentAccountLabel();
    populateDefaultPlayerName();
    showScreen("setup-screen");
  }).catch(function() {
    showScreen("auth-screen");
  });
}

function showScreen(id) {
  var screens = document.querySelectorAll(".screen");
  for (var i = 0; i < screens.length; i++) {
    screens[i].classList.remove("active");
  }
  var screen = document.getElementById(id);
  if (screen) screen.classList.add("active");
}

function updateCurrentAccountLabel() {
  var label = document.getElementById("current-account-label");
  var warning = document.getElementById("guest-warning");
  var helper = document.getElementById("profiles-helper");
  if (label) label.textContent = currentUser ? (isGuestUser() ? "Playing as Guest" : "Signed in as " + currentUser.name) : "Not signed in";
  if (warning) warning.style.display = isGuestUser() ? "block" : "none";
  if (helper) {
    helper.textContent = isGuestUser()
      ? "Guest profiles are temporary and disappear when you leave the site."
      : "Profiles are created automatically from your account and player names used in games.";
  }
}

function getDatabaseKey(kind) {
  var userId = currentUser ? currentUser.id : "guest";
  return APP_STORAGE_PREFIX + "_" + userId + "_" + kind;
}

function isGuestUser() {
  return !!(currentUser && currentUser.id === "guest");
}

function getProfileColor(index) {
  var colors = ["#53d66a", "#e84f3f", "#f4b44e", "#4fb3ff", "#ec4899", "#a855f7"];
  return colors[index % colors.length];
}

function ensureAccountProfile() {
  if (!currentUser || isGuestUser()) return;
  var exists = dbPlayers.some(function(p) {
    return p.name.toLowerCase() === currentUser.name.toLowerCase();
  });
  if (!exists) {
    createPlayerProfile(currentUser.name, getProfileColor(0), true);
  }
}

function populateDefaultPlayerName() {
  var input = document.getElementById("player-name-0");
  if (!input || !currentUser || isGuestUser()) return;
  input.value = currentUser.name;
}

// SETUP SCREEN CONTROLS
var playerCounter = 2; // Default starting player count (Player 1 & Player 2)

function addPlayerRow() {
  if (playerCounter >= 4) {
    alert("Maximum of 4 players allowed!");
    return;
  }
  
  var container = document.getElementById("player-inputs-container");
  var newRow = document.createElement("div");
  newRow.className = "player-input-row";
  newRow.id = "p-row-" + playerCounter;
  
  var label = document.createElement("span");
  label.className = "player-num";
  label.textContent = "P" + (playerCounter + 1);
  
  var input = document.createElement("input");
  input.type = "text";
  input.id = "player-name-" + playerCounter;
  input.value = "Player " + (playerCounter + 1);
  input.placeholder = "Name";
  input.maxLength = 15;
  input.autocomplete = "off";
  input.setAttribute("list", "saved-players-list");
  
  var removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-remove";
  // Wrap index in closure for safety
  var idx = playerCounter;
  removeBtn.onclick = function() { removePlayerRow(idx); };
  removeBtn.textContent = "x";
  
  newRow.appendChild(label);
  newRow.appendChild(input);
  newRow.appendChild(removeBtn);
  container.appendChild(newRow);
  
  playerCounter++;
  
  // Hide add button if 4 players reached
  if (playerCounter === 4) {
    document.getElementById("btn-add-player").style.display = "none";
  }
}

function removePlayerRow(index) {
  var row = document.getElementById("p-row-" + index);
  if (row) {
    row.parentNode.removeChild(row);
  }
  
  // Shift subsequent rows
  for (var i = index + 1; i < playerCounter; i++) {
    var currentRow = document.getElementById("p-row-" + i);
    if (currentRow) {
      currentRow.id = "p-row-" + (i - 1);
      currentRow.querySelector(".player-num").textContent = "P" + i;
      var input = currentRow.querySelector("input");
      input.id = "player-name-" + (i - 1);
      if (input.value === "Player " + (i + 1)) {
        input.value = "Player " + i;
      }
      var removeBtn = currentRow.querySelector(".btn-remove");
      var nextIndex = i - 1;
      removeBtn.onclick = function() { removePlayerRow(nextIndex); };
    }
  }
  
  playerCounter--;
  document.getElementById("btn-add-player").style.display = "block";
}

function setGameMode(mode) {
  state.gameMode = mode;
  
  var btn01 = document.getElementById("mode-btn-01");
  var btnCricket = document.getElementById("mode-btn-cricket");
  var options01 = document.getElementById("options-01-container");
  
  if (mode === '01') {
    btn01.className = "btn btn-toggle active";
    btnCricket.className = "btn btn-toggle";
    options01.style.display = "block";
  } else {
    btn01.className = "btn btn-toggle";
    btnCricket.className = "btn btn-toggle active";
    options01.style.display = "none";
  }
}

// MULTIPLIER SELECTION
function setMultiplier(mult) {
  state.currentMultiplier = mult;
  
  var btnSingle = document.getElementById("mult-single");
  var btnDouble = document.getElementById("mult-double");
  var btnTriple = document.getElementById("mult-triple");
  
  btnSingle.className = "btn btn-mult";
  btnDouble.className = "btn btn-mult";
  btnTriple.className = "btn btn-mult";
  
  if (mult === 1) btnSingle.className = "btn btn-mult active";
  else if (mult === 2) btnDouble.className = "btn btn-mult active";
  else if (mult === 3) btnTriple.className = "btn btn-mult active";
}

// SAVE & RESTORE HISTORY STATE (For Undo/Redo)
function saveHistory() {
  // Deep clone state to save snapshot
  var snapshot = {
    gameMode: state.gameMode,
    players: JSON.parse(JSON.stringify(state.players)),
    activePlayerIndex: state.activePlayerIndex,
    turnDarts: JSON.parse(JSON.stringify(state.turnDarts)),
    currentMultiplier: state.currentMultiplier,
    isGameOver: state.isGameOver,
    winnerIndex: state.winnerIndex,
    gameOptions: Object.assign({}, state.gameOptions)
  };
  
  undoStack.push(snapshot);
  redoStack = []; // Reset redo stack on new action
  
  updateUndoRedoButtons();
}

function handleUndo() {
  if (undoStack.length === 0) return;
  
  // Save current state to redo stack
  var currentSnapshot = {
    gameMode: state.gameMode,
    players: JSON.parse(JSON.stringify(state.players)),
    activePlayerIndex: state.activePlayerIndex,
    turnDarts: JSON.parse(JSON.stringify(state.turnDarts)),
    currentMultiplier: state.currentMultiplier,
    isGameOver: state.isGameOver,
    winnerIndex: state.winnerIndex,
    gameOptions: Object.assign({}, state.gameOptions)
  };
  redoStack.push(currentSnapshot);
  
  // Restore previous state
  var prevSnapshot = undoStack.pop();
  state = prevSnapshot;
  
  log("Undid last action.");
  updateUI();
  updateUndoRedoButtons();
}

function handleRedo() {
  if (redoStack.length === 0) return;
  
  // Save current state to undo stack
  var currentSnapshot = {
    gameMode: state.gameMode,
    players: JSON.parse(JSON.stringify(state.players)),
    activePlayerIndex: state.activePlayerIndex,
    turnDarts: JSON.parse(JSON.stringify(state.turnDarts)),
    currentMultiplier: state.currentMultiplier,
    isGameOver: state.isGameOver,
    winnerIndex: state.winnerIndex,
    gameOptions: Object.assign({}, state.gameOptions)
  };
  undoStack.push(currentSnapshot);
  
  // Restore next state
  var nextSnapshot = redoStack.pop();
  state = nextSnapshot;
  
  log("Redid action.");
  updateUI();
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  var isUndoDisabled = (undoStack.length === 0);
  var isRedoDisabled = (redoStack.length === 0);
  
  var btnUndo01 = document.getElementById("btn-undo");
  var btnRedo01 = document.getElementById("btn-redo");
  var btnUndoCricket = document.getElementById("btn-cricket-undo");
  var btnRedoCricket = document.getElementById("btn-cricket-redo");
  
  if (btnUndo01) btnUndo01.disabled = isUndoDisabled;
  if (btnRedo01) btnRedo01.disabled = isRedoDisabled;
  if (btnUndoCricket) btnUndoCricket.disabled = isUndoDisabled;
  if (btnRedoCricket) btnRedoCricket.disabled = isRedoDisabled;
}

// GAME INITIALIZATION
function startGame() {
  if (!currentUser) {
    showScreen("auth-screen");
    return;
  }

  // Collect players names
  var playersList = [];
  for (var i = 0; i < playerCounter; i++) {
    var input = document.getElementById("player-name-" + i);
    var name = input ? input.value.trim() : "";
    if (name === "") name = "Player " + (i + 1);
    
    // Database Profile Integration
    var profile = dbPlayers.find(function(p) { return p.name.toLowerCase() === name.toLowerCase(); });
    if (!profile) {
      // Auto-create a profile! Use a consistent color scheme based on index
      profile = createPlayerProfile(name, getProfileColor(i));
    }
    
    // Build initial player object
    var player = {
      name: profile.name, // Use the official cased profile name
      profileId: profile.id,
      score: 0,
      totalDartsThrown: 0,
      totalTurns: 0,
      
      // Stats tracking for current match
      turnScores: [],
      ton100: 0,
      ton140: 0,
      ton180: 0,
      cricketStatsMarks: 0,
      bustCount: 0,
      lastTurnBust: false,
      
      // '01 specific
      isIn: false, // For Double-In games
      scoreHistory: [], // Turn-by-turn remaining score history
      
      // Cricket specific
      cricketMarks: {
        20: 0,
        19: 0,
        18: 0,
        17: 0,
        16: 0,
        15: 0,
        25: 0 // Bullseye
      },
      cricketMarksTotal: 0
    };
    
    playersList.push(player);
  }
  
  // Read Game Settings
  state.players = playersList;
  state.activePlayerIndex = 0;
  state.turnDarts = [];
  state.isGameOver = false;
  state.winnerIndex = -1;
  state.currentMultiplier = 1;
  
  undoStack = [];
  redoStack = [];
  
  if (state.gameMode === '01') {
    var scoreVal = parseInt(document.getElementById("start-score-select").value, 10);
    var outRule = document.getElementById("out-rule-select").value;
    
    state.gameOptions.startScore = scoreVal;
    state.gameOptions.outRule = outRule;
    
    // Set starting scores
    for (var i = 0; i < state.players.length; i++) {
      state.players[i].score = scoreVal;
    }
  } else {
    // Cricket scores start at 0
    for (var i = 0; i < state.players.length; i++) {
      state.players[i].score = 0;
    }
  }
  
  // Transition Screens
  document.getElementById("setup-screen").className = "screen";
  document.getElementById("game-screen").className = "screen active";
  
  // Update Title Displays
  updateGameTitle();
  
  // Draw layout
  updateUI();
  updateUndoRedoButtons();
  
  log("Game started: " + state.gameMode.toUpperCase() + " with " + state.players.length + " players.");
}

function updateGameTitle() {
  var display = document.getElementById("game-title-display");
  if (state.gameMode === '01') {
    var ruleText = "Double Out";
    if (state.gameOptions.outRule === 'straight-out') ruleText = "Straight Out";
    else if (state.gameOptions.outRule === 'double-in-out') ruleText = "Double In / Out";
    
    display.textContent = state.gameOptions.startScore + " - " + ruleText;
  } else {
    display.textContent = "Standard Cricket";
  }
}

// SCORE ADDITION / DART INPUT HANDLING
function enterDart(baseNum) {
  if (state.isGameOver) return;
  
  // 1. Validate multiplier for Bull
  var multiplier = state.currentMultiplier;
  if (baseNum === 25) {
    // In darts, Bullseye can only be Single Bull (25) or Double Bull (50).
    // Triple Bull is not possible.
    if (multiplier === 3) multiplier = 2; // Treat Triple Bull as Double Bull
  }
  
  var dartValue = baseNum * multiplier;
  
  // Get label for display
  var dartLabel = "";
  if (baseNum === 0) {
    dartLabel = "Miss";
  } else if (baseNum === 25) {
    dartLabel = multiplier === 2 ? "DBull" : "Bull";
  } else {
    var multPrefix = multiplier === 3 ? "T" : (multiplier === 2 ? "D" : "");
    dartLabel = multPrefix + baseNum;
  }
  
  log("Dart Thrown: " + dartLabel + " (Value: " + dartValue + ")");
  
  // Save history state before executing the dart
  saveHistory();
  
  // Process dart scoring
  var activePlayer = state.players[state.activePlayerIndex];
  
  var dartDetails = {
    value: dartValue,
    label: dartLabel,
    multiplier: multiplier,
    num: baseNum
  };
  
  state.turnDarts.push(dartDetails);
  activePlayer.totalDartsThrown++;
  
  if (state.gameMode === '01') {
    process01Dart(activePlayer, dartDetails);
  } else {
    processCricketDart(activePlayer, dartDetails);
  }
  
  // Reset multiplier selector back to single for the next dart
  setMultiplier(1);
  
  // Update view
  updateUI();
}

// CRICKET MULTI-TAP INPUT BUFFER
function enterDartWithMultiplier(baseNum, multiplier) {
  if (state.isGameOver) return;
  
  var dartValue = baseNum * multiplier;
  
  var dartLabel = "";
  if (baseNum === 0) {
    dartLabel = "Miss";
  } else if (baseNum === 25) {
    dartLabel = multiplier === 2 ? "DBull" : "Bull";
  } else {
    var multPrefix = multiplier === 3 ? "T" : (multiplier === 2 ? "D" : "");
    dartLabel = multPrefix + baseNum;
  }
  
  log("Cricket Grid Dart: " + dartLabel + " (Value: " + dartValue + ")");
  
  saveHistory();
  
  var activePlayer = state.players[state.activePlayerIndex];
  var dartDetails = {
    value: dartValue,
    label: dartLabel,
    multiplier: multiplier,
    num: baseNum
  };
  
  state.turnDarts.push(dartDetails);
  activePlayer.totalDartsThrown++;
  
  processCricketDart(activePlayer, dartDetails);
  
  updateUI();
}

// 01 DART LOGIC
function process01Dart(player, dart) {
  var rule = state.gameOptions.outRule;
  
  // If Double-In rule applies and player is NOT yet "in"
  if (rule === 'double-in-out' && !player.isIn) {
    if (dart.multiplier === 2) {
      player.isIn = true;
      player.score -= dart.value;
      log(player.name + " is IN with " + dart.label);
    } else {
      // Misses/Singles/Triples do not subtract points until player is "in"
      log(player.name + " must hit double to enter. Recorded " + dart.label + " as 0 pts.");
    }
  } else {
    // Normal scoring subtraction
    player.score -= dart.value;
  }
  
  // Check for Bust / Win Conditions
  var isOutDouble = (rule === 'double-out' || rule === 'double-in-out');
  
  if (player.score === 0) {
    // Win check
    if (isOutDouble) {
      if (dart.multiplier === 2) {
        // Correct double-out! Player wins.
        handleGameWin();
      } else {
        // Hit zero, but not on a double. Bust!
        handleBust(player);
      }
    } else {
      // Straight-out. Any hit to 0 wins.
      handleGameWin();
    }
  } else if (player.score < 0 || (isOutDouble && player.score === 1)) {
    // Score went negative or to exactly 1 (cannot check out on a double with 1 remaining). Bust!
    handleBust(player);
  }
  
  // Auto-switch turns after 3 darts thrown
  if (!state.isGameOver && state.turnDarts.length === 3) {
    endTurn();
  }
}

function handleBust(player) {
  player.score = getPreviousTurnScore(player); // Reset to turn-start score
  player.bustCount++;
  player.lastTurnBust = true; // Set bust flag
  log(player.name + " busted! Score reset to " + player.score);
  
  // Highlight remaining slot tags as bust
  for (var i = 0; i < 3; i++) {
    var slot = document.getElementById("dart-slot-" + i);
    if (slot) slot.className = "dart-slot bust";
  }
  
  // Force end of turn
  setTimeout(endTurn, 800); // Small delay so they can see the red bust highlights
}

function getPreviousTurnScore(player) {
  if (player.scoreHistory.length > 0) {
    return player.scoreHistory[player.scoreHistory.length - 1];
  }
  return state.gameOptions.startScore;
}

// CRICKET DART LOGIC
function processCricketDart(player, dart) {
  var num = dart.num;
  var mult = dart.multiplier;
  
  // Check if target number is in play
  if (!CRICKET_TARGETS.includes(num)) {
    log(dart.label + " is out of bounds for Cricket.");
    // Auto-end turn on 3 darts
    if (state.turnDarts.length === 3) endTurn();
    return;
  }
  
  // Determine marks to add (for Bullseye, double bull is 2 marks, single bull is 1 mark)
  var marksToAdd = mult;
  
  // Increment stats marks
  player.cricketStatsMarks = (player.cricketStatsMarks || 0) + marksToAdd;
  
  var currentMarks = player.cricketMarks[num];
  var totalNewMarks = currentMarks + marksToAdd;
  
  player.cricketMarks[num] = Math.min(3, totalNewMarks);
  player.cricketMarksTotal += Math.min(marksToAdd, 3 - currentMarks);
  
  // Points scoring logic for overflow marks
  if (totalNewMarks > 3) {
    var scoringMarks = totalNewMarks - Math.max(3, currentMarks);
    
    // Can score ONLY if at least one other player has NOT closed this segment
    var isClosedByOthers = state.players.every(function(p, idx) {
      if (idx === state.activePlayerIndex) return true; // Ignore active player
      return p.cricketMarks[num] === 3;
    });
    
    if (!isClosedByOthers) {
      // Award points
      var pointsScored = scoringMarks * (num === 25 ? 25 : num);
      player.score += pointsScored;
      log(player.name + " scored " + pointsScored + " points on segment " + (num === 25 ? "Bull" : num));
    } else {
      log("Segment " + (num === 25 ? "Bull" : num) + " is dead. No points awarded.");
    }
  }
  
  // Check Win Condition
  // 1. All numbers must be closed (3 marks each)
  var allClosed = CRICKET_TARGETS.every(function(n) {
    return player.cricketMarks[n] === 3;
  });
  
  // 2. Score must be equal to or higher than all other players
  var highestScore = state.players.every(function(p) {
    return player.score >= p.score;
  });
  
  if (allClosed && highestScore) {
    handleGameWin();
  } else if (state.turnDarts.length === 3) {
    endTurn();
  }
}

// TURN CONTROLLER
function endTurn() {
  if (state.isGameOver) return;
  
  var activePlayer = state.players[state.activePlayerIndex];
  activePlayer.totalTurns++;
  
  // Calculate turn score
  var turnScore = 0;
  if (state.gameMode === '01') {
    if (activePlayer.lastTurnBust) {
      turnScore = 0;
      activePlayer.lastTurnBust = false; // Reset
    } else {
      turnScore = state.turnDarts.reduce(function(sum, d) { return sum + d.value; }, 0);
    }
    
    // Milestones
    if (turnScore === 180) {
      activePlayer.ton180++;
    } else if (turnScore >= 140) {
      activePlayer.ton140++;
    } else if (turnScore >= 100) {
      activePlayer.ton100++;
    }
  } else {
    // For Cricket: points gained in this turn
    var prevScore = activePlayer.scoreHistory.length > 0 
      ? activePlayer.scoreHistory[activePlayer.scoreHistory.length - 1] 
      : 0;
    turnScore = activePlayer.score - prevScore;
  }
  
  activePlayer.turnScores.push(turnScore);
  
  // Store remaining score history for both games (to track turn-start scores)
  activePlayer.scoreHistory.push(activePlayer.score);
  
  // Move to next player
  state.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
  state.turnDarts = [];
  
  log("Turn ended. Active player is now P" + (state.activePlayerIndex + 1) + ": " + state.players[state.activePlayerIndex].name);
  updateUI();
}

function completeTurnManually() {
  // Allows user to end turn early (e.g. they hit a double-out early or chose not to throw 3rd dart)
  if (state.isGameOver) return;
  saveHistory();
  endTurn();
}

function handleGameWin() {
  state.isGameOver = true;
  state.winnerIndex = state.activePlayerIndex;
  
  var winner = state.players[state.winnerIndex];
  winner.totalTurns++;
  
  // Calculate turn score for the winning turn
  var turnScore = 0;
  if (state.gameMode === '01') {
    // Since they checked out, the turn score is their starting score for this turn
    var prevScore = winner.scoreHistory.length > 0 
      ? winner.scoreHistory[winner.scoreHistory.length - 1] 
      : state.gameOptions.startScore;
    turnScore = prevScore; // Checked out to 0, so points scored is prevScore - 0 = prevScore
    
    // Milestones for winning turn
    if (turnScore === 180) {
      winner.ton180++;
    } else if (turnScore >= 140) {
      winner.ton140++;
    } else if (turnScore >= 100) {
      winner.ton100++;
    }
  } else {
    // For Cricket: points gained in this final turn
    var prevScore = winner.scoreHistory.length > 0 
      ? winner.scoreHistory[winner.scoreHistory.length - 1] 
      : 0;
    turnScore = winner.score - prevScore;
  }
  winner.turnScores.push(turnScore);
  winner.scoreHistory.push(winner.score);
  
  log("🏆 " + winner.name + " WINS THE GAME! 🏆");
  
  // Save match results to database
  saveMatchResult();
}

// WINNER / NEW GAME RESET
function confirmReset() {
  if (state.isGameOver || confirm("Are you sure you want to end this game and return to setup?")) {
    document.getElementById("winner-modal").className = "winner-modal";
    document.getElementById("game-screen").className = "screen";
    document.getElementById("setup-screen").className = "screen active";
    
    // Clear history
    undoStack = [];
    redoStack = [];
    updateUndoRedoButtons();
  }
}

// DYNAMIC CHECKOUT RESOLVER ENGINE (T20, T20, Bull etc.)
function solveCheckout(targetScore, maxDarts, rule) {
  if (targetScore <= 0) return null;
  
  // Generate all possible valid target scores on a dart board
  var throws = [];
  for (var i = 1; i <= 20; i++) {
    throws.push({ label: i.toString(), val: i, mult: 1, num: i });
    throws.push({ label: 'D' + i, val: i * 2, mult: 2, num: i });
    throws.push({ label: 'T' + i, val: i * 3, mult: 3, num: i });
  }
  throws.push({ label: '25', val: 25, mult: 1, num: 25 });
  throws.push({ label: 'Bull', val: 50, mult: 2, num: 25 });
  
  var results = [];
  var isOutDouble = (rule === 'double-out' || rule === 'double-in-out');
  
  // 1 Dart checkouts
  if (maxDarts >= 1) {
    for (var i = 0; i < throws.length; i++) {
      var d1 = throws[i];
      if (d1.val === targetScore) {
        if (!isOutDouble || d1.mult === 2) {
          results.push([d1]);
        }
      }
    }
  }
  
  // 2 Dart checkouts (last dart must be double if double-out)
  if (maxDarts >= 2 && results.length === 0) {
    for (var i = 0; i < throws.length; i++) {
      var d1 = throws[i];
      for (var j = 0; j < throws.length; j++) {
        var d2 = throws[j];
        if (d1.val + d2.val === targetScore) {
          if (!isOutDouble || d2.mult === 2) {
            results.push([d1, d2]);
          }
        }
      }
    }
  }
  
  // 3 Dart checkouts (last dart must be double if double-out)
  if (maxDarts >= 3 && results.length === 0) {
    for (var i = 0; i < throws.length; i++) {
      var d1 = throws[i];
      for (var j = 0; j < throws.length; j++) {
        var d2 = throws[j];
        for (var k = 0; k < throws.length; k++) {
          var d3 = throws[k];
          if (d1.val + d2.val + d3.val === targetScore) {
            if (!isOutDouble || d3.mult === 2) {
              results.push([d1, d2, d3]);
            }
          }
        }
      }
    }
  }
  
  if (results.length === 0) return null;
  
  // Preference rankings for finishing doubles (lower score = higher preference)
  var doublePref = {
    'D20': 0, 'D16': 1, 'D18': 2, 'D12': 3, 'D10': 4,
    'D8': 5, 'D14': 6, 'D15': 7, 'D19': 8, 'D11': 9,
    'D9': 10, 'D7': 11, 'D6': 12, 'D5': 13, 'D4': 14,
    'D3': 15, 'D2': 30, 'D1': 40, 'Bull': 45
  };
  
  var bestPath = null;
  var bestScore = Infinity;
  
  for (var idx = 0; idx < results.length; idx++) {
    var p = results[idx];
    var pathPenalty = 0;
    
    // A. Darts length penalty (we always want to finish in fewer darts)
    pathPenalty += p.length * 10000;
    
    // B. Final dart double preference
    var finalDart = p[p.length - 1];
    var finalPref = 50;
    if (finalDart.mult === 2) {
      finalPref = doublePref[finalDart.label] !== undefined ? doublePref[finalDart.label] : 48;
    }
    pathPenalty += finalPref * 100;
    
    // C. Aiming difficulty for preceding setup darts
    for (var step = 0; step < p.length - 1; step++) {
      var d = p[step];
      
      // Mult difficulty (singles are much easier to hit than triples/doubles)
      if (d.mult === 3) {
        pathPenalty += 300;
      } else if (d.mult === 2) {
        pathPenalty += 500;
        if (d.label === 'Bull') pathPenalty -= 100; // Bull is standard setup
      } else {
        pathPenalty += 0;
      }
      
      // Segment accuracy preference (pro players prefer hitting 20, 19, 18, 17)
      if (d.num === 20) pathPenalty += 0;
      else if (d.num === 19) pathPenalty += 10;
      else if (d.num === 18) pathPenalty += 20;
      else if (d.num === 17) pathPenalty += 30;
      else if (d.num === 25) pathPenalty += 40; // Bull/S25
      else pathPenalty += (20 - d.num) * 15; // penalize lower numbers
    }
    
    // D. Rhythm bonus (consecutive shots on the same segment, e.g. T20 + S20)
    if (p.length === 3) {
      if (p[0].num === p[1].num) {
        pathPenalty -= 50;
      }
    }
    
    if (pathPenalty < bestScore) {
      bestScore = pathPenalty;
      bestPath = p;
    }
  }
  
  return bestPath ? bestPath.map(function(d) { return d.label; }) : null;
}

// SMART SETUP SUGGESTION (For Bogey Numbers & >170 scores)
function getSetupSuggestion(score, dartsRemaining) {
  // If > 170, reduce score aggressively
  if (score > 170) {
    if (score > 200 && dartsRemaining === 3) {
      return "Aim for T20 (Reduce Score)";
    }
    // Suggest target based on leaving checkable numbers
    // Try to hit a single/triple to leave a standard finish
    var reductionTargets = [20, 19, 18, 17];
    for (var i = 0; i < reductionTargets.length; i++) {
      var num = reductionTargets[i];
      // Check if hitting triple leaves checkable
      var remT = score - (num * 3);
      if (remT <= 170 && !isBogeyNumber(remT)) {
        return "Aim for T" + num + " (Leaves " + remT + ")";
      }
      // Check if hitting single leaves checkable
      var remS = score - num;
      if (remS <= 170 && !isBogeyNumber(remS)) {
        return "Aim for S" + num + " (Leaves " + remS + ")";
      }
    }
    return "Score points (Aim for T20)";
  }
  
  // If bogey number, recommend target to leave checkable
  if (isBogeyNumber(score)) {
    // 169, 168, 166, 165, 163, 162, 159
    if (score === 169) return "Hit S9 (Leaves 160) or T19 (Leaves 112)";
    if (score === 168) return "Hit S8 (Leaves 160) or T20 (Leaves 108)";
    if (score === 166) return "Hit S6 (Leaves 160) or T20 (Leaves 106)";
    if (score === 165) return "Hit S5 (Leaves 160) or T19 (Leaves 108)";
    if (score === 163) return "Hit S3 (Leaves 160) or T19 (Leaves 106)";
    if (score === 162) return "Hit S2 (Leaves 160) or T20 (Leaves 102)";
    if (score === 159) return "Hit S19 (Leaves 140) or T19 (Leaves 102)";
  }
  
  return "Score points (Aim for T20)";
}

function isBogeyNumber(score) {
  return [169, 168, 166, 165, 163, 162, 159].includes(score);
}

function getCricketFocus(player) {
  if (!player) return "Pick a target";
  for (var i = 0; i < CRICKET_TARGETS.length; i++) {
    var target = CRICKET_TARGETS[i];
    if ((player.cricketMarks[target] || 0) < 3) {
      return "Target: " + (target === 25 ? "Bull" : target);
    }
  }
  return "All closed. Stay ahead on points.";
}

function updateMobileShotStrip(activePlayer, turnTotal) {
  var nameEl = document.getElementById("mobile-active-player");
  var primaryEl = document.getElementById("mobile-primary-value");
  var helperEl = document.getElementById("mobile-helper-value");
  var turnEl = document.getElementById("mobile-turn-value");
  if (!nameEl || !primaryEl || !helperEl || !turnEl || !activePlayer) return;

  nameEl.textContent = activePlayer.name + "'s turn";

  if (state.gameMode === '01') {
    var remDarts = 3 - state.turnDarts.length;
    var helperText = "";
    if (state.gameOptions.outRule === 'double-in-out' && !activePlayer.isIn) {
      helperText = "Hit DOUBLE to start";
    } else {
      var route = solveCheckout(activePlayer.score, remDarts, state.gameOptions.outRule);
      helperText = route ? ("Out: " + route.join(" - ")) : getSetupSuggestion(activePlayer.score, remDarts);
    }
    primaryEl.textContent = "Score: " + activePlayer.score;
    helperEl.textContent = helperText;
    turnEl.textContent = "Turn: " + turnTotal + " | Darts left: " + remDarts;
  } else {
    var dartsText = state.turnDarts.length > 0
      ? state.turnDarts.map(function(d) { return d.label; }).join(", ")
      : "No darts yet";
    primaryEl.textContent = activePlayer.score + " pts";
    helperEl.textContent = getCricketFocus(activePlayer);
    turnEl.textContent = "Darts: " + dartsText;
  }
}

// UI RENDERING CONTROLLER
function updateUI() {
  var activePlayer = state.players[state.activePlayerIndex];
  
  // 1. UPDATE ACTIVE PLAYER DISPLAY & TURN DART SLOTS
  var activePlayerNameEl = document.getElementById("active-player-name");
  if (activePlayerNameEl) activePlayerNameEl.textContent = activePlayer.name;
  
  for (var i = 0; i < 3; i++) {
    var slot = document.getElementById("dart-slot-" + i);
    if (slot) {
      if (i < state.turnDarts.length) {
        slot.textContent = state.turnDarts[i].label;
        slot.className = "dart-slot filled";
      } else {
        slot.textContent = "-";
        slot.className = "dart-slot";
      }
    }
  }
  
  // Calculate turn total points
  var turnTotal = state.turnDarts.reduce(function(sum, dart) {
    return sum + dart.value;
  }, 0);
  
  var turnSumDisplayEl = document.getElementById("turn-sum-display");
  if (turnSumDisplayEl) turnSumDisplayEl.textContent = "Turn: " + turnTotal;
  updateMobileShotStrip(activePlayer, turnTotal);
  
  // Cricket Turn Info Update
  var cricketActivePlayerNameEl = document.getElementById("cricket-active-player-name");
  if (cricketActivePlayerNameEl) cricketActivePlayerNameEl.textContent = activePlayer.name;
  
  for (var i = 0; i < 3; i++) {
    var slot = document.getElementById("cricket-dart-slot-" + i);
    if (slot) {
      if (i < state.turnDarts.length) {
        slot.textContent = state.turnDarts[i].label;
        slot.className = "dart-slot filled";
      } else {
        slot.textContent = "-";
        slot.className = "dart-slot";
      }
    }
  }
  
  var cricketTurnSumDisplayEl = document.getElementById("cricket-turn-sum-display");
  if (cricketTurnSumDisplayEl) cricketTurnSumDisplayEl.textContent = "Turn: " + turnTotal;
  
  // Toggle Keypad Containers
  var keypad01 = document.getElementById("keypad-01-container");
  var keypadCricket = document.getElementById("keypad-cricket-container");
  if (keypad01 && keypadCricket) {
    if (state.gameMode === '01') {
      keypad01.style.display = "block";
      keypadCricket.style.display = "none";
    } else {
      keypad01.style.display = "none";
      keypadCricket.style.display = "block";
    }
  }
  
  // 2. UPDATE SUGGESTIONS CARD
  var suggestionCard = document.getElementById("suggestion-card");
  var suggestionPath = document.getElementById("suggestion-path");
  
  if (state.gameMode === '01') {
    suggestionCard.style.display = "flex";
    
    // Check if player is NOT in yet in Double-In mode
    if (state.gameOptions.outRule === 'double-in-out' && !activePlayer.isIn) {
      suggestionPath.textContent = "Hit DOUBLE to Start";
    } else {
      var remDarts = 3 - state.turnDarts.length;
      var checkoutRoute = solveCheckout(activePlayer.score, remDarts, state.gameOptions.outRule);
      
      if (checkoutRoute) {
        suggestionPath.textContent = checkoutRoute.join(" - ");
      } else {
        // No direct checkout path, show setup recommendation
        suggestionPath.textContent = getSetupSuggestion(activePlayer.score, remDarts);
      }
    }
  } else {
    // Hide suggestion card for Cricket mode (since cricket has a clear grid target)
    suggestionCard.style.display = "none";
  }
  
  // 3. RENDER CORE SCOREBOARDS
  if (state.gameMode === '01') {
    document.getElementById("scoreboard-01").className = "scoreboard-view active";
    document.getElementById("scoreboard-cricket").className = "scoreboard-view";
    render01Scoreboard();
  } else {
    document.getElementById("scoreboard-01").className = "scoreboard-view";
    document.getElementById("scoreboard-cricket").className = "scoreboard-view active";
    renderCricketScoreboard();
  }
  
  // 4. DISPLAY WINNER OVERLAY IF GAME OVER
  var winnerModal = document.getElementById("winner-modal");
  var winnerName = document.getElementById("winner-name-display");
  var winnerStats = document.getElementById("winner-stats-display");
  var statsSavedMessage = document.getElementById("stats-saved-message");
  
  if (state.isGameOver && state.winnerIndex !== -1) {
    var winner = state.players[state.winnerIndex];
    winnerName.textContent = winner.name + " Wins!";
    
    if (state.gameMode === '01') {
      var avg = winner.totalDartsThrown > 0 
        ? ((state.gameOptions.startScore / winner.totalDartsThrown) * 3).toFixed(1) 
        : "0.0";
      winnerStats.textContent = "3-Dart Avg: " + avg + " | Total Darts: " + winner.totalDartsThrown;
    } else {
      var mpr = winner.totalTurns > 0 
        ? (winner.cricketMarksTotal / winner.totalTurns).toFixed(2) 
        : "0.00";
      winnerStats.textContent = "Marks/Round: " + mpr + " | Score: " + winner.score + " pts";
    }

    if (statsSavedMessage) {
      statsSavedMessage.textContent = isGuestUser()
        ? "Guest stats are temporary and will not save after you leave"
        : "Match statistics saved";
    }
    
    winnerModal.className = "winner-modal active";
  } else {
    winnerModal.className = "winner-modal";
  }
}

// 01 SCOREBOARD RENDERER
function render01Scoreboard() {
  var container = document.getElementById("players-01-container");
  container.innerHTML = ""; // Clear
  
  for (var i = 0; i < state.players.length; i++) {
    var p = state.players[i];
    var card = document.createElement("div");
    
    var cardClass = "player-card-01";
    if (i === state.activePlayerIndex && !state.isGameOver) cardClass += " active";
    if (i === state.winnerIndex) cardClass += " winner";
    card.className = cardClass;
    
    // Header (Name + double in status)
    var header = document.createElement("div");
    header.className = "p-header";
    
    var nameSpan = document.createElement("span");
    nameSpan.className = "p-name";
    nameSpan.textContent = p.name;
    
    var statusSpan = document.createElement("span");
    statusSpan.className = "p-legs";
    if (state.gameOptions.outRule === 'double-in-out') {
      statusSpan.textContent = p.isIn ? "IN" : "NOT IN";
      statusSpan.style.color = p.isIn ? "var(--success-color)" : "var(--text-muted)";
    }
    
    header.appendChild(nameSpan);
    header.appendChild(statusSpan);
    
    // Score
    var scoreDiv = document.createElement("div");
    scoreDiv.className = "p-score";
    scoreDiv.textContent = p.score;
    
    // Footer Stats
    var statsDiv = document.createElement("div");
    statsDiv.className = "p-stats";
    
    // Calculate 3-dart average
    // pts = starting - current
    var ptsScored = state.gameOptions.startScore - p.score;
    var avgVal = p.totalDartsThrown > 0 
      ? ((ptsScored / p.totalDartsThrown) * 3).toFixed(1) 
      : "0.0";
      
    var lastTurnDiv = document.createElement("div");
    lastTurnDiv.innerHTML = "Avg: <span class='stat-val'>" + avgVal + "</span>";
    
    var dartsCountDiv = document.createElement("div");
    dartsCountDiv.innerHTML = "Darts: <span class='stat-val'>" + p.totalDartsThrown + "</span>";
    
    statsDiv.appendChild(lastTurnDiv);
    statsDiv.appendChild(dartsCountDiv);
    
    card.appendChild(header);
    card.appendChild(scoreDiv);
    card.appendChild(statsDiv);
    
    container.appendChild(card);
  }
}

// CRICKET SCOREBOARD RENDERER
function renderCricketScoreboard() {
  // Table headers
  var headerRow = document.getElementById("cricket-table-header");
  headerRow.innerHTML = ""; // Clear
  
  var targetHeader = document.createElement("th");
  targetHeader.textContent = "Target";
  headerRow.appendChild(targetHeader);
  
  for (var i = 0; i < state.players.length; i++) {
    var th = document.createElement("th");
    th.textContent = state.players[i].name;
    if (i === state.activePlayerIndex && !state.isGameOver) {
      th.className = "active-player-col";
    }
    headerRow.appendChild(th);
  }
  
  // Table rows for each target
  var tbody = document.getElementById("cricket-table-body");
  tbody.innerHTML = ""; // Clear
  
  for (var tIdx = 0; tIdx < CRICKET_TARGETS.length; tIdx++) {
    var num = CRICKET_TARGETS[tIdx];
    var tr = document.createElement("tr");
    
    // Target label column
    var labelTd = document.createElement("td");
    labelTd.className = "cricket-num-cell";
    labelTd.textContent = num === 25 ? "BULL" : num;
    tr.appendChild(labelTd);
    
    // Mark columns for each player
    for (var pIdx = 0; pIdx < state.players.length; pIdx++) {
      var p = state.players[pIdx];
      var marks = p.cricketMarks[num] || 0;
      
      var td = document.createElement("td");
      var markDiv = document.createElement("div");
      
      var markText = "-";
      var markClass = "cricket-mark";
      
      if (marks === 1) {
        markText = "/";
        markClass += " marks-1";
      } else if (marks === 2) {
        markText = "X";
        markClass += " marks-2";
      } else if (marks === 3) {
        markText = "X";
        markClass += " marks-3";
      }
      
      markDiv.className = markClass;
      markDiv.textContent = markText;
      td.appendChild(markDiv);
      tr.appendChild(td);
    }
    
    tbody.appendChild(tr);
  }
  
  // Bottom point totals summary
  var summaryContainer = document.getElementById("cricket-summary-container");
  summaryContainer.innerHTML = ""; // Clear
  
  for (var i = 0; i < state.players.length; i++) {
    var p = state.players[i];
    var div = document.createElement("div");
    
    var divClass = "cricket-summary-card";
    if (i === state.activePlayerIndex && !state.isGameOver) divClass += " active";
    div.className = divClass;
    
    var name = document.createElement("div");
    name.className = "name";
    name.textContent = p.name;
    
    var score = document.createElement("div");
    score.className = "score";
    score.textContent = p.score + " pts";
    
    div.appendChild(name);
    div.appendChild(score);
    summaryContainer.appendChild(div);
  }
}

// ==========================================
// PLAYER PROFILES & STATISTICS SYSTEM LOGIC
// ==========================================

var dbPlayers = [];
var dbMatches = [];
var selectedProfileId = null;

function loadDatabase() {
  try {
    if (isGuestUser()) {
      dbPlayers = guestPlayers;
      dbMatches = guestMatches;
      if (dbPlayers.length === 0) {
        createPlayerProfile("Player 1", getProfileColor(0), true);
        createPlayerProfile("Player 2", getProfileColor(1), true);
        createPlayerProfile("Player 3", getProfileColor(2), true);
        createPlayerProfile("Player 4", getProfileColor(3), true);
      }
      return;
    }

    if (!dbPlayers) dbPlayers = [];
    if (!dbMatches) dbMatches = [];
  } catch (e) {
    log("Error loading database: " + e);
    dbPlayers = [];
    dbMatches = [];
  }
}

function saveDatabase() {
  try {
    if (isGuestUser()) {
      guestPlayers = dbPlayers;
      guestMatches = dbMatches;
      return;
    }

    return;
  } catch (e) {
    log("Error saving database: " + e);
  }
}

function createPlayerProfile(name, color, isSystemInit) {
  if (isSystemInit === undefined) { isSystemInit = false; }
  name = name.trim();
  if (!name) return null;
  
  // Check for case-insensitive duplicate
  var exists = dbPlayers.some(function(p) { return p.name.toLowerCase() === name.toLowerCase(); });
  if (exists && !isSystemInit) {
    alert("A player profile with the name '" + name + "' already exists!");
    return null;
  }
  
  var profile = {
    id: "p_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    name: name,
    color: color || "#00f0ff",
    createdAt: new Date().toISOString(),
    stats: {
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      
      // '01 Stats
      total01Darts: 0,
      total01Points: 0,
      best01Avg: 0.0,
      best01DartsToWin: null,
      busts: 0,
      ton100: 0,
      ton140: 0,
      ton180: 0,
      
      // Cricket Stats
      totalCricketTurns: 0,
      totalCricketMarks: 0,
      bestCricketMPR: 0.0,
      highestCricketScore: 0
    }
  };
  
  dbPlayers.push(profile);
  saveDatabase();
  updateAutocompleteDatalist();
  return profile;
}

function deletePlayerProfile(id) {
  var index = dbPlayers.findIndex(function(p) { return p.id === id; });
  if (index !== -1) {
    var name = dbPlayers[index].name;
    if (confirm("Are you sure you want to delete profile '" + name + "'? All stats will be permanently lost!")) {
      dbPlayers.splice(index, 1);
      saveDatabase();
      
      if (selectedProfileId === id) {
        selectedProfileId = null;
      }
      
      updateAutocompleteDatalist();
      renderProfilesList();
      renderProfileDetails();
    }
  }
}

function updateAutocompleteDatalist() {
  var datalist = document.getElementById("saved-players-list");
  if (!datalist) return;
  
  datalist.innerHTML = "";
  dbPlayers.forEach(function(p) {
    var option = document.createElement("option");
    option.value = p.name;
    datalist.appendChild(option);
  });
}

function openStatsScreen() {
  document.getElementById("setup-screen").classList.remove("active");
  document.getElementById("stats-screen").classList.add("active");
  
  renderProfilesList();
  if (!selectedProfileId && dbPlayers.length > 0) {
    selectProfile(dbPlayers[0].id);
  } else {
    renderProfileDetails();
  }
}

function closeStatsScreen() {
  document.getElementById("stats-screen").classList.remove("active");
  document.getElementById("setup-screen").classList.add("active");
  updateAutocompleteDatalist();
}

function renderProfilesList() {
  var container = document.getElementById("profiles-list-container");
  if (!container) return;
  
  container.innerHTML = "";
  
  dbPlayers.forEach(function(p) {
    var item = document.createElement("div");
    item.className = "profile-item" + (p.id === selectedProfileId ? " active" : "");
    item.onclick = function(e) {
      if (e.target.classList.contains("btn-delete-profile")) return;
      selectProfile(p.id);
    };
    
    var left = document.createElement("div");
    left.className = "profile-summary-left";
    
    var avatar = document.createElement("div");
    avatar.className = "profile-avatar";
    avatar.style.backgroundColor = p.color;
    avatar.textContent = p.name.substring(0, 2).toUpperCase();
    
    var meta = document.createElement("div");
    meta.className = "profile-meta";
    
    var nameSpan = document.createElement("span");
    nameSpan.className = "name";
    nameSpan.textContent = p.name;
    
    var recordSpan = document.createElement("span");
    recordSpan.className = "record";
    recordSpan.textContent = "W: " + p.stats.wins + " | L: " + p.stats.losses;
    
    meta.appendChild(nameSpan);
    meta.appendChild(recordSpan);
    left.appendChild(avatar);
    left.appendChild(meta);
    
    var right = document.createElement("div");
    right.className = "profile-summary-right";
    
    var totalGames = p.stats.gamesPlayed;
    var winRate = totalGames > 0 ? Math.round((p.stats.wins / totalGames) * 100) : 0;
    
    var wrBadge = document.createElement("span");
    wrBadge.className = "profile-badge-wr";
    wrBadge.textContent = winRate + "% WR";
    
    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-delete-profile";
    deleteBtn.textContent = "x";
    deleteBtn.title = "Delete Profile";
    deleteBtn.onclick = function() { deletePlayerProfile(p.id); };

    right.appendChild(wrBadge);
    if (isGuestUser() || (currentUser && p.ownerUserId === currentUser.id)) {
      right.appendChild(deleteBtn);
    }
    
    item.appendChild(left);
    item.appendChild(right);
    container.appendChild(item);
  });
}

function selectProfile(id) {
  selectedProfileId = id;
  renderProfilesList();
  renderProfileDetails();
}

function renderProfileDetails() {
  var container = document.getElementById("stats-detail-container");
  if (!container) return;
  
  if (!selectedProfileId) {
    container.innerHTML = '\n      <div class="empty-stats-state">\n        <span class="empty-icon">Stats</span>\n        <p>Select a player profile from the list to view detailed lifetime stats and match history.</p>\n      </div>\n    ';
    return;
  }
  
  var profile = dbPlayers.find(function(p) { return p.id === selectedProfileId; });
  if (!profile) {
    selectedProfileId = null;
    renderProfileDetails();
    return;
  }
  
  var stats = profile.stats;
  var wr = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;
  
  var joinedDateStr = new Date(profile.createdAt).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  
  var html = '\n    <div class="profile-detail-view">\n      <!-- Profile Header -->\n      <header class="profile-detail-header">\n        <div class="detail-avatar" style="background-color: ' + (profile.color) + '">\n          ' + (profile.name.substring(0, 2).toUpperCase()) + '\n        </div>\n        <div class="detail-name-meta">\n          <h2>' + (profile.name) + '</h2>\n          <span class="joined-date">Member since ' + (joinedDateStr) + '</span>\n        </div>\n      </header>\n      \n      <!-- Win / Loss Widget -->\n      <div class="win-rate-widget">\n        <div class="win-rate-header-label">\n          <span>Win / Loss Ratio</span>\n          <span style="color: var(--success-color)">' + (wr) + '% Win Rate</span>\n        </div>\n        <div class="win-rate-bar-outer">\n          <div class="win-rate-bar-inner" style="width: ' + (wr) + '%"></div>\n        </div>\n        <div class="win-rate-legend">\n          <span>Wins: ' + (stats.wins) + '</span>\n          <span>Losses: ' + (stats.losses) + '</span>\n          <span>Total Games: ' + (stats.gamesPlayed) + '</span>\n        </div>\n      </div>\n      \n      <!-- Lifetime Summary Cards -->\n      <div class="lifetime-summary-grid">\n        <div class="lifetime-stat-card">\n          <span class="label">Games Played</span>\n          <span class="val">' + (stats.gamesPlayed) + '</span>\n        </div>\n        <div class="lifetime-stat-card">\n          <span class="label">Best 01 Match Avg</span>\n          <span class="val">' + (stats.best01Avg > 0 ? stats.best01Avg.toFixed(1) : '—') + '</span>\n        </div>\n        <div class="lifetime-stat-card">\n          <span class="label">Cricket MPR (Best)</span>\n          <span class="val">' + (stats.bestCricketMPR > 0 ? stats.bestCricketMPR.toFixed(2) : '—') + '</span>\n        </div>\n      </div>\n      \n      <!-- Detailed Subsections -->\n      <div class="stats-sections-container">\n        <!-- \'01 Subsection -->\n        <section class="stats-subsection">\n          <h4 class="stats-section-title">01 Games Stats</h4>\n          <div class="stats-grid-2col">\n            <div class="stat-item">\n              <span class="label">Lifetime Avg</span>\n              <span class="val">' + (stats.total01Darts > 0 ? ((stats.total01Points / stats.total01Darts) * 3).toFixed(1) : '—') + '</span>\n            </div>\n            <div class="stat-item">\n              <span class="label">Fastest 01 Win</span>\n              <span class="val">' + (stats.best01DartsToWin ? stats.best01DartsToWin + ' Darts' : '—') + '</span>\n            </div>\n            <div class="stat-item">\n              <span class="label">Total Busts</span>\n              <span class="val">' + (stats.busts) + '</span>\n            </div>\n            <div class="stat-item">\n              <span class="label">Total Darts</span>\n              <span class="val">' + (stats.total01Darts) + '</span>\n            </div>\n          </div>\n          \n          <!-- Tons Row -->\n          <div class="ton-counters-row">\n            <div class="ton-stat">\n              <span class="label">100+</span>\n              <span class="val" style="color: var(--text-primary)">' + (stats.ton100) + '</span>\n            </div>\n            <div class="ton-stat">\n              <span class="label">140+</span>\n              <span class="val" style="color: var(--success-color)">' + (stats.ton140) + '</span>\n            </div>\n            <div class="ton-stat">\n              <span class="label">180s</span>\n              <span class="val" style="color: var(--accent-color)">' + (stats.ton180) + '</span>\n            </div>\n          </div>\n        </section>\n        \n        <!-- Cricket Subsection -->\n        <section class="stats-subsection">\n          <h4 class="stats-section-title">Cricket Stats</h4>\n          <div class="stats-grid-2col">\n            <div class="stat-item">\n              <span class="label">Lifetime MPR</span>\n              <span class="val">' + (stats.totalCricketTurns > 0 ? (stats.totalCricketMarks / stats.totalCricketTurns).toFixed(2) : '—') + '</span>\n            </div>\n            <div class="stat-item">\n              <span class="label">Best MPR</span>\n              <span class="val">' + (stats.bestCricketMPR > 0 ? stats.bestCricketMPR.toFixed(2) : '—') + '</span>\n            </div>\n            <div class="stat-item">\n              <span class="label">High Score</span>\n              <span class="val">' + (stats.highestCricketScore > 0 ? stats.highestCricketScore + ' pts' : '—') + '</span>\n            </div>\n            <div class="stat-item">\n              <span class="label">Total Marks</span>\n              <span class="val">' + (stats.totalCricketMarks) + '</span>\n            </div>\n          </div>\n        </section>\n      </div>\n      \n      <!-- Recent Matches List -->\n      <section class="recent-matches-container">\n        <h3>Recent Match History</h3>\n        <div class="match-history-list">\n  ';
  
  var matches = dbMatches.filter(function(m) { return m.players.some(function(p) { return p.id === selectedProfileId; }); })
                           .sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  
  if (matches.length === 0) {
    html += '\n          <div style="text-align: center; color: var(--text-muted); padding: var(--spacing-md); font-size: 0.85rem;">\n            No matches played yet.\n          </div>\n    ';
  } else {
    var recentMatches = matches.slice(0, 10);
    recentMatches.forEach(function(m) {
      var playerMatchInfo = m.players.find(function(p) { return p.id === selectedProfileId; });
      var isWinner = playerMatchInfo.isWinner;
      
      var opponents = m.players.filter(function(p) { return p.id !== selectedProfileId; })
                                 .map(function(p) { return p.name; })
                                 .join(", ");
      
      var dateObj = new Date(m.date);
      var dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + " " +
                      dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      
      var gameModeText = m.gameMode === '01' ? m.gameOptions.startScore : 'Cricket';
      if (m.gameMode === '01') {
        var rule = 'DO';
        if (m.gameOptions.outRule === 'straight-out') rule = 'SO';
        else if (m.gameOptions.outRule === 'double-in-out') rule = 'DI/DO';
        gameModeText += " (" + rule + ")";
      }
      
      var metricVal = m.gameMode === '01' 
        ? playerMatchInfo.avgScore.toFixed(1) 
        : playerMatchInfo.avgScore.toFixed(2);
      var metricLabel = m.gameMode === '01' ? 'Avg' : 'MPR';
      
      html += '\n        <div class="match-history-card">\n          <div class="match-card-left">\n            <span class="match-result-badge ' + (isWinner ? 'win' : 'loss') + '">' + (isWinner ? 'WIN' : 'LOSS') + '</span>\n            <div class="match-meta-info">\n              <span class="mode">' + (gameModeText) + '</span>\n              <span class="opponents">vs ' + (opponents || 'Solo') + '</span>\n              <span class="date">' + (dateStr) + '</span>\n            </div>\n          </div>\n          <div class="match-card-right">\n            <span class="metric-val">' + (metricVal) + '</span>\n            <span class="metric-label">' + (metricLabel) + '</span>\n          </div>\n        </div>\n      ';
    });
  }
  
  html += '\n        </div>\n      </section>\n    </div>\n  ';
  
  container.innerHTML = html;
}

function saveMatchResult() {
  if (!state.isGameOver || state.winnerIndex === -1) return;
  
  var matchPlayers = state.players.map(function(p, idx) {
    var avg = 0;
    var bestTurn = 0;
    
    if (state.gameMode === '01') {
      avg = p.totalDartsThrown > 0 ? ((state.gameOptions.startScore - p.score) / p.totalDartsThrown) * 3 : 0;
      bestTurn = p.turnScores.length > 0 ? Math.max.apply(null, p.turnScores) : 0;
    } else {
      avg = p.totalTurns > 0 ? p.cricketStatsMarks / p.totalTurns : 0;
      bestTurn = p.turnScores.length > 0 ? Math.max.apply(null, p.turnScores) : 0;
    }
    
    return {
      id: p.profileId,
      name: p.name,
      isWinner: idx === state.winnerIndex,
      score: p.score,
      totalDarts: p.totalDartsThrown,
      totalTurns: p.totalTurns,
      avgScore: avg,
      bestTurn: bestTurn,
      bustCount: p.bustCount || 0
    };
  });
  
  var match = {
    id: "m_" + Date.now(),
    date: new Date().toISOString(),
    gameMode: state.gameMode,
    gameOptions: {
      startScore: state.gameOptions.startScore,
      outRule: state.gameOptions.outRule
    },
    players: matchPlayers
  };
  
  dbMatches.push(match);
  
  dbPlayers.forEach(function(profile) {
    var matchPlayer = matchPlayers.find(function(p) { return p.id === profile.id; });
    if (!matchPlayer) return;
    
    var stats = profile.stats;
    stats.gamesPlayed++;
    
    if (matchPlayer.isWinner) {
      stats.wins++;
    } else {
      stats.losses++;
    }
    
    if (state.gameMode === '01') {
      stats.total01Darts += matchPlayer.totalDarts;
      var ptsScored = state.gameOptions.startScore - matchPlayer.score;
      stats.total01Points += ptsScored;
      
      if (matchPlayer.avgScore > stats.best01Avg) {
        stats.best01Avg = matchPlayer.avgScore;
      }
      
      if (matchPlayer.isWinner) {
        if (!stats.best01DartsToWin || matchPlayer.totalDarts < stats.best01DartsToWin) {
          stats.best01DartsToWin = matchPlayer.totalDarts;
        }
      }
      
      var gamePlayerState = state.players.find(function(gp) { return gp.profileId === profile.id; });
      if (gamePlayerState) {
        stats.busts += gamePlayerState.bustCount || 0;
        stats.ton100 += gamePlayerState.ton100 || 0;
        stats.ton140 += gamePlayerState.ton140 || 0;
        stats.ton180 += gamePlayerState.ton180 || 0;
      }
    } else {
      var gamePlayerState = state.players.find(function(gp) { return gp.profileId === profile.id; });
      if (gamePlayerState) {
        stats.totalCricketTurns += gamePlayerState.totalTurns;
        stats.totalCricketMarks += gamePlayerState.cricketStatsMarks || 0;
        
        if (matchPlayer.avgScore > stats.bestCricketMPR) {
          stats.bestCricketMPR = matchPlayer.avgScore;
        }
        
        if (gamePlayerState.score > stats.highestCricketScore) {
          stats.highestCricketScore = gamePlayerState.score;
        }
      }
    }
  });
  
  saveDatabase();
  persistMatchResult(match);
  renderWinnerStatsTable(matchPlayers);
}

function persistMatchResult(match) {
  if (isGuestUser()) return;
  apiRequest("/api/matches/", {
    method: "POST",
    body: {
      match: match,
      profiles: dbPlayers
    }
  }).then(function(data) {
    applyServerData(data);
  }).catch(function(error) {
    log("Could not save match to server: " + error.message);
  });
}

function renderWinnerStatsTable(matchPlayers) {
  var tbody = document.getElementById("winner-stats-tbody");
  if (!tbody) return;
  
  tbody.innerHTML = "";
  var sorted = matchPlayers.slice().sort(function(a, b) { return b.isWinner - a.isWinner; });
  
  sorted.forEach(function(p) {
    var tr = document.createElement("tr");
    if (p.isWinner) {
      tr.className = "winner-row";
    }
    
    var nameTd = document.createElement("td");
    nameTd.textContent = p.name + (p.isWinner ? " (Winner)" : "");
    
    var avgTd = document.createElement("td");
    var avgText = state.gameMode === '01' 
      ? p.avgScore.toFixed(1) 
      : p.avgScore.toFixed(2);
    avgTd.textContent = avgText;
    
    var dartsTd = document.createElement("td");
    dartsTd.textContent = p.totalDarts;
    
    var bestTd = document.createElement("td");
    bestTd.textContent = state.gameMode === '01' ? p.bestTurn : p.bestTurn + " pts";
    
    var bustsTd = document.createElement("td");
    bustsTd.textContent = state.gameMode === '01' ? p.bustCount : "-";
    
    tr.appendChild(nameTd);
    tr.appendChild(avgTd);
    tr.appendChild(dartsTd);
    tr.appendChild(bestTd);
    tr.appendChild(bustsTd);
    
    tbody.appendChild(tr);
  });
}

// Initial Database Load & UI Hookup
restoreActiveAccount();
