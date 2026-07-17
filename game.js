const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    groundY = Math.floor(h * 0.8);
}
window.addEventListener('resize', resizeCanvas);

const SAVE_KEY = 'gd_ultimate_save_v1';
const COMMUNITY_USER_KEY = 'gd_community_user_v1';
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
    ? 'http://localhost:3000'
    : 'https://YOUR-RENDER-APP-NAME.onrender.com'; // ← swap in your real Render URL once deployed
let save = {
    orbs: 0,
    c1: '#ffde00', c2: '#00ff00',
    unlockedColors: ['#ffde00', '#00ff00', '#00bfff', '#ff3333', '#ffffff', '#222222'],
    achievements: {},
    editorLevel: null,
    createdLevels: [],
    themeIndex: 0
};
let communityUser = null;

const shopColors = [
    { c: '#cc00ff', cost: 100 }, { c: '#ff00ff', cost: 150 },
    { c: '#00ffcc', cost: 200 }, { c: '#ffaa00', cost: 250 }, { c: '#ff6600', cost: 300 }
];

const DIFFICULTY_TIERS = [
    { name: 'Easy', stars: 1, face: '😊', color: '#3ddc61' },
    { name: 'Normal', stars: 2, face: '🙂', color: '#3d9bdc' },
    { name: 'Hard', stars: 3, face: '😅', color: '#e8a33d' },
    { name: 'Harder', stars: 5, face: '😬', color: '#e8703d' },
    { name: 'Insane', stars: 7, face: '😱', color: '#e83d5a' },
    { name: 'Easy Demon', stars: 10, face: '👹', color: '#b23dd6' },
    { name: 'Medium Demon', stars: 10, face: '👹', color: '#8a29ad' },
    { name: 'Hard Demon', stars: 10, face: '👹', color: '#631f80' },
    { name: 'Insane Demon', stars: 10, face: '👹', color: '#3d1050' },
    { name: 'Extreme Demon', stars: 10, face: '💀', color: '#150019' }
];

function getDifficultyTier(name) {
    return DIFFICULTY_TIERS.find(t => t.name.toLowerCase() === String(name || '').toLowerCase())
        || { name: name || 'Unranked', stars: 0, face: '❔', color: '#888' };
}

function buildDifficultySelect(id, selected) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = DIFFICULTY_TIERS.map(t =>
        `<option value="${t.name}" ${t.name === (selected || 'Normal') ? 'selected' : ''}>${t.face} ${t.name} (★${t.stars})</option>`
    ).join('');
}

const achievementDefs = [
    { id: 'first-launch', name: 'First Steps', desc: 'Boot the game for the first time.', icon: '✨' },
    { id: 'orb-hunter', name: 'Orb Hunter', desc: 'Collect your first orb.', icon: '🟡' },
    { id: 'color-chameleon', name: 'Color Chameleon', desc: 'Unlock a new color.', icon: '🎨' },
    { id: 'builder', name: 'Level Builder', desc: 'Save a custom level.', icon: '🧱' },
    { id: 'sky-rider', name: 'Sky Rider', desc: 'Enter the ship portal.', icon: '🚀' },
    { id: 'clear-run', name: 'Clear Run', desc: 'Beat a level.', icon: '🏁' }
];

const editorPalette = [
    { type: 'block', icon: '⬛', label: 'Block' },
    { type: 'spike', icon: '🔺', label: 'Spike' },
    { type: 'spike-down', icon: '🔻', label: 'Ceiling Spike' },
    { type: 'orb', icon: '⚪', label: 'Jump Orb' },
    { type: 'mana', icon: '💠', label: 'Mana Orb' },
    { type: 'portal-ship', icon: '🚀', label: 'Ship Portal' },
    { type: 'portal-cube', icon: '🟦', label: 'Cube Portal' },
    { type: 'bounce', icon: '⬆️', label: 'Bounce Pad' },
    { type: 'platform', icon: '▭', label: 'Platform' },
    { type: 'eraser', icon: '❌', label: 'Erase' }
];

let GRAVITY = 1.8;
let JUMP_FORCE = -20.5;
let SHIP_THRUST = -1.5;
let SHIP_GRAVITY = 1;
let TERMINAL_VELOCITY = 24;

let B_SIZE = 40;
let SPEED = 9;
let ORB_FORCE = -17.5;

function parseCustomObject(type, c, r, st) {
    let x = st + c * B_SIZE;
    let y = groundY - (r + 1) * B_SIZE;
    let w = B_SIZE;
    let h = B_SIZE;

    if (type === 'platform' || type === 'bounce') {
        h = B_SIZE / 2;
    } else if (type === 'portal-ship' || type === 'portal-cube') {
        h = B_SIZE * 3;
        y = groundY - (r + 3) * B_SIZE;
    } else if (type === 'mana') {
        w = B_SIZE / 2;
        h = B_SIZE / 2;
        x = st + c * B_SIZE + B_SIZE / 4;
        y = groundY - (r + 1) * B_SIZE + B_SIZE / 4;
    }

    return { type, x, y, w, h, act: true };
}

const levels = [
    {
        name: 'Stereo Madness', diff: 'Easy', face: '🟩', color: '#0033cc',
        data: '........>................................................................................................................................................................................................................................^.'
    },
    {
        name: 'Blast Processing', diff: 'Harder', face: '⚡', color: '#2200aa',
        data: '........>........__....__....__....__....__....__....__....__....__....__....__....__....__....__...^.'
    },
    {
        name: 'Nexus', diff: 'Hard Demon', face: '🌌', color: '#6600ff',
        data: '........>........__....__....__....__....__....__....__....__....__....__....__....__....__....__....__....__....__....__....__....__....__....__...o...'
    }
];

let currLevel = 0;
let customData = {};
let isCustomLevel = false;
let state = 'INIT';
let isPractice = false;
let frame = 0;
let attempts = 0;
let camX = 0, groundY = 420, bgScroll = 0;
let screenShake = 0, isHolding = false;
let targetBg = { r: 0, g: 51, b: 204 }, currBg = { r: 0, g: 51, b: 204 };
let player = { x: 0, y: 0, w: 32, h: 32, vy: 0, rot: 0, grounded: true, mode: 'cube' };
let objs = [], particles = [], shards = [], stars = [], checkpoints = [];
let lvlLen = 0, editorTool = 'block', edCamX = 0;
let currentEditorLevelId = null;
let audioCtx, seqInt, step = 0;
let lastT = 0, acc = 0;
const stepT = 1000 / 60;

for (let i = 0; i < 80; i++) stars.push({ x: Math.random() * 2200, y: Math.random() * 700, size: Math.random() * 3 });
resizeCanvas();

const notes = {
    bass: [43, -1, 43, -1, 43, -1, 43, -1, 39, -1, 39, -1, 39, -1, 39, -1, 36, -1, 36, -1, 36, -1, 36, -1, 41, -1, 41, -1, 41, -1, 41, -1],
    mel: [67, -1, 67, -1, 65, -1, 67, -1, 70, -1, 72, -1, -1, -1, -1, -1, 67, -1, 67, -1, 65, -1, 67, -1, 72, -1, 74, -1, -1, -1, -1, -1]
};

