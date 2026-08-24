// ============================================================
// BLUEPRINT ANALYSIS TOOL
// Robust Deriv WebSocket + Digit Analysis Engine
// ============================================================

const APP_ID = 1089;
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

let socket = null;
let ticks = [];
let reconnectTimer = null;
let connectionTimer = null;
let heartbeatTimer = null;

let manuallyClosed = false;
let reconnectAttempts = 0;
let subscribedSymbol = null;

const MAX_RECONNECT_ATTEMPTS = 20;
const CONNECTION_TIMEOUT = 10000;
const HEARTBEAT_INTERVAL = 25000;

// ============================================================
// DOM HELPER
// ============================================================

function $(id) {
    return document.getElementById(id);
}

// ============================================================
// STATUS
// ============================================================

function setStatus(message, connected = false) {

    const status = $("connectionStatus");

    if (!status) return;

    status.textContent = connected
        ? "● CONNECTED"
        : "● " + message;

    status.className = connected
        ? "status online"
        : "status offline";
}

function showConnectionMessage(message) {

    const pattern = $("patternMessage");

    if (pattern) {
        pattern.textContent = message;
    }

    console.log("[BLUEPRINT]", message);
}

// ============================================================
// CURRENT SYMBOL
// ============================================================

function getSymbol() {

    const selector = $("symbol");

    return selector
        ? selector.value
        : "1HZ10V";
}

// ============================================================
// WINDOW SIZE
// ============================================================

function getWindowSize() {

    const selector = $("windowSize");

    return selector
        ? Number(selector.value)
        : 500;
}

// ============================================================
// CLEAR TIMERS
// ============================================================

function clearConnectionTimer() {

    if (connectionTimer) {
        clearTimeout(connectionTimer);
        connectionTimer = null;
    }
}

