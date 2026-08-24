// App Configuration & Constants
const APP_ID = 1089; 
const WS_URL = `wss://://derivws.com{APP_ID}`;

// State Management
let socket = null;
let currentSymbol = '1HZ50V'; // Default: Volatility 50 (1s)
let analysisTicksLimit = 500;
let tickHistory = [];
let apiToken = ''; 

// Market Mapping (UI Dropdown Value -> Deriv API System Symbols)
const marketMapping = {
    'Volatility 50 (1s)': '1HZ50V',
    'Volatility 10 (1s)': '1HZ10V',
    'Volatility 25 (1s)': '1HZ25V',
    'Volatility 75 (1s)': '1HZ75V',
    'Volatility 100 (1s)': '1HZ100V'
};

// UI Element Targets
let connectBtn, refreshBtn, marketSelect, windowSelect, tokenInput;

function init() {
    bindUIElements();
    loadStoredToken(); 
    setupEventListeners();
}

function bindUIElements() {
    // Target the newly inserted token container
    tokenInput = document.getElementById('deriv-token');

    // Dynamically query your template buttons by identifying their text matches
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
        if (btn.textContent.includes('CONNECT')) connectBtn = btn;
        if (btn.textContent.includes('REFRESH')) refreshBtn = btn;
    });

    // Detect dropdown select blocks natively
    const selects = document.querySelectorAll('select');
    if (selects.length >= 2) {
        marketSelect = selects[0];
        windowSelect = selects[1];
    } else if (selects.length === 1) {
        marketSelect = selects[0];
    }
}

// Automatically load your token from local storage if it exists
function loadStoredToken() {
    const savedToken = localStorage.getItem('deriv_api_token');
    if (savedToken && tokenInput) {
        tokenInput.value = savedToken;
        updateStatus('● TOKEN LOADED', '#00bcd4');
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
    if (tokenInput) {
        apiToken = tokenInput.value.trim();
    }

    if (!apiToken && (!socket || socket.readyState === WebSocket.CLOSED)) {
        alert('Please paste your Deriv API Token first!');
        updateStatus('● TOKEN REQUIRED', '#ff9800');
        return;
    }

    if (!socket || socket.readyState === WebSocket.CLOSED) {
        // Save to browser memory
        localStorage.setItem('deriv_api_token', apiToken);
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
        updateStatus('● AUTHORIZING...', '#00bcd4');
        socket.send(JSON.stringify({ authorize: apiToken }));
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.error) {
            alert(`Deriv API Error: ${data.error.message}`);
            localStorage.removeItem('deriv_api_token');
            disconnectFromMarket();
            return;
        }

        if (data.msg_type === 'authorize') {
            updateStatus('● CONNECTED', '#00ff88');
            if (connectBtn) connectBtn.textContent = 'DISCONNECT';
            sendTickSubscription();
        }

        if (data.msg_type === 'tick' && data.tick) {
            handleIncomingTick(data.tick);
        }
    };

    socket.onerror = () => disconnectFromMarket();
    socket.onclose = () => disconnectFromMarket();
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
        socket.send(JSON.stringify({ ticks: currentSymbol, subscribe: 1 }));
    }
}

function handleIncomingTick(tick) {
    const price = tick.quote;
    const decimalPlaces = tick.pip_size ? Math.abs(Math.log10(tick.pip_size)) : 4;
    const priceString = price.toFixed(decimalPlaces);
    const lastDigit = parseInt(priceString.slice(-1));

    updateUIDisplay(priceString, lastDigit);

    tickHistory.push(lastDigit);
    if (tickHistory.length > analysisTicksLimit) {
        tickHistory.shift();
    }

    calculateBlueprintMetrics();
}

// Maps values safely onto your existing UI text structures
function updateUIDisplay(price, lastDigit) {
    const divs = document.querySelectorAll('div, span');
    divs.forEach(div => {
        if (div.textContent.trim() === '---' || (div.textContent.includes('.') && div.previousElementSibling?.textContent.includes('LIVE PRICE'))) {
            div.textContent = price;
        }
        if (div.textContent.trim() === '-' || (div.textContent.length === 1 && !isNaN(div.textContent) && div.previousElementSibling?.textContent.includes('LAST DIGIT'))) {
            div.textContent = lastDigit;
        }
    });
}

function calculateBlueprintMetrics() {
    if (tickHistory.length === 0) return;

    // Compiles stats in your browser's console tab
    const digitCounts = Array(10).fill(0);
    tickHistory.forEach(digit => digitCounts[digit]++);
    
    console.clear();
    console.log(`[Blueprint Analyzer] Tracking pool size: ${tickHistory.length} ticks.`);
    digitCounts.forEach((c, d) => {
        console.log(`Digit ${d}: ${((c / tickHistory.length) * 100).toFixed(1)}%`);
    });
}

function handleRefresh() {
    tickHistory = [];
    clearDisplays();
    if (socket && socket.readyState === WebSocket.OPEN) {
        sendTickSubscription();
    }
}

function updateStatus(text, color) {
    const allElements = document.querySelectorAll('*');
    for (let el of allElements) {
        if (el.textContent.includes('DISCONNECTED') || el.textContent.includes('CONNECTED') || el.textContent.includes('AUTHORIZING')) {
            el.textContent = text;
            el.style.color = color;
            break;
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

init();
