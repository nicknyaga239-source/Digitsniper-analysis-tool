// App Configuration & Constants
const APP_ID = 1089; // Standard public testing app id.
const WS_URL = `wss://://derivws.com{APP_ID}`;

// State Management
let socket = null;
let currentSymbol = '1HZ50V'; // Default mapping for Volatility 50 (1s)
let analysisTicksLimit = 500;
let tickHistory = [];

// Market Mapping Dictionary (Matches dropdown text to Deriv API asset names)
const marketMapping = {
    'Volatility 50 (1s)': '1HZ50V',
    'Volatility 10 (1s)': '1HZ10V',
    'Volatility 25 (1s)': '1HZ25V',
    'Volatility 75 (1s)': '1HZ75V',
    'Volatility 100 (1s)': '1HZ100V'
};

// UI Selectors Definitions
let connectBtn, refreshBtn, marketSelect, windowSelect;

function init() {
    bindUIElements();
    setupEventListeners();
}

function bindUIElements() {
    // Scans your HTML buttons sequentially by tracking their text
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
        if (btn.textContent.includes('CONNECT')) connectBtn = btn;
        if (btn.textContent.includes('REFRESH')) refreshBtn = btn;
    });

    // Grabs select boxes
    const selects = document.querySelectorAll('select');
    if (selects.length >= 2) {
        marketSelect = selects[0];
        windowSelect = selects[1];
    } else if (selects.length === 1) {
        marketSelect = selects[0];
    }
}

function setupEventListeners() {
    if (connectBtn) connectBtn.addEventListener('click', handleConnectionWorkflow);
    if (refreshBtn) refreshBtn.addEventListener('click', handleRefresh);
    
    if (marketSelect) {
        marketSelect.addEventListener('change', (e) => {
            const selectedText = e.target.value;
            currentSymbol = marketMapping[selectedText] || selectedText;
            if (socket && socket.readyState === WebSocket.OPEN) {
                // If already actively running, switch asset stream seamlessly
                socket.send(JSON.stringify({ forget_all: 'ticks' }));
                sendTickSubscription();
            }
        });
    }
    
    if (windowSelect) {
        windowSelect.addEventListener('change', (e) => {
            analysisTicksLimit = parseInt(e.target.value) || 500;
        });
    }
}

function handleConnectionWorkflow() {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
        connectToPublicDerivWebSocket();
    } else {
        disconnectFromDerivWebSocket();
    }
}

// 🌐 OPENS PUBLIC CONNECTION TO THE DERIV WEBSOCKET (NO TOKEN REQUIRED)
function connectToPublicDerivWebSocket() {
    updateStatus('● CONNECTING...', '#ffc107');
    if (connectBtn) connectBtn.textContent = 'CONNECTING...';

    // Establish public websocket connection pipe
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
        updateStatus('● CONNECTED', '#00ff88');
        if (connectBtn) connectBtn.textContent = 'DISCONNECT';
        
        // Immediately request live tick data (no authorization needed for public streams)
        sendTickSubscription();
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.error) {
            console.error(`Deriv API Error: ${data.error.message}`);
            disconnectFromDerivWebSocket();
            return;
        }

        // Stream incoming public values straight into calculation engines
        if (data.msg_type === 'tick' && data.tick) {
            handleIncomingTick(data.tick);
        }
    };

    socket.onerror = (error) => {
        console.error('Deriv Connection Issue:', error);
        disconnectFromDerivWebSocket();
    };

    socket.onclose = () => {
        disconnectFromDerivWebSocket();
    };
}

function disconnectFromDerivWebSocket() {
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
    const decimalPlaces = tick.pip_size ? Math.abs(Math.log10(tick.pip_size)) : 4;
    const priceString = price.toFixed(decimalPlaces);
    const lastDigit = parseInt(priceString.slice(-1));

    // Update screen presentation text items
    updateUIDisplay(priceString, lastDigit);

    // Keep history tracking array tightly constrained to calculation window sizes
    tickHistory.push(lastDigit);
    if (tickHistory.length > analysisTicksLimit) {
        tickHistory.shift();
    }

    calculateBlueprintStatistics();
}