function makeLocalId() {
    return 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function loadSave() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) save = Object.assign(save, JSON.parse(raw));
    } catch (e) { }
    if (!save.achievements) save.achievements = {};
    if (!save.unlockedColors || save.unlockedColors.length === 0) {
        save.unlockedColors = ['#ffde00', '#00ff00', '#00bfff', '#ff3333', '#ffffff', '#222222'];
    }
    if (!save.createdLevels) save.createdLevels = [];

    if (save.editorLevel && Object.keys(save.editorLevel).length > 0 && save.createdLevels.length === 0) {
        save.createdLevels.push({ id: makeLocalId(), name: 'My Level', data: { ...save.editorLevel }, updatedAt: Date.now() });
        persistSave();
    }
    customData = {};
}
function persistSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { }
}
function persistCommunityUser(user) {
    try {
        if (user) localStorage.setItem(COMMUNITY_USER_KEY, JSON.stringify(user));
        else localStorage.removeItem(COMMUNITY_USER_KEY);
    } catch (e) { }
}
function loadCommunityUser() {
    try {
        const raw = localStorage.getItem(COMMUNITY_USER_KEY);
        communityUser = raw ? JSON.parse(raw) : null;
    } catch (e) { communityUser = null; }
}
async function apiRequest(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong... (' + (data.Error || res.statusText) + ')');
    return data;
}
function renderCommunity() {
    const authRoot = document.getElementById('community-auth');
    if (authRoot) {
        if (communityUser) {
            authRoot.innerHTML = `<div class="community-pill">Signed in as <strong>${communityUser.username}</strong></div><div class="community-actions"><button class="debug-btn" style="width:auto; padding:6px 10px;" onclick="logoutCommunity()">Logout</button></div>`;
        } else {
            authRoot.innerHTML = '<div class="community-pill">Sign in to publish and rate levels.</div>';
        }
    }
}
async function submitCommunityAuth(mode) {
    const username = document.getElementById('community-username').value.trim();
    const password = document.getElementById('community-password').value;
    if (!username || !password) {
        showPopup('Error', 'Enter a username and password first.', [{ label: 'OK' }], 'blue');
        return;
    }
    try {
        const data = await apiRequest(mode === 'register' ? '/api/register' : '/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        communityUser = data.user;
        persistCommunityUser(communityUser);
        renderCommunity();
        document.getElementById('community-password').value = '';
        showToast('Community', mode === 'register' ? 'Account created.' : 'Signed in.', '🌐');
        refreshCommunity();
    } catch (err) {
        showPopup('Error', err.message, [{ label: 'OK' }], 'red');
    }
}
function logoutCommunity() {
    communityUser = null;
    persistCommunityUser(null);
    renderCommunity();
    showToast('Community', 'Logged out.', '👋');
}
function renderLeaderboard(entries) {
    const root = document.getElementById('leaderboard-list');
    if (!root) return;
    if (!entries.length) {
        root.innerHTML = '<div class="community-empty">No leaderboard data.</div>';
        return;
    }
    root.innerHTML = entries.map((entry, idx) => `<div class="community-item"><strong>#${idx + 1} ${entry.username}</strong><div>⭐ ${entry.stars}</div></div>`).join('');
}
async function refreshCommunity() {
    const search = document.getElementById('community-search')?.value?.trim() || '';
    const root = document.getElementById('community-levels');
    const leaderboardRoot = document.getElementById('leaderboard-list');
    if (root) root.innerHTML = '<div class="community-empty">Loading…</div>';
    if (leaderboardRoot) leaderboardRoot.innerHTML = '<div class="community-empty">Loading…</div>';
    try {
        const [leaderboardData, levelsData] = await Promise.all([
            apiRequest('/api/leaderboard'),
            search ? apiRequest(`/api/levels/search?q=${encodeURIComponent(search)}`) : apiRequest('/api/levels')
        ]);
        renderLeaderboard(leaderboardData.leaderboard || []);
        renderCommunityLevels(levelsData.levels || []);
    } catch (err) {
        if (leaderboardRoot) leaderboardRoot.innerHTML = '<div class="community-empty">Something went wrong... (Server is unavailable. Check "")</div>';
        if (root) root.innerHTML = '<div class="community-empty">Unable to reach the server.</div>';
    } // If it fails to ge tanything from the sverer, it shows an error message instead of the content bceause i does't xist.
}
async function publishCommunityLevel() {
    if (!communityUser) {
        showPopup('Login Required', 'You need to [Log In] before you can [publish] a [level].', [{ label: 'OK' }], 'blue');
        return;
    }

    // When publishing a level this will show up if you don't have an account. Else, it will return everyting below.

    const title = document.getElementById('community-title').value.trim();
    const description = document.getElementById('community-desc').value.trim();
    const difficulty = document.getElementById('community-difficulty').value.trim();
    const data = document.getElementById('community-data').value.trim();
    if (!title || !data) {
        showPopup('Missing Fields', 'A title and level data are required.', [{ label: 'OK' }], 'red');
        return;
        // Same here, it wil only show this if you don't have a title or level data. If you do, it will publish the level.
    }
    try {
        await apiRequest('/api/levels', {
            method: 'POST',
            body: JSON.stringify({ title, description, creator: communityUser.username, difficulty, data })
        });
        document.getElementById('community-title').value = '';
        document.getElementById('community-desc').value = '';
        document.getElementById('community-difficulty').value = '';
        document.getElementById('community-data').value = '';
        showToast('Published', 'Your level is now live.', '📝');
        refreshCommunity();
    } catch (err) {
        showPopup('Publish Failed', err.message, [{ label: 'OK' }], 'red');
    } // If publishingingg fails, it will show an error message. If it doesn't, it will show a success message and clear the form.
}
function fillCommunityFormFromEditor() {
    document.getElementById('community-title').value = document.getElementById('community-title').value || (isCustomLevel ? 'Custom Level' : levels[currLevel].name);
    if (!document.getElementById('community-difficulty').value) {
        document.getElementById('community-difficulty').value = isCustomLevel ? 'Normal' : levels[currLevel].diff;
    }
    document.getElementById('community-data').value = JSON.stringify(customData || {});
    showToast('Editor', 'Level data copied into the publish form.', '🧱');
}
async function rateCommunityLevel(levelId, verdict) {
    if (!communityUser) {
        showPopup('Login Required', 'You gotta login before you can rate.', [{ label: 'OK' }], 'blue');
        return;

        // If trying to publishing a level when not logged in to an account it will show an error message. Else, it will return to the server.
    }
    try {
        await apiRequest(`/api/levels/${levelId}/rate`, {
            method: 'POST',
            body: JSON.stringify({ moderator: communityUser.username, verdict, stars: 1 })
        });
        showToast('MODERATION', verdict === 'approved' ? 'Level has been approved!.' : 'Level has been rejected!', '🛡️');
        refreshCommunity();
    } catch (err) {
        showPopup('Rating failed', err.message, [{ label: 'OK' }], 'red');
    }

}

async function submitLevelCompletion(rewardStars = 1) {
    if (!communityUser || isPractice) return;
    try {
        const id = (isCustomLevel && currentViewLevel) ? currentViewLevel.id : 'builtin';
        await apiRequest(`/api/levels/${id}/complete`, {
            method: 'POST',
            body: JSON.stringify({ username: communityUser.username, rewardStars })
        });
        refreshCommunity();
    } catch (err) {
        console.warn(err);
    }
}
loadSave();
loadCommunityUser();

function initGame() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
    updateStats();
    unlockAchievement('first-launch');
    setScreen('menu');
}

