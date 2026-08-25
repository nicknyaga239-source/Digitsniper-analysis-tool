let socket = null;
let ticks = [];

const MAX_TICKS = 5000;
const APP_ID = 1089;


// ======================================================
// DIGIT CARDS
// ======================================================

function createDigitCards() {

    const grid = document.getElementById("digitGrid");

    if (!grid) return;

    grid.innerHTML = "";

    for (let digit = 0; digit <= 9; digit++) {

        grid.innerHTML += `
            <div class="digit-card">

                <div class="digit-number">
                    ${digit}
                </div>

                <div
                    class="digit-percent"
                    id="digit-${digit}">
                    0%
                </div>

            </div>
        `;
    }
}


// ======================================================
// STATUS
// ======================================================

function setStatus(message, connected = false) {

    const text =
        document.getElementById("statusText");

    const dot =
        document.getElementById("statusDot");

    if (text) {
        text.textContent = message;
    }

    if (dot) {
        dot.classList.toggle(
            "connected",
            connected
        );
    }
}


// ======================================================
// PUBLIC WEBSOCKET CONNECTION
// ======================================================

function connect() {

    disconnect();

    const symbolElement =
        document.getElementById("symbol");

    const symbol =
        symbolElement
            ? symbolElement.value
            : "R_10";


    setStatus("Connecting...");


    socket = new WebSocket(
        `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`
    );


    // ------------------------------------------
    // SOCKET OPEN
    // ------------------------------------------

    socket.onopen = function () {

        setStatus(
            "Connected",
            true
        );


        /*
         * Subscribe to the PUBLIC
         * live tick stream.
         */

        socket.send(
            JSON.stringify({

                ticks: symbol,

                subscribe: 1

            })
        );
    };


    // ------------------------------------------
    // RECEIVE DATA
    // ------------------------------------------

    socket.onmessage = function(event) {

        let data;

        try {

            data =
                JSON.parse(event.data);

        } catch (error) {

            console.error(
                "Invalid WebSocket response",
                error
            );

            return;
        }


        // API/server error

        if (data.error) {

            console.error(
                "WebSocket error:",
                data.error
            );

            setStatus(
                "Error: " +
                data.error.message
            );

            return;
        }


        // --------------------------------------
        // LIVE TICK
        // --------------------------------------

        if (
            data.msg_type === "tick" &&
            data.tick
        ) {

            processTick(
                data.tick.quote
            );
        }
    };


    // ------------------------------------------
    // SOCKET ERROR
    // ------------------------------------------

    socket.onerror = function(error) {

        console.error(
            "WebSocket error:",
            error
        );

        setStatus(
            "Connection error"
        );
    };


    // ------------------------------------------
    // SOCKET CLOSED
    // ------------------------------------------

    socket.onclose = function() {

        setStatus(
            "Disconnected"
        );

        socket = null;
    };
}


// ======================================================
// DISCONNECT
// ======================================================

function disconnect() {

    if (socket) {

        try {
            socket.close();
        } catch (error) {
            console.error(error);
        }

        socket = null;
    }

    setStatus(
        "Disconnected"
    );
}


// ======================================================
// PROCESS LIVE TICK
// ======================================================

function processTick(price) {

    const number =
        Number(price);

    if (!Number.isFinite(number)) {
        return;
    }


    /*
     * Extract the final displayed
     * decimal digit.
     */

    const text =
        String(price);

    const clean =
        text.replace(".", "");

    const digit =
        Number(
            clean.slice(-1)
        );


    if (
        !Number.isInteger(digit) ||
        digit < 0 ||
        digit > 9
    ) {
        return;
    }


    ticks.push({

        price: number,

        digit: digit,

        time: new Date()

    });


    if (
        ticks.length >
        MAX_TICKS
    ) {

        ticks.shift();
    }


    updateDashboard();
}


// ======================================================
// MAIN DASHBOARD UPDATE
// ======================================================

function updateDashboard() {

    const total =
        ticks.length;


    setText(
        "tickCount",
        total
    );


    setText(
        "sampleSize",
        total
    );


    if (!total) {
        return;
    }


    const latest =
        ticks[ticks.length - 1];


    setText(
        "currentPrice",
        latest.price
    );


    setText(
        "lastDigit",
        latest.digit
    );


    // Analysis order:

    analyzeMatches();

    analyzeEvenOdd();

    analyzeOverUnder();

    analyzePatterns();

    updateTable();
}


