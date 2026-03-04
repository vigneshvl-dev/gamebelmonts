// --- BELMONTS: TECH ARENA - Core Logic ---

// Emergency Error Logger
window.onerror = function (msg, url, line) {
    const err = `System Error: ${msg} [${line}]`;
    console.error(err);
    // If stuck in loading, try to force reveal
    const loading = document.getElementById('loading-screen');
    if (loading && loading.classList.contains('active')) {
        setTimeout(() => {
            loading.style.display = 'none';
            const home = document.getElementById('home-screen');
            if (home) home.classList.add('active');
        }, 5000);
    }
};

console.log("ARENA CORE: INITIALIZING...");

// Supabase - Defensive Init
let supabase = null;
try {
    const supabaseUrl = 'https://loousnbpmmjrwnfwkqxs.supabase.co';
    const supabaseKey = 'sb_publishable_SBrp-zgLSnJAQb8_XAyECQ_Vj8zF5kN';
    if (window.supabase) {
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
} catch (e) {
    console.warn("Supabase Init Failed - Offline Mode Active");
}

// Global state
const state = {
    playerName: '',
    playerId: '',
    userRole: null,
    currentScreen: 'loading-screen',
    global: {
        phase: 'lobby',
        currentLevel: 1,
        questionIndex: 0,
        players: [],
        lastUpdate: Date.now()
    }
};

const levels = [
    { id: 1, name: "Binary Challenge", color: "#00f2ff" },
    { id: 2, name: "Hardware Builder", color: "#bc13fe" },
    { id: 3, name: "Stack & Queue Battle", color: "#39ff14" },
    { id: 4, name: "Network Defender", color: "#ff003c" },
    { id: 5, name: "Tech Escape Room", color: "#ffd700" }
];

const questionsBank = {
    1: [
        { q: "What is the decimal value of the binary number 1010?", a: ["8", "10", "12", "14"], correct: 1 },
        { q: "Which of these is a bitwise operator in JavaScript?", a: ["&&", "||", "&", "!"], correct: 2 },
        { q: "How many bits are in 1 byte?", a: ["4", "8", "16", "32"], correct: 1 }
    ],
    2: [
        { q: "Which component is known as the 'brain' of the computer?", a: ["RAM", "GPU", "CPU", "SSD"], correct: 2 },
        { q: "What type of memory is volatile and lost when power is off?", a: ["ROM", "RAM", "HDD", "FLASH"], correct: 1 },
        { q: "Which port is commonly used for high-definition video and audio?", a: ["VGA", "USB-A", "HDMI", "PS/2"], correct: 2 }
    ],
    3: [
        { q: "Which data structure follows the FIFO (First In First Out) principle?", a: ["Stack", "Queue", "Tree", "Graph"], correct: 1 },
        { q: "What is the operation to add an element to a Stack?", a: ["Pop", "Push", "Enqueue", "Dequeue"], correct: 1 },
        { q: "In a Queue, where does 'Dequeue' happen?", a: ["Front", "Back", "Middle", "Random"], correct: 0 }
    ],
    4: [
        { q: "Which port is the default for HTTPS traffic?", a: ["80", "21", "25", "443"], correct: 3 },
        { q: "What does DNS stand for?", a: ["Data Network System", "Domain Name System", "Digital Node Service", "Direct Net Signal"], correct: 1 },
        { q: "Which layer of the OSI model handles routing?", a: ["Physical", "Data Link", "Network", "Transport"], correct: 2 }
    ],
    5: [
        { q: "What is the time complexity of a Binary Search algorithm?", a: ["O(n)", "O(n²)", "O(log n)", "O(1)"], correct: 2 },
        { q: "Which keyword is used to create a constant variable in ES6?", a: ["var", "let", "const", "static"], correct: 2 },
        { q: "What is the result of typeof null in JavaScript?", a: ["'null'", "'undefined'", "'object'", "'number'"], correct: 2 }
    ]
};

function getCurrentPool() {
    return questionsBank[state.global.currentLevel] || [];
}

// Sync Infrastructure
const SyncManager = {
    async joinPlayer(player) {
        if (!supabase) return;
        await supabase.from('players').upsert([player]);
    },
    async updateScore(playerId, points) {
        if (!supabase) return;
        const p = state.global.players.find(p => p.id === playerId);
        if (p) await supabase.from('players').update({ score: p.score + points }).eq('id', playerId);
    },
    async updateGameState(updates) {
        if (!supabase) return;
        await supabase.from('game_state').upsert([{ id: 'global', ...updates }]);
    },
    async kickPlayer(id) {
        if (!supabase) return;
        await supabase.from('players').update({ status: 'kicked' }).eq('id', id);
    },
    async resetGame() {
        if (!supabase) return;
        await supabase.from('players').update({ score: 0, status: 'active', answers: [] }).neq('id', 'temp');
        await this.updateGameState({ phase: 'lobby', current_level: 1, question_index: 0 });
    },
    subscribe() {
        if (!supabase) return;
        supabase.channel('players_sync').on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => this.loadPlayers()).subscribe();
        supabase.channel('state_sync').on('postgres_changes', { event: '*', schema: 'public', table: 'game_state' }, payload => {
            const d = payload.new;
            if (d && d.id === 'global') {
                state.global.phase = d.phase;
                state.global.currentLevel = d.current_level;
                state.global.questionIndex = d.question_index;
                updateUI();
            }
        }).subscribe();
        this.loadPlayers();
        this.loadGameState();
    },
    async loadPlayers() {
        if (!supabase) return;
        const { data } = await supabase.from('players').select('*').order('joinTime', { ascending: true });
        if (data) state.global.players = data;
        updateUI();
    },
    async loadGameState() {
        if (!supabase) return;
        const { data } = await supabase.from('game_state').select('*').eq('id', 'global').single();
        if (data) {
            state.global.phase = data.phase;
            state.global.currentLevel = data.current_level;
            state.global.questionIndex = data.question_index;
            updateUI();
        }
    }
};

