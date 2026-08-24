// App Configuration & Constants
const APP_ID = 1089; // Standard open testing app_id. Replace with your own registered Deriv App ID if required.
const WS_URL = `wss://://derivws.com{APP_ID}`;

// State Management
let socket = null;
let currentSymbol = '1HZ50V'; // Default: Volatility 50 (1s)
let analysisTicksLimit = 500;
let tickHistory = [];

// Market Mapping (UI Text -> Deriv API System Symbols)
const marketMapping = {
    'Volatility 50 (1s)': '1HZ50V',
    'Volatility 10 (1s)': '1HZ10V',
    'Volatility 25 (1s)': '1HZ25V',
    'Volatility 75 (1s)': '1HZ75V',
    'Volatility 100 (1s)': '1HZ100V'
};

// UI Selectors (Targeting layout items via your explicit text contents)
let connectBtn, refreshBtn, marketSelect, windowSelect;

// Initialize Application
function init() {
    bindUIElements();
    setupEventListeners();
}

function bindUIElements() {
    // Map buttons dynamically by scanning their visual text content
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
        if (btn.textContent.includes('CONNECT')) connectBtn = btn;
        if (btn.textContent.includes('REFRESH')) refreshBtn = btn;
    });

    // Map select dropdowns sequentially based on your visual layout
    const selects = document.querySelectorAll('select');
    if (selects.length >= 2) {
        marketSelect = selects[0];
        windowSelect = selects[1];
    } else {
        marketSelect = document.querySelector('select');
    }
}

function setupEventListeners() {
    if (connectBtn) connectBtn.addEventListener('click', toggleConnection);
    if (refreshBtn) refreshBtn.addEventListener('click', handleRefresh);
    
    if (marketSelect) {
        marketSelect.addEventListener('change', (e) => {
            const selectedText = e.target.value;
            currentSymbol = marketMapping[selectedText] || selectedText;
            if (socket && socket.readyState === WebSocket.OPEN) {
                disconnectFromMarket();
                connectToMarket();
            }
        });
    }
    
    if (windowSelect) {
        windowSelect.addEventListener('change', (e) => {
            analysisTicksLimit = parseInt(e.target.value) || 500;
            calculateBlueprintMetrics(); // Re-calculate based on new window size
        });
    }
}

function toggleConnection() {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
        connectToMarket();
    } else {
        disconnectFromMarket();
    }
}

function connectToMarket() {
    updateStatus('● CONNECTING...', '#ffc107');
    if (connectBtn) connectBtn.textContent = 'CONNECTING...';

    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        updateStatus('● CONNECTED', '#00ff88');
        if (connectBtn) connectBtn.textContent = 'DISCONNECT';
        sendTickSubscription();
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.error) {
            console.error('API Error:', data.error.message);
            return;
        }
        if (data.msg_type === 'tick' && data.tick) {
            handleIncomingTick(data.tick);
        }
    };

    socket.onerror = (error) => {
        console.error('WebSocket Failure:', error);
        disconnectFromMarket();
    };

    socket.onclose = () => {
        disconnectFromMarket();
    };
}

function disconnectFromMarket() {
    if (socket) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ forget_all: 'ticks' }));
            socket.close();
        }
        socket = null;
    }
    updateStatus('● DISCONNECTED', '#ff0055');
    if (connectBtn) connectBtn.textContent = 'CONNECT';
    clearDisplays();
}

function sendTickSubscription() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            ticks: currentSymbol,
            subscribe: 1
        }));
    }
}

function handleIncomingTick(tick) {
    const price = tick.quote;
    // Accurate extraction of the absolute last digit fractional part
    const decimalPlaces = tick.pip_size ? Math.abs(Math.log10(tick.pip_size)) : 4;
    const priceString = price.toFixed(decimalPlaces);
    const lastDigit = parseInt(priceString.slice(-1));

    // Render parameters live onto target UI slots
    updateUIDisplay(priceString, lastDigit);

    // Save history array for calculation windows
    tickHistory.push(lastDigit);
    if (tickHistory.length > analysisTicksLimit) {
        tickHistory.shift();
    }

    calculateBlueprintMetrics();
}

