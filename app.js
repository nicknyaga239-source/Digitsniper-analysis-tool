// ==========================================
// BLUEPRINT ANALYSIS TOOL
// Live Deriv Digit Analysis
// ==========================================

const APP_ID = 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

let socket = null;
let ticks = [];
let running = false;
let reconnectTimer = null;

const $ = id => document.getElementById(id);

// ------------------------------------------
// INITIAL UI
// ------------------------------------------

function setStatus(text, online = false) {
  const el = $("connectionStatus");

  el.textContent = online
    ? "● CONNECTED"
    : "● " + text;

  el.className = online
    ? "status online"
    : "status offline";
}

function selectedSymbol() {
  return $("symbol").value;
}

function windowLimit() {
  return Number($("windowSize").value);
}

// ------------------------------------------
// CONNECT
// ------------------------------------------

function connect() {

  if (socket) {
    try {
      socket.close();
    } catch {}
  }

  setStatus("CONNECTING");

  socket = new WebSocket(WS_URL);

  socket.onopen = () => {

    running = true;

    setStatus("CONNECTED", true);

    subscribeTicks();

  };

  socket.onmessage = event => {

    try {

      const data = JSON.parse(event.data);

      if (data.error) {
        console.error(data.error);
        setStatus("ERROR");
        return;
      }

      if (data.msg_type === "tick") {
        processTick(data.tick);
      }

    } catch (error) {
      console.error("Message error:", error);
    }

  };

  socket.onerror = error => {

    console.error("WebSocket error:", error);

    setStatus("CONNECTION ERROR");

  };

  socket.onclose = () => {

    running = false;

    setStatus("DISCONNECTED");

    scheduleReconnect();

  };
}

// ------------------------------------------
// SUBSCRIBE TO LIVE TICKS
// ------------------------------------------

function subscribeTicks() {

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify({
    ticks: selectedSymbol(),
    subscribe: 1
  }));

}

// ------------------------------------------
// RECONNECT
// ------------------------------------------

function scheduleReconnect() {

  clearTimeout(reconnectTimer);

  reconnectTimer = setTimeout(() => {

    if (!running) {
      connect();
    }

  }, 3000);

}

// ------------------------------------------
// PROCESS TICK
// ------------------------------------------

function processTick(tick) {

  if (!tick || tick.quote === undefined) {
    return;
  }

  const price = Number(tick.quote);

  const digit = extractLastDigit(
    tick.quote,
    tick.pip_size
  );

  ticks.push({
    price,
    digit,
    time: Date.now()
  });

  const limit = windowLimit();

  if (ticks.length > limit) {
    ticks.shift();
  }

  $("livePrice").textContent =
    Number(price).toFixed(
      tick.pip_size !== undefined
        ? Number(tick.pip_size)
        : 2
    );

  $("lastDigit").textContent = digit;

  $("tickCount").textContent = ticks.length;

  updateAllAnalysis();

}

// ------------------------------------------
// LAST DIGIT
// ------------------------------------------

function extractLastDigit(value, pipSize) {

  const decimals =
    Number.isInteger(Number(pipSize))
      ? Number(pipSize)
      : detectDecimals(value);

  const fixed = Number(value).toFixed(decimals);

  const digits = fixed.replace(/\D/g, "");

  return Number(digits[digits.length - 1]);

}

function detectDecimals(value) {

  const str = String(value);

  if (!str.includes(".")) {
    return 0;
  }

  return str.split(".")[1].length;

}

// ------------------------------------------
// GET DIGITS
// ------------------------------------------

function getDigits() {

  return ticks.map(t => t.digit);

}

// ------------------------------------------
// FULL ANALYSIS
// ------------------------------------------

function updateAllAnalysis() {

  const digits = getDigits();

  if (!digits.length) {
    return;
  }

  updateDigitDistribution(digits);

  updateEvenOdd(digits);

  updateOverUnder(digits);

  updatePatterns(digits);

  updateRecentDigits(digits);

}

// ------------------------------------------
// DIGIT DISTRIBUTION
// ------------------------------------------

function calculateFrequency(digits) {

  const frequency = Array(10).fill(0);

  digits.forEach(digit => {

    if (digit >= 0 && digit <= 9) {
      frequency[digit]++;
    }

  });

  return frequency;

}