function playSfx(type) {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    if (type === 'crash') {
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(100, audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(1, audioCtx.currentTime + 0.5);
        g.gain.setValueAtTime(0.5, audioCtx.currentTime);
        g.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        o.start(); o.stop(audioCtx.currentTime + 0.5);
    } else if (type === 'orb') {
        o.type = 'sine';
        o.frequency.setValueAtTime(800, audioCtx.currentTime);
        o.frequency.linearRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        g.gain.setValueAtTime(0.3, audioCtx.currentTime);
        g.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        o.start(); o.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'coin') {
        o.type = 'square';
        o.frequency.setValueAtTime(987.77, audioCtx.currentTime);
        setTimeout(() => {
            if (!audioCtx) return;
            const o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain();
            o2.type = 'square'; o2.frequency.setValueAtTime(1318.51, audioCtx.currentTime);
            o2.connect(g2); g2.connect(audioCtx.destination);
            g2.gain.setValueAtTime(0.2, audioCtx.currentTime);
            g2.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
            o2.start(); o2.stop(audioCtx.currentTime + 0.2);
        }, 100);
        g.gain.setValueAtTime(0.2, audioCtx.currentTime);
        g.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        o.start(); o.stop(audioCtx.currentTime + 0.1);
    }
}

function startMusic() {
    clearInterval(seqInt);
    step = 0;
    seqInt = setInterval(() => {
        if (state === 'DEAD' && !isPractice) return;
        const b = notes.bass[step % notes.bass.length], m = notes.mel[step % notes.mel.length];
        if (audioCtx) {
            if (b !== -1) {
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.type = 'sawtooth'; o.frequency.value = 440 * Math.pow(2, (b - 69) / 12);
                o.connect(g); g.connect(audioCtx.destination);
                g.gain.setValueAtTime(0.08, audioCtx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
                o.start(); o.stop(audioCtx.currentTime + 0.2);
            }
            if (m !== -1) {
                const o = audioCtx.createOscillator(), g = audioCtx.createGain();
                o.type = 'square'; o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
                o.connect(g); g.connect(audioCtx.destination);
                g.gain.setValueAtTime(0.04, audioCtx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
                o.start(); o.stop(audioCtx.currentTime + 0.15);
            }
        }
        step++;
    }, state === 'MENU' ? 140 : 120);
}

function setScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('practice-ui').classList.remove('active');
    document.getElementById('attemptItem').style.display = 'none';

    if (id === 'menu') { state = 'MENU'; document.getElementById('menu-ui').classList.add('active'); }
    else if (id === 'level-select') { updateLevelUI(); document.getElementById('level-select-ui').classList.add('active'); }
    else if (id === 'icon-kit') { buildIconKit(); document.getElementById('icon-kit-ui').classList.add('active'); }
    else if (id === 'shop') { buildShop(); document.getElementById('shop-ui').classList.add('active'); }
    else if (id === 'vault') { document.getElementById('vault-ui').classList.add('active'); }
    else if (id === 'credits') { document.getElementById('credits-ui').classList.add('active'); }
    else if (id === 'achievements') { renderAchievements(); document.getElementById('achievements-ui').classList.add('active'); }
    else if (id === 'debug') { document.getElementById('debug-ui').classList.add('active'); }
    else if (id === 'community') { renderCommunity(); refreshCommunity(); document.getElementById('community-ui').classList.add('active'); }
    else if (id === 'created-levels') { renderCreatedLevels(); document.getElementById('created-levels-ui').classList.add('active'); }
    else if (id === 'profile') { renderProfile(); document.getElementById('profile-ui').classList.add('active'); }
    else if (id === 'search') { runLevelSearch(); document.getElementById('search-ui').classList.add('active'); }
    else if (id === 'editor') { state = 'EDITOR'; buildEditorPalette(); document.getElementById('editor-ui').classList.add('active'); }
    else if (id === 'level-info') { document.getElementById('level-info-ui').classList.add('active'); }
}

async function renderProfile() {
    const root = document.getElementById('profile-content');
    if (!root) return;
    root.innerHTML = '<div class="community-empty">Loading…</div>';

    document.getElementById('profile-username').innerText = communityUser ? communityUser.username : 'Guest';
    document.getElementById('profile-cube').style.background = save.c1;
    const inner = document.getElementById('profile-cube-inner');
    if (inner) inner.style.background = save.c2;

    const achCount = Object.values(save.achievements).filter(Boolean).length;
    let serverStats = { stars: 0, levelsPublished: 0, levelsApproved: 0 };
    if (communityUser) {
        try {
            const data = await apiRequest(`/api/users/${encodeURIComponent(communityUser.username)}`);
            serverStats = {
                stars: data.user.stars || 0,
                levelsPublished: data.levelsPublished || 0,
                levelsApproved: data.levelsApproved || 0
            };
        } catch (e) { /* keep zeros if the lookup fails */ }
    }

    root.innerHTML = `
        <div class="profile-stat-card"><div class="profile-stat-value">${save.orbs}</div><div class="profile-stat-label">Orbs</div></div>
        <div class="profile-stat-card"><div class="profile-stat-value">${serverStats.stars}</div><div class="profile-stat-label">Stars</div></div>
        <div class="profile-stat-card"><div class="profile-stat-value">${attempts}</div><div class="profile-stat-label">Attempts</div></div>
        <div class="profile-stat-card"><div class="profile-stat-value">${achCount}/${achievementDefs.length}</div><div class="profile-stat-label">Achievements</div></div>
        <div class="profile-stat-card"><div class="profile-stat-value">${save.createdLevels.length}</div><div class="profile-stat-label">Levels Made</div></div>
        <div class="profile-stat-card"><div class="profile-stat-value">${serverStats.levelsPublished}</div><div class="profile-stat-label">Published</div></div>
    `;
}

let searchTab = 'recent';
function setSearchTab(tab) {
    searchTab = tab;
    ['recent', 'likes', 'downloads'].forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        if (el) el.classList.toggle('active', t === tab);
    });
    runLevelSearch();
}

async function runLevelSearch() {
    const q = document.getElementById('search-query')?.value?.trim() || '';
    const root = document.getElementById('search-results');
    if (root) root.innerHTML = '<div class="community-empty">Loading…</div>';
    try {
        const path = q
            ? `/api/levels/search?q=${encodeURIComponent(q)}&sort=${searchTab}`
            : `/api/levels?sort=${searchTab}`;
        const data = await apiRequest(path);
        renderSearchResults(data.levels || []);
    } catch (err) {
        if (root) root.innerHTML = '<div class="community-empty">Unable to reach the server.</div>';
    }
}

function renderSearchResults(levelList) {
    const root = document.getElementById('search-results');
    if (!root) return;
    if (!levelList.length) {
        root.innerHTML = '<div class="community-empty">No levels found.</div>';
        return;
    }
    root.innerHTML = levelList.map(level => {
        const tier = getDifficultyTier(level.difficulty);
        return `
            <div class="community-item" onclick="openLevelInfo('${level.id}')">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="font-size:1.05rem; color:var(--gd-blue);">${level.title}</strong>
                    <span style="font-size:0.85rem;">${tier.face} ${tier.name}</span>
                </div>
                <div style="font-size:0.8rem; color:#ccc; margin-top:3px;">${level.creator} • ❤️ ${level.likes || 0} • ⬇️ ${level.downloads || 0}</div>
            </div>
        `;
    }).join('');
}

function updateStats() {
    document.getElementById('orbCount').innerText = save.orbs;
    document.getElementById('attemptCount').innerText = attempts;
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : { r: 0, g: 0, b: 0 };
}

function updateLevelUI() {
    const l = levels[currLevel];
    const tier = getDifficultyTier(l.diff);
    document.getElementById('lvName').innerText = l.name;
    document.getElementById('lvDiff').innerHTML = `${tier.face} ${tier.name} <span style="color:var(--gd-yellow);">★${tier.stars}</span>`;
    document.getElementById('lvFace').innerText = l.face;
}
function changeLevel(d) { currLevel = (currLevel + d + levels.length) % levels.length; updateLevelUI(); }

function buildIconKit() {
    const buildGrid = (id, type) => {
        let html = '';
        save.unlockedColors.forEach(c => {
            const active = (type === 'c1' && save.c1 === c) || (type === 'c2' && save.c2 === c) ? 'box-shadow: 0 0 0 4px #00ffcc;' : '';
            html += `<div class="color-btn" style="background:${c}; ${active}" onclick="selectColor('${type}', '${c}')"></div>`;
        });
        document.getElementById(id).innerHTML = html;
    };
    buildGrid('c1Grid', 'c1'); buildGrid('c2Grid', 'c2');
    updateCubePreview();
}
function selectColor(type, c) { save[type] = c; persistSave(); buildIconKit(); }
function updateCubePreview() {
    const p = document.getElementById('previewCube');
    p.style.background = save.c1;
    p.innerHTML = `<div style="width:50%; height:50%; background:${save.c2}; position:absolute; top:25%; left:25%; border:2px solid #000;"></div>`;
}