function updateUIDisplay(price, lastDigit) {
    const divs = document.querySelectorAll('div');
    divs.forEach(div => {
        // Matches live price placement blocks
        if (div.textContent.trim() === '---' || (div.textContent.includes('.') && div.previousElementSibling?.textContent.includes('LIVE PRICE'))) {
            div.textContent = price;
        }
        // Matches last digit placement blocks
        if (div.textContent.trim() === '-' || (div.textContent.length === 1 && !isNaN(div.textContent) && div.previousElementSibling?.textContent.includes('LAST DIGIT'))) {
            div.textContent = lastDigit;
        }
    });
}

function calculateBlueprintMetrics() {
    const totalTicks = tickHistory.length;
    if (totalTicks === 0) return;

    // 1. MATCHES / DIFFERS (Digit Frequency Counters 0-9)
    const digitCounts = Array(10).fill(0);
    
    // 2. EVEN / ODD Counters
    let evenCount = 0;
    let oddCount = 0;

    // 3. OVER / UNDER Counters (Standard Blueprint benchmark is Over 4 / Under 5)
    let overCount = 0; // Digits: 5, 6, 7, 8, 9
    let underCount = 0; // Digits: 0, 1, 2, 3, 4

    // Run statistical pass through the sliding data window
    tickHistory.forEach(digit => {
        // Frequency track
        digitCounts[digit]++;

        // Even/Odd track
        if (digit % 2 === 0) {
            evenCount++;
        } else {
            oddCount++;
        }

        // Over/Under track
        if (digit > 4) {
            overCount++;
        } else {
            underCount++;
        }
    });

    // Translate counts to explicit percentages
    const digitPercentages = digitCounts.map(count => ((count / totalTicks) * 100).toFixed(1));
    const evenPercentage = ((evenCount / totalTicks) * 100).toFixed(1);
    const oddPercentage = ((oddCount / totalTicks) * 100).toFixed(1);
    const overPercentage = ((overCount / totalTicks) * 100).toFixed(1);
    const underPercentage = ((underCount / totalTicks) * 100).toFixed(1);

    // Render statistics to console (and updates UI containers if you paste them below)
    renderStatsToUI({
        digits: digitPercentages,
        even: evenPercentage,
        odd: oddPercentage,
        over: overPercentage,
        under: underPercentage,
        sampleSize: totalTicks
    });
}

function renderStatsToUI(stats) {
    console.clear();
    console.log(`%c[Blueprint Metrics] Window Size: ${stats.sampleSize} ticks`, 'color: #00ff88; font-weight: bold;');
    
    // Output 1: Matches / Differs distribution
    console.log('%c1. Digit Frequency (Matches/Differs Ratio):', 'color: #2196F3; font-weight: bold;');
    stats.digits.forEach((pct, digit) => {
        console.log(`   Digit [${digit}]: ${pct}%`);
    });

    // Output 2: Even / Odd distribution
    console.log('%c2. Even vs Odd Ratio:', 'color: #2196F3; font-weight: bold;');
    console.log(`   EVEN: ${stats.even}% | ODD: ${stats.odd}%`);

    // Output 3: Over / Under distribution
    console.log('%c3. Over 4 vs Under 5 Ratio:', 'color: #2196F3; font-weight: bold;');
    console.log(`   OVER (5-9): ${stats.over}% | UNDER (0-4): ${stats.under}%`);

    /** 
     * NOTE FOR USER: If you add elements to your index.html to visually display these stats,
     * you can bind them directly here. For example:
     * document.querySelector('#even-pct').textContent = stats.even + '%';
     * document.querySelector('#under-pct').textContent = stats.under + '%';
     */
}

function handleRefresh() {
    tickHistory = [];
    clearDisplays();
    if (socket && socket.readyState === WebSocket.OPEN) {
        sendTickSubscription();
    }
}

function updateStatus(text, color) {
    // Looks for explicit DISCONNECTED state banner elements or header spans
    const statusEl = document.querySelector('span, h5, .DISCONNECTED') || document.body;
    if (statusEl) {
        // Handles finding text nodes containing 'DISCONNECTED' safely
        const allElements = document.querySelectorAll('*');
        for (let el of allElements) {
            if (el.textContent.includes('DISCONNECTED') || el.textContent.includes('CONNECTED')) {
                el.textContent = text;
                el.style.color = color;
                break;
            }
        }
    }
}

function clearDisplays() {
    const divs = document.querySelectorAll('div');
    divs.forEach(div => {
        if (div.previousElementSibling?.textContent.includes('LIVE PRICE')) div.textContent = '---';
        if (div.previousElementSibling?.textContent.includes('LAST DIGIT')) div.textContent = '-';
    });
}

// Initial Call
init();