function updateUIDisplay(price, lastDigit) {
    // Updates components matching "LIVE PRICE"
    const livePriceBox = document.getElementById('live-price-val') || document.querySelector('.LIVE-PRICE + div');
    if (livePriceBox) livePriceBox.textContent = price;

    // Updates components matching "LAST DIGIT"
    const lastDigitBox = document.getElementById('last-digit-val') || document.querySelector('.LAST-DIGIT + div');
    if (lastDigitBox) lastDigitBox.textContent = lastDigit;

    // Fallback scanner if custom IDs aren't present yet
    if (!livePriceBox || !lastDigitBox) {
        const divs = document.querySelectorAll('div, span, p');
        divs.forEach(div => {
            if (div.textContent.trim() === '---' || (div.textContent.includes('.') && div.previousElementSibling?.textContent.includes('LIVE PRICE'))) {
                div.textContent = price;
            }
            if (div.textContent.trim() === '-' || (div.textContent.length === 1 && !isNaN(div.textContent) && div.previousElementSibling?.textContent.includes('LAST DIGIT'))) {
                div.textContent = lastDigit;
            }
        });
    }
}

function calculateBlueprintStatistics() {
    const totalTicks = tickHistory.length;
    if (totalTicks === 0) return;

    const digitCounts = Array(10).fill(0);
    let evenCount = 0, overCount = 0;

    tickHistory.forEach(digit => {
        digitCounts[digit]++;
        if (digit % 2 === 0) evenCount++;
        if (digit > 4) overCount++;
    });

    const oddCount = totalTicks - evenCount;
    const underCount = totalTicks - overCount;

    const evenPct = ((evenCount / totalTicks) * 100).toFixed(1);
    const oddPct = ((oddCount / totalTicks) * 100).toFixed(1);
    const overPct = ((overCount / totalTicks) * 100).toFixed(1);
    const underPct = ((underCount / totalTicks) * 100).toFixed(1);

    // Render stats dynamically if matching layout graphics bars are present in the DOM
    safeUpdateWidth('even-bar', evenPct);
    safeUpdateText('even-pct', `${evenPct}%`);
    safeUpdateWidth('odd-bar', oddPct);
    safeUpdateText('odd-pct', `${oddPct}%`);

    document.getElementById('even-bar')

    safeUpdateWidth('over-bar', overPct);
    safeUpdateText('over-pct', `${overPct}%`);
    safeUpdateWidth('under-bar', underPct);
    safeUpdateText('under-pct', `${underPct}%`);

    const maxCount = Math.max(...digitCounts);

    for (let i = 0; i <= 9; i++) {
        const pct = ((digitCounts[i] / totalTicks) * 100).toFixed(1);
        safeUpdateWidth(`digit-bar-${i}`, pct);
        safeUpdateText(`digit-text-${i}`, `${pct}%`);

        const boxEl = document.getElementById(`digit-box-${i}`);
        if (boxEl) {
            if (digitCounts[i] === maxCount && maxCount > 0) {
                boxEl.style.borderColor = '#ffc107';
                boxEl.style.boxShadow = '0 0 8px rgba(255, 193, 7, 0.2)';
            } else {
                boxEl.style.borderColor = '#132442';
                boxEl.style.boxShadow = 'none';
            }
        }
    }
}

// Visual Helper functions to prevent crashes if certain bars aren't present yet
function safeUpdateWidth(id, percentage) {
    const el = document.getElementById(id);
    if (el) el.style.width = `${percentage}%`;
}

function safeUpdateText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function handleRefresh() {
    tickHistory = [];
    clearDisplays();
    if (socket && socket.readyState === WebSocket.OPEN) {
        sendTickSubscription();
    }
}

function updateStatus(text, color) {
    const statusEl = document.getElementById('connectionStatus') || document.getElementById('status-indicator');
    if (statusEl) {
        statusEl.textContent = text;
        statusEl.style.color = color;
    } else {
        const allElements = document.querySelectorAll('*');
        for (let el of allElements) {
            if (el.textContent.includes('DISCONNECTED') || el.textContent.includes('CONNECTED') || el.textContent.includes('CONNECTING')) {
                el.textContent = text;
                el.style.color = color;
                break;
            }
        }
    }
}

function clearDisplays() {
    const livePriceBox = document.getElementById('live-price-val') || document.querySelector('.LIVE-PRICE + div');
    if (livePriceBox) livePriceBox.textContent = '---';

    const lastDigitBox = document.getElementById('last-digit-val') || document.querySelector('.LAST-DIGIT + div');
    if (lastDigitBox) lastDigitBox.textContent = '-';
}

init();