function buildShop() {
    let html = '';
    shopColors.forEach((sc, i) => {
        const unlocked = save.unlockedColors.includes(sc.c);
        const canAfford = save.orbs >= sc.cost;
        html += `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.1); padding:10px; border-radius:10px;">
                    <div style="display:flex; gap:15px; align-items:center;">
                        <div class="color-btn" style="background:${sc.c}; width:40px; height:40px; border:2px solid #fff;"></div>
                        <span class="gd-text">${sc.cost} 🔮</span>
                    </div>
                    <button class="btn-base" style="width:auto; padding:5px 20px; border-radius:20px; font-family:'Pusab'; font-size:1rem; background:${unlocked ? '#444' : (canAfford ? '#009944' : '#663333')}"
                        onclick="buyColor(${i})" ${unlocked || !canAfford ? 'disabled' : ''}>${unlocked ? 'OWNED' : 'BUY'}</button>
                 </div>`;
    });
    document.getElementById('shopItems').innerHTML = html;
}
function buyColor(idx) {
    const sc = shopColors[idx];
    if (!save.unlockedColors.includes(sc.c) && save.orbs >= sc.cost) {
        save.orbs -= sc.cost;
        save.unlockedColors.push(sc.c);
        persistSave();
        unlockAchievement('color-chameleon');
        playSfx('coin');
        updateStats();
        buildShop();
    }
}

function checkVault() {
    const v = document.getElementById('vaultInput').value.toLowerCase().trim();
    const m = document.getElementById('vaultMsg');
    if (v === 'rubrub') {
        m.innerText = 'Developer secret found! +500 Orbs';
        save.orbs += 500; persistSave(); playSfx('coin'); updateStats();
    } else if (v === 'spooky') {
        m.innerText = 'Unlocked secret color!';
        if (!save.unlockedColors.includes('#ff6600')) { save.unlockedColors.push('#ff6600'); persistSave(); }
        playSfx('coin');
    } else {
        m.innerText = 'Invalid code...';
    }
    document.getElementById('vaultInput').value = '';
}

function unlockAchievement(id) {
    if (save.achievements[id]) return;
    save.achievements[id] = true;
    persistSave();
    const def = achievementDefs.find(a => a.id === id);
    if (def) showToast(def.name, def.desc, def.icon);
    renderAchievements();
}

function renderAchievements() {
    const root = document.getElementById('ach-list');
    if (!root) return;
    root.innerHTML = achievementDefs.map(def => {
        const unlocked = !!save.achievements[def.id];
        return `<div class="ach-card ${unlocked ? '' : 'locked-card'}">
            <div class="ach-icon">${def.icon}</div>
            <div class="ach-name">${def.name}</div>
            <div class="ach-desc">${def.desc}</div>
        </div>`;
    }).join('');
}

function showToast(title, body, icon) {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.innerHTML = `<div class="ach-toast-icon">${icon}</div><div><div class="ach-toast-title">ACHIEVEMENT</div><div class="ach-toast-name">${title}</div><div style="font-size:0.75rem;color:#ccc;">${body}</div></div>`;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
        el.classList.remove('show');
        el.classList.add('hide');
        setTimeout(() => el.remove(), 400);
    }, 2200);
}

function showPopup(title, content, buttons = [{ label: 'OK' }], accent = 'yellow') {
    const backdrop = document.getElementById('popup-root');
    const popup = backdrop.querySelector('.gd-popup');
    const titleEl = document.getElementById('popup-title');
    const bodyEl = document.getElementById('popup-body');
    const actions = document.getElementById('popup-actions');
    popup.className = `gd-popup accent-${accent}`;
    titleEl.innerText = title;
    bodyEl.innerHTML = content;
    actions.innerHTML = '';
    buttons.forEach((btn) => {
        const b = document.createElement('button');
        b.className = 'gd-popup-btn';
        b.innerText = btn.label;
        b.onclick = () => {
            closePopup();
            if (btn.action) btn.action();
        };
        actions.appendChild(b);
    });
    backdrop.classList.add('show');
}

function closePopup() {
    document.getElementById('popup-root').classList.remove('show');
}

function buildEditorPalette() {
    const root = document.getElementById('editor-palette');
    if (!root) return;
    root.innerHTML = '';
    editorPalette.forEach((tile) => {
        const btn = document.createElement('div');
        btn.className = `editor-tile${editorTool === tile.type ? ' selected' : ''}`;
        btn.innerHTML = `<span>${tile.icon}</span>`;
        btn.title = tile.label;
        btn.onclick = () => {
            if (tile.type === 'eraser') { editorTool = 'eraser'; }
            else { editorTool = tile.type; }
            buildEditorPalette();
        };
        root.appendChild(btn);
    });
}

function setTool(tool) { editorTool = tool; buildEditorPalette(); }
function moveEditorCam(dx) { edCamX = Math.max(0, edCamX + dx); }

function clearEditor() {
    customData = {};
    currentEditorLevelId = null;
    showPopup('Editor Cleared', 'The level has been cleared. Saving now will create a new entry in My Levels.', [{ label: 'Nice!' }], 'red');
}
function saveEditorLevel() {
    if (Object.keys(customData).length === 0) {
        showPopup('Level Empty', 'Place a few blocks before saving.', [{ label: 'OK' }], 'blue');
        return;
    }
    const existing = currentEditorLevelId ? save.createdLevels.find(l => l.id === currentEditorLevelId) : null;
    const defaultName = existing ? existing.name : `Level ${save.createdLevels.length + 1}`;
    const defaultDiff = existing ? (existing.difficulty || 'Normal') : 'Normal';
    const diffOptions = DIFFICULTY_TIERS.map(t =>
        `<option value="${t.name}" ${t.name === defaultDiff ? 'selected' : ''}>${t.face} ${t.name} (★${t.stars})</option>`
    ).join('');
    showPopup(
        'Save Level',
        `<div style="text-align:left;">
            <label class="gd-text" style="font-size:0.85rem; display:block; margin-bottom:6px;">Level Name</label>
            <input type="text" id="popup-input" class="debug-input" value="${defaultName.replace(/"/g, '&quot;')}" maxlength="30">
            <label class="gd-text" style="font-size:0.85rem; display:block; margin:10px 0 6px;">Difficulty</label>
            <select id="popup-diff" class="debug-input">${diffOptions}</select>
         </div>`,
        [
            {
                label: 'Save', action: () => commitEditorSave(
                    (document.getElementById('popup-input').value || '').trim() || defaultName,
                    document.getElementById('popup-diff').value
                )
            },
            { label: 'Cancel' }
        ],
        'green'
    );
}

function commitEditorSave(name, difficulty) {
    if (!save.createdLevels) save.createdLevels = [];
    const lvl = currentEditorLevelId ? save.createdLevels.find(l => l.id === currentEditorLevelId) : null;
    if (lvl) {
        lvl.name = name;
        lvl.difficulty = difficulty;
        lvl.data = { ...customData };
        lvl.updatedAt = Date.now();
    } else {
        const id = makeLocalId();
        save.createdLevels.push({ id, name, difficulty, data: { ...customData }, updatedAt: Date.now() });
        currentEditorLevelId = id;
    }
    save.editorLevel = { ...customData };
    persistSave();
    unlockAchievement('builder');
    showPopup('Level Saved', `"${name}" has been saved to My Levels.`, [{ label: 'OK' }], 'green');
}

function loadEditorLevel(id) {
    const lvl = save.createdLevels.find(l => l.id === id);
    if (!lvl) return;
    customData = { ...lvl.data };
    currentEditorLevelId = lvl.id;
    setScreen('editor');
    showToast('Editor', `Loaded "${lvl.name}" into the editor.`, '🧱');
}

function playCreatedLevel(id) {
    const lvl = save.createdLevels.find(l => l.id === id);
    if (!lvl) return;
    customData = { ...lvl.data };
    isCustomLevel = true;
    currentViewLevel = null;
    startGame(false, true);
}

function deleteCreatedLevel(id) {
    const lvl = save.createdLevels.find(l => l.id === id);
    if (!lvl) return;
    showPopup(
        'Delete Level',
        `Delete "${lvl.name}"? This can't be undone.`,
        [
            {
                label: 'Delete', action: () => {
                    save.createdLevels = save.createdLevels.filter(l => l.id !== id);
                    if (currentEditorLevelId === id) currentEditorLevelId = null;
                    persistSave();
                    renderCreatedLevels();
                    showToast('Deleted', `"${lvl.name}" was removed.`, '🗑️');
                }
            },
            { label: 'Cancel' }
        ],
        'red'
    );
}