// UI Elements
const getEl = (id) => document.getElementById(id);

// Navigation
function showScreen(screenId) {
    console.log("SWITCHING TO SCREEN:", screenId);
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const target = getEl(screenId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'flex';
        state.currentScreen = screenId;
    } else {
        console.error("SCREEN NOT FOUND:", screenId);
    }
}

// Participant Join
function validateAndJoin() {
    const input = getEl('player-name');
    const name = input.value.trim();
    const error = getEl('name-error');

    error.classList.add('hidden');
    input.classList.remove('wrong-auth');

    if (name.length < 2) {
        showJoinError("NAME TOO SHORT");
        return;
    }

    state.playerName = name;
    state.playerId = 'P-' + Date.now();
    state.userRole = 'PARTICIPANT';

    SyncManager.joinPlayer({
        id: state.playerId,
        name: state.playerName,
        score: 0,
        joinTime: Date.now(),
        answers: [],
        status: 'active'
    });

    showScreen('lobby-screen');
}

function showJoinError(msg) {
    const error = getEl('name-error');
    error.innerText = msg;
    error.classList.remove('hidden');
}

// Global UI Update
function updateUI() {
    if (state.currentScreen === 'admin-panel-screen') renderAdminData();
    if (state.userRole === 'PARTICIPANT') syncParticipantScreen();
}

