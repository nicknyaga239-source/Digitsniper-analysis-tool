// App Configuration & Constants
const APP_ID = 1089; 
const WS_URL = `wss://://derivws.com{APP_ID}`;

// State Management
let socket = null;
let currentSymbol = '1HZ50V'; 
let analysisTicksLimit = 500;
let tickHistory = [];
let apiToken = ''; 

// Market Mapping Dictionary
const marketMapping = {
    'Volatility 50 (1s)': '1HZ50V',
    'Volatility 10 (1s)': '1HZ10V',
    'Volatility 25 (1s)': '1HZ25V',
    'Volatility 75 (1s)': '1HZ75V',
    'Volatility 100 (1s)': '1HZ100V'
};

// UI Selectors References
let connectBtn, refreshBtn, marketSelect, windowSelect, tokenInput;

function init() {
    bindUIElements();
    loadStoredToken(); 
    buildHTMLDigitGridTemplate(); // Build out 0-9 indicators right at launch
    setupEventListeners();
}

function bindUIElements() {
    tokenInput = document.querySelector('#deriv-token, input[type="text"], input[type="password"]');
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
        if (btn.textContent.includes('CONNECT')) connectBtn = btn;
        if (btn.textContent.includes('REFRESH')) refreshBtn = btn;
    });
    const selects = document.querySelectorAll('select');
    if (selects.length >= 2) {
        marketSelect = selects[0];
        windowSelect = selects[1];
    } else if (selects.length === 1) {
        marketSelect = selects[0];
    }
}

// Generate the placeholder elements for digits 0-9 on launch
function buildHTMLDigitGridTemplate() {
    const gridContainer = document.getElementById('digit-grid-container');
    if (!gridContainer) return;
    
    gridContainer.innerHTML = '';
    for (let i = 0; i <= 9; i++) {
        gridContainer.innerHTML += `
            <div class="digit-row-item" id="digit-box-${i}">
                <div class="digit-label">Digit ${i}</div>
                <div class="digit-progress-bg">
                    <div class="digit-progress-fill" id="digit-bar-${i}"></div>
                </div>
                <div class="digit-pct-text" id="digit-text-${i}">0.0%</div>
            </div>
        `;
    }
}

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
            calculateBlueprintMetrics();
        });
    }
}

function handleConnectionWorkflow() {
    if (tokenInput) apiToken = tokenInput.value.trim();

    if (!apiToken && (!socket || socket.readyState === WebSocket.CLOSED)) {
        alert('Please paste your Deriv API Token first!');
        updateStatus('● TOKEN REQUIRED', '#ff9800');
        return;
    }

    if (!socket || socket.readyState === WebSocket.CLOSED) {
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
            updateStatus('● CONNECTED (SECURE)', '#00ff88');
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

function updateUIDisplay(price, lastDigit) {
    const divs = document.querySelectorAll('div');
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
    const totalTicks = tickHistory.length;
    if (totalTicks === 0) return;

    const digitCounts = Array(10).fill(0);
    let evenCount = 0, oddCount = 0;
    let overCount = 0, underCount = 0;

    tickHistory.forEach(digit => {
        digitCounts[digit]++;
        if (digit % 2 === 0) evenCount++; else oddCount++;
        if (digit > 4) overCount++; else underCount++;
    });

    // Calculate structural percentage profiles
    const evenPct = ((evenCount / totalTicks) * 100).toFixed(1);
    const oddPct = ((oddCount / totalTicks) * 100).toFixed(1);
    const overPct = ((overCount / totalTicks) * 100).toFixed(1);
    const underPct = ((underCount / totalTicks) * 100).toFixed(1);

    // Dynamic graphic adjustments into DOM targets
    document.getElementById('even-bar').style.width = `${evenPct}%`;
    document.getElementById('even-pct').textContent = `${evenPct}%`;
    document.getElementById('odd-bar').style.width = `${oddPct}%`;
    document.getElementById('odd-pct').textContent = `${oddPct}%`;

    document.getElementById('over-bar').style.width = `${overPct}%`;
    document.getElementById('over-pct').textContent = `${overPct}%`;
    document.getElementById('under-bar').style.width = `${underPct}%`;
    document.getElementById('under-pct').textContent = `${underPct}%`;

    // Map the 0-9 density outputs
    for (let i = 0; i <= 9; i++) {
        const pct = ((digitCounts[i] / totalTicks) * 100).toFixed(1);
        const barEl = document.getElementById(`digit-bar-${i}`);
        const textEl = document.getElementById(`digit-text-${i}`);
        const cardBox = document.getElementById(`digit-box-${i}`);
        
        if (barEl) barEl.style.width = `${pct}%`;
        if (textEl) textEl.textContent = `${pct}%`;

        // Highlight dominant digit in gold like Blueprint Tool
        if (cardBox) {
            if (digitCounts[i] === Math.max(...digitCounts) && Math.max(...digitCounts) > 0) {
                cardBox.style.borderColor = '#ffc107';
                if (textEl) textEl.style.color = '#ffc107';
                if (barEl) barEl.style.backgroundColor = '#ffc107';
            } else {
                cardBox.style.borderColor = '#132442';
                if (textEl) textEl.style.color = '#00ff88';
                if (barEl) barEl.style.backgroundColor = '#00ff88';
            }
        }
    }
}

function handleRefresh() {
    tickHistory = [];
    clearDisplays();
    buildHTMLDigitGridTemplate();
    if (socket && socket.readyState === WebSocket.OPEN) {
        sendTickSubscription();
    }
}

function updateStatus(text, color) {
    const allElements = document.querySelectorAll('*');
    for (let el of allElements) {
        if (el.textContent.includes('DISCONNECTED') || el.textContent.includes('CONNECTED') || el.textContent.includes('AUTHORIZING') || el.textContent.includes('TOKEN')) {
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