function publishCreatedLevel(id) {
    const lvl = save.createdLevels.find(l => l.id === id);
    if (!lvl) return;
    setScreen('community');
    document.getElementById('community-title').value = lvl.name;
    document.getElementById('community-difficulty').value = lvl.difficulty || 'Normal';
    document.getElementById('community-data').value = JSON.stringify(lvl.data);
    showToast('Ready to Publish', `"${lvl.name}" loaded into the publish form below.`, '📝');
}
function renderCreatedLevels() {
    const root = document.getElementById('created-levels-list');
    if (!root) return;
    const list = save.createdLevels || [];
    if (!list.length) {
        root.innerHTML = '<div class="community-empty">No saved levels yet. Build one in the Editor and hit Save!</div>';
        return;
    }
    root.innerHTML = [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map(lvl => {
        const tier = getDifficultyTier(lvl.difficulty);
        return `
        <div class="community-item" style="cursor:default;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:1.05rem; color:var(--gd-blue);">${lvl.name}</strong>
                <span style="font-size:0.85rem;">${tier.face} ${tier.name}</span>
            </div>
            <div style="font-size:0.7rem; color:#888; margin-top:2px;">${Object.keys(lvl.data || {}).length} tiles • ★${tier.stars}</div>
            <div class="community-actions" style="margin-top:8px;">
                <button class="debug-btn" style="width:auto; padding:4px 10px; font-size:0.75rem; background:var(--gd-green);" onclick="playCreatedLevel('${lvl.id}')">▶ Play</button>
                <button class="debug-btn" style="width:auto; padding:4px 10px; font-size:0.75rem;" onclick="loadEditorLevel('${lvl.id}')">✏️ Edit</button>
                <button class="debug-btn" style="width:auto; padding:4px 10px; font-size:0.75rem; background:#2b3dff;" onclick="publishCreatedLevel('${lvl.id}')">📤 Publish</button>
                <button class="debug-btn" style="width:auto; padding:4px 10px; font-size:0.75rem; background:var(--gd-red);" onclick="deleteCreatedLevel('${lvl.id}')">🗑️</button>
            </div>
        </div>`;
    }).join('');
}
function testLevel() {
    if (Object.keys(customData).length === 0) {
        showPopup('Level Empty', 'Place a few blocks first, then test the level.', [{ label: 'OK' }], 'blue');
        return;
    }
    startGame(false, true);
}

function setBgColor(hex) { targetBg = hexToRgb(hex); if (state !== 'PLAYING') currBg = { ...targetBg }; }

function buildLevel(isCustom) {
    objs = [];
    const st = window.innerWidth * 0.4;
    if (isCustom) {
        let maxC = 0;
        for (const k in customData) {
            const [c, r] = k.split(',').map(Number);
            const t = customData[k];
            if (c > maxC) maxC = c;
            objs.push(parseCustomObject(t, c, r, st));
        }
        lvlLen = st + (maxC + 10) * B_SIZE;
    } else {
        const str = levels[currLevel].data;
        for (let i = 0; i < str.length; i++) {
            const c = str[i], x = st + i * B_SIZE, y = groundY - B_SIZE;
            if (c === '^') objs.push({ type: 'spike', x, y, w: B_SIZE, h: B_SIZE });
            else if (c === 'v') objs.push({ type: 'spike-down', x, y: groundY - B_SIZE * 4, w: B_SIZE, h: B_SIZE });
            else if (c === '_') objs.push({ type: 'block', x, y, w: B_SIZE, h: B_SIZE });
            else if (c === 'o') objs.push({ type: 'orb', x, y: y - B_SIZE, w: B_SIZE, h: B_SIZE, act: true });
            else if (c === '*') objs.push({ type: 'mana', x: x + B_SIZE / 4, y: y - B_SIZE + B_SIZE / 4, w: B_SIZE / 2, h: B_SIZE / 2, act: true });
            else if (c === '>') objs.push({ type: 'portal-ship', x, y: y - B_SIZE * 2, w: B_SIZE, h: B_SIZE * 3 });
            else if (c === '<') objs.push({ type: 'portal-cube', x, y: y - B_SIZE * 2, w: B_SIZE, h: B_SIZE * 3 });
            else if (c === 'C') objs.push({ type: 'trigger-col', x, color: '#0033cc' });
            else if (c === 'R') objs.push({ type: 'trigger-col', x, color: '#cc0000' });
            else if (c === 'p') objs.push({ type: 'platform', x, y, w: B_SIZE, h: B_SIZE / 2 });
            else if (c === 'b') objs.push({ type: 'bounce', x, y, w: B_SIZE, h: B_SIZE / 2, act: true });
        }
        lvlLen = st + str.length * B_SIZE;
    }
}

function startGame(prac, custom) {
    isPractice = prac;
    isCustomLevel = !!custom;
    checkpoints = [];
    if (!isPractice) { attempts++; updateStats(); }

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('game-ui').classList.add('active');
    document.getElementById('attemptItem').style.display = isPractice ? 'none' : 'flex';
    if (isPractice) document.getElementById('practice-ui').classList.add('active');

    const initCol = isPractice ? '#003311' : (isCustomLevel ? '#222244' : levels[currLevel].color);
    setBgColor(initCol); currBg = { ...targetBg };

    player = { x: window.innerWidth * 0.2, y: groundY - 32, w: 32, h: 32, vy: 0, rot: 0, grounded: true, mode: 'cube' };
    camX = 0; particles = []; shards = []; screenShake = 0;
    document.getElementById('progressFill').style.width = '0%';

    buildLevel(isCustomLevel);
    state = 'PLAYING';
    startMusic();
}

function retryLevel() {
    if (isPractice && checkpoints.length > 0) {
        const cp = checkpoints[checkpoints.length - 1];
        camX = cp.cx; player.x = cp.px; player.y = cp.py;
        player.vy = cp.vy; player.rot = cp.rot; player.mode = cp.m;
        player.grounded = false;
        objs.forEach(o => o.act = true);
        setBgColor(cp.bg); currBg = { ...targetBg };

        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('game-ui').classList.add('active');
        document.getElementById('practice-ui').classList.add('active');
        state = 'PLAYING';
        startMusic();
    } else {
        startGame(isPractice, isCustomLevel);
    }
}

function addCheckpoint() {
    if (state !== 'PLAYING') return;
    checkpoints.push({
        cx: camX, px: player.x, py: player.y, vy: player.vy, rot: player.rot, m: player.mode,
        bg: `#${Math.floor(currBg.r).toString(16).padStart(2, '0')}${Math.floor(currBg.g).toString(16).padStart(2, '0')}${Math.floor(currBg.b).toString(16).padStart(2, '0')}`
    });
}
function removeCheckpoint() { if (checkpoints.length > 0) checkpoints.pop(); }

let editorPainting = false;
let hoverCell = null;

function getEditorCell(pos) {
    if (pos.clientY < 80 || pos.clientY > window.innerHeight - 80) return null;
    const c = Math.floor((pos.clientX + edCamX - (window.innerWidth * 0.4)) / B_SIZE);
    const r = Math.floor((groundY - pos.clientY) / B_SIZE);
    if (c >= 0 && r >= 0 && r < 15) return { c, r };
    return null;
}

function applyEditorTool(cell) {
    const k = `${cell.c},${cell.r}`;
    if (editorTool === 'eraser') delete customData[k];
    else customData[k] = editorTool;
}

function handlePress(e) {
    const pos = e.touches ? e.touches[0] : e;
    if (state === 'EDITOR') {
        const cell = getEditorCell(pos);
        if (cell) { editorPainting = true; applyEditorTool(cell); hoverCell = cell; }
        return;
    }

    isHolding = true;

    if (state === 'PLAYING' && player.mode === 'cube') {
        for (const o of objs) {
            if (o.type === 'orb' && o.act) {
                const sX = o.x - camX;
                const d = Math.hypot((player.x + player.w / 2) - (sX + o.w / 2), (player.y + player.h / 2) - (o.y + o.h / 2));
                if (d < B_SIZE * 1.5) {
                    player.vy = ORB_FORCE; player.grounded = false; o.act = false; playSfx('orb');
                    unlockAchievement('orb-hunter');
                    for (let i = 0; i < 15; i++) particles.push({ x: sX + o.w / 2, y: o.y + o.h / 2, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 1, size: 4, c: '#ffde00' });
                    return;
                }
            }
        }
        if (player.grounded) { player.vy = JUMP_FORCE; player.grounded = false; }
    }
}
function handleRelease() { isHolding = false; editorPainting = false; }

function handleEditorMove(e) {
    if (state !== 'EDITOR') return;
    const pos = e.touches ? e.touches[0] : e;
    const cell = getEditorCell(pos);
    hoverCell = cell;
    if (editorPainting && cell) applyEditorTool(cell);
}

function isTypingInInput() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
}