function clearReconnectTimer() {

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

function clearHeartbeat() {

    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

// ============================================================
// START HEARTBEAT
// ============================================================

function startHeartbeat() {

    clearHeartbeat();

    heartbeatTimer = setInterval(() => {

        if (
            socket &&
            socket.readyState === WebSocket.OPEN
        ) {

            try {

                socket.send(
                    JSON.stringify({
                        ping: 1
                    })
                );

            } catch (error) {

                console.error(
                    "Heartbeat failed:",
                    error
                );

            }

        }

    }, HEARTBEAT_INTERVAL);
}

// ============================================================
// CONNECT
// ============================================================

function connectToDeriv() {

    manuallyClosed = false;

    clearReconnectTimer();
    clearConnectionTimer();
    clearHeartbeat();

    if (
        socket &&
        (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
        )
    ) {

        console.log(
            "Existing WebSocket is already active."
        );

        return;

    }

    setStatus("CONNECTING");

    showConnectionMessage(
        "Connecting to Deriv live tick server..."
    );

    try {

        socket = new WebSocket(WS_URL);

    } catch (error) {

        console.error(
            "WebSocket creation failed:",
            error
        );

        setStatus("CONNECTION ERROR");

        scheduleReconnect();

        return;
    }

    // --------------------------------------------------------
    // CONNECTION TIMEOUT
    // --------------------------------------------------------

    connectionTimer = setTimeout(() => {

        if (
            socket &&
            socket.readyState === WebSocket.CONNECTING
        ) {

            console.warn(
                "Connection timeout."
            );

            showConnectionMessage(
                "Deriv connection timed out. Retrying..."
            );

            try {
                socket.close();
            } catch {}

        }

    }, CONNECTION_TIMEOUT);

    // --------------------------------------------------------
    // OPEN
    // --------------------------------------------------------

    socket.onopen = () => {

        clearConnectionTimer();

        reconnectAttempts = 0;

        setStatus(
            "CONNECTED",
            true
        );

        showConnectionMessage(
            `Connected to Deriv. Subscribing to ${getSymbol()}...`
        );

        startHeartbeat();

        subscribeToTicks();

    };

    // --------------------------------------------------------
    // MESSAGE
    // --------------------------------------------------------

    socket.onmessage = event => {

        let data;

        try {

            data = JSON.parse(event.data);

        } catch (error) {

            console.error(
                "Invalid Deriv message:",
                event.data
            );

            return;
        }

        handleDerivMessage(data);

    };

    // --------------------------------------------------------
    // ERROR
    // --------------------------------------------------------

    socket.onerror = error => {

        console.error(
            "Deriv WebSocket error:",
            error
        );

        setStatus(
            "CONNECTION ERROR"
        );

    };

    // --------------------------------------------------------
    // CLOSE
    // --------------------------------------------------------

    socket.onclose = event => {

        clearConnectionTimer();
        clearHeartbeat();

        subscribedSymbol = null;

        console.warn(
            "Deriv socket closed:",
            event.code,
            event.reason
        );

        socket = null;

        if (manuallyClosed) {

            setStatus(
                "DISCONNECTED"
            );

            return;
        }

        setStatus(
            "RECONNECTING"
        );

        showConnectionMessage(
            "Connection lost. Attempting to reconnect..."
        );

        scheduleReconnect();

    };

}

// ============================================================
// HANDLE DERIV MESSAGES
// ============================================================

function handleDerivMessage(data) {

    // API error
    if (data.error) {

        console.error(
            "Deriv API error:",
            data.error
        );

        const message =
            data.error.message ||
            "Unknown Deriv API error";

        showConnectionMessage(
            "Deriv error: " + message
        );

        return;
    }

    // Subscription confirmation
    if (
        data.msg_type === "tick" &&
        data.subscription
    ) {

        subscribedSymbol = getSymbol();

        setStatus(
            "CONNECTED",
            true
        );

    }

    // Live tick
    if (data.msg_type === "tick") {

        processTick(
            data.tick
        );

        return;
    }

    // Ping response
    if (data.msg_type === "ping") {

        console.log(
            "Deriv heartbeat OK."
        );

        return;
    }

    // Forget response
    if (data.msg_type === "forget") {

        console.log(
            "Previous subscription removed."
        );

        return;
    }

}

// ============================================================
// SUBSCRIBE TO TICKS
// ============================================================

function subscribeToTicks() {

    if (
        !socket ||
        socket.readyState !== WebSocket.OPEN
    ) {

        console.warn(
            "Cannot subscribe: socket not open."
        );

        return;
    }

    const symbol = getSymbol();

    console.log(
        "Subscribing to:",
        symbol
    );

    try {

        socket.send(
            JSON.stringify({
                ticks: symbol,
                subscribe: 1
            })
        );

        showConnectionMessage(
            `Live ${symbol} tick stream active.`
        );

    } catch (error) {

        console.error(
            "Subscription failed:",
            error
        );

        showConnectionMessage(
            "Tick subscription failed."
        );

    }

}

// ============================================================
// CLOSE SOCKET
// ============================================================

function closeDerivConnection() {

    manuallyClosed = true;

    clearConnectionTimer();
    clearReconnectTimer();
    clearHeartbeat();

    subscribedSymbol = null;

    if (socket) {

        try {
            socket.close();
        } catch {}

    }

    socket = null;

}

// ============================================================
// RECONNECT
// ============================================================

function scheduleReconnect() {

    if (manuallyClosed) {
        return;
    }

    if (
        reconnectAttempts >=
        MAX_RECONNECT_ATTEMPTS
    ) {

        setStatus(
            "RECONNECT FAILED"
        );

        showConnectionMessage(
            "Unable to reconnect after multiple attempts. Press CONNECT to try again."
        );

        return;
    }

    clearReconnectTimer();

    reconnectAttempts++;

    const delay =
        Math.min(
            15000,
            1000 * Math.pow(
                1.5,
                reconnectAttempts - 1
            )
        );

    console.log(
        `Reconnect attempt ${reconnectAttempts} in ${Math.round(delay / 1000)} seconds.`
    );

    reconnectTimer = setTimeout(() => {

        connectToDeriv();

    }, delay);

}

// ============================================================
// PROCESS LIVE TICK
// ============================================================

function processTick(tick) {

    if (
        !tick ||
        tick.quote === undefined
    ) {

        return;
    }

    const quote =
        Number(tick.quote);

    if (!Number.isFinite(quote)) {
        return;
    }

    const pipSize =
        Number.isInteger(
            Number(tick.pip_size)
        )
            ? Number(tick.pip_size)
            : detectDecimals(
                tick.quote
            );

    const digit =
        extractLastDigit(
            tick.quote,
            pipSize
        );

    ticks.push({
        price: quote,
        digit: digit,
        time: Date.now()
    });

    const limit =
        getWindowSize();

    if (ticks.length > limit) {

        ticks =
            ticks.slice(
                -limit
            );

    }

    updateLiveDisplay(
        quote,
        digit,
        pipSize
    );

    updateAllAnalysis();

}

// ============================================================
// UPDATE LIVE DISPLAY
// ============================================================

function updateLiveDisplay(
    price,
    digit,
    pipSize
) {

    if ($("livePrice")) {

        $("livePrice").textContent =
            price.toFixed(
                pipSize
            );

    }

    if ($("lastDigit")) {

        $("lastDigit").textContent =
            digit;

    }

    if ($("tickCount")) {

        $("tickCount").textContent =
            ticks.length;

    }

}

// ============================================================
// EXTRACT LAST DIGIT
// ============================================================

function extractLastDigit(
    value,
    decimals
) {

    const fixed =
        Number(value).toFixed(
            decimals
        );

    const digits =
        fixed.replace(
            /\D/g,
            ""
        );

    if (!digits.length) {
        return 0;
    }

    return Number(
        digits[
            digits.length - 1
        ]
    );

}

// ============================================================
// DETECT DECIMALS
// ============================================================

function detectDecimals(value) {

    const stringValue =
        String(value);

    if (
        !stringValue.includes(".")
    ) {

        return 0;

    }

    return stringValue
        .split(".")[1]
        .length;

}

// ============================================================
// GET DIGITS
// ============================================================

function getDigits() {

    return ticks.map(
        tick => tick.digit
    );

}

// ============================================================
// FREQUENCY
// ============================================================

function calculateFrequency(
    digits
) {

    const frequency =
        Array(10).fill(0);

    digits.forEach(
        digit => {

            if (
                digit >= 0 &&
                digit <= 9
            ) {

                frequency[digit]++;

            }

        }
    );

    return frequency;

}

// ============================================================
// UPDATE EVERYTHING
// ============================================================

function updateAllAnalysis() {

    const digits =
        getDigits();

    if (!digits.length) {
        return;
    }

    updateDigitDistribution(
        digits
    );

    updateEvenOdd(
        digits
    );

    updateOverUnder(
        digits
    );

    updatePatterns(
        digits
    );

    updateRecentDigits(
        digits
    );

}

// ============================================================
// DIGIT DISTRIBUTION
// ============================================================

function updateDigitDistribution(
    digits
) {

    const frequency =
        calculateFrequency(
            digits
        );

    const total =
        digits.length;

    const grid =
        $("digitGrid");

    if (!grid) return;

    grid.innerHTML = "";

    frequency.forEach(
        (count, digit) => {

            const percentage =
                total
                    ? (
                        count /
                        total *
                        100
                    ).toFixed(1)
                    : "0.0";

            const box =
                document.createElement(
                    "div"
                );

            box.className =
                "digit-box";

            box.innerHTML = `
                <strong>${digit}</strong>
                <small>
                    ${count} • ${percentage}%
                </small>
            `;

            grid.appendChild(
                box
            );

        }
    );

}

// ============================================================
// MATCHES ANALYSIS
// ============================================================

function analyzeMatches() {

    const digits =
        getDigits();

    if (
        digits.length < 30
    ) {

        if ($("patternMessage")) {

            $("patternMessage").textContent =
                `Collecting data: ${digits.length}/30 ticks.`;

        }

        return;

    }

    const frequency =
        calculateFrequency(
            digits
        );

    const recentSize =
        Math.min(
            50,
            digits.length
        );

    const recent =
        digits.slice(
            -recentSize
        );

    const recentFrequency =
        calculateFrequency(
            recent
        );

    const scores =
        Array(10).fill(0);

    for (
        let digit = 0;
        digit <= 9;
        digit++
    ) {

        const overallRate =
            frequency[digit] /
            digits.length;

        const recentRate =
            recentFrequency[digit] /
            recent.length;

        const gap =
            digitGapScore(
                digits,
                digit
            );

        const repeat =
            repeatingEvidence(
                digits,
                digit
            );

        scores[digit] =
            (
                overallRate * 0.30
            ) +
            (
                recentRate * 0.35
            ) +
            (
                gap * 0.15
            ) +
            (
                repeat * 0.20
            );

    }

    let bestDigit = 0;

    for (
        let digit = 1;
        digit <= 9;
        digit++
    ) {

        if (
            scores[digit] >
            scores[bestDigit]
        ) {

            bestDigit =
                digit;

        }

    }

    const sorted =
        [...scores]
            .sort(
                (a, b) =>
                    b - a
            );

    const difference =
        sorted[0] -
        sorted[1];

    let confidence =
        50 +
        (
            difference * 500
        );

    confidence =
        Math.max(
            1,
            Math.min(
                99,
                confidence
            )
        );

    if ($("predictedDigit")) {

        $("predictedDigit").textContent =
            bestDigit;

    }

    if ($("matchConfidence")) {

        $("matchConfidence").textContent =
            confidence.toFixed(1) +
            "%";

    }

    if ($("confidenceBar")) {

        $("confidenceBar").style.width =
            confidence + "%";

    }

    if ($("patternMessage")) {

        $("patternMessage").textContent =
            `Digit ${bestDigit} currently has the strongest combined statistical score.`;

    }

}

// ============================================================
// DIGIT GAP SCORE
// ============================================================

function digitGapScore(
    digits,
    target
) {

    let gap = 0;

    for (
        let i = digits.length - 1;
        i >= 0;
        i--
    ) {

        if (
            digits[i] === target
        ) {

            break;

        }

        gap++;

    }

    return Math.min(
        1,
        gap / 20
    );

}

// ============================================================
// REPEATING EVIDENCE
// ============================================================

function repeatingEvidence(
    digits,
    target
) {

    const recent =
        digits.slice(
            -30
        );

    if (!recent.length) {
        return 0;
    }

    let occurrences = 0;

    recent.forEach(
        digit => {

            if (
                digit === target
            ) {

                occurrences++;

            }

        }
    );

    return Math.min(
        1,
        occurrences / 6
    );

}

// ============================================================
// EVEN / ODD
// ============================================================

function updateEvenOdd(
    digits
) {

    let even = 0;
    let odd = 0;

    digits.forEach(
        digit => {

            if (
                digit % 2 === 0
            ) {

                even++;

            } else {

                odd++;

            }

        }
    );

    const total =
        digits.length;

    const evenPercent =
        even / total * 100;

    const oddPercent =
        odd / total * 100;

    if ($("evenPercent")) {

        $("evenPercent").textContent =
            evenPercent.toFixed(1) +
            "%";

    }

    if ($("oddPercent")) {

        $("oddPercent").textContent =
            oddPercent.toFixed(1) +
            "%";

    }

    if ($("evenCount")) {

        $("evenCount").textContent =
            `${even} ticks`;

    }

    if ($("oddCount")) {

        $("oddCount").textContent =
            `${odd} ticks`;

    }

    if ($("evenBar")) {

        $("evenBar").style.width =
            evenPercent + "%";

    }

    if ($("oddBar")) {

        $("oddBar").style.width =
            oddPercent + "%";

    }

    if ($("evenOddSignal")) {

        if (
            evenPercent >
            oddPercent
        ) {

            $("evenOddSignal").textContent =
                `EVEN currently leads by ${(evenPercent - oddPercent).toFixed(1)} percentage points.`;

        } else if (
            oddPercent >
            evenPercent
        ) {

            $("evenOddSignal").textContent =
                `ODD currently leads by ${(oddPercent - evenPercent).toFixed(1)} percentage points.`;

        } else {

            $("evenOddSignal").textContent =
                "EVEN and ODD are currently balanced.";

        }

    }

}

// ============================================================
// OVER / UNDER
// ============================================================

function updateOverUnder(
    digits
) {

    if (!digits.length) {
        return;
    }

    const barrier =
        Number(
            $("barrier")
                ? $("barrier").value
                : 4
        );

    let over = 0;
    let under = 0;

    digits.forEach(
        digit => {

            if (
                digit > barrier
            ) {

                over++;

            } else if (
                digit < barrier
            ) {

                under++;

            }

        }
    );

    const total =
        over + under;

    if (!total) {
        return;
    }

    const overPercent =
        over / total * 100;

    const underPercent =
        under / total * 100;

    if ($("overPercent")) {

        $("overPercent").textContent =
            overPercent.toFixed(1) +
            "%";

    }

    if ($("underPercent")) {

        $("underPercent").textContent =
            underPercent.toFixed(1) +
            "%";

    }

    if ($("overCount")) {

        $("overCount").textContent =
            `${over} ticks`;

    }

    if ($("underCount")) {

        $("underCount").textContent =
            `${under} ticks`;

    }

    if ($("overBar")) {

        $("overBar").style.width =
            overPercent + "%";

    }

    if ($("underBar")) {

        $("underBar").style.width =
            underPercent + "%";

    }

    if ($("overUnderSignal")) {

        if (
            overPercent >
            underPercent
        ) {

            $("overUnderSignal").textContent =
                `OVER ${barrier} currently leads by ${(overPercent - underPercent).toFixed(1)} percentage points.`;

        } else if (
            underPercent >
            overPercent
        ) {

            $("overUnderSignal").textContent =
                `UNDER ${barrier} currently leads by ${(underPercent - overPercent).toFixed(1)} percentage points.`;

        } else {

            $("overUnderSignal").textContent =
                `OVER and UNDER are currently balanced around ${barrier}.`;

        }

    }

}

// ============================================================
// PATTERN ENGINE
// ============================================================

function updatePatterns(
    digits
) {

    if (
        digits.length < 20
    ) {

        if ($("patterns")) {

            $("patterns").textContent =
                "Collecting enough data for pattern analysis...";

        }

        return;

    }

    const recent =
        digits.slice(
            -100
        );

    const patterns = [];

    for (
        let length = 2;
        length <= 5;
        length++
    ) {

        const counts = {};

        for (
            let i = 0;
            i <= recent.length - length;
            i++
        ) {

            const pattern =
                recent
                    .slice(
                        i,
                        i + length
                    )
                    .join("");

            counts[pattern] =
                (
                    counts[pattern] ||
                    0
                ) + 1;

        }

        Object.entries(
            counts
        )
            .filter(
                ([pattern, count]) =>
                    count >= 2
            )
            .forEach(
                ([pattern, count]) => {

                    patterns.push({
                        pattern,
                        count,
                        length
                    });

                }
            );

    }

    patterns.sort(
        (a, b) => {

            if (
                b.count !==
                a.count
            ) {

                return (
                    b.count -
                    a.count
                );

            }

            return (
                b.length -
                a.length
            );

        }
    );

    const top =
        patterns.slice(
            0,
            8
        );

    if (!top.length) {

        $("patterns").textContent =
            "No repeating sequences detected.";

        return;

    }

    $("patterns").innerHTML =
        top.map(
            item => `
                <div class="pattern-item">
                    Pattern:
                    <strong>
                        ${item.pattern}
                    </strong>
                    —
                    repeated
                    <strong>
                        ${item.count}
                    </strong>
                    times
                </div>
            `
        ).join("");

}

// ============================================================
// RECENT DIGITS
// ============================================================

function updateRecentDigits(
    digits
) {

    if (!$("recentDigits")) {
        return;
    }

    const recent =
        digits.slice(
            -40
        );

    $("recentDigits").innerHTML =
        recent.map(
            digit => `
                <div class="recent-digit">
                    ${digit}
                </div>
            `
        ).join("");

}

// ============================================================
// RESET ANALYSIS
// ============================================================

function resetAnalysis() {

    ticks = [];

    if ($("livePrice")) {
        $("livePrice").textContent = "---";
    }

    if ($("lastDigit")) {
        $("lastDigit").textContent = "-";
    }

    if ($("tickCount")) {
        $("tickCount").textContent = "0";
    }

    if ($("predictedDigit")) {
        $("predictedDigit").textContent = "-";
    }

    if ($("matchConfidence")) {
        $("matchConfidence").textContent = "0%";
    }

    if ($("confidenceBar")) {
        $("confidenceBar").style.width = "0%";
    }

    if ($("recentDigits")) {
        $("recentDigits").textContent =
            "Waiting for ticks...";
    }

}

// ============================================================
// CHANGE SYMBOL
// ============================================================

function changeSymbol() {

    const newSymbol =
        getSymbol();

    console.log(
        "Changing market to:",
        newSymbol
    );

    resetAnalysis();

    closeDerivConnection();

    setTimeout(
        () => {

            manuallyClosed = false;

            connectToDeriv();

        },
        500
    );

}

// ============================================================
// CHANGE WINDOW
// ============================================================

function changeWindow() {

    const limit =
        getWindowSize();

    if (
        ticks.length >
        limit
    ) {

        ticks =
            ticks.slice(
                -limit
            );

    }

    updateAllAnalysis();

    analyzeMatches();

}

// ============================================================
// BUTTONS
// ============================================================

if ($("connectBtn")) {

    $("connectBtn")
        .addEventListener(
            "click",
            () => {

                manuallyClosed = false;

                reconnectAttempts = 0;

                connectToDeriv();

            }
        );

}

if ($("refreshBtn")) {

    $("refreshBtn")
        .addEventListener(
            "click",
            () => {

                updateAllAnalysis();

                analyzeMatches();

            }
        );

}

if ($("matchesBtn")) {

    $("matchesBtn")
        .addEventListener(
            "click",
            () => {

                analyzeMatches();

            }
        );

}

if ($("symbol")) {

    $("symbol")
        .addEventListener(
            "change",
            changeSymbol
        );

}

if ($("windowSize")) {

    $("windowSize")
        .addEventListener(
            "change",
            changeWindow
        );

}

if ($("barrier")) {

    $("barrier")
        .addEventListener(
            "change",
            () => {

                updateOverUnder(
                    getDigits()
                );

            }
        );

}

// ============================================================
// INITIAL STATE
// ============================================================

setStatus(
    "DISCONNECTED"
);

showConnectionMessage(
    "Press CONNECT to start the live Deriv tick stream."
);

// ============================================================
// AUTO CONNECT
// ============================================================

window.addEventListener(
    "load",
    () => {

        setTimeout(
            () => {

                connectToDeriv();

            },
            800
        );

    }
);

console.log(
    "Blueprint Analysis Tool loaded."
);