// Admin Panel Logic
function renderAdminData() {
    getEl('status-badge').innerText = state.global.phase.toUpperCase();
    getEl('active-level-label').innerText = levels.find(l => l.id === state.global.currentLevel)?.name || 'NONE';

    const list = getEl('admin-player-list');
    list.innerHTML = '';
    state.global.players.filter(p => p.status === 'active').forEach((p, i) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${i + 1}</td><td>${p.name}</td><td>${p.score}</td><td><button class="text-link red" onclick="SyncManager.kickPlayer('${p.id}')">KICK</button></td>`;
        list.appendChild(row);
    });
}

// Participant Sync
function syncParticipantScreen() {
    if (!state.playerId) return;
    const g = state.global;

    if (g.phase === 'lobby' && state.currentScreen !== 'lobby-screen') showScreen('lobby-screen');
    else if (g.phase === 'playing' && state.currentScreen !== 'quiz-screen') {
        showScreen('quiz-screen');
        initLocalQuestion();
    }
    else if (g.phase === 'results' && state.currentScreen !== 'result-screen') showResults();

    if (state.currentScreen === 'lobby-screen') {
        const list = getEl('player-list');
        list.innerHTML = '';
        g.players.filter(p => p.status === 'active').forEach((p, i) => {
            const item = document.createElement('div');
            item.className = 'player-entry';
            item.innerHTML = `<span>${i + 1}</span><span class="name">${p.name}</span><span class="score">${p.score}</span>`;
            list.appendChild(item);
        });
        getEl('participant-count-badge').innerText = `UNITS: ${g.players.length}`;
    }
}

// Quiz Logic
function initLocalQuestion() {
    const pool = getCurrentPool();
    const q = pool[state.global.questionIndex];
    if (!q) return;

    getEl('question-text').innerText = q.q;
    const grid = getEl('answer-grid');
    grid.innerHTML = '';
    grid.dataset.answered = 'false';

    q.a.forEach((ans, i) => {
        const btn = document.createElement('button');
        btn.className = 'answer-btn';
        btn.innerText = ans;
        btn.onclick = () => {
            if (grid.dataset.answered === 'true') return;
            grid.dataset.answered = 'true';
            if (i === q.correct) {
                btn.classList.add('correct');
                SyncManager.updateScore(state.playerId, 100);
            } else {
                btn.classList.add('wrong');
            }
        };
        grid.appendChild(btn);
    });
}

function showResults() {
    showScreen('result-screen');
    const sorted = [...state.global.players].sort((a, b) => b.score - a.score);
    const myRank = sorted.findIndex(p => p.id === state.playerId) + 1;
    getEl('personal-rank-box').innerHTML = `<h2>RANK: ${myRank}</h2>`;
}

// Event Bindings (Safe)
const safeBind = (id, fn) => { const el = getEl(id); if (el) el.onclick = fn; };

safeBind('role-admin', () => showScreen('admin-login-screen'));
safeBind('role-participant', () => { getEl('role-selection').classList.add('hidden'); getEl('player-input-group').classList.remove('hidden'); });
safeBind('login-btn', () => { if (getEl('admin-password').value === '9500') { state.userRole = 'ADMIN'; showScreen('admin-panel-screen'); } });
safeBind('start-battle', validateAndJoin);
safeBind('admin-start', () => SyncManager.updateGameState({ phase: 'playing', question_index: 0 }));
safeBind('admin-stop', () => SyncManager.updateGameState({ phase: 'lobby' }));
safeBind('admin-next', () => SyncManager.updateGameState({ question_index: state.global.questionIndex + 1, phase: 'playing' }));

// INITIALIZATION
function initArena() {
    console.log("ARENA START...");

    // Particles
    const ptn = getEl('particles-container');
    if (ptn) {
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            Object.assign(p.style, { position: 'absolute', left: Math.random() * 100 + '%', top: Math.random() * 100 + '%', width: '2px', height: '2px', background: '#00f2ff', boxShadow: '0 0 5px #00f2ff' });
            ptn.appendChild(p);
        }
    }

    // Supabase
    try { if (supabase) SyncManager.subscribe(); } catch (e) { }

    // CRITICAL: FORCE REVEAL
    setTimeout(() => {
        const loading = getEl('loading-screen');
        const app = getEl('app');
        if (app) app.style.display = 'block';

        if (loading) {
            console.log("FADING OUT LOADING...");
            loading.classList.add('fade-out');
            setTimeout(() => {
                loading.style.display = 'none';
                showScreen('home-screen');
            }, 800);
        } else {
            showScreen('home-screen');
        }
    }, 2000);
}

// Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initArena);
} else {
    initArena();
}