window.addEventListener('mousedown', (e) => { if (e.target.tagName === 'CANVAS') handlePress(e); });
window.addEventListener('mouseup', handleRelease);
window.addEventListener('touchstart', (e) => { if (e.target.tagName === 'CANVAS') { e.preventDefault(); handlePress(e); } }, { passive: false });
window.addEventListener('touchend', handleRelease);
window.addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.code === 'ArrowUp') && !isTypingInInput()) { e.preventDefault(); handlePress(e); } });
window.addEventListener('keyup', (e) => { if ((e.code === 'Space' || e.code === 'ArrowUp') && !isTypingInInput()) handleRelease(e); });
window.addEventListener('mousemove', handleEditorMove);
window.addEventListener('touchmove', (e) => {
    if (state === 'EDITOR') { e.preventDefault(); handleEditorMove(e); }
}, { passive: false });
window.addEventListener('contextmenu', (e) => {
    if (state === 'EDITOR' && e.target.tagName === 'CANVAS') {
        e.preventDefault();
        const cell = getEditorCell(e);
        if (cell) delete customData[`${cell.c},${cell.r}`];
    }
});

document.getElementById('popup-root').addEventListener('click', (e) => { if (e.target.id === 'popup-root') closePopup(); });

function die() {
    state = 'DEAD'; screenShake = 25; playSfx('crash');
    if (!isPractice) clearInterval(seqInt);
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('game-over-ui').classList.add('active');
    const title = document.getElementById('goTitle');
    title.innerText = isPractice ? 'PRACTICE CRASH' : 'LEVEL FAILED';
    title.style.color = 'var(--gd-red)';
    document.getElementById('percentText').innerText = Math.min(Math.floor((camX / lvlLen) * 100), 99) + '%';
    updateStats();
    if (!isPractice) unlockAchievement('clear-run');
    for (let i = 0; i < 10; i++) shards.push({
        x: player.x + 16, y: player.y + 16, vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 1) * 15,
        rot: 0, rotV: (Math.random() - 0.5) * 0.5, c: i % 2 === 0 ? save.c1 : save.c2
    });
}

function winLevel() {
    state = 'WON';
    clearInterval(seqInt);
    playSfx('coin');
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('game-over-ui').classList.add('active');
    const title = document.getElementById('goTitle');
    title.innerText = isPractice ? 'PRACTICE COMPLETE!' : 'LEVEL COMPLETE!';
    title.style.color = 'var(--gd-green)';
    document.getElementById('percentText').innerText = '100%';
    unlockAchievement('clear-run');

    let rewardStars = 1;
    if (!isCustomLevel) {
        rewardStars = getDifficultyTier(levels[currLevel].diff).stars;
    } else if (currentViewLevel) {
        rewardStars = getDifficultyTier(currentViewLevel.difficulty).stars;
    } else if (currentEditorLevelId) {
        const lvl = save.createdLevels.find(l => l.id === currentEditorLevelId);
        if (lvl) rewardStars = getDifficultyTier(lvl.difficulty).stars;
    }
    if (!isPractice) submitLevelCompletion(rewardStars);
}

function runDebugAction(type) {
    if (type === 'popup') {
        const title = document.getElementById('dbg-popup-title').value || 'Debug Popup';
        const content = document.getElementById('dbg-popup-content').value || 'No content';
        const btn = document.getElementById('dbg-popup-btn').value || 'Continue';
        showPopup(title, content, [{ label: btn }], 'purple');
    } else if (type === 'orbs') {
        save.orbs += 50; persistSave(); updateStats(); showToast('Debug', 'Added 50 orbs.', '🧪');
    } else if (type === 'colors') {
        const extras = ['#ff6600', '#00ffff', '#ff00ff', '#00ffcc'];
        extras.forEach(c => { if (!save.unlockedColors.includes(c)) save.unlockedColors.push(c); });
        persistSave(); buildIconKit(); buildShop(); showToast('Debug', 'Unlocked Colors.', '🎨');
    } else if (type === 'complete') {
        winLevel();
    } else if (type === 'crash') {
        die();
    } else if (type === 'theme') {
        const themes = ['#0033cc', '#220066', '#cc2200', '#009944'];
        save.themeIndex = (save.themeIndex + 1) % themes.length;
        setBgColor(themes[save.themeIndex]);
        persistSave();
        showToast('Theme', 'Switched theme (wip?).', '🌈');
    }
}

let currentViewLevel = null;

// 1. Update the renderer to make levels clickable
function renderCommunityLevels(levels) {
    const root = document.getElementById('community-levels');
    if (!root) return;
    if (!levels.length) {
        root.innerHTML = '<div class="community-empty">No levels found.</div>';
        return;
    }
    root.innerHTML = levels.map((level) => {
        let ratingStatus = '';
        if (level.verdict) {
            const bg = level.verdict === 'approved' ? 'var(--gd-green)' : 'var(--gd-red)';
            ratingStatus = ` <span style="font-size:0.75rem; padding: 2px 6px; border-radius: 4px; background: ${bg}; color: #fff; vertical-align: middle; margin-left: 5px;">${level.verdict.toUpperCase()}</span>`;
        }

        return `
            <div class="community-item" onclick="openLevelInfo('${level.id}')" style="cursor:pointer; transition:transform 0.1s; margin-bottom:8px; border: 1px solid rgba(255,255,255,0.2);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <strong style="font-size:1.1rem; color:var(--gd-blue);">${level.title}</strong>
                        ${ratingStatus}
                    </div>
                    <div style="color:var(--gd-red); font-size:0.9rem;">❤️ ${level.likes || 0}</div>
                </div>
              <div style="font-size:0.85rem; color:#ccc; margin-top:3px;">${level.creator} • ${getDifficultyTier(level.difficulty).face} ${getDifficultyTier(level.difficulty).name} • ⬇️ ${level.downloads || 0}</div>
                <div style="font-size:0.8rem; color:#aaa; margin-top:5px; font-style:italic;">${level.description || 'No description'}</div>
                <div class="community-actions" onclick="event.stopPropagation()" style="margin-top:8px;">
                    ${communityUser ? `
                        <button class="debug-btn" style="width:auto; padding:4px 8px; font-size:0.75rem; background:var(--gd-green);" onclick="rateCommunityLevel('${level.id}', 'approved')">Approve</button>
                        <button class="debug-btn" style="width:auto; padding:4px 8px; font-size:0.75rem; background:var(--gd-red);" onclick="rateCommunityLevel('${level.id}', 'rejected')">Reject</button>
                    ` : '<span style="font-size:0.75rem; color:#aaa;">Sign in to rate</span>'}
                </div>
            </div>
        `;
    }).join('');
}