function updateDigitDistribution(digits) {

  const frequency = calculateFrequency(digits);

  const total = digits.length;

  const grid = $("digitGrid");

  grid.innerHTML = "";

  frequency.forEach((count, digit) => {

    const percentage =
      total > 0
        ? ((count / total) * 100).toFixed(1)
        : 0;

    const box = document.createElement("div");

    box.className = "digit-box";

    box.innerHTML = `
      <strong>${digit}</strong>
      <small>${count} • ${percentage}%</small>
    `;

    grid.appendChild(box);

  });

}

// ------------------------------------------
// MATCHES ENGINE
// ------------------------------------------

function analyzeMatches() {

  const digits = getDigits();

  if (digits.length < 30) {

    $("patternMessage").textContent =
      "Collect at least 30 ticks before generating a signal.";

    return;

  }

  const frequency = calculateFrequency(digits);

  const total = digits.length;

  const recentSize = Math.min(50, total);

  const recent = digits.slice(-recentSize);

  const recentFrequency =
    calculateFrequency(recent);

  /*
    Score combines:

    1. Overall frequency
    2. Recent frequency
    3. Recency
    4. Repeating sequence evidence

    This is a statistical ranking system,
    NOT a guaranteed prediction.
  */

  const scores = Array(10).fill(0);

  for (let d = 0; d <= 9; d++) {

    const overallRate =
      frequency[d] / total;

    const recentRate =
      recentFrequency[d] / recent.length;

    const recency =
      recencyScore(digits, d);

    const repeat =
      repeatingEvidence(digits, d);

    scores[d] =
      overallRate * 0.35 +
      recentRate * 0.35 +
      recency * 0.15 +
      repeat * 0.15;

  }

  let bestDigit = 0;

  for (let d = 1; d <= 9; d++) {

    if (scores[d] > scores[bestDigit]) {
      bestDigit = d;
    }

  }

  const sorted = [...scores].sort((a, b) => b - a);

  const top = sorted[0];
  const second = sorted[1];

  /*
    Confidence represents relative model strength,
    not probability of guaranteed success.
  */

  let confidence =
    50 + ((top - second) * 500);

  confidence =
    Math.max(1, Math.min(99, confidence));

  $("predictedDigit").textContent = bestDigit;

  $("matchConfidence").textContent =
    confidence.toFixed(1) + "%";

  $("confidenceBar").style.width =
    confidence + "%";

  const evidence =
    repeatingEvidence(digits, bestDigit);

  if (evidence > 0.6) {

    $("patternMessage").textContent =
      `Digit ${bestDigit} has strong recent repeating-pattern evidence.`;

  } else if (recentFrequency[bestDigit] > frequency[bestDigit] / 2) {

    $("patternMessage").textContent =
      `Digit ${bestDigit} is showing increased recent frequency.`;

  } else {

    $("patternMessage").textContent =
      `Digit ${bestDigit} currently has the strongest combined statistical score.`;

  }

}

function recencyScore(digits, target) {

  const maxLookback =
    Math.min(30, digits.length);

  const recent =
    digits.slice(-maxLookback);

  let score = 0;

  for (let i = 0; i < recent.length; i++) {

    if (recent[i] === target) {

      const weight =
        (i + 1) / recent.length;

      score += weight;

    }

  }

  return Math.min(
    1,
    score / 5
  );

}

function repeatingEvidence(digits, target) {

  if (digits.length < 20) {
    return 0;
  }

  const recent =
    digits.slice(-20);

  let matches = 0;

  recent.forEach(d => {

    if (d === target) {
      matches++;
    }

  });

  return Math.min(
    1,
    matches / 6
  );

}

// ------------------------------------------
// EVEN / ODD
// ------------------------------------------

function updateEvenOdd(digits) {

  let even = 0;
  let odd = 0;

  digits.forEach(d => {

    if (d % 2 === 0) {
      even++;
    } else {
      odd++;
    }

  });

  const total = digits.length;

  const evenPct =
    (even / total) * 100;

  const oddPct =
    (odd / total) * 100;

  $("evenPercent").textContent =
    evenPct.toFixed(1) + "%";

  $("oddPercent").textContent =
    oddPct.toFixed(1) + "%";

  $("evenCount").textContent =
    `${even} ticks`;

  $("oddCount").textContent =
    `${odd} ticks`;

  $("evenBar").style.width =
    evenPct + "%";

  $("oddBar").style.width =
    oddPct + "%";

  if (evenPct > oddPct) {

    $("evenOddSignal").textContent =
      `EVEN currently leads by ${(evenPct - oddPct).toFixed(1)} percentage points.`;

  } else if (oddPct > evenPct) {

    $("evenOddSignal").textContent =
      `ODD currently leads by ${(oddPct - evenPct).toFixed(1)} percentage points.`;

  } else {

    $("evenOddSignal").textContent =
      "EVEN and ODD are currently balanced.";

  }

}