// ======================================================
// 1. MATCHES / DIGIT FREQUENCY
// ======================================================

function analyzeMatches() {

    if (!ticks.length) {
        return;
    }


    const counts =
        Array(10).fill(0);


    ticks.forEach(
        tick => {

            counts[tick.digit]++;

        }
    );


    const total =
        ticks.length;


    for (
        let digit = 0;
        digit <= 9;
        digit++
    ) {

        const percentage =
            (
                counts[digit] /
                total
            ) * 100;


        setText(

            `digit-${digit}`,

            percentage.toFixed(2) +
            "%"

        );
    }


    /*
     * Recent 100-tick comparison.
     */

    const recent =
        ticks.slice(-100);


    const recentCounts =
        Array(10).fill(0);


    recent.forEach(
        tick => {

            recentCounts[
                tick.digit
            ]++;

        }
    );


    const ranking =
        recentCounts
            .map(
                (count, digit) => ({

                    digit,

                    count,

                    percentage:
                        (
                            count /
                            recent.length
                        ) * 100

                })
            )
            .sort(
                (a, b) =>
                    b.count -
                    a.count
            );


    console.log(
        "MATCHES / DIGIT ANALYSIS"
    );

    console.table(
        ranking
    );
}


// ======================================================
// 2. EVEN / ODD
// ======================================================

function analyzeEvenOdd() {

    if (!ticks.length) {
        return;
    }


    const even =
        ticks.filter(
            tick =>
                tick.digit % 2 === 0
        ).length;


    const odd =
        ticks.length -
        even;


    const evenPercentage =
        (
            even /
            ticks.length
        ) * 100;


    const oddPercentage =
        (
            odd /
            ticks.length
        ) * 100;


    setText(
        "evenPercent",

        evenPercentage.toFixed(2) +
        "%"
    );


    setText(
        "oddPercent",

        oddPercentage.toFixed(2) +
        "%"
    );


    setWidth(
        "evenBar",
        evenPercentage
    );


    setWidth(
        "oddBar",
        oddPercentage
    );
}


// ======================================================
// 3. OVER / UNDER
// ======================================================

function analyzeOverUnder() {

    if (!ticks.length) {
        return;
    }


    const barrierElement =
        document.getElementById(
            "barrier"
        );


    const barrier =
        barrierElement
            ? Number(
                barrierElement.value
            )
            : 5;


    const over =
        ticks.filter(
            tick =>
                tick.digit >
                barrier
        ).length;


    const under =
        ticks.filter(
            tick =>
                tick.digit <
                barrier
        ).length;


    const equal =
        ticks.filter(
            tick =>
                tick.digit ===
                barrier
        ).length;


    const total =
        ticks.length;


    setText(

        "overPercent",

        (
            over /
            total *
            100
        ).toFixed(2) +
        "%"

    );


    setText(

        "underPercent",

        (
            under /
            total *
            100
        ).toFixed(2) +
        "%"

    );


    console.log(
        "OVER / UNDER ANALYSIS",
        {
            barrier,
            over,
            under,
            equal
        }
    );
}


// ======================================================
// REPEATING PATTERN ANALYSIS
// ======================================================

function analyzePatterns() {

    if (
        ticks.length <
        10
    ) {
        return;
    }


    const digits =
        ticks.map(
            tick =>
                tick.digit
        );


    const patterns3 =
        findRepeatedSequences(
            digits,
            3
        );


    const patterns4 =
        findRepeatedSequences(
            digits,
            4
        );


    const totalRepeated =
        patterns3.length +
        patterns4.length;


    setText(
        "repeatedPatterns",
        totalRepeated
    );


    calculateStreaks();


    setText(
        "dataQuality",

        ticks.length >= 100
            ? "Sufficient sample"
            : "Collecting data"
    );


    console.log(
        "REPEATING 3-DIGIT PATTERNS",
        patterns3.slice(0, 20)
    );


    console.log(
        "REPEATING 4-DIGIT PATTERNS",
        patterns4.slice(0, 20)
    );
}