// 2. Open the Level Details Screen
async function openLevelInfo(id) {
    try {
        const data = await apiRequest(`/api/levels/${id}`);
        currentViewLevel = data.level;
        const tier = getDifficultyTier(currentViewLevel.difficulty);

        // Populate UI
        document.getElementById('info-title').innerText = currentViewLevel.title;
        document.getElementById('info-creator').innerText = `By ${currentViewLevel.creator}`;
        document.getElementById('info-desc').innerText = currentViewLevel.description || 'No description provided.';
        document.getElementById('info-likes').innerText = currentViewLevel.likes || 0;
        document.getElementById('info-downloads').innerText = currentViewLevel.downloads || 0;
        document.getElementById('info-difficulty').innerHTML = `${tier.face} ${tier.name} <span style="color:var(--gd-yellow);">★${tier.stars}</span>`;

        loadComments(id);
        setScreen('level-info'); // Show the new screen
    } catch (err) {
        showPopup('Error', err.message, [{ label: 'OK' }], 'red');
    }
}

// 3. Play the custom level directly from the info screen
function playCommunityLevel() {
    if (!currentViewLevel) return;
    try {
        const parsed = JSON.parse(currentViewLevel.data);
        customData = (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
        showPopup('Broken Level', "This level's data could not be read.", [{ label: 'OK' }], 'red');
        return;
    }
    if (Object.keys(customData).length === 0) {
        showPopup('Empty Level', 'This level has no tiles to play.', [{ label: 'OK' }], 'blue');
        return;
    }
    isCustomLevel = true;
    currentEditorLevelId = null;
    apiRequest(`/api/levels/${currentViewLevel.id}/download`, { method: 'POST' }).catch(() => { });
    startGame(false, true); // custom=true so buildLevel() actually reads customData
}

// 4. Like a Level
async function likeCurrentLevel() {
    if (!currentViewLevel) return;
    try {
        const data = await apiRequest(`/api/levels/${currentViewLevel.id}/like`, { method: 'POST' });
        currentViewLevel.likes = data.likes;
        document.getElementById('info-likes').innerText = currentViewLevel.likes;
    } catch (err) {
        showPopup('Error', 'Failed to like level.', [{ label: 'OK' }], 'red');
    }
}

// 5. Comments Logic
async function loadComments(id) {
    const root = document.getElementById('comments-list');
    root.innerHTML = 'Loading...';
    try {
        const data = await apiRequest(`/api/levels/${id}/comments`);
        if (data.comments.length === 0) {
            root.innerHTML = '<div style="color:#777;">No comments yet. Be the first!</div>';
        } else {
            root.innerHTML = data.comments.map(c => `
                <div style="background:rgba(255,255,255,0.1); padding:10px; border-radius:8px;">
                    <strong style="color:var(--gd-yellow);">${c.username}</strong>
                    <div style="margin-top:5px;">${c.text}</div>
                </div>
            `).join('');
        }
    } catch (e) {
        root.innerHTML = 'Could not load comments.';
    }
}

async function postComment() {
    if (!communityUser) {
        showPopup('Login Required', 'You must be logged in to comment.', [{ label: 'OK' }], 'blue');
        return;
    }
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text || !currentViewLevel) return;

    try {
        await apiRequest(`/api/levels/${currentViewLevel.id}/comments`, {
            method: 'POST',
            body: JSON.stringify({ username: communityUser.username, text })
        });
        input.value = '';
        loadComments(currentViewLevel.id); // Refresh the list
    } catch (err) {
        showPopup('Error', 'Failed to post comment.', [{ label: 'OK' }], 'red');
    }
}

function updateLogic() {
    bgScroll += SPEED * 0.4;
    if (screenShake > 0) screenShake *= 0.8;

    currBg.r += (targetBg.r - currBg.r) * 0.05;
    currBg.g += (targetBg.g - currBg.g) * 0.05;
    currBg.b += (targetBg.b - currBg.b) * 0.05;

    if (state === 'PLAYING') {
        camX += SPEED;

        if (player.mode === 'ship') {
            if (isHolding) player.vy += SHIP_THRUST;
            player.vy += SHIP_GRAVITY;
            if (player.vy < -10) player.vy = -10;
            if (player.vy > 10) player.vy = 10;
            player.rot = player.vy * 0.05;
        } else {
            player.vy += GRAVITY;
            if (!player.grounded) player.rot += 0.12;
            else { const snap = Math.PI / 2; player.rot = Math.round(player.rot / snap) * snap; }
            if (player.grounded && isHolding) { player.vy = JUMP_FORCE; player.grounded = false; }
        }
        player.y += player.vy;

        if (player.mode === 'ship' && player.y < 50) { player.y = 50; player.vy = 0; }

        const pR = { x: player.x, y: player.y, w: player.w, h: player.h };
        let landed = false;

        for (const o of objs) {
            if (o.x > camX + window.innerWidth || o.x + o.w < camX) continue;
            const sX = o.x - camX;

            if (o.type === 'trigger-col' && player.x > sX) { setBgColor(o.color); o.x = -9999; }
            if (o.type === 'portal-ship' && pR.x + pR.w > sX && pR.x < sX + o.w) { player.mode = 'ship'; unlockAchievement('sky-rider'); o.x = -9999; playSfx('orb'); }
            if (o.type === 'portal-cube' && pR.x + pR.w > sX && pR.x < sX + o.w) { player.mode = 'cube'; o.x = -9999; playSfx('orb'); }
            if (o.type === 'mana' && o.act && pR.x + pR.w > sX && pR.x < sX + o.w && pR.y + pR.h > o.y && pR.y < o.y + o.h) {
                o.act = false; if (!isPractice) { save.orbs += 5; persistSave(); } playSfx('coin');
                for (let i = 0; i < 10; i++) particles.push({ x: sX + o.w / 2, y: o.y + o.h / 2, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, life: 1, size: 4, c: '#00bfff' });
            }
            if (o.type === 'bounce' && o.act && pR.x + pR.w > sX && pR.x < sX + o.w && pR.y + pR.h > o.y && pR.y < o.y + o.h) {
                o.act = false; player.vy = ORB_FORCE; player.grounded = false; playSfx('orb');
            }
            if (o.type === 'spike') {
                const hw = B_SIZE * 0.3, hh = B_SIZE * 0.4, sR = { x: sX + (B_SIZE - hw) / 2, y: o.y + (B_SIZE - hh), w: hw, h: hh };
                if (pR.x < sR.x + sR.w && pR.x + pR.w > sR.x && pR.y < sR.y + sR.h && pR.y + pR.h > sR.y) return die();
            } else if (o.type === 'spike-down') {
                const hw = B_SIZE * 0.3, hh = B_SIZE * 0.4, sR = { x: sX + (B_SIZE - hw) / 2, y: o.y, w: hw, h: hh };
                if (pR.x < sR.x + sR.w && pR.x + pR.w > sR.x && pR.y < sR.y + sR.h && pR.y + pR.h > sR.y) return die();
            } else if (o.type === 'block' || o.type === 'platform') {
                const bR = { x: sX, y: o.type === 'platform' ? o.y + 8 : o.y, w: o.w, h: o.type === 'platform' ? o.h - 8 : o.h };
                if (pR.x < bR.x + bR.w && pR.x + pR.w > bR.x && pR.y < bR.y + bR.h && pR.y + pR.h > bR.y) {
                    const prevB = (player.y - player.vy) + player.h;
                    const prevT = (player.y - player.vy);
                    if (prevT >= bR.y + bR.h - 2 && player.vy < 0) { player.y = bR.y + bR.h; player.vy = 0; }
                    else if (prevB <= bR.y + 0.1 && player.vy > 0) { player.y = bR.y - player.h; player.vy = 0; player.grounded = true; landed = true; }
                    else return die();
                }
            }
        }

        if (!landed) {
            if (player.y + player.h >= groundY) { player.y = groundY - player.h; player.vy = 0; player.grounded = true; }
            else { player.grounded = false; }
        }


        document.getElementById('progressFill').style.width = Math.min((camX / lvlLen) * 100, 100) + '%';
        if (camX > lvlLen + window.innerWidth) return winLevel();
    }

    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx; p.y += p.vy; p.life -= 0.05; if (p.life <= 0) particles.splice(i, 1); }
    for (let i = shards.length - 1; i >= 0; i--) { const s = shards[i]; s.vy += GRAVITY; s.x += s.vx; s.y += s.vy; s.rot += s.rotV; if (s.y > groundY + 100) shards.splice(i, 1); }
}