// ------------------------------------------
// OVER / UNDER
// ------------------------------------------

function updateOverUnder(digits) {

  const barrier =
    Number($("barrier").value);

  let over = 0;
  let under = 0;

  digits.forEach(d => {

    if (d > barrier) {
      over++;
    } else if (d < barrier) {
      under++;
    }

  });

  const total =
    over + under;

  if (total === 0) {
    return;
  }

  const overPct =
    (over / total) * 100;

  const underPct =
    (under / total) * 100;

  $("overPercent").textContent =
    overPct.toFixed(1) + "%";

  $("underPercent").textContent =
    underPct.toFixed(1) + "%";

  $("overCount").textContent =
    `${over} ticks`;

  $("underCount").textContent =
    `${under} ticks`;

  $("overBar").style.width =
    overPct + "%";

  $("underBar").style.width =
    underPct + "%";

  if (overPct > underPct) {

    $("overUnderSignal").textContent =
      `OVER ${barrier} currently leads by ${(overPct - underPct).toFixed(1)} percentage points.`;

  } else if (underPct > overPct) {

    $("overUnderSignal").textContent =
      `UNDER ${barrier} currently leads by ${(underPct - overPct).toFixed(1)} percentage points.`;

  } else {

    $("overUnderSignal").textContent =
      `OVER and UNDER are currently balanced around ${barrier}.`;

  }

}

// ------------------------------------------
// REPEATING PATTERN ENGINE
// ------------------------------------------

function updatePatterns(digits) {

  if (digits.length < 20) {
    return;
  }

  const recent =
    digits.slice(-100);

  const patterns = [];

  for (let length = 2; length <= 5; length++) {

    const counts = {};

    for (
      let i = 0;
      i <= recent.length - length;
      i++
    ) {

      const pattern =
        recent
          .slice(i, i + length)
          .join("");

      counts[pattern] =
        (counts[pattern] || 0) + 1;

    }

    Object.entries(counts)
      .filter(([pattern, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([pattern, count]) => {

        patterns.push({
          pattern,
          count,
          length
        });

      });

  }

  patterns.sort((a, b) => {

    if (b.count !== a.count) {
      return b.count - a.count;
    }

    return b.length - a.length;

  });

  const top =
    patterns.slice(0, 8);

  if (!top.length) {

    $("patterns").textContent =
      "No significant repeating sequences detected.";

    return;

  }

  $("patterns").innerHTML =
    top.map(item => `
      <div class="pattern-item">
        Pattern:
        <strong>${item.pattern}</strong>
        —
        repeated
        <strong>${item.count}</strong>
        times
      </div>
    `).join("");

}

// ------------------------------------------
// RECENT DIGITS
// ------------------------------------------

function updateRecentDigits(digits) {

  const recent =
    digits.slice(-40);

  $("recentDigits").innerHTML =
    recent.map(d => `
      <div class="recent-digit">${d}</div>
    `).join("");

}

// ------------------------------------------
// BUTTON EVENTS
// ------------------------------------------

$("connectBtn").addEventListener(
  "click",
  () => {

    connect();

  }
);

$("refreshBtn").addEventListener(
  "click",
  () => {

    updateAllAnalysis();

    analyzeMatches();

  }
);

$("matchesBtn").addEventListener(
  "click",
  () => {

    analyzeMatches();

  }
);

$("barrier").addEventListener(
  "change",
  () => {

    updateOverUnder(
      getDigits()
    );

  }
);

$("windowSize").addEventListener(
  "change",
  () => {

    const limit =
      windowLimit();

    if (ticks.length > limit) {
      ticks =
        ticks.slice(-limit);
    }

    updateAllAnalysis();

  }
);

$("symbol").addEventListener(
  "change",
  () => {

    ticks = [];

    $("livePrice").textContent = "---";
    $("lastDigit").textContent = "-";
    $("tickCount").textContent = "0";

    if (socket) {

      try {
        socket.close();
      } catch {}

    }

    setTimeout(
      connect,
      500
    );

  }
);

// ------------------------------------------
// START
// ------------------------------------------

setStatus("DISCONNECTED");

console.log(
  "Blueprint Analysis Tool initialized."
);