// ======================================================
// FIND REPEATED SEQUENCES
// ======================================================

function findRepeatedSequences(
    data,
    length
) {

    const sequences = {};


    for (
        let i = 0;
        i <=
        data.length -
        length;
        i++
    ) {

        const sequence =
            data
                .slice(
                    i,
                    i + length
                )
                .join("-");


        sequences[sequence] =
            (
                sequences[sequence] ||
                0
            ) + 1;
    }


    return Object.entries(
        sequences
    )
    .filter(
        ([sequence, count]) =>
            count > 1
    )
    .map(
        ([sequence, count]) => ({

            sequence,

            occurrences:
                count

        })
    )
    .sort(
        (a, b) =>
            b.occurrences -
            a.occurrences
    );
}


// ======================================================
// EVEN / ODD STREAKS
// ======================================================

function calculateStreaks() {

    let currentEven = 0;

    let currentOdd = 0;

    let longestEven = 0;

    let longestOdd = 0;


    ticks.forEach(
        tick => {

            if (
                tick.digit %
                2 === 0
            ) {

                currentEven++;

                currentOdd = 0;


                longestEven =
                    Math.max(
                        longestEven,
                        currentEven
                    );

            } else {

                currentOdd++;

                currentEven = 0;


                longestOdd =
                    Math.max(
                        longestOdd,
                        currentOdd
                    );
            }

        }
    );


    setText(
        "evenStreak",
        longestEven
    );


    setText(
        "oddStreak",
        longestOdd
    );
}


// ======================================================
// RECENT TICKS TABLE
// ======================================================

function updateTable() {

    const table =
        document.getElementById(
            "tickTable"
        );


    if (!table) {
        return;
    }


    const recent =
        ticks
            .slice(-20)
            .reverse();


    table.innerHTML = "";


    recent.forEach(
        tick => {

            const row =
                document.createElement(
                    "tr"
                );


            const type =
                tick.digit %
                2 === 0
                    ? "Even"
                    : "Odd";


            row.innerHTML = `

                <td>
                    ${tick.time.toLocaleTimeString()}
                </td>

                <td>
                    ${tick.price}
                </td>

                <td>
                    ${tick.digit}
                </td>

                <td>
                    ${type}
                </td>

            `;


            table.appendChild(
                row
            );
        }
    );
}


// ======================================================
// MARKET SELECTOR
// ======================================================

document
    .getElementById(
        "symbol"
    )
    .addEventListener(
        "change",
        function() {

            const selected =
                this.options[
                    this.selectedIndex
                ].text;


            setText(
                "marketName",
                selected
            );


            // Clear old market data

            ticks = [];


            updateDashboard();
        }
    );


// ======================================================
// BARRIER SELECTOR
// ======================================================

document
    .getElementById(
        "barrier"
    )
    .addEventListener(
        "change",
        analyzeOverUnder
    );


// ======================================================
// BUTTONS
// ======================================================

document
    .getElementById(
        "connectBtn"
    )
    .addEventListener(
        "click",
        connect
    );


document
    .getElementById(
        "disconnectBtn"
    )
    .addEventListener(
        "click",
        disconnect
    );


// ======================================================
// CLEAR
// ======================================================

document
    .getElementById(
        "clearBtn"
    )
    .addEventListener(
        "click",
        function() {

            ticks = [];


            updateDashboard();


            const table =
                document.getElementById(
                    "tickTable"
                );


            if (table) {

                table.innerHTML = `

                    <tr>

                        <td
                            colspan="4"
                            class="empty"
                        >
                            Tick history cleared.
                        </td>

                    </tr>

                `;
            }
        }
    );


// ======================================================
// HELPERS
// ======================================================

function setText(
    id,
    value
) {

    const element =
        document.getElementById(id);


    if (element) {
        element.textContent =
            value;
    }
}


function setWidth(
    id,
    value
) {

    const element =
        document.getElementById(id);


    if (element) {

        element.style.width =
            Math.max(
                0,
                Math.min(
                    100,
                    value
                )
            ) + "%";
    }
}


// ======================================================
// START
// ======================================================

createDigitCards();

setStatus(
    "Disconnected"
);