function drawBlock(x, y, w, h, color, topGlow) {
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, topGlow || '#ffffff');
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + 4, y + 4, 8, 6);
}

function draw() {
    const w = window.innerWidth, h = window.innerHeight;
    ctx.save();
    if (screenShake > 0.5) ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);

    const bgStr = `rgb(${Math.floor(currBg.r)},${Math.floor(currBg.g)},${Math.floor(currBg.b)})`;
    const darkBg = `rgb(${Math.floor(currBg.r * 0.3)},${Math.floor(currBg.g * 0.3)},${Math.floor(currBg.b * 0.3)})`;
    const grad = ctx.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, bgStr); grad.addColorStop(1, darkBg);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

    const aCamX = state === 'EDITOR' ? edCamX : camX;

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    stars.forEach(s => { let sx = (s.x - aCamX * 0.05) % w; if (sx < 0) sx += w; ctx.fillRect(sx, s.y, s.size, s.size); });

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    const pOff = -(aCamX * 0.2) % 600;
    for (let i = 0; i < w / 600 + 2; i++) {
        const bx = pOff + i * 600;
        ctx.beginPath();
        ctx.moveTo(bx, groundY); ctx.lineTo(bx + 100, groundY - 200); ctx.lineTo(bx + 200, groundY - 150);
        ctx.lineTo(bx + 300, groundY - 300); ctx.lineTo(bx + 450, groundY - 60); ctx.lineTo(bx + 600, groundY);
        ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
    for (let x = -(aCamX * 0.5 % 80); x < w; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    ctx.fillStyle = '#000'; ctx.fillRect(0, groundY, w, h - groundY);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(w, groundY); ctx.stroke();
    for (let i = 0, off = -(aCamX % 50); i < w / 50 + 1; i++) { ctx.beginPath(); ctx.moveTo(off + i * 50, groundY); ctx.lineTo(off + i * 50 - 50, h); ctx.stroke(); }

    const drawObjs = state === 'EDITOR'
        ? Object.keys(customData).map(k => {
            const [c, r] = k.split(',').map(Number);
            return parseCustomObject(customData[k], c, r, w * 0.4);
        })
        : objs;

    for (const o of drawObjs) {
        const sX = o.x - aCamX;
        if (sX > w || sX + o.w < -50) continue;

        if (o.type === 'spike') {
            const grad = ctx.createLinearGradient(sX, o.y, sX + o.w, o.y + o.h);
            grad.addColorStop(0, '#444'); grad.addColorStop(1, '#000');
            ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(sX, o.y + o.h); ctx.lineTo(sX + o.w / 2, o.y); ctx.lineTo(sX + o.w, o.y + o.h); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        } else if (o.type === 'spike-down') {
            const grad = ctx.createLinearGradient(sX, o.y, sX + o.w, o.y + o.h);
            grad.addColorStop(0, '#444'); grad.addColorStop(1, '#000');
            ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(sX, o.y); ctx.lineTo(sX + o.w / 2, o.y + o.h); ctx.lineTo(sX + o.w, o.y); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        } else if (o.type === 'block') {
            drawBlock(sX, o.y, o.w, o.h, '#222', '#666');
        } else if (o.type === 'platform') {
            drawBlock(sX, o.y + 8, o.w, o.h - 8, '#444', '#888');
        } else if (o.type === 'orb' && (o.act || state === 'EDITOR')) {
            const g = ctx.createRadialGradient(sX + o.w / 2, o.y + o.h / 2, 3, sX + o.w / 2, o.y + o.h / 2, 18);
            g.addColorStop(0, '#fff8b0'); g.addColorStop(0.3, '#ffde00'); g.addColorStop(1, '#aa6600');
            ctx.beginPath(); ctx.arc(sX + o.w / 2, o.y + o.h / 2, 14, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
            ctx.beginPath(); ctx.arc(sX + o.w / 2, o.y + o.h / 2, 20, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,222,0,0.4)'; ctx.lineWidth = 4; ctx.stroke();
        } else if (o.type === 'mana' && (o.act || state === 'EDITOR')) {
            const g = ctx.createRadialGradient(sX + o.w / 2, o.y + o.h / 2, 2, sX + o.w / 2, o.y + o.h / 2, 12);
            g.addColorStop(0, '#c8ffff'); g.addColorStop(1, '#00bfff');
            ctx.beginPath(); ctx.arc(sX + o.w / 2, o.y + o.h / 2, 10, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        } else if (o.type === 'portal-ship' || o.type === 'portal-cube') {
            ctx.strokeStyle = o.type === 'portal-ship' ? '#ff00ff' : '#00ff00'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.ellipse(sX + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 0.3; ctx.fillStyle = ctx.strokeStyle; ctx.fill(); ctx.globalAlpha = 1;
        } else if (o.type === 'bounce') {
            drawBlock(sX, o.y, o.w, o.h, '#4a2b00', '#cc8800');
            ctx.fillStyle = '#ffde00'; ctx.fillRect(sX + 8, o.y + 8, o.w - 16, 6);
        }
    }

    if (state === 'EDITOR') {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
        const stX = (w * 0.4) - edCamX;
        for (let x = stX; x < w; x += B_SIZE) { ctx.beginPath(); ctx.moveTo(x, groundY); ctx.lineTo(x, groundY - 15 * B_SIZE); ctx.stroke(); }
        for (let r = 0; r <= 15; r++) { const y = groundY - r * B_SIZE; ctx.beginPath(); ctx.moveTo(stX, y); ctx.lineTo(w, y); ctx.stroke(); }

        if (hoverCell) {
            const hx = stX + hoverCell.c * B_SIZE;
            const hy = groundY - (hoverCell.r + 1) * B_SIZE;
            ctx.strokeStyle = editorTool === 'eraser' ? 'rgba(255,80,80,0.9)' : 'rgba(255,222,0,0.9)';
            ctx.lineWidth = 3;
            ctx.strokeRect(hx, hy, B_SIZE, B_SIZE);
        }
    }

    const drawPlayer = (x, y, r, m, a, c1, c2) => {
        ctx.save(); ctx.translate(x + 16, y + 16); ctx.rotate(r); ctx.globalAlpha = a;
        if (m === 'ship') {
            const g = ctx.createLinearGradient(-20, -10, 20, 10); g.addColorStop(0, c1); g.addColorStop(1, c2);
            ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-20, -10); ctx.lineTo(20, 0); ctx.lineTo(-20, 10); ctx.fill();
            ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = c2; ctx.fillRect(-10, -5, 10, 10); ctx.strokeRect(-10, -5, 10, 10);
        } else {
            ctx.fillStyle = c1; ctx.fillRect(-16, -16, 32, 32); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(-16, -16, 32, 32);
            ctx.fillStyle = c2; ctx.fillRect(-8, -8, 16, 16); ctx.strokeRect(-8, -8, 16, 16);
            ctx.fillStyle = '#000'; ctx.fillRect(-10, -10, 5, 5); ctx.fillRect(5, -10, 5, 5); ctx.fillRect(-8, 5, 16, 3);
        }
        ctx.restore();
    };

    if (state === 'PLAYING') {

        drawPlayer(player.x, player.y, player.rot, player.mode, 1, save.c1, save.c2);
    }

    shards.forEach(s => { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.fillStyle = s.c; ctx.fillRect(-8, -8, 16, 16); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(-8, -8, 16, 16); ctx.restore(); });
    particles.forEach(p => { ctx.fillStyle = p.c; ctx.globalAlpha = p.life; ctx.fillRect(p.x, p.y, p.size, p.size); ctx.globalAlpha = 1; });

    ctx.restore();
}

function loop(t) {
    let dt = t - (lastT || t); lastT = t; if (dt > 100) dt = 100;
    acc += dt;
    while (acc >= stepT) { updateLogic(); acc -= stepT; frame++; }
    draw();
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

buildEditorPalette();
renderAchievements();
renderCommunity();
updateStats();
refreshCommunity();
buildDifficultySelect('community-difficulty');