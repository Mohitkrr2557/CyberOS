const bootScreen = document.getElementById('boot-screen');
const desktop = document.getElementById('desktop');
const usernameInput = document.getElementById('username-input');
const bootBtn = document.getElementById('boot-btn');
const bootStatus = document.getElementById('boot-status');
const bootSubtitle = document.getElementById('boot-subtitle');
const usernameDisplay = document.getElementById('username-display');
const taskbar = document.getElementById('taskbar');
const startMenu = document.getElementById('start-menu');
const contextMenu = document.getElementById('context-menu');
const altTabOverlay = document.getElementById('alt-tab-overlay');
const altTabGrid = document.getElementById('alt-tab-grid');
const showDesktopBtn = document.getElementById('show-desktop-btn');

// Icon tray emojis
const trayEmojis = ['👤','🚀','🌌','🛸','🌠','💻','🔥','⚡','🎮','👾','🤖','💀','🦾','🔮','⚔️','🐉'];

// Boot verification
if (!bootBtn) {
    document.write('ERROR: boot-btn element not found');
} else {
    bootBtn.textContent = 'SIGN IN';
}

// Debug: show script loaded
if (bootStatus) bootStatus.textContent = '';
console.log('Cyber OS script loaded at', new Date().toISOString());

let currentUser = null;
let booted = false;
let bootState = 'boot';
let windowZ = 100;
let openWindows = [];
let minimizedWindows = [];
let altTabIndex = -1;
let isAltTab = false;
let previousFocus = null;
let showDesktopState = false;
let lastDesktopState = [];
let lockInput = false;
let isDragging = false;
let alwaysOnTopWindow = null;
let windowPreState = {};
function safeJsonParse(value, fallback) {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch (e) {
        return fallback;
    }
}
function safeJsonObject(key, fallback) {
    var value = safeJsonParse(localStorage.getItem(key), fallback);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}
function safeJsonArray(key) {
    var value = safeJsonParse(localStorage.getItem(key), []);
    return Array.isArray(value) ? value : [];
}
function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
}
function capturePageFallback(target, options) {
    var width = window.innerWidth;
    var height = window.innerHeight;
    var clone = (target || document.body).cloneNode(true);
    clone.querySelectorAll('script, iframe, canvas, video').forEach(function(el) { el.remove(); });
    clone.style.margin = '0';
    clone.style.width = width + 'px';
    clone.style.minHeight = height + 'px';
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><base href="' + escapeHtml(location.href) + '"><style>html,body{margin:0;width:' + width + 'px;height:' + height + 'px;overflow:hidden;}</style></head><body>' + new XMLSerializer().serializeToString(clone) + '</body></html>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '"><foreignObject width="100%" height="100%">' + html + '</foreignObject></svg>';
    var canvas = document.createElement('canvas');
    var scale = (options && options.scale) || window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    var ctx = canvas.getContext('2d');
    return new Promise(function(resolve, reject) {
        var img = new Image();
        img.onload = function() {
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(img.src);
            resolve(canvas);
        };
        img.onerror = function() {
            URL.revokeObjectURL(img.src);
            reject(new Error('Fallback capture failed'));
        };
        img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    });
}
if (typeof window.html2canvas === 'undefined') {
    window.html2canvas = capturePageFallback;
}
let appUsage = safeJsonObject('cyberos_app_usage', {});
let appBadges = {};
let batteryHistory = [];
for (let i = 0; i < 10; i++) batteryHistory.push(80 + Math.floor(Math.random() * 15));
let powerSubmenuOpen = false;
const _defaultTaskbarApps = ['notes','calendar','calc','ai','gaminghub','fileexplorer','recyclebin','brave','terminal','powershell','ubuntu','snip','paint','mediaplayer','controlpanel','photos','camera'];
let _pinnedApps = (function() {
    var v = safeJsonArray('cyberos_pinned');
    if (v.length === 0) { v = _defaultTaskbarApps.slice(); localStorage.setItem('cyberos_pinned', JSON.stringify(v)); }
    return v;
})();
let _recycleBin = { items: [] };
let _feStates = {};
let _feClipboard = null;

const windowRegistry = {};
const cleanups = {};
const contextMenuState = { icon: null, x: 0, y: 0 };

const mediaState = {
    playing: false,
    currentTrack: 'Ambient Waves 🌊',
    progress: 35,
    volume: 80,
    trackIndex: 0,
    tracks: ['Ambient Waves 🌊', 'Cyber Pulse', 'Neon Dreams', 'Starfield'],
};

function loadAccounts() {
    return safeJsonObject('cyberos_accounts', {});
}
function saveAccounts(acc) { localStorage.setItem('cyberos_accounts', JSON.stringify(acc)); }
function hashPW(pw) { return btoa(pw); }

function collectUserData() {
    const data = {};
    const notesWin = windowRegistry.notes;
    if (notesWin) {
        const ta = notesWin.querySelector('textarea');
        if (ta) data.notes = ta.value;
    }
    const todoWin = windowRegistry.todo;
    if (todoWin) {
        const items = [];
        todoWin.querySelectorAll('#todo-items-' + todoWin.id + ' > div').forEach(div => {
            const cb = div.querySelector('input[type=checkbox]');
            const label = div.querySelector('span');
            if (label) items.push({ text: label.textContent, checked: cb ? cb.checked : false });
        });
        data.todos = items;
    }
    const aiWin = windowRegistry.ai;
    if (aiWin) {
        const log = aiWin.querySelector('[id^="ai-log-"]');
        if (log) {
            const msgs = [];
            log.querySelectorAll('p').forEach(p => {
                const text = p.textContent || '';
                const isUser = text.startsWith('You:');
                msgs.push({ role: isUser ? 'user' : 'assistant', text: isUser ? text.slice(4).trim() : text });
            });
            data.aiChat = msgs;
        }
    }
    const paintWin = windowRegistry.paint;
    if (paintWin) {
        const pc = paintWin._paintCanvas;
        if (pc) data.paintCanvas = pc.toDataURL();
    }
    const snipWin = windowRegistry.snip;
    if (snipWin) {
        const sc = snipWin._snipCanvas;
        if (sc) data.snipCanvas = sc.toDataURL();
    }
    return data;
}

function applyUserData(data) {
    if (!data) return;
    if (data.notes) {
        setTimeout(() => {
            const notesWin = windowRegistry.notes;
            if (notesWin) {
                const ta = notesWin.querySelector('textarea');
                if (ta) ta.value = data.notes;
            }
        }, 100);
    }
    if (data.todos) {
        setTimeout(() => {
            const todoWin = windowRegistry.todo;
            if (todoWin) renderTodoItems(todoWin, data.todos);
        }, 100);
    }
    if (data.aiChat) {
        setTimeout(() => {
            const aiWin = windowRegistry.ai;
            if (aiWin) {
                const log = aiWin.querySelector('[id^="ai-log-"]');
                if (log) {
                    log.innerHTML = '';
                    data.aiChat.forEach(msg => {
                        const p = document.createElement('p');
                        p.textContent = (msg.role === 'user' ? 'You: ' : '') + msg.text;
                        p.style.color = msg.role === 'user' ? '#88ff88' : '#88ccff';
                        log.appendChild(p);
                    });
                    log.scrollTop = log.scrollHeight;
                }
            }
        }, 100);
    }
    if (data.paintCanvas) {
        setTimeout(() => {
            const paintWin = windowRegistry.paint;
            if (paintWin) {
                const pc = paintWin._paintCanvas;
                if (pc) {
                    const img = new Image();
                    img.onload = function() {
                        const ctx = pc.getContext('2d');
                        ctx.clearRect(0, 0, pc.width, pc.height);
                        ctx.drawImage(img, 0, 0);
                    };
                    img.src = data.paintCanvas;
                }
            }
        }, 100);
    }
    if (data.snipCanvas) {
        setTimeout(() => {
            const snipWin = windowRegistry.snip;
            if (snipWin) {
                const sc = snipWin._snipCanvas;
                const sb = snipWin._snipSaveBtn;
                if (sc) {
                    const img = new Image();
                    img.onload = function() {
                        const ctx = sc.getContext('2d');
                        ctx.clearRect(0, 0, sc.width, sc.height);
                        ctx.drawImage(img, 0, 0);
                        if (sb) sb.disabled = false;
                        var db = snipWin._snipDownloadBtn;
                        if (db) db.disabled = false;
                    };
                    img.src = data.snipCanvas;
                }
            }
        }, 100);
    }
}

function saveUserSession() {
    if (!currentUser) return;
    const accounts = loadAccounts();
    if (accounts[currentUser]) {
        accounts[currentUser].data = collectUserData();
        saveAccounts(accounts);
    }
}

function bootUser(username) {
    const accounts = loadAccounts();
    const emoji = getSelectedEmoji();
    if (accounts[username]) {
        currentUser = username;
        usernameDisplay.textContent = `${accounts[username].emoji || emoji} ${username}`;
        if (!booted) {
            applyWp();
            booted = true;
        }
        bootScreen.classList.add('hidden');
        desktop.classList.remove('hidden');
        applyUserData(accounts[username].data);
        window._initParticles();
        setTimeout(showWelcomeTour, 1500);
        return true;
    } else {
        accounts[username] = { emoji, data: {} };
        saveAccounts(accounts);
        currentUser = username;
        usernameDisplay.textContent = `${emoji} ${username}`;
        if (!booted) {
            applyWp();
            booted = true;
        }
        bootScreen.classList.add('hidden');
        desktop.classList.remove('hidden');
        window._initParticles();
        setTimeout(showWelcomeTour, 1500);
        return true;
    }
}

function getSelectedEmoji() {
    const sel = document.querySelector('#emoji-tray .tray-emoji.selected');
    return sel ? sel.textContent.trim() : '👤';
}

function populateBootScreen() {
    const accounts = loadAccounts();
    bootStatus.textContent = '';
    if (bootState === 'lock') {
        bootSubtitle.textContent = `Welcome back, ${currentUser}!`;
        usernameInput.value = currentUser || '';
        usernameInput.disabled = true;
        bootBtn.textContent = 'CONTINUE';
    } else {
        bootSubtitle.textContent = 'Welcome, Space Cadet!';
        usernameInput.disabled = false;
        usernameInput.value = '';
        const recent = Object.keys(accounts);
        if (recent.length > 0) {
            const lastUser = recent[recent.length - 1];
            usernameInput.value = lastUser;
            bootSubtitle.textContent = `Welcome back, ${lastUser}!`;
        }
        bootBtn.textContent = 'LOGIN';
    }
    usernameInput.focus();
}

function handleBoot() {
    try {
        const username = usernameInput.value.trim();
        if (!username) { bootStatus.textContent = 'Enter a name!'; return; }
        bootUser(username);
    } catch(e) {
        bootStatus.textContent = 'Error: ' + (e.message || e);
        console.error('Boot error:', e);
    }
}

usernameInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleBoot(); });
bootBtn.addEventListener('click', handleBoot);

// Init icon tray
(function() {
    var tray = document.getElementById('emoji-tray');
    if (!tray) return;
    trayEmojis.forEach(function(e) {
        var el = document.createElement('div');
        el.className = 'tray-emoji';
        el.textContent = e;
        el.addEventListener('click', function() {
            tray.querySelectorAll('.tray-emoji').forEach(function(x) { x.classList.remove('selected'); });
            el.classList.add('selected');
        });
        tray.appendChild(el);
    });
    // Select first by default
    var first = tray.querySelector('.tray-emoji');
    if (first) first.classList.add('selected');
})();

function minimizeWindow(id) {
    const win = document.getElementById(id);
    if (!win) return;
    win.classList.add('minimizing');
    setTimeout(() => {
        win.classList.add('hidden');
        win.classList.remove('minimizing');
        if (!minimizedWindows.includes(id)) minimizedWindows.push(id);
        updateTaskbar();
    }, 200);
}

function closeWindow(id) {
    const win = document.getElementById(id);
    if (win) win.remove();
    openWindows = openWindows.filter(w => w !== id);
    minimizedWindows = minimizedWindows.filter(w => w !== id);
    Object.keys(windowRegistry).forEach(k => { if (windowRegistry[k] && windowRegistry[k].id === id) delete windowRegistry[k]; });
    if (cleanups[id]) { cleanups[id](); delete cleanups[id]; }
    updateTaskbar();
    if (openWindows.length === 0) { showDesktopState = false; lastDesktopState = []; }
}

function maximizeWindow(id) {
    const win = document.getElementById(id);
    if (!win) return;
    if (!win.classList.contains('maximized')) {
        const r = win.getBoundingClientRect();
        windowPreState[id] = {
            left: win.style.left || r.left + 'px',
            top: win.style.top || r.top + 'px',
            width: win.style.width || r.width + 'px',
            height: win.style.height || r.height + 'px'
        };
        win.classList.add('maximized');
        win.style.left = '0';
        win.style.top = '0';
        win.style.width = '100%';
        win.style.height = 'calc(100% - 40px)';
        win.style.transform = 'none';
    } else {
        win.classList.remove('maximized');
        const pre = windowPreState[id];
        if (pre) {
            win.style.left = pre.left;
            win.style.top = pre.top;
            win.style.width = pre.width;
            win.style.height = pre.height;
        }
    }
    updateTaskbar();
}

function updateTaskbar() {
    taskbar.querySelectorAll('.taskbar-btn').forEach(btn => {
        const app = btn.dataset.app;
        const isOpen = openWindows.some(w => w.startsWith(app + '-'));
        const isMinimized = minimizedWindows.some(w => w.startsWith(app + '-'));
        btn.classList.toggle('active', isOpen && !isMinimized);
        btn.classList.toggle('minimized', isMinimized);
    });
}

function focusWindow(id) {
    if (lockInput) return;
    const win = document.getElementById(id);
    if (!win) return;
    windowZ++;
    win.style.zIndex = windowZ;
    if (alwaysOnTopWindow && alwaysOnTopWindow !== id) {
        const pinned = document.getElementById(alwaysOnTopWindow);
        if (pinned) pinned.style.zIndex = windowZ + 1000;
    }
    win.classList.remove('minimized-style');
    minimizedWindows = minimizedWindows.filter(w => w !== id);
    openWindows = openWindows.filter(w => w !== id);
    openWindows.push(id);
    updateTaskbar();
}

function toggleWindow(type) {
    if (lockInput) return;
    trackAppUsage(type);
    const existing = Object.keys(windowRegistry).find(k => windowRegistry[k] && windowRegistry[k].id && windowRegistry[k].id.startsWith(type + '-'));
    if (existing && windowRegistry[existing]) {
        const winId = windowRegistry[existing].id;
        const win = document.getElementById(winId);
        if (win && !win.classList.contains('hidden')) {
            if (minimizedWindows.includes(winId)) {
                focusWindow(winId);
            } else {
                minimizeWindow(winId);
            }
        } else if (win) {
            win.classList.remove('hidden');
            minimizedWindows = minimizedWindows.filter(w => w !== winId);
            focusWindow(winId);
        } else {
            createWindow(type);
        }
    } else {
        createWindow(type);
    }
}

function createWindow(type) {
    if (lockInput) return;
    const app = apps[type];
    if (!app) return;
    const id = type + '-' + Date.now();
    const win = document.createElement('div');
    win.className = 'window';
    win.id = id;
    windowZ++;
    win.style.zIndex = windowZ;
    const title = app.title;
    win.innerHTML = `<div class="window-header" data-window-id="${id}"><span class="window-title">${title}</span><div class="window-controls"><button class="win-btn win-desktop" data-action="desktop" data-win="${id}" title="Show on desktop">\u{1F5A5}</button><button class="win-btn win-pin" data-action="pin" data-win="${id}" title="Always on top">\u{1F4CC}</button><button class="win-btn win-min" data-action="minimize" data-win="${id}">\u{2014}</button><button class="win-btn win-max" data-action="maximize" data-win="${id}">\u{25A1}</button><button class="win-btn win-close" data-action="close" data-win="${id}">\u2715</button></div></div><div class="window-content"></div>`;
    desktop.appendChild(win);
    const content = win.querySelector('.window-content');
    app.createContent(content, id);
    const deskBtnInit = win.querySelector('.win-desktop');
    if (iconApps.some(a => a.t === type)) {
        deskBtnInit.style.color = '#33ff33';
        deskBtnInit.style.background = 'rgba(51,255,51,0.15)';
    }
    if (!openWindows.includes(id)) openWindows.push(id);
    updateTaskbar();

    const header = win.querySelector('.window-header');
    let offX, offY;
    const onStart = (e) => {
        if (lockInput) return;
        if (e.target.closest('.window-controls')) return;
        focusWindow(id);
        const ev = e.touches ? e.touches[0] : e;
        const rect = win.getBoundingClientRect();
        offX = ev.clientX - rect.left;
        offY = ev.clientY - rect.top;
        isDragging = true;
        const onMove = (e2) => {
            if (lockInput) return;
            const ev2 = e2.touches ? e2.touches[0] : e2;
            let x = ev2.clientX - offX;
            let y = ev2.clientY - offY;
            x = Math.max(0, Math.min(x, window.innerWidth - rect.width));
            y = Math.max(0, Math.min(y, window.innerHeight - rect.height));
            win.style.left = x + 'px';
            win.style.top = y + 'px';
            win.style.transform = 'none';
        };
        const onEnd = () => {
            isDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: true });
        document.addEventListener('touchend', onEnd);
    };
    header.addEventListener('mousedown', onStart);
    header.addEventListener('touchstart', onStart, { passive: true });

    win.addEventListener('mousedown', () => focusWindow(id));
    win.addEventListener('touchstart', () => focusWindow(id), { passive: true });

    win.querySelector('.win-min').addEventListener('click', () => minimizeWindow(id));
    win.querySelector('.win-max').addEventListener('click', () => maximizeWindow(id));
    win.querySelector('.win-close').addEventListener('click', () => closeWindow(id));
    win.querySelector('.win-desktop').addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = win.querySelector('.win-desktop');
        const isOnDesktop = iconApps.some(a => a.t === type);
        if (isOnDesktop) {
            toggleDesktopIcon(type);
            btn.style.color = '';
            btn.style.background = '';
            showToast('Desktop', 'Removed from desktop', 'info');
        } else {
            toggleDesktopIcon(type);
            btn.style.color = '#33ff33';
            btn.style.background = 'rgba(51,255,51,0.15)';
            showToast('Desktop', 'Added to desktop', 'info');
        }
    });
    win.querySelector('.win-pin').addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = win.querySelector('.win-pin');
        if (alwaysOnTopWindow === id) {
            alwaysOnTopWindow = null;
            btn.style.color = '';
            btn.style.background = '';
            showToast('Always on Top', 'Disabled', 'info');
        } else {
            if (alwaysOnTopWindow) {
                const oldWin = document.getElementById(alwaysOnTopWindow);
                if (oldWin) { const ob = oldWin.querySelector('.win-pin'); if (ob) { ob.style.color = ''; ob.style.background = ''; } }
            }
            alwaysOnTopWindow = id;
            windowZ++;
            win.style.zIndex = windowZ + 1000;
            btn.style.color = '#ffcc00';
            btn.style.background = 'rgba(255,204,0,0.15)';
            showToast('Always on Top', 'Window pinned', 'info');
        }
    });

    // Window header right-click context menu
    header.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const existing = document.getElementById('win-cm-' + id);
        if (existing) existing.remove();
        const menu = document.createElement('div');
        menu.id = 'win-cm-' + id;
        menu.style.cssText = 'position:fixed;z-index:10001;background:var(--bg2);border:1px solid rgba(255,255,255,0.1);border-radius:var(--radius);box-shadow:0 8px 32px var(--shadow);min-width:180px;padding:4px 0;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);';
        const isOnDesktop = iconApps.some(a => a.t === type);
        menu.innerHTML =
            '<div class="win-cm-item" data-action="restore">Restore</div>' +
            '<div class="win-cm-item" data-action="minimize">Minimize</div>' +
            '<div class="win-cm-item" data-action="maximize">Maximize</div>' +
            '<div class="win-cm-sep"></div>' +
            '<div class="win-cm-item" data-action="desktop">' + (isOnDesktop ? '\u{1F5D1}\uFE0F Remove from desktop' : '\u{1F5A5}\uFE0F Add to desktop') + '</div>' +
            '<div class="win-cm-sep"></div>' +
            '<div class="win-cm-item" data-action="close" style="color:var(--danger);">Close</div>';
        menu.style.left = Math.min(e.clientX, window.innerWidth - 190) + 'px';
        menu.style.top = Math.min(e.clientY, window.innerHeight - 220) + 'px';
        document.body.appendChild(menu);
        const closeMenu = () => menu.remove();
        menu.querySelectorAll('.win-cm-item').forEach(item => {
            item.addEventListener('click', () => {
                menu.remove();
                const action = item.dataset.action;
                if (action === 'restore') { win.classList.remove('hidden', 'maximized'); focusWindow(id); }
                else if (action === 'minimize') minimizeWindow(id);
                else if (action === 'maximize') maximizeWindow(id);
                else if (action === 'desktop') {
                    toggleDesktopIcon(type);
                    const btn = win.querySelector('.win-desktop');
                    const nowOnDesktop = iconApps.some(a => a.t === type);
                    if (btn) {
                        btn.style.color = nowOnDesktop ? '#33ff33' : '';
                        btn.style.background = nowOnDesktop ? 'rgba(51,255,51,0.15)' : '';
                    }
                    showToast('Desktop', nowOnDesktop ? 'Added to desktop' : 'Removed from desktop', 'info');
                }
                else if (action === 'close') closeWindow(id);
            });
        });
        document.addEventListener('click', closeMenu, { once: true });
    });

    addResizeHandles(win);

    // Snap layout popup on maximize hover
    const maxBtn = win.querySelector('.win-max');
    let slTimer;
    maxBtn.addEventListener('mouseenter', () => {
        slTimer = setTimeout(() => showSnapLayoutPopup(win, maxBtn), 400);
    });
    maxBtn.addEventListener('mouseleave', () => { clearTimeout(slTimer); });
    maxBtn.addEventListener('click', () => { clearTimeout(slTimer); });

    // Window shake detection
    let shakeHist = [], shakeFired = false;
    const origMD = header._listeners ? null : null;
    const shakeHandler = (e) => {
        if (e.target.closest('.window-controls')) return;
        const onShakeMove = (e2) => {
            if (!isDragging || shakeFired) return;
            const now = Date.now();
            shakeHist.push({ x: e2.clientX, t: now });
            while (shakeHist.length > 0 && now - shakeHist[0].t > 500) shakeHist.shift();
            if (shakeHist.length >= 8) {
                let changes = 0;
                for (let i = 2; i < shakeHist.length; i++) {
                    if ((shakeHist[i].x - shakeHist[i-1].x) * (shakeHist[i-1].x - shakeHist[i-2].x) < 0) changes++;
                }
                if (changes >= 4) {
                    shakeFired = true;
                    openWindows.forEach(w => { if (w !== id && !minimizedWindows.includes(w)) minimizeWindow(w); });
                    showToast('Shake', 'Other windows minimized', 'info');
                }
            }
        };
        const onShakeEnd = () => {
            shakeHist = []; shakeFired = false;
            document.removeEventListener('mousemove', onShakeMove);
            document.removeEventListener('mouseup', onShakeEnd);
        };
        document.addEventListener('mousemove', onShakeMove);
        document.addEventListener('mouseup', onShakeEnd);
    };
    header.addEventListener('mousedown', shakeHandler);

    const initialX = Math.max(0, (window.innerWidth - 400) / 2 + Math.random() * 40 - 20);
    const initialY = Math.max(0, (window.innerHeight - 350) / 2 + Math.random() * 40 - 20);
    win.style.left = initialX + 'px';
    win.style.top = initialY + 'px';
    win.style.width = '400px';
    win.style.height = '350px';

    windowRegistry[type] = win;
    return win;
}

// Taskbar event delegation
taskbar.addEventListener('click', (e) => {
    const btn = e.target.closest('.taskbar-btn');
    if (btn) toggleWindow(btn.dataset.app);
});

// Taskbar hover preview
taskbar.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('.taskbar-btn');
    if (!btn) return;
    const app = btn.dataset.app;
    const win = windowRegistry[app];
    if (!win) return;
    if (document.getElementById('preview-' + app)) return;
    const preview = document.createElement('div');
    preview.id = 'preview-' + app;
    preview.style.cssText = 'position:fixed;bottom:48px;left:' + btn.offsetLeft + 'px;width:200px;height:150px;background:rgba(10,25,49,0.95);border:1px solid rgba(51,255,51,0.3);border-radius:6px;z-index:99999;overflow:hidden;pointer-events:none;';
    const clone = win.cloneNode(true);
    clone.style.cssText = 'width:100%;height:100%;transform:scale(0.5);transform-origin:top left;pointer-events:none;';
    preview.appendChild(clone);
    document.body.appendChild(preview);
});

taskbar.addEventListener('mouseout', (e) => {
    const btn = e.target.closest('.taskbar-btn');
    if (!btn) return;
    const app = btn.dataset.app;
    const preview = document.getElementById('preview-' + app);
    if (preview) preview.remove();
});

// === Smart positioning for context menus ===
function positionMenu(menu, x, y) {
    var w = menu.offsetWidth || 180;
    var h = menu.offsetHeight || 200;
    if (x + w > window.innerWidth - 10) x = window.innerWidth - w - 10;
    if (y + h > window.innerHeight - 10) y = window.innerHeight - h - 10;
    if (x < 10) x = 10;
    if (y < 10) y = 10;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

// Desktop event delegation
desktop.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    contextMenuState.x = e.clientX;
    contextMenuState.y = e.clientY;
    document.body.appendChild(contextMenu);
    contextMenu.classList.remove('hidden');
    positionMenu(contextMenu, e.clientX, e.clientY);
});

document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) contextMenu.classList.add('hidden');
    if (!startMenu.contains(e.target) && !e.target.closest('.profile-logo')) {
        startMenu.classList.add('hidden');
        document.getElementById('start-power-popup')?.classList.add('hidden');
    }
    if (!e.target.closest('.start-power-popup') && !e.target.closest('#start-power-btn')) {
        document.getElementById('start-power-popup')?.classList.add('hidden');
    }
});

// Build context menu
var allAppsList = [
    {t:'fileexplorer', i:'\u{1F4C1}', l:'File Explorer'},
    {t:'recyclebin', i:'\u{1F5D1}', l:'Recycle Bin'},
    {t:'notes', i:'\u{1F4DD}', l:'Notepad'},
    {t:'calendar', i:'\u{1F4C5}', l:'Calendar'},
    {t:'calc', i:'\u{1F9EE}', l:'Calculator'},
    {t:'todo', i:'\u2705', l:'Todo'},
    {t:'ai', i:'\u{1F916}', l:'AI Chat'},
    {t:'settings', i:'\u2699\uFE0F', l:'Settings'},
    {t:'taskmgr', i:'\u{1F4CA}', l:'Task Manager'},
    {t:'gaminghub', i:'\u{1F3AE}', l:'Gaming Hub'},
    {t:'highscores', i:'\u{1F3C6}', l:'High Scores'},
    {t:'wallpapers', i:'\u{1F5BC}', l:'Wallpapers'},
    {t:'brave', i:'\u{1F981}', l:'Brave Browser'},
    {t:'terminal', i:'\u{1F5A5}', l:'Terminal'},
    {t:'powershell', i:'\u{1FA9F}', l:'PowerShell'},
    {t:'ubuntu', i:'\u{1F427}', l:'Ubuntu Terminal'},
    {t:'snip', i:'\u{2702}\uFE0F', l:'Snipping Tool'},
    {t:'paint', i:'\u{1F3A8}', l:'Paint'},
    {t:'mediaplayer', i:'\u{1F3B5}', l:'Media Player'},
    {t:'controlpanel', i:'\u2699', l:'Control Panel'},
    {t:'photos', i:'\u{1F5BC}', l:'Photos'},
    {t:'camera', i:'\u{1F4F7}', l:'Camera'},
];
contextMenu.innerHTML = '<div class="cm-item" data-action="refresh">\u{1F504} Refresh</div><div class="cm-item" data-action="view">\u{1F441} Show/Hide Desktop Icons</div><div class="cm-item-wrap"><div class="cm-item has-sub" data-action="sort">\u{1F4CB} Sort by</div><div class="cm-submenu"><div class="cm-item" data-sort="name">Name</div><div class="cm-item" data-sort="size">Size</div><div class="cm-item" data-sort="type">Type</div><div class="cm-item" data-sort="date">Date modified</div></div></div><div class="cm-separator"></div><div class="cm-item" data-action="add-icon">\u{2795} Add desktop icon</div><div class="cm-item" data-action="remove-icon">\u{2796} Remove desktop icon</div><div class="cm-separator"></div><div class="cm-item" data-action="new-folder">\u{1F4C1} New Folder</div><div class="cm-item" data-action="new-text">\u{1F4DD} New Text Document</div>';
contextMenu.querySelectorAll('.cm-item').forEach(function(item){
    item.onclick = function(){
        var action = item.dataset.action;
        if (action === 'sort') return;
        contextMenu.classList.add('hidden');
        if (action === 'refresh') {}
        else if (action === 'view') {
            var icons = document.getElementById('desktop-icons');
            icons.style.display = icons.style.display === 'none' ? '' : 'none';
        } else if (action === 'add-icon') {
            showDesktopIconPicker(true);
        } else if (action === 'remove-icon') {
            showDesktopIconPicker(false);
        } else if (action === 'new-folder') {
            createDesktopFolder();
        } else if (action === 'new-text') {
            var desktopFs2 = _fileSystem.Desktop;
            if (desktopFs2 && desktopFs2.children) {
                var tIdx = 1;
                while (desktopFs2.children['New Text Document' + (tIdx > 1 ? ' (' + tIdx + ')' : '') + '.txt']) tIdx++;
                var tName = 'New Text Document' + (tIdx > 1 ? ' (' + tIdx + ')' : '') + '.txt';
                desktopFs2.children[tName] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: '' };
                _feSaveFS();
                createDesktopIcons();
                showToast('Desktop', 'Created ' + tName, 'info');
            }
        }
    };
});
contextMenu.querySelectorAll('.cm-submenu .cm-item').forEach(function(item){
    item.onclick = function(){
        contextMenu.classList.add('hidden');
        var method = item.dataset.sort;
        var container = document.getElementById('desktop-icons');
        var items = Array.from(container.children);
        if (method === 'name') {
            items.sort(function(a,b){ return a.querySelector('span').textContent.localeCompare(b.querySelector('span').textContent); });
        } else if (method === 'size') {
            items.sort(function(a,b){ return b.textContent.length - a.textContent.length; });
        } else if (method === 'type') {
            items.sort(function(a,b){ return (a.dataset.app||'').localeCompare(b.dataset.app||''); });
        } else if (method === 'date') {
            items.sort(function(){ return Math.random() - 0.5; });
        }
        items.forEach(function(item){ container.appendChild(item); });
    };
});

// Apply saved background
function applyBg() {
    if (!currentUser) return;
    const accounts = loadAccounts();
    if (accounts[currentUser] && accounts[currentUser].bg) {
        document.getElementById('desktop').style.background = accounts[currentUser].bg;
        document.body.style.background = accounts[currentUser].bg;
    }
}

// Profile / Start Menu
document.querySelector('.profile-logo')?.addEventListener('click', (e) => {
    e.stopPropagation();
    buildStartMenu();
    startMenu.classList.toggle('hidden');
});

document.getElementById('show-desktop-btn')?.addEventListener('click', () => {
    if (showDesktopState) {
        showDesktopState = false;
        lastDesktopState.forEach(id => {
            const win = document.getElementById(id);
            if (win) { win.classList.remove('hidden'); focusWindow(id); }
        });
        lastDesktopState = [];
    } else {
        showDesktopState = true;
        lastDesktopState = [...openWindows];
        openWindows.forEach(id => {
            const win = document.getElementById(id);
            if (win) win.classList.add('hidden');
        });
    }
});

function buildStartMenu() {
    const accounts = loadAccounts();
    const userData = currentUser && accounts[currentUser] ? accounts[currentUser] : null;
    const emoji = userData ? (userData.emoji || '\u{1F464}') : '\u{1F464}';
    const name = currentUser || 'User';
    const allApps = [
        {t:'fileexplorer', i:'\u{1F4C1}', l:'File Explorer'},
        {t:'recyclebin', i:'\u{1F5D1}', l:'Recycle Bin'},
        {t:'notes', i:'\u{1F4DD}', l:'Notepad'},
        {t:'calendar', i:'\u{1F4C5}', l:'Calendar'},
        {t:'calc', i:'\u{1F9EE}', l:'Calculator'},
        {t:'todo', i:'\u2705', l:'Todo'},
        {t:'ai', i:'\u{1F916}', l:'AI Chat'},
        {t:'settings', i:'\u2699\uFE0F', l:'Settings'},
        {t:'taskmgr', i:'\u{1F4CA}', l:'Task Manager'},
        {t:'gaminghub', i:'\u{1F3AE}', l:'Gaming Hub'},
        {t:'highscores', i:'\u{1F3C6}', l:'High Scores'},
        {t:'wallpapers', i:'\u{1F5BC}', l:'Wallpapers'},
        {t:'brave', i:'\u{1F981}', l:'Brave Browser'},
        {t:'terminal', i:'\u{1F5A5}', l:'Terminal'},
        {t:'powershell', i:'\u{1FA9F}', l:'PowerShell'},
        {t:'ubuntu', i:'\u{1F427}', l:'Ubuntu Terminal'},
        {t:'snip', i:'\u{2702}\uFE0F', l:'Snipping Tool'},
        {t:'paint', i:'\u{1F3A8}', l:'Paint'},
        {t:'mediaplayer', i:'\u{1F3B5}', l:'Media Player'},
        {t:'controlpanel', i:'\u2699', l:'Control Panel'},
        {t:'photos', i:'\u{1F5BC}', l:'Photos'},
        {t:'camera', i:'\u{1F4F7}', l:'Camera'},
    ];
    const sorted = [...allApps].sort((a,b) => a.l.localeCompare(b.l));
    const groups = {};
    sorted.forEach(a => {
        const letter = a.l[0].toUpperCase();
        if (!groups[letter]) groups[letter] = [];
        groups[letter].push(a);
    });
    const freqApps = Object.entries(appUsage)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 4)
        .map(([t]) => allApps.find(a => a.t === t))
        .filter(Boolean);

    let html = '<div class="start-search"><span>\u{1F50D}</span><input type="text" id="start-search-input" placeholder="Search apps..." maxlength="50"><div id="start-search-results" class="hidden"></div></div>';
    if (freqApps.length > 0) {
        html += '<div class="start-section-header">Most used</div>';
        html += freqApps.map(a => '<button class="start-app-item" data-app="' + a.t + '"><span>' + a.i + '</span><span>' + a.l + '</span></button>').join('');
    }
    html += '<div class="start-section-header">All Apps</div>';
    html += '<div class="start-all-apps">';
    Object.keys(groups).sort().forEach(letter => {
        html += '<div class="start-letter-section">';
        html += '<div class="start-letter-header">' + letter + '</div>';
        groups[letter].forEach(a => {
            html += '<button class="start-app-item" data-app="' + a.t + '"><span>' + a.i + '</span><span>' + a.l + '</span></button>';
        });
        html += '</div>';
    });
    html += '</div>';
    html += '<div class="start-bottom-bar">';
    html += '<button class="start-user-btn" id="start-user-btn"><span class="suv-avatar">' + emoji + '</span><span class="suv-name">' + name + '</span></button>';
    html += '<div class="start-bottom-right">';
    html += '<button class="start-icon-btn" id="start-desk-icons-btn" title="Desktop icons">\u{1F4C1}</button>';
    html += '<button class="start-icon-btn" id="start-settings-btn" title="Settings">\u{2699}\uFE0F</button>';
    html += '<button class="start-power-btn" id="start-power-btn">\u{23FB}</button>';
    html += '</div>';
    html += '</div>';
    html += '<div class="start-power-popup hidden" id="start-power-popup">';
    html += '<div class="spp-item" data-action="lock"><span>\u{1F512}</span><span>Lock</span></div>';
    html += '<div class="spp-item" data-action="signout"><span>\u{1F6AA}</span><span>Sign out</span></div>';
    html += '<div class="spp-item" data-action="sleep"><span>\u{1F634}</span><span>Sleep</span></div>';
    html += '<div class="spp-item" data-action="restart"><span>\u{1F504}</span><span>Restart</span></div>';
    html += '<div class="spp-item" data-action="shutdown"><span>\u{23FB}</span><span>Shut down</span></div>';
    html += '</div>';
    startMenu.innerHTML = html;

    startMenu.addEventListener('click', (e) => {
        const btn = e.target.closest('.start-app-item');
        if (btn) { toggleWindow(btn.dataset.app); startMenu.classList.add('hidden'); }
    });
    const sInput = document.getElementById('start-search-input');
    const sResults = document.getElementById('start-search-results');
    if (sInput) {
        sInput.addEventListener('input', function() {
            const q = this.value.toLowerCase().trim();
            if (!q) { sResults.classList.add('hidden'); return; }
            const matches = allApps.filter(a => a.l.toLowerCase().includes(q) || a.t.toLowerCase().includes(q));
            if (matches.length === 0) { sResults.classList.add('hidden'); return; }
            sResults.innerHTML = matches.map(a => '<div class="search-result-item" data-app="'+a.t+'"><span>'+a.i+'</span><span>'+a.l+'</span></div>').join('');
            sResults.classList.remove('hidden');
        });
        sResults.addEventListener('click', (e) => {
            const item = e.target.closest('.search-result-item');
            if (!item) return;
            toggleWindow(item.dataset.app);
            startMenu.classList.add('hidden');
            sInput.value = '';
            sResults.classList.add('hidden');
        });
    }
    // User button → user info page
    document.getElementById('start-user-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        startMenu.classList.add('hidden');
        showUserInfoPage();
    });
    // Desktop icons toggle
    document.getElementById('start-desk-icons-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        startMenu.classList.add('hidden');
        const icons = document.getElementById('desktop-icons');
        icons.style.display = icons.style.display === 'none' ? '' : 'none';
        showToast('Desktop', icons.style.display === 'none' ? 'Desktop icons hidden' : 'Desktop icons shown', 'info');
    });
    // Settings
    document.getElementById('start-settings-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        startMenu.classList.add('hidden');
        toggleWindow('settings');
    });
    // Power button
    const pBtn = document.getElementById('start-power-btn');
    const pPopup = document.getElementById('start-power-popup');
    if (pBtn) {
        pBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const rect = pBtn.getBoundingClientRect();
            pPopup.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
            pPopup.style.right = (window.innerWidth - rect.right + 4) + 'px';
            pPopup.classList.toggle('hidden');
        });
    }
    if (pPopup) {
        pPopup.addEventListener('click', (e) => {
            const item = e.target.closest('.spp-item');
            if (!item) return;
            const action = item.dataset.action;
            pPopup.classList.add('hidden');
            startMenu.classList.add('hidden');
            if (action === 'lock') { lockSession(); }
            else if (action === 'signout') { signOut(); }
            else if (action === 'sleep') { sleepSystem(); }
            else if (action === 'restart') { restartSystem(); }
            else if (action === 'shutdown') { shutdownSystem(); }
        });
    }
}

function showUserInfoPage() {
    const accounts = loadAccounts();
    const userData = currentUser && accounts[currentUser] ? accounts[currentUser] : null;
    const emoji = userData ? (userData.emoji || '\u{1F464}') : '\u{1F464}';
    const name = currentUser || 'User';
    const safeEmoji = escapeHtml(emoji);
    const safeName = escapeHtml(name);
    const safeUser = escapeHtml(currentUser || 'guest');
    const safeAccount = escapeHtml(currentUser || 'Local');
    const safeEmail = escapeHtml(name.toLowerCase().replace(/\s/g,'') + '@cyberos.io');
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:100000;display:flex;align-items:center;justify-content:center;';
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg2);border:2px solid var(--border);border-radius:8px;padding:30px;min-width:320px;max-width:400px;box-shadow:0 8px 40px var(--shadow);text-align:center;';
    card.innerHTML = '<div style="font-size:3rem;margin-bottom:10px;">' + safeEmoji + '</div>'
        + '<div style="font-size:1.2rem;font-weight:bold;margin-bottom:4px;">' + safeName + '</div>'
        + '<div style="font-size:0.8rem;opacity:0.5;margin-bottom:20px;">' + safeUser + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:left;font-size:0.8rem;margin-bottom:20px;">'
        + '<div style="opacity:0.5;">Account:</div><div>' + safeAccount + '</div>'
        + '<div style="opacity:0.5;">Password:</div><div>\u{2022}\u{2022}\u{2022}\u{2022}\u{2022}\u{2022}\u{2022}\u{2022}</div>'
        + '<div style="opacity:0.5;">Email:</div><div>' + safeEmail + '</div>'
        + '<div style="opacity:0.5;">Member since:</div><div>June 2026</div>'
        + '</div>'
        + '<div style="display:flex;gap:8px;justify-content:center;">'
        + '<button id="uip-close" style="margin:0;padding:8px 24px;font-size:0.85rem;background:var(--accent);color:#fff;border:none;border-radius:4px;cursor:pointer;">Close</button>'
        + '<button id="uip-signout" style="margin:0;padding:8px 24px;font-size:0.85rem;background:transparent;border:1px solid var(--border);color:var(--fg);border-radius:4px;cursor:pointer;">Sign out</button>'
        + '</div>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.getElementById('uip-close').onclick = function() { overlay.remove(); };
    document.getElementById('uip-signout').onclick = function() { overlay.remove(); signOut(); };
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

// === Desktop icon management ===
function toggleDesktopIcon(appType) {
    const idx = iconApps.findIndex(a => a.t === appType);
    if (idx >= 0) {
        iconApps.splice(idx, 1);
        showToast('Desktop', 'Icon removed', 'info');
    } else {
        const app = allAppsList.find(a => a.t === appType);
        if (app) {
            iconApps.push({t:app.t, i:app.i, l:app.l});
            showToast('Desktop', 'Icon added', 'info');
        }
    }
    createDesktopIcons();
    localStorage.setItem('cyberos_desktop_icons', JSON.stringify(iconApps));
}

function showDesktopIconPicker(addMode) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:100000;display:flex;align-items:center;justify-content:center;';
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg2);border:2px solid var(--border);border-radius:8px;padding:20px;min-width:280px;max-width:350px;max-height:70vh;box-shadow:0 8px 40px var(--shadow);display:flex;flex-direction:column;';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:0.95rem;font-weight:bold;margin-bottom:12px;';
    title.textContent = addMode ? 'Add desktop icon' : 'Remove desktop icon';
    card.appendChild(title);
    const list = document.createElement('div');
    list.style.cssText = 'flex:1;overflow-y:auto;margin-bottom:12px;';
    if (addMode) {
        allAppsList.forEach(function(app) {
            if (iconApps.some(function(ia) { return ia.t === app.t; })) return;
            var item = document.createElement('div');
            item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:0.85rem;display:flex;align-items:center;gap:10px;border-radius:4px;';
            item.innerHTML = '<span>' + app.i + '</span><span>' + app.l + '</span>';
            item.onmouseenter = function() { this.style.background = 'var(--fg-dim)'; };
            item.onmouseleave = function() { this.style.background = 'transparent'; };
            item.onclick = function() {
                iconApps.push({t:app.t, i:app.i, l:app.l});
                createDesktopIcons();
                localStorage.setItem('cyberos_desktop_icons', JSON.stringify(iconApps));
                overlay.remove();
                showToast('Desktop', app.l + ' added', 'info');
            };
            list.appendChild(item);
        });
        if (list.children.length === 0) {
            list.innerHTML = '<div style="padding:16px;text-align:center;opacity:0.5;font-size:0.8rem;">All app icons already on desktop</div>';
        }
    } else {
        // App shortcut icons
        iconApps.forEach(function(app) {
            var item = document.createElement('div');
            item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:0.85rem;display:flex;align-items:center;gap:10px;border-radius:4px;';
            item.innerHTML = '<span>' + app.i + '</span><span class="sdi-type">[App] ' + app.l + '</span>';
            item.onmouseenter = function() { this.style.background = 'var(--fg-dim)'; };
            item.onmouseleave = function() { this.style.background = 'transparent'; };
            item.onclick = function() {
                var idx2 = iconApps.indexOf(app);
                if (idx2 >= 0) iconApps.splice(idx2, 1);
                createDesktopIcons();
                localStorage.setItem('cyberos_desktop_icons', JSON.stringify(iconApps));
                overlay.remove();
                showToast('Desktop', app.l + ' removed', 'info');
            };
            list.appendChild(item);
        });
        // File system desktop items
        var desktopFs = _fileSystem.Desktop;
        if (desktopFs && desktopFs.children) {
            Object.keys(desktopFs.children).forEach(function(name) {
                var entry = desktopFs.children[name];
                var item = document.createElement('div');
                var icon = entry.type === 'folder' ? '\u{1F4C1}' : '\u{1F4C4}';
                item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:0.85rem;display:flex;align-items:center;gap:10px;border-radius:4px;color:#ff6666;';
                item.innerHTML = '<span>' + icon + '</span><span class="sdi-type">[File] ' + name + ' \u{1F5D1}</span>';
                item.onmouseenter = function() { this.style.background = 'rgba(255,50,50,0.1)'; };
                item.onmouseleave = function() { this.style.background = 'transparent'; };
                item.onclick = function() {
                    _recycleBin.items.push({ name: name, entry: JSON.parse(JSON.stringify(entry)), origPath: 'Desktop', origArr: ['Desktop'], dateDeleted: new Date().toLocaleString(), type: entry.type, size: entry.size });
                    delete desktopFs.children[name];
                    _saveRecycleBin();
                    _feSaveFS();
                    _updateRecycleBinIcon();
                    createDesktopIcons();
                    overlay.remove();
                    showToast('Recycle Bin', name + ' moved to Recycle Bin', 'info');
                };
                list.appendChild(item);
            });
        }
        if (iconApps.length === 0 && (!desktopFs || !desktopFs.children || Object.keys(desktopFs.children).length === 0)) {
            list.innerHTML = '<div style="padding:16px;text-align:center;opacity:0.5;font-size:0.8rem;">Nothing to remove</div>';
        }
    }
    card.appendChild(list);
    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Cancel';
    closeBtn.style.cssText = 'margin:0;padding:8px;font-size:0.85rem;background:transparent;border:1px solid var(--border);color:var(--fg);border-radius:4px;cursor:pointer;';
    closeBtn.onclick = function() { overlay.remove(); };
    card.appendChild(closeBtn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

// Load saved Recycle Bin
(function() {
    var savedRb = localStorage.getItem('cyberos_recyclebin');
    if (savedRb) {
        try { var p = JSON.parse(savedRb); if (p && p.items) _recycleBin.items = p.items; } catch(e) {}
    }
})();

// Clear any existing oversized recycle bin data
try {
    var oldRb = localStorage.getItem('cyberos_recyclebin');
    if (oldRb && oldRb.length > 100000) localStorage.removeItem('cyberos_recyclebin');
} catch(e) {}

// Save Recycle Bin on any change (hooked via setter proxy)
function _saveRecycleBin() {
    try {
        localStorage.setItem('cyberos_recyclebin', JSON.stringify({ items: _recycleBin.items }));
    } catch(e) {
        _recycleBin.items = [];
        try { localStorage.setItem('cyberos_recyclebin', JSON.stringify({ items: [] })); } catch(ex) {}
        showToast('Recycle Bin', 'Storage full — Recycle Bin cleared', 'error');
    }
    _updateRecycleBinIcon();
}

// Monkey-patch the recycle bin items array to auto-save
var _origRbPush = Array.prototype.push;
_recycleBin.items.push = function() {
    var r = _origRbPush.apply(this, arguments);
    _saveRecycleBin();
    return r;
};
_recycleBin.items.splice = function() {
    var r = Array.prototype.splice.apply(this, arguments);
    _saveRecycleBin();
    return r;
};

// Load saved desktop icons
(function() {
    var saved = localStorage.getItem('cyberos_desktop_icons');
    if (saved) {
        try {
            var parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                iconApps.length = 0;
                parsed.forEach(function(a) { iconApps.push(a); });
            }
        } catch(e) {}
    }
})();

function lockSession() {
    saveUserSession();
    bootState = 'lock';
    desktop.classList.add('hidden');
    bootScreen.classList.remove('hidden');
    populateBootScreen();
    if (window._stopParticles) window._stopParticles();
}

function signOut() {
    saveUserSession();
    currentUser = null;
    bootState = 'boot';
    openWindows.forEach(id => { const win = document.getElementById(id); if (win) win.remove(); });
    openWindows = [];
    minimizedWindows = [];
    Object.keys(windowRegistry).forEach(k => delete windowRegistry[k]);
    Object.keys(cleanups).forEach(k => { if (cleanups[k]) cleanups[k](); delete cleanups[k]; });
    desktop.classList.add('hidden');
    bootScreen.classList.remove('hidden');
    populateBootScreen();
    if (window._stopParticles) window._stopParticles();
}

function sleepSystem() {
    saveUserSession();
    if (screensaverTimer) clearTimeout(screensaverTimer);
    screensaverActive = false;
    const ss = document.getElementById('screensaver-overlay');
    if (ss) ss.remove();
    var sleepOv = document.getElementById('sleep-overlay');
    if (!sleepOv) {
        sleepOv = document.createElement('div');
        sleepOv.id = 'sleep-overlay';
        sleepOv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:#000;display:flex;align-items:center;justify-content:center;flex-direction:column;';
        sleepOv.innerHTML = '<div style="color:#33ff33;font-family:monospace;font-size:3rem;margin-bottom:16px;animation:ssFade 2s infinite;">\u{1F634}</div><div style="color:#33ff33;font-family:monospace;font-size:1.2rem;opacity:0.7;">Sleeping... move mouse or press any key to wake</div>';
        sleepOv.onmousemove = function() { wakeSystem(); };
        sleepOv.onclick = function() { wakeSystem(); };
        document.addEventListener('keydown', wakeHandler);
        document.body.appendChild(sleepOv);
    }
    function wakeHandler() {
        wakeSystem();
        document.removeEventListener('keydown', wakeHandler);
    }
    function wakeSystem() {
        var ov = document.getElementById('sleep-overlay');
        if (ov) ov.remove();
        document.removeEventListener('keydown', wakeHandler);
        resetScreensaver();
    }
}

function restartSystem() {
    saveUserSession();
    location.reload();
}

function shutdownSystem() {
    saveUserSession();
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#33ff33;font-family:monospace;font-size:1.5rem;flex-direction:column;"><div style="font-size:3rem;margin-bottom:20px;">\u{23FB}</div><div>Shutting down...</div></div>';
}

function lockInputFn() {
    lockInput = true;
    const overlay = document.createElement('div');
    overlay.id = 'lock-input-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;color:#33ff33;font-family:monospace;font-size:1.5rem;cursor:not-allowed;';
    overlay.textContent = '\u{1F510} INPUT LOCKED - Press Ctrl+Alt to unlock';
    document.body.appendChild(overlay);
    document.addEventListener('keydown', lockKeyHandler);
    document.addEventListener('keyup', lockKeyUpHandler);
}

let lockKeys = { ctrl: false, alt: false };
function lockKeyHandler(e) {
    if (!lockInput) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Control') lockKeys.ctrl = true;
    if (e.key === 'Alt') lockKeys.alt = true;
    if (lockKeys.ctrl && lockKeys.alt) {
        lockInput = false;
        document.getElementById('lock-input-overlay')?.remove();
        document.removeEventListener('keydown', lockKeyHandler);
        document.removeEventListener('keyup', lockKeyUpHandler);
        lockKeys = { ctrl: false, alt: false };
    }
}
function lockKeyUpHandler(e) {
    if (e.key === 'Control') lockKeys.ctrl = false;
    if (e.key === 'Alt') lockKeys.alt = false;
}

// ── Command Palette (Ctrl+K) ──
(function() {
    function showCmdPalette() {
        const existing = document.getElementById('cmd-palette-overlay');
        if (existing) { existing.remove(); return; }
        const overlay = document.createElement('div');
        overlay.id = 'cmd-palette-overlay';
        overlay.innerHTML =
            '<div id="cmd-palette">' +
            '<input id="cmd-palette-input" type="text" placeholder="Search apps, settings, or type a command..." autofocus spellcheck="false">' +
            '<div id="cmd-palette-results"></div>' +
            '</div>';
        document.body.appendChild(overlay);

        const input = document.getElementById('cmd-palette-input');
        const results = document.getElementById('cmd-palette-results');
        let selectedIdx = 0;

        const allCmds = [
            { icon: '\u{1F4C1}', name: 'File Explorer', type: 'app', action: 'fileexplorer' },
            { icon: '\u{1F5D1}', name: 'Recycle Bin', type: 'app', action: 'recyclebin' },
            { icon: '\u{1F4DD}', name: 'Notepad', type: 'app', action: 'notes' },
            { icon: '\u{1F4C5}', name: 'Calendar', type: 'app', action: 'calendar' },
            { icon: '\u{1F9EE}', name: 'Calculator', type: 'app', action: 'calc' },
            { icon: '\u2705', name: 'Todo', type: 'app', action: 'todo' },
            { icon: '\u{1F916}', name: 'AI Chat', type: 'app', action: 'ai' },
            { icon: '\u{1F3AE}', name: 'Gaming Hub', type: 'app', action: 'gaminghub' },
            { icon: '\u{1F3C6}', name: 'High Scores', type: 'app', action: 'highscores' },
            { icon: '\u{1F5BC}', name: 'Wallpapers', type: 'app', action: 'wallpapers' },
            { icon: '\u2699\uFE0F', name: 'Settings', type: 'app', action: 'settings' },
            { icon: '\u{1F4CA}', name: 'Task Manager', type: 'app', action: 'taskmgr' },
            { icon: '\u{1F5A5}', name: 'Terminal', type: 'app', action: 'terminal' },
            { icon: '\u{1FA9F}', name: 'PowerShell', type: 'app', action: 'powershell' },
            { icon: '\u{1F427}', name: 'Ubuntu Terminal', type: 'app', action: 'ubuntu' },
            { icon: '\u{1F3A8}', name: 'Paint', type: 'app', action: 'paint' },
            { icon: '\u{2702}\uFE0F', name: 'Snipping Tool', type: 'app', action: 'snip' },
            { icon: '\u{1F3B5}', name: 'Media Player', type: 'app', action: 'mediaplayer' },
            { icon: '\u{1F981}', name: 'Brave Browser', type: 'app', action: 'brave' },
            { icon: '\u{1F512}', name: 'Lock', type: 'action', action: 'lock' },
            { icon: '\u{1F6AA}', name: 'Sign Out', type: 'action', action: 'signout' },
            { icon: '\u{1F504}', name: 'Restart', type: 'action', action: 'restart' },
            { icon: '\u{23FB}', name: 'Shut Down', type: 'action', action: 'shutdown' },
        ];

        function filterResults(query) {
            const q = query.toLowerCase().trim();
            if (!q) return allCmds;
            const parts = q.split(/\s+/).filter(Boolean);
            return allCmds.filter(cmd => {
                const name = cmd.name.toLowerCase();
                return parts.every(p => name.includes(p) || cmd.action.includes(p));
            });
        }

        function renderResults(list) {
            selectedIdx = 0;
            if (list.length === 0) {
                results.innerHTML = '<div style="padding:20px;text-align:center;opacity:0.3;font-size:0.85rem;">No results found</div>';
                return;
            }
            const appList = list.filter(c => c.type === 'app');
            const actionList = list.filter(c => c.type === 'action');
            let html = '';
            if (appList.length > 0) {
                html += '<div class="cmd-palette-section">Apps</div>';
                appList.forEach((c, i) => {
                    html += '<div class="cmd-palette-item" data-idx="' + i + '" data-action="' + c.action + '" data-type="app">' +
                        '<span class="cmd-icon">' + c.icon + '</span>' +
                        '<span class="cmd-name">' + c.name + '</span>' +
                        '</div>';
                });
            }
            if (actionList.length > 0) {
                html += '<div class="cmd-palette-section">System</div>';
                actionList.forEach((c, i) => {
                    html += '<div class="cmd-palette-item" data-idx="' + i + '" data-action="' + c.action + '" data-type="action">' +
                        '<span class="cmd-icon">' + c.icon + '</span>' +
                        '<span class="cmd-name">' + c.name + '</span>' +
                        '</div>';
                });
            }
            results.innerHTML = html;
            updateSelection();
        }

        function updateSelection() {
            results.querySelectorAll('.cmd-palette-item').forEach((el, i) => {
                el.classList.toggle('selected', i === selectedIdx);
            });
        }

        function executeSelected() {
            const selected = results.querySelector('.cmd-palette-item.selected');
            if (!selected) return;
            const action = selected.dataset.action;
            const type = selected.dataset.type;
            overlay.remove();
            if (type === 'app') { toggleWindow(action); }
            else if (action === 'lock') { lockSession(); }
            else if (action === 'signout') { signOut(); }
            else if (action === 'restart') { restartSystem(); }
            else if (action === 'shutdown') { shutdownSystem(); }
        }

        input.addEventListener('input', () => {
            const list = filterResults(input.value);
            renderResults(list);
        });

        input.addEventListener('keydown', (e) => {
            const items = results.querySelectorAll('.cmd-palette-item');
            if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(items.length - 1, selectedIdx + 1); updateSelection(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(0, selectedIdx - 1); updateSelection(); }
            else if (e.key === 'Enter') { e.preventDefault(); executeSelected(); }
            else if (e.key === 'Escape') { overlay.remove(); }
        });

        results.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.cmd-palette-item');
            if (!item) return;
            overlay.remove();
            const action = item.dataset.action;
            const type = item.dataset.type;
            if (type === 'app') toggleWindow(action);
            else if (action === 'lock') lockSession();
            else if (action === 'signout') signOut();
            else if (action === 'restart') restartSystem();
            else if (action === 'shutdown') shutdownSystem();
        });

        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) overlay.remove(); });
        input.focus();
        renderResults(allCmds);
    }

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            showCmdPalette();
        }
    });
})();

// Alt+Tab
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && e.altKey) {
        e.preventDefault();
        const grid = altTabGrid || (() => {
            let g = altTabOverlay.querySelector('#alt-tab-grid');
            if (!g) { g = document.createElement('div'); g.id = 'alt-tab-grid'; altTabOverlay.appendChild(g); }
            return g;
        })();
        if (!isAltTab) {
            isAltTab = true;
            altTabOverlay.classList.remove('hidden');
            grid.innerHTML = '';
            const visible = openWindows.filter(id => {
                const win = document.getElementById(id);
                return win && !win.classList.contains('hidden');
            });
            if (visible.length === 0) return;
            visible.forEach(id => {
                const win = document.getElementById(id);
                if (!win) return;
                const card = document.createElement('div');
                card.className = 'alt-tab-card';
                const title = win.querySelector('.window-title')?.textContent || 'Window';
                const type = Object.keys(windowRegistry).find(k => windowRegistry[k] && windowRegistry[k].id === id) || '';
                card.innerHTML = '<div class="alt-tab-icon">' + (apps[type]?.icon || '\u{1F5C4}') + '</div><div class="alt-tab-title">' + title + '</div>';
                card.dataset.winId = id;
                grid.appendChild(card);
            });
            altTabIndex = 0;
            updateAltTabSelection();
        } else {
            altTabIndex = (altTabIndex + 1) % grid.children.length;
            updateAltTabSelection();
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'Tab' && isAltTab && !e.altKey) {
        e.preventDefault();
        isAltTab = false;
        altTabOverlay.classList.add('hidden');
        const grid = altTabGrid || altTabOverlay.querySelector('#alt-tab-grid');
        const selected = grid && grid.children[altTabIndex];
        if (selected) {
            const winId = selected.dataset.winId;
            const win = document.getElementById(winId);
            if (win) {
                win.classList.remove('hidden');
                minimizedWindows = minimizedWindows.filter(w => w !== winId);
                focusWindow(winId);
            }
        }
    }
});

function updateAltTabSelection() {
    const grid = altTabGrid || altTabOverlay.querySelector('#alt-tab-grid');
    if (!grid) return;
    grid.querySelectorAll('.alt-tab-card').forEach((card, i) => {
        card.classList.toggle('selected', i === altTabIndex);
    });
}

// System Tray clock
function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const el = document.getElementById('clock');
    if (el) el.innerHTML = '<div>' + time + '</div><div style="font-size:0.6rem;">' + date + '</div>';
}
setInterval(updateClock, 1000);
updateClock();

// Desktop Icons
const iconApps = [
    {t:'fileexplorer', i:'📁', l:'File Explorer'},
    {t:'recyclebin', i:'🗑', l:'Recycle Bin'},
    {t:'notes', i:'📝', l:'Notepad'},
    {t:'calendar', i:'📅', l:'Calendar'},
    {t:'calc', i:'🧮', l:'Calculator'},
    {t:'todo', i:'✅', l:'Todo'},
    {t:'ai', i:'🤖', l:'AI Chat'},
    {t:'settings', i:'⚙️', l:'Settings'},
    {t:'taskmgr', i:'📊', l:'Task Manager'},
    {t:'gaminghub', i:'🎮', l:'Gaming Hub'},
    {t:'highscores', i:'🏆', l:'High Scores'},
    {t:'wallpapers', i:'🖼', l:'Wallpapers'},
    {t:'brave', i:'🦁', l:'Brave Browser'},
    {t:'powershell', i:'🪟', l:'PowerShell'},
    {t:'ubuntu', i:'🐧', l:'Ubuntu Terminal'},
    {t:'photos', i:'🖼', l:'Photos'},
    {t:'camera', i:'📷', l:'Camera'},
];
const container = document.getElementById('desktop-icons');

function createDesktopIcons() {
    container.innerHTML = '';
    // Render app icons
    iconApps.forEach(function(app) {
        var icon = document.createElement('div');
        icon.className = 'desktop-icon';
        icon.dataset.app = app.t;
        icon.setAttribute('tabindex', '0');
        icon.style.position = 'relative';
        var img = document.createElement('span');
        img.className = 'desktop-icon-img';
        img.textContent = app.i;
        var label = document.createElement('span');
        label.className = 'd-label';
        label.textContent = app.l;
        icon.appendChild(img);
        icon.appendChild(label);
        // Single click: select
        icon.addEventListener('click', function(e) {
            e.stopPropagation();
            container.querySelectorAll('.desktop-icon').forEach(function(ic) { ic.classList.remove('selected'); });
            icon.classList.add('selected');
        });
        // Double click: open app
        icon.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            toggleWindow(app.t);
        });
        // Right-click context menu
        icon.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var cm = document.getElementById('context-menu');
            cm.innerHTML = '<div class="cm-item" data-daction="open">\u{1F4E4} Open</div>';
            cm.classList.remove('hidden');
            positionMenu(cm, e.clientX, e.clientY);
            cm.querySelectorAll('[data-daction]').forEach(function(btn) {
                btn.onclick = function() {
                    cm.classList.add('hidden');
                    if (btn.dataset.daction === 'open') toggleWindow(app.t);
                };
            });
        });
        container.appendChild(icon);
    });
    // Render file system desktop items
    var desktopFs = _fileSystem && _fileSystem.Desktop;
    if (desktopFs && desktopFs.children) {
        Object.keys(desktopFs.children).forEach(function(name) {
            var entry = desktopFs.children[name];
            var icon = document.createElement('div');
            icon.className = 'desktop-icon';
            icon.dataset.fsName = name;
            icon.setAttribute('tabindex', '0');
            icon.style.position = 'relative';
            var img = document.createElement('span');
            img.className = 'desktop-icon-img';
            img.textContent = entry.type === 'folder' ? '\u{1F4C1}' : '\u{1F4C4}';
            var label = document.createElement('span');
            label.className = 'd-label';
            label.textContent = name;
            icon.appendChild(img);
            icon.appendChild(label);
            // Single click: select
            icon.addEventListener('click', function(e) {
                e.stopPropagation();
                container.querySelectorAll('.desktop-icon').forEach(function(ic) { ic.classList.remove('selected'); });
                icon.classList.add('selected');
            });
            // Double click: open file
            icon.addEventListener('dblclick', function(e) {
                e.stopPropagation();
                if (entry.type === 'folder') {
                    toggleWindow('fileexplorer');
                } else {
                    var isImg = /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(name);
                    var isVideo = /\.(mp4|webm|avi|mov|mkv|wmv|flv)$/i.test(name);
                    if (isImg && entry.data) {
                        toggleWindow('paint');
                        setTimeout(function() {
                            var paintWin = windowRegistry.paint;
                            if (paintWin) {
                                var contentEl = paintWin.querySelector('.window-content');
                                var pc = contentEl ? contentEl._paintCanvas : null;
                                if (pc) {
                                    var img = new Image();
                                    img.onload = function() {
                                        pc.width = img.width;
                                        pc.height = img.height;
                                        var ctx = pc.getContext('2d');
                                        ctx.fillStyle = '#020813';
                                        ctx.fillRect(0, 0, pc.width, pc.height);
                                        ctx.drawImage(img, 0, 0);
                                        if (typeof paintWin.updateSizeDisplay === 'function') paintWin.updateSizeDisplay();
                                        var title = paintWin.querySelector('.window-title');
                                        if (title) title.textContent = '\u{1F3A8} ' + name;
                                    };
                                    img.src = entry.data;
                                }
                            }
                        }, 300);
                    } else if (isVideo) {
                        toggleWindow('mediaplayer');
                        setTimeout(function() {
                            var mediaContent = document.querySelector('.window:last-child .window-content');
                            if (mediaContent && mediaContent._openVideo) {
                                mediaContent._openVideo(entry.data || null, name);
                                var win = mediaContent.closest('.window');
                                if (win) {
                                    var title = win.querySelector('.window-title');
                                    if (title) title.textContent = '\u{1F3AC} ' + name;
                                }
                            }
                        }, 300);
                    } else {
                        toggleWindow('notes');
                        setTimeout(function() {
                            var notesWin = windowRegistry.notes;
                            if (notesWin) {
                                var ta = notesWin.querySelector('textarea');
                                if (ta) ta.value = entry.data || '';
                            }
                        }, 200);
                    }
                }
            });
            // Right-click: context menu with Open, Rename, Delete
            icon.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                e.stopPropagation();
                var cm = document.getElementById('context-menu');
                cm.innerHTML = '<div class="cm-item" data-daction="open">\u{1F4E4} Open</div>' +
                    '<div class="cm-item" data-daction="rename">\u270F\uFE0F Rename</div>' +
                    '<div class="cm-separator"></div>' +
                    '<div class="cm-item" data-daction="delete" style="color:var(--danger);">\u{1F5D1}\uFE0F Delete</div>';
                cm.classList.remove('hidden');
                positionMenu(cm, e.clientX, e.clientY);
                cm.querySelectorAll('[data-daction]').forEach(function(btn) {
                    btn.onclick = function() {
                        cm.classList.add('hidden');
                        if (btn.dataset.daction === 'open') {
                            icon.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
                        } else if (btn.dataset.daction === 'rename') {
                            var newName = prompt('Rename "' + name + '" to:', name);
                            if (newName && newName !== name) {
                                var folder = _fileSystem.Desktop;
                                if (folder && folder.children) {
                                    folder.children[newName] = folder.children[name];
                                    delete folder.children[name];
                                    _feSaveFS();
                                    createDesktopIcons();
                                }
                            }
                        } else if (btn.dataset.daction === 'delete') {
                            if (confirm('Delete "' + name + '"?')) {
                                var folder2 = _fileSystem.Desktop;
                                if (folder2 && folder2.children) {
                                    var recycledEntry = JSON.parse(JSON.stringify(entry, function(key, val) { return key === 'data' ? '' : val; }));
                                    recycledEntry.dataRestored = false;
                                    _recycleBin.items.push({ name: name, entry: recycledEntry, origPath: 'Desktop', origArr: ['Desktop'], dateDeleted: new Date().toLocaleString(), type: entry.type, size: entry.size });
                                    delete folder2.children[name];
                                    _saveRecycleBin();
                                    _feSaveFS();
                                    createDesktopIcons();
                                }
                            }
                        }
                    };
                });
            });
            container.appendChild(icon);
        });
    }
    _updateRecycleBinIcon();
}

function _updateDesktopFsIcons() {
    createDesktopIcons();
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.desktop-icon')) {
        container.querySelectorAll('.desktop-icon').forEach(ic => ic.classList.remove('selected'));
    }
});

// Snap Assist
let snapGuide = null;
function createSnapGuide(rect) {
    snapGuide = document.createElement('div');
    snapGuide.id = 'snap-guide';
    snapGuide.style.cssText = 'position:fixed;border:2px dashed rgba(51,255,51,0.4);background:rgba(51,255,51,0.03);z-index:99998;pointer-events:none;';
    snapGuide.style.left = rect.left + 'px';
    snapGuide.style.top = rect.top + 'px';
    snapGuide.style.width = rect.width + 'px';
    snapGuide.style.height = rect.height + 'px';
    desktop.appendChild(snapGuide);
}

// Override createWindow to add snap drag support
const origCreateWindow = createWindow;
createWindow = function(type) {
    const win = origCreateWindow(type);
    if (!win) return win;
    const header = win.querySelector('.window-header');
    const origStart = header._listeners ? null : null;
    if (!win._snapSetup) {
        win._snapSetup = true;
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-controls')) return;
            const onMove2 = (e2) => {
                if (lockInput || !isDragging) return;
                const cx = e2.clientX, cy = e2.clientY;
                const tw = window.innerWidth, th = window.innerHeight;
                const snapThreshold = 80;
                if (snapGuide) { snapGuide.remove(); snapGuide = null; }
                if (cy < snapThreshold && cx < snapThreshold) {
                    createSnapGuide({ left:0, top:0, width:tw/2-20, height:th/2-20 });
                } else if (cy < snapThreshold && cx > tw - snapThreshold) {
                    createSnapGuide({ left:tw/2+20, top:0, width:tw/2-20, height:th/2-20 });
                } else if (cy > th - snapThreshold && cx < snapThreshold) {
                    createSnapGuide({ left:0, top:th/2+20, width:tw/2-20, height:th/2-20 });
                } else if (cy > th - snapThreshold && cx > tw - snapThreshold) {
                    createSnapGuide({ left:tw/2+20, top:th/2+20, width:tw/2-20, height:th/2-20 });
                } else if (cx < snapThreshold) {
                    createSnapGuide({ left:0, top:0, width:tw/2, height:th });
                } else if (cx > tw - snapThreshold) {
                    createSnapGuide({ left:tw/2, top:0, width:tw/2, height:th });
                } else if (cy < snapThreshold) {
                    createSnapGuide({ left:0, top:0, width:tw, height:th/2 });
                } else {
                    if (snapGuide) { snapGuide.remove(); snapGuide = null; }
                }
            };
            const onUp2 = (e2) => {
                if (snapGuide) {
                    const guide = snapGuide;
                    snapGuide = null;
                    win.style.left = guide.style.left;
                    win.style.top = guide.style.top;
                    win.style.width = guide.style.width;
                    win.style.height = guide.style.height;
                    win.style.transform = 'none';
                    guide.remove();
                }
                document.removeEventListener('mousemove', onMove2);
                document.removeEventListener('mouseup', onUp2);
            };
            document.addEventListener('mousemove', onMove2);
            document.addEventListener('mouseup', onUp2);
        });
    }
    if (win) playBeep(880, 0.05, 'sine');
    return win;
};

// ── Interactive Desktop Particle Starfield ──
(function() {
    let pc, pCtx, pW, pH, particles = [], mouse = {x:0,y:0};
    let pRunning = false, pFrame;

    function initParticles() {
        const existing = document.getElementById('particle-starfield');
        if (existing) existing.remove();
        const c = document.createElement('canvas');
        c.id = 'particle-starfield';
        c.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none;';
        document.getElementById('desktop').appendChild(c);
        pc = c; pCtx = c.getContext('2d');
        resize();
        particles = [];
        for (let i = 0; i < 120; i++) {
            particles.push({
                x: Math.random() * pW, y: Math.random() * pH,
                vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
                size: Math.random() * 2 + 0.5, life: Math.random()
            });
        }
        pRunning = true;
        drawParticles();
    }

    function resize() {
        if (!pc) return;
        const dpr = window.devicePixelRatio || 1;
        pW = window.innerWidth; pH = window.innerHeight;
        pc.width = pW * dpr; pc.height = pH * dpr;
        pc.style.width = pW + 'px'; pc.style.height = pH + 'px';
        pCtx.scale(dpr, dpr);
    }

    function drawParticles() {
        if (!pRunning) return;
        pCtx.clearRect(0, 0, pW, pH);
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += p.vx + (mouse.x - pW/2) * 0.0001;
            p.y += p.vy + (mouse.y - pH/2) * 0.0001;
            p.life += 0.003;
            if (p.x < 0) p.x = pW;
            if (p.x > pW) p.x = 0;
            if (p.y < 0) p.y = pH;
            if (p.y > pH) p.y = 0;
            const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(p.life * 3 + i));
            const dist = Math.hypot(mouse.x - p.x, mouse.y - p.y);
            const glow = dist < 150 ? 1 - dist / 150 : 0;
            pCtx.beginPath();
            pCtx.arc(p.x, p.y, p.size + glow * 1.5, 0, Math.PI * 2);
            pCtx.fillStyle = glow > 0
                ? 'rgba(255, 107, 53, ' + (alpha * (0.5 + glow * 0.5)) + ')'
                : 'rgba(255, 217, 61, ' + (alpha * 0.4) + ')';
            pCtx.fill();
            // Draw connections between close particles
            for (let j = i + 1; j < particles.length; j++) {
                const q = particles[j];
                const d = Math.hypot(p.x - q.x, p.y - q.y);
                if (d < 120) {
                    pCtx.beginPath();
                    pCtx.moveTo(p.x, p.y);
                    pCtx.lineTo(q.x, q.y);
                    pCtx.strokeStyle = 'rgba(255, 107, 53, ' + (0.06 * (1 - d / 120)) + ')';
                    pCtx.lineWidth = 0.5;
                    pCtx.stroke();
                }
            }
        }
        pFrame = requestAnimationFrame(drawParticles);
    }

    function stopParticles() { pRunning = false; if (pFrame) cancelAnimationFrame(pFrame); const e = document.getElementById('particle-starfield'); if (e) e.remove(); }

    window._initParticles = function() {
        if (document.getElementById('particle-starfield')) stopParticles();
        initParticles();
    };
    window._stopParticles = stopParticles;

    window.addEventListener('resize', resize);
    document.addEventListener('mousemove', function(e) { mouse.x = e.clientX; mouse.y = e.clientY; });
})();

// Re-register apps that were already opened
bootUser = (function(orig) {
    return function(username, password) {
        const result = orig.call(this, username, password);
        if (booted) applyBg();
        return result;
    };
})(bootUser);

// === Window Resize Handles ===
function addResizeHandles(win) {
    const dirs = [
        { d:'nw', css:{ top:'-4px', left:'-4px', width:'12px', height:'12px', cursor:'nwse-resize' } },
        { d:'n',  css:{ top:'-4px', left:'12px', right:'12px', height:'8px', cursor:'ns-resize' } },
        { d:'ne', css:{ top:'-4px', right:'-4px', width:'12px', height:'12px', cursor:'nesw-resize' } },
        { d:'e',  css:{ top:'12px', right:'-4px', bottom:'12px', width:'8px', cursor:'ew-resize' } },
        { d:'se', css:{ bottom:'-4px', right:'-4px', width:'12px', height:'12px', cursor:'nwse-resize' } },
        { d:'s',  css:{ bottom:'-4px', left:'12px', right:'12px', height:'8px', cursor:'ns-resize' } },
        { d:'sw', css:{ bottom:'-4px', left:'-4px', width:'12px', height:'12px', cursor:'nesw-resize' } },
        { d:'w',  css:{ top:'12px', left:'-4px', bottom:'12px', width:'8px', cursor:'ew-resize' } }
    ];
    dirs.forEach(({ d, css }) => {
        const el = document.createElement('div');
        el.className = 'resize-handle resize-handle-' + d;
        let s = 'position:absolute;z-index:20;';
        for (const [k, v] of Object.entries(css)) s += k + ':' + v + ';';
        el.style.cssText = s;
        win.appendChild(el);
        let sx, sy, sw, sh, sl, st;
        function onStart(e) {
            if (lockInput || win.classList.contains('maximized')) return;
            e.preventDefault();
            e.stopPropagation();
            focusWindow(win.id);
            const ev = e.touches ? e.touches[0] : e;
            const r = win.getBoundingClientRect();
            sx = ev.clientX; sy = ev.clientY; sw = r.width; sh = r.height; sl = r.left; st = r.top;
            function onMove(e2) {
                const ev2 = e2.touches ? e2.touches[0] : e2;
                const dx = ev2.clientX - sx, dy = ev2.clientY - sy;
                let nw, nh, nl, nt;
                if (d.includes('e')) { nw = Math.max(200, sw + dx); nl = sl; }
                if (d.includes('w')) { nw = Math.max(200, sw - dx); nl = sl + sw - nw; }
                if (d.includes('s')) { nh = Math.max(100, sh + dy); nt = st; }
                if (d.includes('n')) { nh = Math.max(100, sh - dy); nt = st + sh - nh; }
                if (d === 'e' || d === 'w') nh = sh;
                if (d === 'n' || d === 's') nw = sw;
                win.style.left = (nl !== undefined ? nl : win.style.left || sl) + 'px';
                win.style.top = (nt !== undefined ? nt : win.style.top || st) + 'px';
                win.style.width = (nw !== undefined ? nw : sw) + 'px';
                win.style.height = (nh !== undefined ? nh : sh) + 'px';
                win.style.transform = 'none';
            }
            function onEnd() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onEnd);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: true });
            document.addEventListener('touchend', onEnd);
        }
        el.addEventListener('mousedown', onStart);
        el.addEventListener('touchstart', onStart, { passive: true });
    });
}

// === Snap Layout Popup ===
let _slpTimer = null;
function showSnapLayoutPopup(win, btn) {
    const existing = document.getElementById('slp-' + win.id);
    if (existing) return;
    const rect = btn.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.id = 'slp-' + win.id;
    popup.style.cssText = 'position:fixed;z-index:99999;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:5px;box-shadow:0 4px 20px var(--shadow);';
    popup.style.left = Math.max(0, rect.left - 70) + 'px';
    popup.style.top = (rect.top - 95) + 'px';
    const layouts = [
        { p:[1,1], n:'Left' }, { p:[0,1], n:'Right' }, { p:[1,1,1,1], n:'Quarters' },
        { p:[2,1], n:'Left 2/3' }, { p:[1,2], n:'Right 2/3' }
    ];
    popup.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;">' +
        layouts.map((l, i) => '<div class="slp-option" data-idx="' + i + '" style="display:flex;flex-direction:column;align-items:center;gap:1px;padding:3px;border:1px solid var(--fg-dim);border-radius:4px;cursor:pointer;background:var(--bg);"><div style="display:flex;gap:1px;height:24px;width:100%;">' +
        l.p.map(p => '<div style="flex:' + p + ';background:var(--fg-dim);border:1px solid var(--border);border-radius:1px;"></div>').join('') +
        '</div><span style="font-size:0.5rem;">' + l.n + '</span></div>').join('') + '</div>';
    document.body.appendChild(popup);
    popup.querySelectorAll('.slp-option').forEach(opt => {
        opt.addEventListener('mouseenter', () => { opt.style.borderColor = 'var(--accent)'; opt.style.background = 'rgba(0,102,204,0.1)'; });
        opt.addEventListener('mouseleave', () => { opt.style.borderColor = 'var(--fg-dim)'; opt.style.background = 'var(--bg)'; });
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(opt.dataset.idx);
            const snaps = [
                { w:'50%', h:'100%', x:'0', y:'0' },
                { w:'50%', h:'100%', x:'50%', y:'0' },
                { w:'50%', h:'50%', x:'0', y:'0' },
                { w:'66%', h:'100%', x:'0', y:'0' },
                { w:'66%', h:'100%', x:'33%', y:'0' },
            ];
            const s = snaps[idx] || snaps[0];
            win.classList.remove('maximized');
            win.style.left = s.x; win.style.top = s.y;
            win.style.width = s.w; win.style.height = s.h;
            win.style.transform = 'none';
            popup.remove();
        });
    });
    setTimeout(() => {
        document.addEventListener('click', function _closeSlp(e) {
            if (!popup.contains(e.target) && e.target !== btn) { popup.remove(); document.removeEventListener('click', _closeSlp); }
        });
    }, 0);
}

// === Window Arrangement ===
function cascadeWindows() {
    const visible = openWindows.filter(id => { const w = document.getElementById(id); return w && !w.classList.contains('hidden'); });
    if (visible.length === 0) return;
    visible.forEach((id, i) => {
        const win = document.getElementById(id);
        if (!win) return;
        win.classList.remove('maximized');
        win.style.left = (40 + i * 30) + 'px';
        win.style.top = (40 + i * 30) + 'px';
        win.style.width = '400px'; win.style.height = '350px';
        win.style.transform = 'none';
        focusWindow(id);
    });
}
function stackWindows() {
    const visible = openWindows.filter(id => { const w = document.getElementById(id); return w && !w.classList.contains('hidden'); });
    if (visible.length === 0) return;
    const count = visible.length, rows = Math.ceil(Math.sqrt(count)), cols = Math.ceil(count / rows);
    const ww = window.innerWidth, wh = window.innerHeight - 40;
    const cw = (ww - (cols + 1) * 4) / cols, ch = (wh - (rows + 1) * 4) / rows;
    visible.forEach((id, i) => {
        const win = document.getElementById(id);
        if (!win) return;
        win.classList.remove('maximized');
        win.style.left = (4 + (i % cols) * (cw + 4)) + 'px';
        win.style.top = (4 + Math.floor(i / cols) * (ch + 4)) + 'px';
        win.style.width = cw + 'px'; win.style.height = ch + 'px';
        win.style.transform = 'none';
        focusWindow(id);
    });
}
function sideBySideWindows() {
    const visible = openWindows.filter(id => { const w = document.getElementById(id); return w && !w.classList.contains('hidden'); });
    if (visible.length === 0) return;
    const count = Math.min(visible.length, 4);
    const cols = count <= 2 ? count : 2;
    const rows = count <= 2 ? 1 : 2;
    const ww = window.innerWidth, wh = window.innerHeight - 40;
    const cw = ww / cols, ch = wh / rows;
    visible.slice(0, count).forEach((id, i) => {
        const win = document.getElementById(id);
        if (!win) return;
        win.classList.remove('maximized');
        win.style.left = ((i % cols) * cw) + 'px';
        win.style.top = (Math.floor(i / cols) * ch) + 'px';
        win.style.width = cw + 'px'; win.style.height = ch + 'px';
        win.style.transform = 'none';
        focusWindow(id);
    });
}

// Apps
const apps = {
    notes: {
        title: '\u{1F4DD} Notepad',
        icon: '\u{1F4DD}',
        createContent: (el, id) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;';
            var toolbar = document.createElement('div');
            toolbar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid rgba(51,255,51,0.15);flex-shrink:0;flex-wrap:wrap;';
            var saveBtn = document.createElement('button');
            saveBtn.textContent = '\u{1F4BE} Save';
            saveBtn.style.cssText = 'margin:0;padding:2px 10px;font-size:0.7rem;background:rgba(51,255,51,0.1);border:1px solid rgba(51,255,51,0.2);color:#33ff33;border-radius:3px;cursor:pointer;';
            var saveAsBtn = document.createElement('button');
            saveAsBtn.textContent = '\u{1F4C2} Save As...';
            saveAsBtn.style.cssText = saveBtn.style.cssText;
            var fileLabel = document.createElement('span');
            fileLabel.style.cssText = 'font-size:0.7rem;opacity:0.5;flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            fileLabel.textContent = 'Untitled';
            toolbar.append(saveBtn, saveAsBtn, fileLabel);
            var ta = document.createElement('textarea');
            ta.style.cssText = 'width:100%;flex:1;background:rgba(0,0,0,0.3);color:#33ff33;border:none;padding:8px;font-family:monospace;font-size:0.9rem;resize:none;outline:none;';
            ta.placeholder = 'Type your notes here...';
            el.append(toolbar, ta);
            // Track current file path
            var currentFilePath = null;
            el._notepadData = { ta: ta, fileLabel: fileLabel, currentPath: function() { return currentFilePath; }, setPath: function(p, name) { currentFilePath = p; fileLabel.textContent = name || 'Untitled'; } };
            saveBtn.onclick = function() {
                if (currentFilePath) {
                    var folder = _feGetFolder(currentFilePath.slice(0, -1));
                    var name = currentFilePath[currentFilePath.length - 1];
                    if (folder && folder.children[name]) {
                        var content = ta.value;
                        folder.children[name].data = content;
                        folder.children[name].size = content.length;
                        _feSaveFS();
                        showToast('Notepad', 'Saved ' + name, 'info');
                    }
                } else {
                    saveAsBtn.click();
                }
            };
            saveAsBtn.onclick = function() {
                showSaveAsDialog(function(pathArr, fileName) {
                    var folder = _feGetFolder(pathArr.slice(0, -1));
                    if (folder) {
                        var name = pathArr[pathArr.length - 1] || fileName;
                        var content = ta.value;
                        folder.children[name] = { type: 'file', size: content.length, date: new Date().toLocaleString(), data: content };
                        currentFilePath = pathArr;
                        fileLabel.textContent = name;
                        _feSaveFS();
                        showToast('Notepad', 'Saved ' + name, 'info');
                    }
                }, currentFilePath ? currentFilePath[currentFilePath.length - 1] : 'Untitled.txt');
            };
        }
    },
    todo: {
        title: '\u2705 Todo',
        icon: '\u2705',
        createContent: (el, id) => {
            el.style.padding = '8px';
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
            el.style.gap = '8px';
            const inputRow = document.createElement('div');
            inputRow.style.display = 'flex';
            inputRow.style.gap = '4px';
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Add todo...';
            input.style.cssText = 'flex:1;background:rgba(0,0,0,0.3);color:#33ff33;border:1px solid rgba(51,255,51,0.3);padding:4px 8px;border-radius:4px;font-family:monospace;outline:none;';
            const addBtn = document.createElement('button');
            addBtn.textContent = '+';
            addBtn.style.cssText = 'padding:4px 12px;background:rgba(51,255,51,0.2);border:1px solid #33ff33;color:#33ff33;border-radius:4px;cursor:pointer;font-family:monospace;';
            inputRow.appendChild(input);
            inputRow.appendChild(addBtn);
            const list = document.createElement('div');
            list.id = 'todo-items-' + id;
            list.style.cssText = 'flex:1;overflow-y:auto;';
            el.appendChild(inputRow);
            el.appendChild(list);
            function addTodo() {
                const text = input.value.trim();
                if (!text) return;
                const item = document.createElement('div');
                item.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid rgba(51,255,51,0.1);';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.style.cssText = 'accent-color:#33ff33;cursor:pointer;';
                const span = document.createElement('span');
                span.textContent = text;
                span.style.cssText = 'flex:1;color:#33ff33;font-size:0.85rem;';
                const del = document.createElement('button');
                del.textContent = '\u2715';
                del.style.cssText = 'background:none;border:none;color:#ff4444;cursor:pointer;font-size:0.8rem;padding:0 4px;';
                del.onclick = () => item.remove();
                item.appendChild(cb);
                item.appendChild(span);
                item.appendChild(del);
                list.appendChild(item);
                input.value = '';
                input.focus();
            }
            addBtn.onclick = addTodo;
            input.addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });
        }
    },
    calendar: {
        title: '\u{1F4C5} Calendar',
        icon: '\u{1F4C5}',
        createContent: (el) => {
            el.style.padding = '8px';
            el.style.textAlign = 'center';
            el.style.fontFamily = 'monospace';
            const now = new Date();
            const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
            const m = now.getMonth(), y = now.getFullYear();
            const first = new Date(y, m, 1).getDay();
            const last = new Date(y, m + 1, 0).getDate();
            let html = '<div style="font-size:1.1rem;margin-bottom:8px;color:#33ff33;">' + months[m] + ' ' + y + '</div>';
            html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-size:0.75rem;">';
            days.forEach(d => html += '<div style="color:rgba(51,255,51,0.5);padding:2px;">' + d + '</div>');
            for (let i = 0; i < first; i++) html += '<div></div>';
            for (let d = 1; d <= last; d++) {
                const isToday = d === now.getDate() ? 'background:rgba(51,255,51,0.3);border-radius:4px;' : '';
                html += '<div style="padding:4px;color:#33ff33;' + isToday + '">' + d + '</div>';
            }
            html += '</div>';
            el.innerHTML = html;
        }
    },
    calc: {
        title: '\u{1F9EE} Calculator',
        icon: '\u{1F9EE}',
        createContent: (el) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;background:#1c1c1e;user-select:none;overflow:hidden;';
            var displayVal = '0', operand = null, operator = null, waiting = false, memory = 0;

            var display = document.createElement('div');
            display.style.cssText = 'padding:20px 14px 10px;text-align:right;font-size:2.7rem;font-weight:300;color:#fff;background:#1c1c1e;font-family:-apple-system,Helvetica Neue,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-height:3.4rem;line-height:1;flex-shrink:0;';
            display.textContent = '0';

            function fmt(n) {
                if (!isFinite(n) || isNaN(n)) return 'Error';
                var s = String(n);
                if (s.length > 14) { try { s = parseFloat(n).toExponential(6); } catch(e) { s = 'Error'; } }
                return s;
            }
            function upd() { display.textContent = displayVal; }
            function dig(d) {
                if (waiting) { displayVal = String(d); waiting = false; }
                else { displayVal = displayVal === '0' ? String(d) : displayVal + d; }
                upd();
            }
            function dec() {
                if (waiting) { displayVal = '0.'; waiting = false; upd(); return; }
                if (displayVal.indexOf('.') === -1) displayVal += '.';
                upd();
            }
            function clr() { displayVal = '0'; operand = null; operator = null; waiting = false; upd(); }
            function unary(fn) {
                var cur = parseFloat(displayVal);
                var r;
                switch (fn) {
                    case '±': r = -cur; break;
                    case '%': r = cur / 100; break;
                    case 'sin': r = Math.sin(cur * Math.PI / 180); break;
                    case 'cos': r = Math.cos(cur * Math.PI / 180); break;
                    case 'tan': r = Math.tan(cur * Math.PI / 180); break;
                    case 'ln': r = Math.log(cur); break;
                    case 'log': r = Math.log10(cur); break;
                    case '√': r = Math.sqrt(cur); break;
                    case 'x²': r = cur * cur; break;
                    case 'x³': r = cur * cur * cur; break;
                    case '1/x': r = cur === 0 ? 'Error' : 1 / cur; break;
                    case 'n!':
                        if (cur < 0 || !Number.isInteger(cur)) { r = 'Error'; break; }
                        var f = 1;
                        for (var i = 2; i <= cur; i++) f *= i;
                        r = f;
                        break;
                    case 'π': r = Math.PI; break;
                    case 'e': r = Math.E; break;
                    default: r = cur;
                }
                if (r === 'Error') { displayVal = 'Error'; upd(); return; }
                displayVal = fmt(r);
                if (fn !== '±' && fn !== '%' && fn !== 'π' && fn !== 'e') waiting = true;
                upd();
            }
            function op(next) {
                var cur = parseFloat(displayVal);
                if (operator && !waiting) {
                    var r;
                    switch (operator) {
                        case '+': r = operand + cur; break;
                        case '−': r = operand - cur; break;
                        case '×': r = operand * cur; break;
                        case '÷': r = cur === 0 ? 'Error' : operand / cur; break;
                        default: r = cur;
                    }
                    if (r === 'Error') { displayVal = 'Error'; operand = null; operator = null; waiting = true; upd(); return; }
                    displayVal = fmt(r);
                    operand = r;
                } else { operand = cur; }
                if (next === '=') { operator = null; waiting = true; }
                else { operator = next; waiting = true; }
                upd();
            }

            function btn(label, type, opt) {
                var b = document.createElement('button');
                b.textContent = label;
                var base = type === 'op' ? '#ff9500' : type === 'func' ? '#d4d4d2' : '#333';
                var tc = type === 'op' ? '#fff' : type === 'func' ? '#000' : '#fff';
                var fs = type === 'op' || type === 'func' ? '1.3rem' : '1.5rem';
                var style = 'margin:0;padding:0;border:none;cursor:pointer;font-size:' + fs + ';font-weight:' + (type === 'op' ? '500' : '300') + ';background:' + base + ';color:' + tc + ';display:flex;align-items:center;justify-content:center;outline:none;transition:filter 0.1s;height:48px;';
                if (opt && opt.colspan === 2) style += 'grid-column:span 2;';
                if (label === '=') style += 'background:#ff9500;color:#fff;';
                b.style.cssText = style;
                b.onmouseenter = function() { this.style.filter = 'brightness(1.15)'; };
                b.onmouseleave = function() { this.style.filter = 'brightness(1)'; };
                b.onmousedown = function() { this.style.filter = 'brightness(0.85)'; };
                b.onmouseup = function() { this.style.filter = 'brightness(1.15)'; };
                return b;
            }

            el.appendChild(display);

            // Main button grid
            var grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#1c1c1e;padding:4px 8px 8px;flex:1;';

            var rows = [
                [{ l:'C', t:'func' }, { l:'±', t:'func' }, { l:'%', t:'func' }, { l:'÷', t:'op' }],
                [{ l:'7', t:'num' }, { l:'8', t:'num' }, { l:'9', t:'num' }, { l:'×', t:'op' }],
                [{ l:'4', t:'num' }, { l:'5', t:'num' }, { l:'6', t:'num' }, { l:'−', t:'op' }],
                [{ l:'1', t:'num' }, { l:'2', t:'num' }, { l:'3', t:'num' }, { l:'+', t:'op' }],
                [{ l:'0', t:'num', colspan:2 }, { l:'.', t:'num' }, { l:'=', t:'op' }],
            ];

            rows.forEach(function(row) {
                row.forEach(function(cell) {
                    var b = btn(cell.l, cell.t, cell);
                    b.onclick = function() {
                        if (cell.l === 'C') { clr(); return; }
                        if (cell.t === 'op') {
                            if (cell.l === '=') op('=');
                            else op(cell.l);
                            return;
                        }
                        if (cell.t === 'func') {
                            unary(cell.l);
                            return;
                        }
                        if (cell.l === '.') { dec(); return; }
                        dig(cell.l);
                    };
                    grid.appendChild(b);
                });
            });

            el.appendChild(grid);
        }
    },
    ai: {
        title: '\u{1F916} AI Chat',
        icon: '\u{1F916}',
        createContent: (el, id) => {
            el.style.padding = '8px';
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
            el.style.gap = '8px';
            const log = document.createElement('div');
            log.id = 'ai-log-' + id;
            log.style.cssText = 'flex:1;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:4px;padding:8px;font-size:0.85rem;';
            log.innerHTML = '<p style="color:#88ccff;">Welcome to AI Chat!</p>';
            const inputRow = document.createElement('div');
            inputRow.style.display = 'flex';
            inputRow.style.gap = '4px';
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'Ask anything...';
            input.style.cssText = 'flex:1;background:rgba(0,0,0,0.3);color:#33ff33;border:1px solid rgba(51,255,51,0.3);padding:4px 8px;border-radius:4px;font-family:monospace;outline:none;';
            const sendBtn = document.createElement('button');
            sendBtn.textContent = 'Send';
            sendBtn.style.cssText = 'padding:4px 12px;background:rgba(51,255,51,0.2);border:1px solid #33ff33;color:#33ff33;border-radius:4px;cursor:pointer;font-family:monospace;';
            inputRow.appendChild(input);
            inputRow.appendChild(sendBtn);
            el.appendChild(log);
            el.appendChild(inputRow);
            const API_KEY = 'AQ.Ab8RN6JruVd2ICV3ejhE3kyjY_NrVU7MjDda2pXn2vbrIGddoA';
            const MODEL = 'gemini-flash-latest';
            function addMsg(text, color) {
                const p = document.createElement('p');
                p.textContent = text;
                p.style.color = color;
                p.style.whiteSpace = 'pre-wrap';
                log.appendChild(p);
                log.scrollTop = log.scrollHeight;
            }
            function sendMessage() {
                const text = input.value.trim();
                if (!text) return;
                addMsg('You: ' + text, '#88ff88');
                input.value = '';
                sendBtn.disabled = true;
                sendBtn.textContent = '...';
                const thinkP = document.createElement('p');
                thinkP.textContent = 'Gemini: thinking...';
                thinkP.style.color = '#88ccff';
                log.appendChild(thinkP);
                log.scrollTop = log.scrollHeight;
                fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': API_KEY },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: text }] }]
                    })
                }).then(r => r.json()).then(data => {
                    thinkP.remove();
                    const reply = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
                        ? data.candidates[0].content.parts.map(p => p.text).join('')
                        : 'No response.';
                    addMsg('Gemini: ' + reply, '#88ccff');
                }).catch(err => {
                    thinkP.remove();
                    addMsg('Gemini: Error - ' + err.message, '#ff6666');
                }).finally(() => {
                    sendBtn.disabled = false;
                    sendBtn.textContent = 'Send';
                });
            }
            sendBtn.onclick = sendMessage;
            input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
        }
    },
    highscores: {
        title: '\u{1F3C6} High Scores',
        icon: '\u{1F3C6}',
        createContent: (el) => {
            el.style.padding = '8px';
            el.style.overflow = 'auto';
            const scores = safeJsonObject('cyberos_highscores', {});
            let html = '<div style="text-align:center;margin-bottom:8px;font-size:1rem;color:#33ff33;">\u{1F3C6} High Scores</div>';
            const allGames = {'snake':'Snake','tictactoe':'Tic Tac Toe','solitaire':'Solitaire','minesweeper':'Minesweeper','blackjack':'Blackjack','memory':'Memory','2048':'2048','pacman':'Pac-Man'};
            Object.entries(allGames).forEach(([key, gameName]) => {
                const val = scores[key];
                const display = val ? '<span style="color:#ffcc00;">' + val + '</span>' : '<span style="color:rgba(51,255,51,0.3);">---</span>';
                html += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(51,255,51,0.1);font-size:0.85rem;"><span>' + gameName + '</span><span>' + display + '</span></div>';
            });
            el.innerHTML = html;
        }
    },
    wallpapers: {
        title: '\u{1F5BC} Wallpapers',
        icon: '\u{1F5BC}',
        createContent: (el) => {
            const list = Object.entries(wallpapers || {});
            const cols = 4;
            el.style.overflow = 'auto';
            el.style.display = 'grid';
            el.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
            el.style.gap = '6px';
            el.style.padding = '8px';
            list.forEach(([id, wp]) => {
                const card = document.createElement('div');
                const isActive = wpCurrent === id;
                card.style.cssText = 'border:2px solid ' + (isActive ? '#33ff33' : 'rgba(51,255,51,0.2)') + ';border-radius:6px;padding:10px 4px;text-align:center;cursor:pointer;transition:all 0.15s;background:' + (isActive ? 'rgba(51,255,51,0.1)' : 'rgba(10,25,49,0.3)');
                card.innerHTML = '<div style="font-size:1.8rem;line-height:1.4;">' + wp.icon + '</div><div style="font-size:0.7rem;">' + wp.name + '</div>';
                card.onclick = function() {
                    startWallpaper(id);
                    el.querySelectorAll(':scope > div').forEach(function(c) { c.style.borderColor = 'rgba(51,255,51,0.2)'; c.style.background = 'rgba(10,25,49,0.3)'; });
                    card.style.borderColor = '#33ff33';
                    card.style.background = 'rgba(51,255,51,0.1)';
                };
                el.appendChild(card);
            });
        }
    },
    settings: {
        title: '\u2699\uFE0F Settings',
        icon: '\u2699\uFE0F',
        createContent: function(el) {
            el.style.display = 'flex';
            el.style.flexDirection = 'row';
            el.style.padding = '0';
            var nav = document.createElement('div');
            nav.className = 'settings-nav';
            var pages = {personalize:'\u{1F3A8} Personalize',display:'\u{1F4FA} Display',widgets:'\u{1F5A5} Widgets',system:'\u{2699} System',about:'\u2139\uFE0F About'};
            var currentPage = 'personalize';
            var content = document.createElement('div');
            content.className = 'settings-content';
            function renderPage(page) {
                nav.querySelectorAll('.settings-nav-item').forEach(function(n){n.classList.toggle('active',n.dataset.page===page);});
                currentPage = page;
                if (page === 'personalize') {
                    var accentColors = ['#33ff33','#00ccff','#ff6633','#cc33ff','#ffcc00','#33ff99','#ff3366','#ffffff'];
                    var currentAccent = localStorage.getItem('cyberos_accent') || '#33ff33';
                    var html = '<div style="margin-bottom:8px;font-weight:bold;">Accent Color</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">';
                    accentColors.forEach(function(c){html+='<div style="width:28px;height:28px;background:'+c+';border-radius:4px;cursor:pointer;border:2px solid '+(c===currentAccent?'var(--fg)':'transparent')+';" data-accent="'+c+'"></div>';});
                    html += '</div>';
                    var cursorThemes = [
                        { id:'default', label:'Default' },
                        { id:'retro-pixel', label:'Retro Pixel' },
                        { id:'retro-hand', label:'Retro Hand' },
                        { id:'retro-cross', label:'Retro Crosshair' },
                        { id:'retro-text', label:'Retro I-beam' },
                    ];
                    var currentCursor = localStorage.getItem('cyberos_cursor') || 'default';
                    html += '<div style="margin:8px 0;font-weight:bold;">\u{1F431} Cursor Theme</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">';
                    cursorThemes.forEach(function(t) {
                        var sel = t.id === currentCursor ? 'border-color:var(--fg);background:rgba(255,255,255,0.1);' : 'border-color:var(--border);background:transparent;';
                        html += '<div class="cursor-option" data-cursor="' + t.id + '" style="flex:1;min-width:70px;padding:8px 6px;border:2px solid ' + (t.id === currentCursor ? 'var(--fg)' : 'var(--border)') + ';border-radius:6px;text-align:center;cursor:pointer;transition:all 0.15s;font-size:0.75rem;background:' + (t.id === currentCursor ? 'rgba(255,255,255,0.08)' : 'transparent') + ';">' + t.label + '</div>';
                    });
                    html += '</div>';
                    var bongoVis = localStorage.getItem('cyberos_bongo_enabled') !== 'false';
                    html += '<div class="setting-row" style="border:none;"><span>\u{1F431} Bongo Cat</span><label><input type="checkbox" ' + (bongoVis ? 'checked' : '') + ' id="bongo-toggle"> <span style="font-size:0.7rem;">' + (bongoVis ? 'Visible' : 'Hidden') + '</span></label></div>';
                    var currentBg = document.getElementById('desktop').style.background || '#020813';
                    var hexBg = '#020813';
                    try { var t = document.getElementById('desktop').style.background; if (t && t.startsWith('#')) hexBg = t; } catch(e){}
                    html += '<div style="margin-bottom:8px;font-weight:bold;">Desktop Background</div><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;"><input type="color" id="bg-colorpicker" value="'+hexBg+'" style="width:40px;height:40px;border:2px solid var(--border);border-radius:4px;cursor:pointer;background:none;padding:2px;"><button id="bg-apply-btn" style="padding:4px 12px;border:1px solid var(--border);border-radius:4px;background:var(--bg2);color:var(--fg);cursor:pointer;font-size:0.8rem;">Apply</button><span style="font-size:0.8rem;opacity:0.7;">Choose any color</span></div><div style="font-weight:bold;">Wallpaper</div><div style="margin-top:4px;font-size:0.75rem;opacity:0.7;">Open Wallpapers app to change</div>';
                    content.innerHTML = html;
                    content.querySelector('#bg-apply-btn').onclick = function(){
                        var bg = content.querySelector('#bg-colorpicker').value;
                        stopWallpaper();
                        document.getElementById('matrix-canvas').style.display = 'none';
                        document.getElementById('desktop').style.background = bg;
                        document.body.style.background = bg;
                        if (currentUser) { var acc = loadAccounts(); if (acc[currentUser]) { acc[currentUser].bg = bg; acc[currentUser].wp = ''; saveAccounts(acc); } }
                    };
                    content.querySelectorAll('[data-accent]').forEach(function(el2){
                        el2.onclick = function(){
                            var clr = el2.dataset.accent;
                            localStorage.setItem('cyberos_accent', clr);
                            document.documentElement.style.setProperty('--fg', clr);
                            document.documentElement.style.setProperty('--fg-bright', clr);
                            document.documentElement.style.setProperty('--border', clr);
                            document.documentElement.style.setProperty('--accent', clr);
                            document.documentElement.style.setProperty('--shadow', clr+'66');
                            content.querySelectorAll('[data-accent]').forEach(function(s){s.style.borderColor='transparent';});
                            el2.style.borderColor='var(--fg)';
                        };
                    });
                    content.querySelectorAll('.cursor-option').forEach(function(el2){
                        el2.onclick = function(){
                            var cur = el2.dataset.cursor;
                            localStorage.setItem('cyberos_cursor', cur);
                            document.body.className = document.body.className.replace(/cursor-\S+/g, '').trim();
                            if (cur !== 'default') document.body.classList.add('cursor-' + cur);
                            content.querySelectorAll('.cursor-option').forEach(function(s){ s.style.borderColor = 'var(--border)'; s.style.background = 'transparent'; });
                            el2.style.borderColor = 'var(--fg)';
                            el2.style.background = 'rgba(255,255,255,0.08)';
                        };
                    });
                    var bongoCb = content.querySelector('#bongo-toggle');
                    if (bongoCb) {
                        bongoCb.onchange = function() {
                            var vis = bongoCb.checked;
                            toggleBongoCat(vis);
                            bongoCb.nextElementSibling.textContent = vis ? 'Visible' : 'Hidden';
                        };
                    }
                } else if (page === 'display') {
                    var isLight = document.body.classList.contains('light-theme');
                    var transparency = localStorage.getItem('cyberos_transparency') || '85';
                    var acrylic = localStorage.getItem('cyberos_acrylic') === '1';
                    content.innerHTML = '<div class="setting-row"><span>\u{2600}\uFE0F Theme</span><label><input type="checkbox" '+(isLight?'checked':'')+' id="theme-toggle"> <span style="font-size:0.7rem;">'+(isLight?'Light':'Dark')+'</span></label></div><div class="setting-row"><span>\u{1F4F1} Transparency</span><span style="font-size:0.7rem;opacity:0.7;">'+(acrylic?'Blur':'Solid')+'</span></div><div class="setting-row" style="border:none;"><span style="font-size:0.7rem;">Window Opacity</span><input type="range" min="30" max="100" value="'+transparency+'" id="transparency-slider" style="flex:1;max-width:120px;accent-color:var(--accent);"> <span id="transparency-label" style="font-size:0.7rem;width:30px;text-align:right;">'+transparency+'%</span></div>';
                    var themeCb = content.querySelector('#theme-toggle');
                    themeCb.onchange = function(){
                        document.body.classList.toggle('light-theme', themeCb.checked);
                        content.querySelector('#theme-toggle ~ span').textContent = themeCb.checked ? 'Light' : 'Dark';
                        localStorage.setItem('cyberos_theme', themeCb.checked ? 'light' : 'dark');
                        var icon = document.getElementById('tray-nightlight');
                        if (icon) icon.textContent = themeCb.checked ? '\u{2600}\uFE0F' : '\u{1F319}';
                        var trSlider = content.querySelector('#transparency-slider');
                        if (trSlider) {
                            var alpha = trSlider.value / 100;
                            var base = themeCb.checked ? '255,255,255' : '2,8,19';
                            document.body.style.setProperty('--win-bg', 'rgba('+base+','+alpha+')');
                        }
                    };
                    var trSlider = content.querySelector('#transparency-slider');
                    trSlider.oninput = function(){
                        var v = this.value;
                        document.getElementById('transparency-label').textContent = v + '%';
                        var alpha = v / 100;
                        var base = document.body.classList.contains('light-theme') ? '255,255,255' : '2,8,19';
                        document.body.style.setProperty('--win-bg', 'rgba('+base+','+alpha+')');
                        localStorage.setItem('cyberos_transparency', v);
                    };
                } else if (page === 'system') {
                    var currentTimeout = parseInt(localStorage.getItem('cyberos_timeout') || '180000', 10);
                    var timeoutSec = Math.round(currentTimeout / 1000);
                    var presetOptions = [
                        { label: '1 minute', value: 60 },
                        { label: '3 minutes', value: 180 },
                        { label: '5 minutes', value: 300 },
                        { label: '10 minutes', value: 600 },
                        { label: '30 minutes', value: 1800 },
                        { label: 'Never', value: 0 }
                    ];
                    var html = '<div style="margin-bottom:8px;font-weight:bold;">Screen timeout</div>';
                    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">';
                    presetOptions.forEach(function(o) {
                        var sel = o.value === timeoutSec ? ' style="background:var(--accent);color:#000;font-weight:bold;"' : '';
                        html += '<button class="timeout-preset" data-sec="' + o.value + '"' + sel + ' style="margin:0;padding:4px 10px;font-size:0.75rem;border-radius:4px;cursor:pointer;background:var(--bg2);color:var(--fg);border:1px solid var(--border);">' + o.label + '</button>';
                    });
                    html += '</div>';
                    html += '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;"><span style="font-size:0.7rem;opacity:0.7;">Custom:</span><input type="range" min="0" max="3600" value="' + timeoutSec + '" id="timeout-slider" style="flex:1;max-width:200px;accent-color:var(--accent);"> <span id="timeout-label" style="font-size:0.75rem;min-width:60px;">' + (timeoutSec === 0 ? 'Never' : timeoutSec + 's') + '</span></div>';
                    content.innerHTML = html;
                    function applyTimeout(sec) {
                        var ms = sec > 0 ? sec * 1000 : 3600000;
                        localStorage.setItem('cyberos_timeout', String(ms));
                        screenTimeout = ms;
                        if (sec === 0) {
                            if (screensaverTimer) clearTimeout(screensaverTimer);
                        } else {
                            resetScreensaver();
                        }
                    }
                    content.querySelectorAll('.timeout-preset').forEach(function(btn) {
                        btn.onclick = function() {
                            var sec = parseInt(btn.dataset.sec, 10);
                            content.querySelectorAll('.timeout-preset').forEach(function(b) { b.style.background = 'var(--bg2)'; b.style.color = 'var(--fg)'; b.style.fontWeight = 'normal'; });
                            btn.style.background = 'var(--accent)'; btn.style.color = '#000'; btn.style.fontWeight = 'bold';
                            var slider = content.querySelector('#timeout-slider');
                            slider.value = sec;
                            document.getElementById('timeout-label').textContent = sec === 0 ? 'Never' : sec + 's';
                            applyTimeout(sec);
                        };
                    });
                    var slider2 = content.querySelector('#timeout-slider');
                    slider2.oninput = function() {
                        var sec = parseInt(this.value, 10);
                        document.getElementById('timeout-label').textContent = sec === 0 ? 'Never' : sec + 's';
                        content.querySelectorAll('.timeout-preset').forEach(function(b) { b.style.background = 'var(--bg2)'; b.style.color = 'var(--fg)'; b.style.fontWeight = 'normal'; });
                        applyTimeout(sec);
                    };
                } else if (page === 'about') {
                    var accounts = loadAccounts();
                    var ud = currentUser && accounts[currentUser] ? accounts[currentUser] : {};
                    content.innerHTML = '<div class="setting-row"><span>User</span><span style="font-size:0.8rem;">'+escapeHtml((ud.emoji||'')+' '+(currentUser || ''))+'</span></div><div class="setting-row"><span>OS Version</span><span style="font-size:0.8rem;">Cyber OS v2.0</span></div><div class="setting-row"><span>Windows</span><span style="font-size:0.8rem;">'+escapeHtml(window.navigator.platform||'PC')+'</span></div><div class="setting-row"><span>Resolution</span><span style="font-size:0.8rem;">'+window.innerWidth+'\u00D7'+window.innerHeight+'</span></div><div class="setting-row" style="border:none;"><span>\u{1F3AF} Tour</span><button id="restart-tour-btn" style="margin:0;padding:4px 14px;font-size:0.8rem;background:var(--accent);color:#fff;border:none;border-radius:5px;cursor:pointer;">Restart welcome tour</button></div>';
                    setTimeout(function() {
                        var rtBtn = document.getElementById('restart-tour-btn');
                        if (rtBtn) rtBtn.onclick = function() {
                            localStorage.removeItem('cyberos_tour_done');
                            document.querySelectorAll('.tour-highlight').forEach(function(el) { el.classList.remove('tour-highlight'); });
                            var existing = document.getElementById('tour-toast');
                            if (existing) existing.remove();
                            showWelcomeTour();
                            showToast('Tour', 'Tour restarted!', 'info');
                        };
                    }, 0);
                } else if (page === 'widgets') {
                    var clockVis = localStorage.getItem('cyberos_widget_clock_visible') !== 'false';
                    var calVis = localStorage.getItem('cyberos_widget_calendar_visible') !== 'false';
                    var mediaVis = localStorage.getItem('cyberos_widget_media_visible') !== 'false';
                    var clockTrans = localStorage.getItem('cyberos_widget_clock_transparent') === 'true';
                    var calTrans = localStorage.getItem('cyberos_widget_calendar_transparent') === 'true';
                    var mediaTrans = localStorage.getItem('cyberos_widget_media_transparent') === 'true';
                    var currentTheme = localStorage.getItem('cyberos_widget_theme') || 'cyber';
                    content.innerHTML = '<div style="margin-bottom:8px;font-weight:bold;">Widget Visibility</div>'
                        + '<div class="setting-row"><span>\u{1F570} Clock</span><label><input type="checkbox" ' + (clockVis?'checked':'') + ' id="wg-clock-vis"> <span style="font-size:0.7rem;">Visible</span></label></div>'
                        + '<div class="setting-row"><span>\u{1F4C5} Calendar</span><label><input type="checkbox" ' + (calVis?'checked':'') + ' id="wg-cal-vis"> <span style="font-size:0.7rem;">Visible</span></label></div>'
                        + '<div class="setting-row"><span>\u{1F3B5} Media Player</span><label><input type="checkbox" ' + (mediaVis?'checked':'') + ' id="wg-media-vis"> <span style="font-size:0.7rem;">Visible</span></label></div>'
                        + '<div style="margin:12px 0 8px;font-weight:bold;">Widget Transparency</div>'
                        + '<div class="setting-row"><span>\u{1F570} Clock</span><label><input type="checkbox" ' + (clockTrans?'checked':'') + ' id="wg-clock-trans"> <span style="font-size:0.7rem;">Transparent</span></label></div>'
                        + '<div class="setting-row"><span>\u{1F4C5} Calendar</span><label><input type="checkbox" ' + (calTrans?'checked':'') + ' id="wg-cal-trans"> <span style="font-size:0.7rem;">Transparent</span></label></div>'
                        + '<div class="setting-row" style="border:none;"><span>\u{1F3B5} Media Player</span><label><input type="checkbox" ' + (mediaTrans?'checked':'') + ' id="wg-media-trans"> <span style="font-size:0.7rem;">Transparent</span></label></div>'
                        + '<div style="margin:12px 0 8px;font-weight:bold;">Widget Theme</div>'
                        + '<div style="display:flex;gap:8px;flex-wrap:wrap;" id="wg-theme-options">'
                        + Object.entries(widgetThemes).map(function(e) {
                            var k = e[0], t = e[1];
                            var sel = k === currentTheme ? 'border-color:var(--fg);background:rgba(255,255,255,0.1);' : '';
                            return '<div class="wg-theme-option" data-theme="' + k + '" style="flex:1;min-width:60px;padding:10px 6px;border:2px solid rgba(255,255,255,0.15);border-radius:8px;text-align:center;cursor:pointer;transition:all 0.15s;' + sel + '">'
                                + '<div style="font-size:1.2rem;margin-bottom:2px;">' + t.icon + '</div>'
                                + '<div style="font-size:0.6rem;opacity:0.7;">' + t.name + '</div>'
                                + '</div>';
                        }).join('') + '</div>';
                    function bindWidgetSetting(id, key) {
                        var cb = content.querySelector('#' + id);
                        if (cb) {
                            cb.onchange = function() {
                                localStorage.setItem(key, cb.checked ? 'true' : 'false');
                                applyWidgetSettings();
                            };
                        }
                    }
                    bindWidgetSetting('wg-clock-vis', 'cyberos_widget_clock_visible');
                    bindWidgetSetting('wg-cal-vis', 'cyberos_widget_calendar_visible');
                    bindWidgetSetting('wg-media-vis', 'cyberos_widget_media_visible');
                    bindWidgetSetting('wg-clock-trans', 'cyberos_widget_clock_transparent');
                    bindWidgetSetting('wg-cal-trans', 'cyberos_widget_calendar_transparent');
                    bindWidgetSetting('wg-media-trans', 'cyberos_widget_media_transparent');
                    setTimeout(function() {
                        content.querySelectorAll('.wg-theme-option').forEach(function(opt) {
                            opt.onclick = function() {
                                var theme = opt.dataset.theme;
                                localStorage.setItem('cyberos_widget_theme', theme);
                                content.querySelectorAll('.wg-theme-option').forEach(function(o) {
                                    o.style.borderColor = 'rgba(255,255,255,0.15)';
                                    o.style.background = 'transparent';
                                });
                                opt.style.borderColor = 'var(--fg)';
                                opt.style.background = 'rgba(255,255,255,0.1)';
                                applyWidgetSettings();
                            };
                        });
                    }, 0);
                }
            }
            Object.entries(pages).forEach(function(_a){
                var key=_a[0],val=_a[1];
                var item = document.createElement('div');
                item.className = 'settings-nav-item' + (key==='personalize'?' active':'');
                item.dataset.page = key;
                item.textContent = val;
                item.onclick = function(){ renderPage(key); };
                nav.appendChild(item);
            });
            renderPage('personalize');
            el.appendChild(nav);
            el.appendChild(content);
        }
    },
    taskmgr: {
        title: '\u{1F4CA} Task Manager',
        icon: '\u{1F4CA}',
        createContent: function(el, id) {
            el.style.padding = '0';
            el.style.display = 'flex';
            el.style.flexDirection = 'column';
            var tabs = document.createElement('div');
            tabs.className = 'taskmgr-tabs';
            var tabData = [{k:'processes',l:'Processes'},{k:'performance',l:'Performance'}];
            var currentTab = 'processes';
            var body = document.createElement('div');
            body.className = 'taskmgr-body';
            var selectedProcess = null;
            function renderTab(tab) {
                currentTab = tab;
                tabs.querySelectorAll('.taskmgr-tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===tab);});
                if (tab === 'processes') {
                    var html = '<div style="display:flex;gap:8px;padding:2px 8px;font-weight:bold;font-size:0.7rem;border-bottom:1px solid rgba(51,255,51,0.1);"><span style="flex:1;">Name</span><span style="width:50px;text-align:right;">CPU</span><span style="width:50px;text-align:right;">Memory</span><span style="width:40px;text-align:right;">PID</span></div>';
                    var procs = openWindows.length > 0 ? openWindows : ['system','idle'];
                    var usedMem = Math.floor(Math.random()*40+30);
                    procs.forEach(function(w,i){
                        var name = w === 'system' ? 'System' : w === 'idle' ? 'System Idle' : (windowRegistry[Object.keys(windowRegistry).find(function(k){return windowRegistry[k]&&windowRegistry[k].id===w;})] ? w : 'Process '+(i+1));
                        var cpu = (Math.random()*5+(i===0?3:0)).toFixed(1);
                        var mem = (Math.random()*20+(i<3?10:2)).toFixed(1);
                        var pid = 1000 + i*4 + Math.floor(Math.random()*3);
                        var sel = selectedProcess === w ? ' style="background:rgba(51,255,51,0.15);"' : '';
                        html += '<div class="taskmgr-row" data-proc="'+w+'"'+sel+'><span class="tm-name">'+name+'</span><span class="tm-cpu">'+cpu+'%</span><span class="tm-mem">'+mem+'MB</span><span class="tm-pid">'+pid+'</span></div>';
                    });
                    html += '<div style="padding:6px 8px;font-size:0.65rem;opacity:0.5;border-top:1px solid rgba(51,255,51,0.05);">CPU: '+(Math.random()*30+10).toFixed(0)+'% &middot; Memory: '+usedMem+'% &middot; Processes: '+procs.length+'</div>';
                    body.innerHTML = html;
                    body.querySelectorAll('.taskmgr-row').forEach(function(row){
                        row.onclick = function(){ selectedProcess = row.dataset.proc; body.querySelectorAll('.taskmgr-row').forEach(function(r){r.style.background='';}); row.style.background='rgba(51,255,51,0.15)'; };
                    });
                } else {
                    var cpuUsage = Math.floor(Math.random()*40+10);
                    var memUsage = Math.floor(Math.random()*30+40);
                    body.innerHTML = '<div style="padding:10px;"><div style="margin-bottom:12px;"><div style="font-size:0.8rem;margin-bottom:4px;">CPU &nbsp; <span style="color:#88ff88;">'+cpuUsage+'%</span></div><div style="background:rgba(51,255,51,0.1);border-radius:3px;height:16px;overflow:hidden;"><div style="background:#33ff33;width:'+cpuUsage+'%;height:100%;border-radius:3px;transition:width 0.3s;"></div></div></div><div><div style="font-size:0.8rem;margin-bottom:4px;">Memory &nbsp; <span style="color:#88ccff;">'+memUsage+'%</span></div><div style="background:rgba(51,255,51,0.1);border-radius:3px;height:16px;overflow:hidden;"><div style="background:#88ccff;width:'+memUsage+'%;height:100%;border-radius:3px;transition:width 0.3s;"></div></div></div><div style="margin-top:12px;font-size:0.65rem;opacity:0.5;">Updating every 2 seconds...</div></div>';
                }
            }
            tabData.forEach(function(t){
                var tb = document.createElement('div');
                tb.className = 'taskmgr-tab' + (t.k==='processes'?' active':'');
                tb.dataset.tab = t.k;
                tb.textContent = t.l;
                tb.onclick = function(){ renderTab(t.k); };
                tabs.appendChild(tb);
            });
            var footer = document.createElement('div');
            footer.className = 'taskmgr-footer';
            var endBtn = document.createElement('button');
            endBtn.textContent = 'End Task';
            endBtn.onclick = function(){
                if (!selectedProcess || selectedProcess === 'system' || selectedProcess === 'idle') { showToast('Task Manager','Cannot end system process','info'); return; }
                closeWindow(selectedProcess);
                selectedProcess = null;
                showToast('Task Manager','Task ended successfully','info');
            };
            footer.appendChild(endBtn);
            renderTab('processes');
            el.appendChild(tabs);
            el.appendChild(body);
            el.appendChild(footer);
            var tmr = setInterval(function(){ renderTab(currentTab); }, 2000);
            cleanups[id] = function(){ clearInterval(tmr); };
        }
    },
    gaminghub: {
        title: '\u{1F3AE} Gaming Hub',
        icon: '\u{1F3AE}',
        createContent: (el, id) => {
            const games = [
                {g:'snake', i:'\u{1F40D}', n:'Snake', d:'Classic web snake'},
                {g:'tictactoe', i:'\u274C', n:'Tic Tac Toe', d:'Classic 3-in-a-row AI'},
                {g:'solitaire', i:'\u{1F0CF}', n:'Solitaire', d:'Klondike card game'},
                {g:'minesweeper', i:'\u{1F4A3}', n:'Minesweeper', d:'Find the mines'},
                {g:'blackjack', i:'\u2660\uFE0F', n:'Blackjack', d:'Beat the dealer'},
                {g:'memory', i:'\u{1F0CF}', n:'Memory', d:'Flip cards and match pairs'},
                {g:'game2048', i:'\u{1F3B2}', n:'2048', d:'Merge tiles to 2048'},
                {g:'pacman', i:'\u{1F7E1}', n:'Pac-Man', d:'Maze chase arcade'},
            ];
            el.style.overflow = 'auto';
            el.innerHTML = '<div style="text-align:center;margin-bottom:12px;font-size:1.1rem;padding-top:4px;">\u{1F3AE} Gaming Hub</div><div class="gaminghub-grid">' + games.map(function(g) { return '<div class="gaminghub-card" data-game="' + g.g + '"><span class="gaminghub-icon">' + g.i + '</span><span class="gaminghub-name">' + g.n + '</span><span class="gaminghub-desc">' + g.d + '</span></div>'; }).join('') + '</div><div style="text-align:center;margin-top:8px;"><button id="hs-btn-' + id + '" style="margin:0;padding:6px 16px;font-size:0.85rem;">\u{1F3C6} High Scores</button></div>';
            el.querySelectorAll('.gaminghub-card').forEach(function(card) {
                card.onclick = function() { toggleWindow(card.dataset.game); };
            });
            document.getElementById('hs-btn-' + id).onclick = function() { toggleWindow('highscores'); };
        }
    },
    fileexplorer: {
        title: '\u{1F4C1} File Explorer',
        icon: '\u{1F4C1}',
        createContent: (el, id) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;';
            const state = _feCreateState(id);
            const toolbar = document.createElement('div');
            toolbar.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 6px;border-bottom:1px solid rgba(51,255,51,0.15);flex-shrink:0;flex-wrap:wrap;';
            const backBtn = _feBtn('\u25C0', 'Back', toolbar);
            const fwdBtn = _feBtn('\u25B6', 'Forward', toolbar);
            const upBtn = _feBtn('\u2B06', 'Up', toolbar);
            toolbar.append(backBtn, fwdBtn, upBtn);
            const sep1 = document.createElement('span');
            sep1.style.cssText = 'width:1px;height:18px;background:rgba(51,255,51,0.2);margin:0 4px;';
            toolbar.appendChild(sep1);
            const addrBar = document.createElement('div');
            addrBar.style.cssText = 'flex:1;display:flex;align-items:center;gap:2px;overflow:hidden;padding:2px 6px;background:rgba(0,0,0,0.2);border:1px solid rgba(51,255,51,0.15);border-radius:3px;min-width:0;';
            toolbar.appendChild(addrBar);
            const sep2 = document.createElement('span');
            sep2.style.cssText = 'width:1px;height:18px;background:rgba(51,255,51,0.2);margin:0 4px;';
            toolbar.appendChild(sep2);
            const nfBtn = _feBtn('\u{1F4C4}', 'New Folder', toolbar);
            const viewBtn = document.createElement('button');
            viewBtn.textContent = '\u{1F5C4}';
            viewBtn.title = 'Change view';
            viewBtn.style.cssText = 'margin:0;padding:2px 6px;font-size:0.75rem;background:rgba(51,255,51,0.05);border:1px solid rgba(51,255,51,0.2);color:#33ff33;border-radius:3px;cursor:pointer;';
            toolbar.appendChild(viewBtn);
            var sep3 = document.createElement('span');
            sep3.style.cssText = 'width:1px;height:18px;background:rgba(51,255,51,0.2);margin:0 4px;';
            toolbar.appendChild(sep3);
            var uploadBtn = _feBtn('\u{1F4C4}', 'Upload file to current folder', toolbar);
            var dlSelectedBtn = _feBtn('\u{1F4E5}', 'Download selected file', toolbar);
            var feFileInput = document.createElement('input');
            feFileInput.type = 'file';
            feFileInput.multiple = true;
            feFileInput.style.display = 'none';
            el.appendChild(feFileInput);
            uploadBtn.onclick = function() { feFileInput.click(); };
            feFileInput.onchange = function() {
                var files = Array.from(this.files);
                var folder = _feGetFolder(state.currentPath);
                if (!folder) { showToast('File Explorer', 'Cannot access current folder', 'error'); return; }
                files.forEach(function(f) {
                    var reader = new FileReader();
                    reader.onload = function(ev) {
                        var data = ev.target.result;
                        var name = f.name;
                        var idx = 1;
                        while (folder.children[name]) {
                            var dot = f.name.lastIndexOf('.');
                            var base = dot >= 0 ? f.name.slice(0, dot) : f.name;
                            var ext = dot >= 0 ? f.name.slice(dot) : '';
                            name = base + ' (' + idx + ')' + ext;
                            idx++;
                        }
                        var isTextFile = /\.(txt|md|js|html|css|json|xml|log|py|rb|sh|bat|ps1|yml|yaml|ini|cfg|c|cpp|h|hpp|java|ts|tsx|jsx|go|rs|swift|kt|env|gitignore|toml|php|pl|lua|r|m|sql|graphql|svelte|vue)$/i.test(f.name);
                        folder.children[name] = { type: 'file', size: data.length || f.size, date: new Date().toLocaleString(), data: data };
                        if (/\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(f.name)) folder.children[name].icon = '\u{1F5BC}';
                        else if (/\.(mp3|wav|flac|ogg)$/i.test(f.name)) folder.children[name].icon = '\u{1F3B5}';
                        else if (/\.(mp4|avi|mkv|mov)$/i.test(f.name)) folder.children[name].icon = '\u{1F3AC}';
                        _feSaveFS();
                        _feRender();
                        showToast('File Explorer', 'Uploaded: ' + name, 'info');
                    };
                    if (/\.(txt|md|js|html|css|json|xml|log|py|rb|sh|bat|ps1)$/i.test(f.name)) reader.readAsText(f);
                    else reader.readAsDataURL(f);
                });
                this.value = '';
            };
            dlSelectedBtn.onclick = function() {
                var selected = fileList.querySelector('.fe-selected-' + id);
                if (!selected) { showToast('File Explorer', 'Select a file first', 'info'); return; }
                var nameEl = selected.querySelector('[data-path]') || selected.querySelector('span:last-child');
                var selName = nameEl ? (nameEl.textContent || nameEl.innerText) : '';
                if (!selName) { showToast('File Explorer', 'Could not identify file', 'error'); return; }
                var folder = _feGetFolder(state.currentPath);
                if (!folder || !folder.children[selName]) { showToast('File Explorer', 'File not found', 'error'); return; }
                var entry = folder.children[selName];
                if (entry.type === 'folder') { showToast('File Explorer', 'Cannot download a folder', 'info'); return; }
                var data = entry.data || '';
                var mime = 'application/octet-stream';
                if (/\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(selName)) mime = 'image/png';
                else if (/\.(txt|md|js|html|css|json|xml|log)$/i.test(selName)) mime = 'text/plain';
                else if (/\.(mp3|wav|ogg)$/i.test(selName)) mime = 'audio/mpeg';
                else if (/\.(mp4|avi|mkv)$/i.test(selName)) mime = 'video/mp4';
                var blob;
                if (data && data.indexOf('data:') === 0) {
                    var parts = data.split(',');
                    var raw = atob(parts[1]);
                    var rawLen = raw.length;
                    var uInt8 = new Uint8Array(rawLen);
                    for (var i = 0; i < rawLen; i++) uInt8[i] = raw.charCodeAt(i);
                    blob = new Blob([uInt8], { type: mime });
                } else {
                    blob = new Blob([data], { type: mime });
                }
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = selName;
                a.click();
                URL.revokeObjectURL(url);
                showToast('File Explorer', 'Downloaded: ' + selName, 'info');
            };
            const mainArea = document.createElement('div');
            mainArea.style.cssText = 'display:flex;flex:1;min-height:0;';
            const sidebar = document.createElement('div');
            sidebar.style.cssText = 'width:150px;border-right:1px solid rgba(51,255,51,0.15);overflow-y:auto;padding:4px 0;flex-shrink:0;font-size:0.75rem;';
            const fileArea = document.createElement('div');
            fileArea.style.cssText = 'flex:1;overflow:auto;position:relative;';
            const fileList = document.createElement('div');
            fileList.style.cssText = 'width:100%;height:100%;';
            fileArea.appendChild(fileList);
            mainArea.append(sidebar, fileArea);
            el.append(toolbar, mainArea);

            function _feRender() {
                const path = state.currentPath;
                const parts = [...path];
                addrBar.innerHTML = '';
                parts.forEach((p, i) => {
                    if (i > 0) {
                        const sep = document.createElement('span');
                        sep.textContent = '\u203A';
                        sep.style.cssText = 'margin:0 2px;opacity:0.5;font-size:0.7rem;';
                        addrBar.appendChild(sep);
                    }
                    const seg = document.createElement('span');
                    seg.textContent = p;
                    seg.style.cssText = 'padding:1px 4px;cursor:pointer;border-radius:2px;font-size:0.7rem;white-space:nowrap;';
                    seg.onmouseenter = function() { this.style.background = 'rgba(51,255,51,0.1)'; };
                    seg.onmouseleave = function() { this.style.background = ''; };
                    seg.onclick = function() {
                        const newPath = parts.slice(0, i + 1);
                        state.history = state.history.slice(0, state.historyIndex + 1);
                        state.history.push(newPath);
                        state.historyIndex = state.history.length - 1;
                        state.currentPath = newPath;
                        _feRender();
                    };
                    addrBar.appendChild(seg);
                });

                const curFolder = _feGetFolder(path);
                backBtn.disabled = state.historyIndex <= 0;
                fwdBtn.disabled = state.historyIndex >= state.history.length - 1;
                upBtn.disabled = path.length <= 1;

                const entries = Object.entries(curFolder.children || {});

                if (state.sortBy === 'name') {
                    entries.sort(function(a, b) {
                        const fa = a[1], fb = b[1];
                        if (fa.type !== fb.type) return fa.type === 'folder' ? -1 : 1;
                        return state.sortAsc ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]);
                    });
                } else if (state.sortBy === 'size') {
                    entries.sort(function(a, b) {
                        const fa = a[1], fb = b[1];
                        if (fa.type !== fb.type) return fa.type === 'folder' ? -1 : 1;
                        const sa = fa.size || 0, sb = fb.size || 0;
                        return state.sortAsc ? sa - sb : sb - sa;
                    });
                } else if (state.sortBy === 'date') {
                    entries.sort(function(a, b) {
                        const fa = a[1], fb = b[1];
                        if (fa.type !== fb.type) return fa.type === 'folder' ? -1 : 1;
                        return state.sortAsc ? (fa.date || '').localeCompare(fb.date || '') : (fb.date || '').localeCompare(fa.date || '');
                    });
                } else if (state.sortBy === 'type') {
                    entries.sort(function(a, b) {
                        const fa = a[1], fb = b[1];
                        if (fa.type !== fb.type) return fa.type === 'folder' ? -1 : 1;
                        const ta = fa.type === 'folder' ? 'Folder' : (a[0].split('.').pop() || '').toUpperCase();
                        const tb = fb.type === 'folder' ? 'Folder' : (b[0].split('.').pop() || '').toUpperCase();
                        return state.sortAsc ? ta.localeCompare(tb) : tb.localeCompare(ta);
                    });
                }

                if (state.viewMode === 'details') {
                    const table = document.createElement('table');
                    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.7rem;';
                    const thead = document.createElement('thead');
                    const hdrRow = document.createElement('tr');
                    const cols = [
                        { key: 'name', label: 'Name', flex: '1' },
                        { key: 'date', label: 'Date', w: '130px' },
                        { key: 'type', label: 'Type', w: '90px' },
                        { key: 'size', label: 'Size', w: '70px' },
                    ];
                    cols.forEach(function(col) {
                        const th = document.createElement('th');
                        th.textContent = col.label;
                        th.style.cssText = 'padding:3px 8px;text-align:left;border-bottom:1px solid rgba(51,255,51,0.2);cursor:pointer;font-weight:bold;white-space:nowrap;';
                        if (col.flex) th.style.width = col.flex;
                        if (col.w) th.style.width = col.w;
                        if (state.sortBy === col.key) {
                            th.textContent += state.sortAsc ? ' \u25B2' : ' \u25BC';
                        }
                        th.onclick = function() {
                            if (state.sortBy === col.key) state.sortAsc = !state.sortAsc;
                            else { state.sortBy = col.key; state.sortAsc = true; }
                            _feRender();
                        };
                        hdrRow.appendChild(th);
                    });
                    thead.appendChild(hdrRow);
                    table.appendChild(thead);
                    const tbody = document.createElement('tbody');
                    entries.forEach(function(_a) {
                        var name = _a[0], entry = _a[1];
                        var tr = document.createElement('tr');
                        tr.style.cssText = 'cursor:pointer;';
                        tr.onmouseenter = function() { this.style.background = 'rgba(51,255,51,0.05)'; };
                        tr.onmouseleave = function() { this.style.background = ''; };
                        var icon = entry.type === 'folder' ? '\u{1F4C1}' : (entry.icon || '\u{1F4C4}');
                        var isImage = /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(name);
                        var isAudio = /\.(mp3|wav|flac|ogg)$/i.test(name);
                        var isVideo = /\.(mp4|avi|mkv|mov)$/i.test(name);
                        var isText = /\.(txt|md|js|html|css|json|xml)$/i.test(name);
                        var fileIcon = entry.type === 'folder' ? '\u{1F4C1}' : isImage ? '\u{1F5BC}' : isAudio ? '\u{1F3B5}' : isVideo ? '\u{1F3AC}' : isText ? '\u{1F4DD}' : '\u{1F4C4}';
                        var ext = entry.type === 'folder' ? 'Folder' : (name.split('.').pop() || '').toUpperCase() + ' File';
                        var sizeStr = entry.size ? _feFormatSize(entry.size) : '';
                        var dateStr = entry.date || '';
                        var renameAttr = state.renameTarget === name ? ' data-rename="1"' : '';
                        tr.innerHTML = '<td style="padding:2px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><span style="margin-right:6px;">' + escapeHtml(fileIcon) + '</span><span class="fe-name-' + id + '" data-path="' + escapeHtml(name) + '"' + renameAttr + '>' + escapeHtml(name) + '</span></td><td style="padding:2px 8px;white-space:nowrap;">' + escapeHtml(dateStr) + '</td><td style="padding:2px 8px;white-space:nowrap;">' + escapeHtml(ext) + '</td><td style="padding:2px 8px;text-align:right;white-space:nowrap;">' + escapeHtml(sizeStr) + '</td>';
                        _feAttachRowEvents(tr, name, entry, path, state, id, fileList);
                        tbody.appendChild(tr);
                    });
                    table.appendChild(tbody);
                    fileList.innerHTML = '';
                    fileList.appendChild(table);
                } else if (state.viewMode === 'list') {
                    fileList.innerHTML = '';
                    var list = document.createElement('div');
                    list.style.cssText = 'display:flex;flex-direction:column;font-size:0.75rem;';
                    entries.forEach(function(_a) {
                        var name = _a[0], entry = _a[1];
                        var row = document.createElement('div');
                        row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:3px 8px;cursor:pointer;';
                        row.onmouseenter = function() { this.style.background = 'rgba(51,255,51,0.05)'; };
                        row.onmouseleave = function() { this.style.background = ''; };
                        var icon = entry.type === 'folder' ? '\u{1F4C1}' : '\u{1F4C4}';
                        row.innerHTML = '<span style="font-size:1rem;">' + icon + '</span><span>' + name + '</span>';
                        _feAttachRowEvents(row, name, entry, path, state, id, fileList);
                        list.appendChild(row);
                    });
                    fileList.appendChild(list);
                } else if (state.viewMode === 'largeicons') {
                    fileList.innerHTML = '';
                    var grid2 = document.createElement('div');
                    grid2.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:8px;align-content:flex-start;';
                    entries.forEach(function(_a) {
                        var name = _a[0], entry = _a[1];
                        var card = document.createElement('div');
                        card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 6px;cursor:pointer;border:1px solid transparent;border-radius:4px;width:70px;text-align:center;';
                        card.onmouseenter = function() { this.style.borderColor = 'rgba(51,255,51,0.3)'; this.style.background = 'rgba(51,255,51,0.05)'; };
                        card.onmouseleave = function() { this.style.borderColor = 'transparent'; this.style.background = ''; };
                        var icon = entry.type === 'folder' ? '\u{1F4C1}' : '\u{1F4C4}';
                        card.innerHTML = '<span style="font-size:1.8rem;line-height:1;">' + icon + '</span><span style="font-size:0.65rem;word-break:break-word;line-height:1.2;">' + name + '</span>';
                        _feAttachRowEvents(card, name, entry, path, state, id, fileList);
                        grid2.appendChild(card);
                    });
                    fileList.appendChild(grid2);
                } else if (state.viewMode === 'tiles') {
                    fileList.innerHTML = '';
                    var grid3 = document.createElement('div');
                    grid3.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:4px;padding:6px;';
                    entries.forEach(function(_a) {
                        var name = _a[0], entry = _a[1];
                        var tile = document.createElement('div');
                        tile.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px;cursor:pointer;border:1px solid transparent;border-radius:4px;';
                        tile.onmouseenter = function() { this.style.borderColor = 'rgba(51,255,51,0.3)'; this.style.background = 'rgba(51,255,51,0.05)'; };
                        tile.onmouseleave = function() { this.style.borderColor = 'transparent'; this.style.background = ''; };
                        var icon = entry.type === 'folder' ? '\u{1F4C1}' : '\u{1F4C4}';
                        tile.innerHTML = '<span style="font-size:1.5rem;">' + icon + '</span><span style="font-size:0.7rem;">' + name + '</span>';
                        _feAttachRowEvents(tile, name, entry, path, state, id, fileList);
                        grid3.appendChild(tile);
                    });
                    fileList.appendChild(grid3);
                }

                // Right-click on empty space → New, Paste
                fileArea.oncontextmenu = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (state.currentPath.length <= 1) {
                        showToast('File Explorer', 'Cannot create items here. Navigate into a folder first.', 'info');
                        return;
                    }
                    var m = document.createElement('div');
                    m.style.cssText = 'position:fixed;z-index:100001;background:#0a1931;border:2px solid #33ff33;border-radius:4px;box-shadow:0 4px 20px rgba(51,255,51,0.3);min-width:160px;padding:4px 0;font-size:0.75rem;';
                    var items2 = [];
                    items2.push({ label: 'New Folder', icon: '\u{1F4C1}', action: 'new-folder' });
                    items2.push({ label: 'New Text Document (.txt)', icon: '\u{1F4DD}', action: 'new-txt' });
                    items2.push({ label: 'New JavaScript (.js)', icon: '\u{1F4DD}', action: 'new-js' });
                    items2.push({ label: 'New HTML (.html)', icon: '\u{1F4DD}', action: 'new-html' });
                    items2.push({ label: 'New CSS (.css)', icon: '\u{1F4DD}', action: 'new-css' });
                    items2.push({ label: 'New JSON (.json)', icon: '\u{1F4DD}', action: 'new-json' });
                    items2.push({ label: 'New Markdown (.md)', icon: '\u{1F4DD}', action: 'new-md' });
                    items2.push({ label: 'New Python (.py)', icon: '\u{1F40D}', action: 'new-py' });
                    items2.push({ label: 'New C (.c)', icon: '\u{1F4DD}', action: 'new-c' });
                    items2.push({ label: 'New C++ (.cpp)', icon: '\u{1F4DD}', action: 'new-cpp' });
                    items2.push({ label: 'New TypeScript (.ts)', icon: '\u{1F4DD}', action: 'new-ts' });
                    items2.push({ label: 'New Java (.java)', icon: '\u{1F4DD}', action: 'new-java' });
                    items2.push({ label: 'New Go (.go)', icon: '\u{1F4DD}', action: 'new-go' });
                    items2.push({ label: 'New Rust (.rs)', icon: '\u{1F4DD}', action: 'new-rs' });
                    items2.push({ label: 'New Env (.env)', icon: '\u{1F4DD}', action: 'new-env' });
                    items2.push(null);
                    items2.push({ label: 'Paste', icon: '\u{1F4CE}', action: 'paste' });
                    items2.forEach(function(i) {
                        if (i === null) { var s = document.createElement('div'); s.style.cssText = 'height:1px;background:rgba(51,255,51,0.2);margin:4px 8px;'; m.appendChild(s); return; }
                        var mi = document.createElement('div');
                        mi.innerHTML = '<span style="margin-right:8px;">' + i.icon + '</span>' + i.label;
                        mi.style.cssText = 'padding:5px 14px;cursor:pointer;color:#33ff33;';
                        mi.onmouseenter = function() { this.style.background = 'rgba(51,255,51,0.15)'; };
                        mi.onmouseleave = function() { this.style.background = ''; };
                        mi.onclick = function() {
                            m.remove();
                            if (i.action === 'new-folder') {
                                var folder = _feGetFolder(state.currentPath);
                                var idx = 1;
                                while (folder.children['New Folder' + (idx > 1 ? ' (' + idx + ')' : '')]) idx++;
                                var n = 'New Folder' + (idx > 1 ? ' (' + idx + ')' : '');
                                folder.children[n] = { type: 'folder', children: {} };
                                _feSaveFS();
                                _feRender();
                                showToast('File Explorer', 'Created ' + n, 'info');
                            } else if (i.action === 'new-txt') {
                                var folder2 = _feGetFolder(state.currentPath);
                                var idx2 = 1;
                                while (folder2.children['New Text Document' + (idx2 > 1 ? ' (' + idx2 + ')' : '') + '.txt']) idx2++;
                                var n2 = 'New Text Document' + (idx2 > 1 ? ' (' + idx2 + ')' : '') + '.txt';
                                folder2.children[n2] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: '' };
                                _feSaveFS();
                                _feRender();
                                showToast('File Explorer', 'Created ' + n2, 'info');
                            } else if (i.action === 'new-js') {
                                var f3 = _feGetFolder(state.currentPath);
                                var n3 = 'script.js';
                                var c3 = 1;
                                while (f3.children[n3]) { c3++; n3 = 'script (' + c3 + ').js'; }
                                f3.children[n3] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: '// JavaScript file\n' };
                                _feSaveFS(); _feRender(); showToast('File Explorer', 'Created ' + n3, 'info');
                            } else if (i.action === 'new-html') {
                                var f4 = _feGetFolder(state.currentPath);
                                var n4 = 'index.html';
                                var c4 = 1;
                                while (f4.children[n4]) { c4++; n4 = 'index (' + c4 + ').html'; }
                                f4.children[n4] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: '<!DOCTYPE html>\n<html>\n<head><title>Page</title></head>\n<body>\n\n</body>\n</html>\n' };
                                _feSaveFS(); _feRender(); showToast('File Explorer', 'Created ' + n4, 'info');
                            } else if (i.action === 'new-css') {
                                var f5 = _feGetFolder(state.currentPath);
                                var n5 = 'style.css';
                                var c5 = 1;
                                while (f5.children[n5]) { c5++; n5 = 'style (' + c5 + ').css'; }
                                f5.children[n5] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: '/* CSS file */\n' };
                                _feSaveFS(); _feRender(); showToast('File Explorer', 'Created ' + n5, 'info');
                            } else if (i.action === 'new-json') {
                                var f6 = _feGetFolder(state.currentPath);
                                var n6 = 'data.json';
                                var c6 = 1;
                                while (f6.children[n6]) { c6++; n6 = 'data (' + c6 + ').json'; }
                                f6.children[n6] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: '{\n  \n}\n' };
                                _feSaveFS(); _feRender(); showToast('File Explorer', 'Created ' + n6, 'info');
                            } else if (i.action === 'new-md') {
                                var f7 = _feGetFolder(state.currentPath);
                                var n7 = 'README.md';
                                var c7 = 1;
                                while (f7.children[n7]) { c7++; n7 = 'README (' + c7 + ').md'; }
                                f7.children[n7] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: '# Title\n\nDescription\n' };
                                _feSaveFS(); _feRender(); showToast('File Explorer', 'Created ' + n7, 'info');
                            } else if (i.action === 'new-py') {
                                var fpy = _feGetFolder(state.currentPath);
                                var npy = 'main.py';
                                var cpy = 1;
                                while (fpy.children[npy]) { cpy++; npy = 'main (' + cpy + ').py'; }
                                fpy.children[npy] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: '#!/usr/bin/env python3\n\ndef main():\n    pass\n\nif __name__ == "__main__":\n    main()\n' };
                                _feSaveFS(); _feRender(); showToast('File Explorer', 'Created ' + npy, 'info');
                            } else if (i.action === 'new-c') {
                                var fc = _feGetFolder(state.currentPath);
                                var nc = 'main.c';
                                var cc = 1;
                                while (fc.children[nc]) { cc++; nc = 'main (' + cc + ').c'; }
                                fc.children[nc] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}\n' };
                                _feSaveFS(); _feRender(); showToast('File Explorer', 'Created ' + nc, 'info');
                            } else if (i.action === 'new-cpp') {
                                var fcpp = _feGetFolder(state.currentPath);
                                var ncpp = 'main.cpp';
                                var ccpp = 1;
                                while (fcpp.children[ncpp]) { ccpp++; ncpp = 'main (' + ccpp + ').cpp'; }
                                fcpp.children[ncpp] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}\n' };
                                _feSaveFS(); _feRender(); showToast('File Explorer', 'Created ' + ncpp, 'info');
                            } else if (i.action === 'new-ts') {
                                var fts = _feGetFolder(state.currentPath);
                                var nts = 'index.ts';
                                var cts = 1;
                                while (fts.children[nts]) { cts++; nts = 'index (' + cts + ').ts'; }
                                fts.children[nts] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: 'function greet(name: string): void {\n  console.log(`Hello, ${name}!`);\n}\n\ngreet("World");\n' };
                                _feSaveFS(); _feRender(); showToast('File Explorer', 'Created ' + nts, 'info');
                            } else if (i.action === 'new-java') {
                                var fjava = _feGetFolder(state.currentPath);
                                var njava = 'Main.java';
                                var cjava = 1;
                                while (fjava.children[njava]) { cjava++; njava = 'Main (' + cjava + ').java'; }
                                fjava.children[njava] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n' };
                                _feSaveFS(); _feRender(); showToast('File Explorer', 'Created ' + njava, 'info');
                            } else if (i.action === 'new-go') {
                                var fgo = _feGetFolder(state.currentPath);
                                var ngo = 'main.go';
                                var cgo = 1;
                                while (fgo.children[ngo]) { cgo++; ngo = 'main (' + cgo + ').go'; }
                                fgo.children[ngo] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}\n' };
                                _feSaveFS(); _feRender(); showToast('File Explorer', 'Created ' + ngo, 'info');
                            } else if (i.action === 'new-rs') {
                                var frs = _feGetFolder(state.currentPath);
                                var nrs = 'main.rs';
                                var crs = 1;
                                while (frs.children[nrs]) { crs++; nrs = 'main (' + crs + ').rs'; }
                                frs.children[nrs] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: 'fn main() {\n    println!("Hello, World!");\n}\n' };
                                _feSaveFS(); _feRender(); showToast('File Explorer', 'Created ' + nrs, 'info');
                            } else if (i.action === 'new-env') {
                                var fenv = _feGetFolder(state.currentPath);
                                var nenv = '.env';
                                var cenv = 1;
                                while (fenv.children[nenv]) { cenv++; nenv = '.env (' + cenv + ')'; }
                                fenv.children[nenv] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: '# Environment Variables\nAPI_KEY=\nDB_HOST=localhost\nDB_PORT=5432\n' };
                                _feSaveFS(); _feRender(); showToast('File Explorer', 'Created ' + nenv, 'info');
                            } else if (i.action === 'paste') {
                                if (state.clipboard) {
                                    var targetF = _feGetFolder(state.currentPath);
                                    if (targetF) {
                                        if (state.clipboard.action === 'cut') {
                                            var srcF = _feGetFolder(state.clipboard.path);
                                            if (srcF && srcF.children[state.clipboard.name]) {
                                                delete srcF.children[state.clipboard.name];
                                                targetF.children[state.clipboard.name] = state.clipboard.entry;
                                            }
                                        } else {
                                            targetF.children[state.clipboard.name] = JSON.parse(JSON.stringify(state.clipboard.entry));
                                        }
                                        _feSaveFS();
                                    }
                                    state.clipboard = null;
                                    _feRender();
                                }
                            }
                        };
                        if (i.action === 'paste' && !state.clipboard) { mi.style.opacity = '0.3'; mi.onclick = function() { m.remove(); }; }
                        m.appendChild(mi);
                    });
                    positionMenu(m, e.clientX, e.clientY);
                    document.body.appendChild(m);
                    function cmClose(ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', cmClose); } }
                    setTimeout(function() { document.addEventListener('click', cmClose); }, 10);
                };

                // Drop target for drag & drop
                fileList.ondragover = function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
                fileList.ondrop = function(e) {
                    e.preventDefault();
                    try {
                        var data = JSON.parse(e.dataTransfer.getData('text/plain'));
                        if (data && data.name && data.path) {
                            var srcFolder = _feGetFolder(data.path);
                            var dstFolder = _feGetFolder(state.currentPath);
                            if (srcFolder && dstFolder && srcFolder !== dstFolder && srcFolder.children[data.name]) {
                                dstFolder.children[data.name] = srcFolder.children[data.name];
                                delete srcFolder.children[data.name];
                                _feSaveFS();
                                _feRender();
                            }
                        }
                    } catch(ex) {}
                };

                _feRenderSidebar(sidebar, state, id);
            }

            backBtn.onclick = function() {
                if (state.historyIndex > 0) {
                    state.historyIndex--;
                    state.currentPath = state.history[state.historyIndex];
                    _feRender();
                }
            };
            fwdBtn.onclick = function() {
                if (state.historyIndex < state.history.length - 1) {
                    state.historyIndex++;
                    state.currentPath = state.history[state.historyIndex];
                    _feRender();
                }
            };
            upBtn.onclick = function() {
                if (state.currentPath.length > 1) {
                    const newPath = state.currentPath.slice(0, -1);
                    state.history = state.history.slice(0, state.historyIndex + 1);
                    state.history.push(newPath);
                    state.historyIndex = state.history.length - 1;
                    state.currentPath = newPath;
                    _feRender();
                }
            };
            nfBtn.onclick = function() {
                const folder = _feGetFolder(state.currentPath);
                let idx = 1;
                while (folder.children['New Folder' + (idx > 1 ? ' (' + idx + ')' : '')]) idx++;
                const name = 'New Folder' + (idx > 1 ? ' (' + idx + ')' : '');
                folder.children[name] = { type: 'folder', children: {} };
                _feSaveFS();
                _feRender();
                showToast('File Explorer', 'Created ' + name, 'info');
            };
            viewBtn.onclick = function() {
                const modes = ['details', 'list', 'largeicons', 'tiles'];
                const ci = modes.indexOf(state.viewMode);
                state.viewMode = modes[(ci + 1) % modes.length];
                _feRender();
            };

            state._render = _feRender;
            cleanups[id] = function() { delete _feStates[id]; };
            _feRender();
        }
    },
    recyclebin: {
        title: '\u{1F5D1} Recycle Bin',
        icon: '\u{1F5D1}',
        createContent: (el, id) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;';
            var header = document.createElement('div');
            header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid rgba(51,255,51,0.15);flex-shrink:0;font-size:0.75rem;';
            header.innerHTML = '<span style="font-size:1.2rem;">\u{1F5D1}</span><span style="flex:1;">Recycle Bin</span>';
            var emptyBtn = document.createElement('button');
            emptyBtn.textContent = '\u{1F9F1} Empty Recycle Bin';
            emptyBtn.style.cssText = 'margin:0;padding:3px 10px;font-size:0.7rem;background:rgba(255,50,50,0.15);border:1px solid rgba(255,50,50,0.3);color:#ff6666;border-radius:3px;cursor:pointer;';
            if (_recycleBin.items.length === 0) emptyBtn.disabled = true;
            header.appendChild(emptyBtn);
            var restoreBtn = document.createElement('button');
            restoreBtn.textContent = '\u{1F504} Restore All';
            restoreBtn.style.cssText = 'margin:0;padding:3px 10px;font-size:0.7rem;background:rgba(51,255,51,0.1);border:1px solid rgba(51,255,51,0.2);color:#33ff33;border-radius:3px;cursor:pointer;';
            if (_recycleBin.items.length === 0) restoreBtn.disabled = true;
            header.appendChild(restoreBtn);
            var body = document.createElement('div');
            body.style.cssText = 'flex:1;overflow:auto;';
            el.append(header, body);
            function render() {
                if (_recycleBin.items.length === 0) {
                    body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;opacity:0.4;gap:8px;"><span style="font-size:2rem;">\u{1F5D1}</span><span style="font-size:0.8rem;">The Recycle Bin is empty</span></div>';
                    emptyBtn.disabled = true;
                    restoreBtn.disabled = true;
                    return;
                }
                emptyBtn.disabled = false;
                restoreBtn.disabled = false;
                var table = document.createElement('table');
                table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.7rem;';
                var thead = document.createElement('thead');
                var hdr = document.createElement('tr');
                ['Name', 'Original Location', 'Date Deleted', 'Size'].forEach(function(l) {
                    var th = document.createElement('th');
                    th.textContent = l;
                    th.style.cssText = 'padding:3px 8px;text-align:left;border-bottom:1px solid rgba(51,255,51,0.2);font-weight:bold;';
                    hdr.appendChild(th);
                });
                thead.appendChild(hdr);
                table.appendChild(thead);
                var tbody = document.createElement('tbody');
                _recycleBin.items.forEach(function(item, idx) {
                    var tr = document.createElement('tr');
                    tr.style.cssText = 'cursor:pointer;';
                    tr.onmouseenter = function() { this.style.background = 'rgba(51,255,51,0.05)'; };
                    tr.onmouseleave = function() { this.style.background = ''; };
                    tr.innerHTML = '<td style="padding:2px 8px;">' + (item.type === 'folder' ? '\u{1F4C1}' : '\u{1F4C4}') + ' ' + item.name + '</td><td style="padding:2px 8px;">' + item.origPath + '</td><td style="padding:2px 8px;">' + item.dateDeleted + '</td><td style="padding:2px 8px;">' + (item.size ? _feFormatSize(item.size) : '') + '</td>';
                    tr.oncontextmenu = function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        var rm = document.createElement('div');
                        rm.style.cssText = 'position:fixed;z-index:100001;background:#0a1931;border:2px solid #33ff33;border-radius:4px;box-shadow:0 4px 20px rgba(51,255,51,0.3);min-width:150px;padding:4px 0;font-size:0.75rem;';
                        rm.innerHTML = '<div class="cm-item" data-rb-action="restore" style="padding:5px 14px;cursor:pointer;color:#33ff33;">\u{1F504} Restore</div><div class="cm-item" data-rb-action="delete" style="padding:5px 14px;cursor:pointer;color:#ff6666;">\u{2716} Delete permanently</div>';
                        positionMenu(rm, e.clientX, e.clientY);
                        document.body.appendChild(rm);
                        rm.querySelectorAll('[data-rb-action]').forEach(function(el) {
                            el.onmouseenter = function() { this.style.background = 'rgba(51,255,51,0.15)'; };
                            el.onmouseleave = function() { this.style.background = ''; };
                            el.onclick = function() {
                                rm.remove();
                                var action2 = el.dataset.rbAction;
                                if (action2 === 'restore') {
                                    var target = _feGetFolder(item.origArr);
                                    if (target) target.children[item.name] = item.entry;
                                    _recycleBin.items.splice(idx, 1);
                                    _feSaveFS();
                                    _updateRecycleBinIcon();
                                    render();
                                    showToast('Recycle Bin', item.name + ' restored', 'info');
                                } else if (action2 === 'delete') {
                                    _recycleBin.items.splice(idx, 1);
                                    _feSaveFS();
                                    _updateRecycleBinIcon();
                                    render();
                                    showToast('Recycle Bin', item.name + ' permanently deleted', 'info');
                                }
                            };
                        });
                        function rmClose(ev) { if (!rm.contains(ev.target)) { rm.remove(); document.removeEventListener('click', rmClose); } }
                        setTimeout(function() { document.addEventListener('click', rmClose); }, 10);
                    };
                    tbody.appendChild(tr);
                });
                table.appendChild(tbody);
                body.innerHTML = '';
                body.appendChild(table);
            }
            emptyBtn.onclick = function() {
                _recycleBin.items = [];
                _saveRecycleBin();
                _feSaveFS();
                _updateRecycleBinIcon();
                render();
                showToast('Recycle Bin', 'Recycle Bin emptied', 'info');
            };
            restoreBtn.onclick = function() {
                _recycleBin.items.forEach(function(item) {
                    const target = _feGetFolder(item.origArr);
                    if (target) target.children[item.name] = item.entry;
                });
                _recycleBin.items = [];
                _saveRecycleBin();
                _feSaveFS();
                _updateRecycleBinIcon();
                render();
                showToast('Recycle Bin', 'All items restored', 'info');
            };
            render();
        }
    },
    brave: {
        title: '\u{1F981} Brave Browser',
        icon: '\u{1F981}',
        createContent: (el, id) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;';
            let history = ['https://search.brave.com'];
            let historyIdx = 0;
            let currentUrl = 'https://search.brave.com';
            const toolbar = document.createElement('div');
            toolbar.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px 8px;border-bottom:1px solid rgba(255,100,0,0.2);flex-shrink:0;flex-wrap:wrap;background:linear-gradient(135deg,rgba(255,100,0,0.08),rgba(100,0,255,0.08));';
            const backBtn = document.createElement('button');
            backBtn.textContent = '\u25C0'; backBtn.title = 'Back';
            backBtn.style.cssText = 'margin:0;padding:2px 6px;font-size:0.7rem;background:rgba(255,100,0,0.1);border:1px solid rgba(255,100,0,0.3);color:#ff6600;border-radius:3px;cursor:pointer;';
            const fwdBtn = document.createElement('button');
            fwdBtn.textContent = '\u25B6'; fwdBtn.title = 'Forward';
            fwdBtn.style.cssText = backBtn.style.cssText;
            const refBtn = document.createElement('button');
            refBtn.textContent = '\u{1F504}'; refBtn.title = 'Refresh';
            refBtn.style.cssText = backBtn.style.cssText;
            const homeBtn = document.createElement('button');
            homeBtn.textContent = '\u{1F3E0}'; homeBtn.title = 'Home';
            homeBtn.style.cssText = backBtn.style.cssText;
            const addrBar = document.createElement('div');
            addrBar.style.cssText = 'flex:1;display:flex;align-items:center;background:rgba(0,0,0,0.3);border:1px solid rgba(255,100,0,0.2);border-radius:14px;padding:2px 10px;gap:4px;min-width:0;';
            const lockIcon = document.createElement('span');
            lockIcon.textContent = '\u{1F512}';
            lockIcon.style.cssText = 'font-size:0.6rem;opacity:0.5;color:#ff6600;';
            const urlInput = document.createElement('input');
            urlInput.type = 'text';
            urlInput.value = currentUrl;
            urlInput.style.cssText = 'flex:1;background:transparent;border:none;color:#ff6600;font-family:monospace;font-size:0.75rem;outline:none;';
            urlInput.spellcheck = false;
            addrBar.append(lockIcon, urlInput);
            const goBtn = document.createElement('button');
            goBtn.textContent = '\u{1F50D}'; goBtn.title = 'Go';
            goBtn.style.cssText = 'margin:0;padding:2px 8px;font-size:0.7rem;background:linear-gradient(135deg,#ff6600,#9900ff);border:none;color:#fff;border-radius:3px;cursor:pointer;';
            const extBtn = document.createElement('button');
            extBtn.textContent = '\u{1F517}'; extBtn.title = 'Open in external browser';
            extBtn.style.cssText = 'margin:0;padding:2px 8px;font-size:0.7rem;background:rgba(0,150,255,0.15);border:1px solid rgba(0,150,255,0.3);color:#0099ff;border-radius:3px;cursor:pointer;';
            toolbar.append(backBtn, fwdBtn, refBtn, homeBtn, addrBar, goBtn, extBtn);
            const noiframeMsg = document.createElement('div');
            noiframeMsg.style.cssText = 'display:none;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:20px;text-align:center;gap:12px;background:#f8f8f8;color:#333;font-family:sans-serif;';
            noiframeMsg.innerHTML = '<div style="font-size:3rem;">\u{26A0}\uFE0F</div><div style="font-size:1.1rem;font-weight:bold;">This website cannot be displayed in an iframe</div><div style="font-size:0.85rem;color:#666;max-width:400px;">Most websites block embedding due to security policies (X-Frame-Options / CSP). Open it in your external browser instead.</div><button id="ext-open-btn-' + id + '" style="padding:10px 24px;font-size:1rem;background:#0099ff;color:#fff;border:none;border-radius:6px;cursor:pointer;">\u{1F517} Open in Browser</button>';
            const frame = document.createElement('iframe');
            frame.style.cssText = 'flex:1;width:100%;border:none;background:#fff;';
            frame.src = currentUrl;
            const statusBar = document.createElement('div');
            statusBar.style.cssText = 'padding:2px 8px;font-size:0.65rem;opacity:0.5;border-top:1px solid rgba(255,100,0,0.1);flex-shrink:0;color:#ff6600;display:flex;justify-content:space-between;align-items:center;';
            statusBar.innerHTML = '<span>Ready</span>';
            el.append(toolbar, noiframeMsg, frame, statusBar);
            let navFailed = false;
            function navigate(url, isHistoryNav) {
                let u = url.trim();
                if (!u) return;
                if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'https://' + u;
                if (u !== currentUrl && !isHistoryNav) {
                    history = history.slice(0, historyIdx + 1);
                    history.push(u);
                    historyIdx = history.length - 1;
                }
                currentUrl = u;
                urlInput.value = u;
                navFailed = false;
                noiframeMsg.style.display = 'none';
                frame.style.display = 'flex';
                frame.src = u;
                statusBar.innerHTML = '<span>Loading ' + u + '...</span>';
                backBtn.style.opacity = historyIdx > 0 ? '1' : '0.3';
                fwdBtn.style.opacity = historyIdx < history.length - 1 ? '1' : '0.3';
                lockIcon.textContent = u.startsWith('https') ? '\u{1F512}' : '\u{1F513}';
            }
            frame.onload = function() {
                if (navFailed) return;
                statusBar.innerHTML = '<span>Done - ' + currentUrl + '</span><span style="cursor:pointer;color:#0099ff;" title="Open in external browser">\u{1F517}</span>';
                statusBar.querySelector('span:last-child')?.addEventListener('click', function() { window.open(currentUrl, '_blank'); });
            };
            frame.onerror = function() {
                navFailed = true;
                frame.style.display = 'none';
                noiframeMsg.style.display = 'flex';
                noiframeMsg.querySelector('button').onclick = function() { window.open(currentUrl, '_blank'); };
                statusBar.innerHTML = '<span style="color:#ff6666;">Blocked by site security policy</span><span style="cursor:pointer;color:#0099ff;" title="Open in external browser">\u{1F517} Open externally</span>';
            };
            backBtn.onclick = function() { if (historyIdx > 0) { historyIdx--; navigate(history[historyIdx], true); } };
            fwdBtn.onclick = function() { if (historyIdx < history.length - 1) { historyIdx++; navigate(history[historyIdx], true); } };
            refBtn.onclick = function() { navigate(currentUrl); };
            homeBtn.onclick = function() { navigate('https://search.brave.com'); };
            goBtn.onclick = function() { navigate(urlInput.value); };
            extBtn.onclick = function() { window.open(currentUrl, '_blank'); };
            urlInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); navigate(this.value); } });
            urlInput.addEventListener('focus', function() { this.select(); });
            const bookmarksBar = document.createElement('div');
            bookmarksBar.style.cssText = 'display:flex;align-items:center;gap:2px;padding:2px 6px;border-bottom:1px solid rgba(255,100,0,0.1);flex-shrink:0;overflow:hidden;';
            const bookmarks = [
                {n:'Brave Search', u:'https://search.brave.com', i:'\u{1F981}'},
                {n:'Wikipedia', u:'https://en.wikipedia.org', i:'\u{1F4D6}'},
                {n:'YouTube', u:'https://youtube.com', i:'\u{1F3AC}'},
                {n:'GitHub', u:'https://github.com', i:'\u{1F4BB}'},
                {n:'Reddit', u:'https://reddit.com', i:'\u{1F4AC}'},
            ];
            bookmarks.forEach(b => {
                const btn = document.createElement('button');
                btn.style.cssText = 'margin:0;padding:2px 6px;font-size:0.65rem;background:transparent;border:1px solid transparent;color:rgba(255,100,0,0.7);border-radius:3px;cursor:pointer;white-space:nowrap;';
                btn.textContent = b.i + ' ' + b.n;
                btn.onmouseenter = function() { this.style.borderColor = 'rgba(255,100,0,0.3)'; this.style.background = 'rgba(255,100,0,0.08)'; };
                btn.onmouseleave = function() { this.style.borderColor = 'transparent'; this.style.background = 'transparent'; };
                btn.onclick = function() { navigate(b.u); };
                bookmarksBar.appendChild(btn);
            });
            el.insertBefore(bookmarksBar, noiframeMsg);
        }
    },
    terminal: {
        title: '\u{1F5A5} Terminal',
        icon: '\u{1F5A5}',
        createContent: (el) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;background:#000;';
            const output = document.createElement('div');
            output.style.cssText = 'flex:1;overflow-y:auto;padding:8px;font-family:Consolas,monospace;font-size:0.8rem;color:#33ff33;white-space:pre-wrap;';
            output.id = 'terminal-output';
            output.innerHTML = '<span style="color:#88cc88;">Cyber OS Terminal v1.0</span>\nType "help" for commands.\n';
            const inputRow = document.createElement('div');
            inputRow.style.cssText = 'display:flex;align-items:center;padding:4px 8px;border-top:1px solid rgba(51,255,51,0.2);background:rgba(0,0,0,0.5);';
            const prompt = document.createElement('span');
            prompt.textContent = 'C:\\>';
            prompt.style.cssText = 'color:#88ff88;margin-right:4px;font-family:Consolas,monospace;font-size:0.8rem;';
            const cmdInput = document.createElement('input');
            cmdInput.type = 'text';
            cmdInput.style.cssText = 'flex:1;background:transparent;border:none;color:#33ff33;font-family:Consolas,monospace;font-size:0.8rem;outline:none;';
            inputRow.append(prompt, cmdInput);
            el.append(output, inputRow);
            const commands = {
                help: 'Available commands: help, echo, dir, date, time, ver, calc, notepad, cls, clear, whoami, hostname, ping',
                ver: 'Cyber OS v2.0 (Build 2024)',
                whoami: currentUser || 'Unknown User',
                hostname: 'CYBER-PC',
                dir: 'Volume in drive C has no label\n Directory of C:\\\n\n...',
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString(),
                cls: '',
                clear: '',
            };
            cmdInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    const cmd = this.value.trim();
                    const cmdLine = document.createElement('div');
                    cmdLine.innerHTML = '<span style="color:#88ff88;">C:\\></span>' + this.value;
                    output.appendChild(cmdLine);
                    this.value = '';
                    if (cmd === '' || cmd === 'cls' || cmd === 'clear') {
                        output.innerHTML = '<span style="color:#88cc88;">Cyber OS Terminal v1.0</span>\n';
                        return;
                    }
                    if (cmd.startsWith('echo ')) {
                        const result = document.createElement('div');
                        result.textContent = cmd.slice(5);
                        output.appendChild(result);
                    } else if (cmd.startsWith('ping ')) {
                        const result = document.createElement('div');
                        result.textContent = 'Pinging ' + cmd.slice(5) + '...\nReply from 192.168.1.1: bytes=32 time<1ms TTL=64';
                        output.appendChild(result);
                    } else if (cmd === 'calc') {
                        toggleWindow('calc');
                        const r = document.createElement('div'); r.textContent = 'Opening Calculator...'; output.appendChild(r);
                    } else if (cmd === 'notepad') {
                        toggleWindow('notes');
                        const r = document.createElement('div'); r.textContent = 'Opening Notepad...'; output.appendChild(r);
                    } else if (commands[cmd] !== undefined) {
                        const result = document.createElement('div');
                        result.textContent = commands[cmd];
                        if (cmd === 'cls' || cmd === 'clear') return;
                        output.appendChild(result);
                    } else {
                        const result = document.createElement('div');
                        result.textContent = '\'' + cmd + '\' is not recognized as an internal or external command.';
                        result.style.color = '#ff6666';
                        output.appendChild(result);
                    }
                    output.scrollTop = output.scrollHeight;
                }
            });
            cmdInput.focus();
        }
    },
    powershell: {
        title: '\u{1FA9F} PowerShell',
        icon: '\u{1FA9F}',
        createContent: (el, id) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;background:#012456;';
            const output = document.createElement('div');
            output.style.cssText = 'flex:1;overflow-y:auto;padding:8px;font-family:Consolas,monospace;font-size:0.8rem;color:#e0e0e0;white-space:pre-wrap;background:#012456;';
            output.innerHTML = '<span style="color:#569cd6;">Windows PowerShell</span>\n<span style="color:#888;">Copyright (C) Microsoft Corporation. All rights reserved.</span>\n\n';
            const inputRow = document.createElement('div');
            inputRow.style.cssText = 'display:flex;align-items:center;padding:4px 8px;border-top:1px solid rgba(255,255,255,0.1);background:rgba(0,0,0,0.3);';
            const prompt = document.createElement('span');
            prompt.style.cssText = 'color:#569cd6;margin-right:4px;font-family:Consolas,monospace;font-size:0.8rem;white-space:pre;';
            const cmdInput = document.createElement('input');
            cmdInput.type = 'text';
            cmdInput.style.cssText = 'flex:1;background:transparent;border:none;color:#e0e0e0;font-family:Consolas,monospace;font-size:0.8rem;outline:none;';
            inputRow.append(prompt, cmdInput);
            el.append(output, inputRow);
            var psState = { currentPath: ['This PC'], cmdHistory: [], histIdx: -1 };
            function psPromptStr() {
                var p = psState.currentPath;
                if (p.length === 1) return 'PS C:\\>';
                return 'PS C:\\' + p.slice(1).join('\\') + '>';
            }
            function psUpdate() { prompt.textContent = psPromptStr(); }
            psUpdate();
            function psPrint(t) { var d = document.createElement('div'); d.textContent = t; output.appendChild(d); output.scrollTop = output.scrollHeight; }
            function psPrintH(h) { var d = document.createElement('div'); d.innerHTML = h; output.appendChild(d); output.scrollTop = output.scrollHeight; }
            function psGetFolder() { return _feGetFolder(psState.currentPath); }
            function psResolvePath(p) {
                if (!p || p === '.' || p === '.\\') return psState.currentPath.slice();
                if (p.startsWith('C:\\') || p.startsWith('c:\\')) {
                    var parts = p.replace(/^[cC]:\\/, '').split('\\').filter(Boolean);
                    return ['This PC'].concat(parts);
                }
                if (p === '..' || p === '..\\') return psState.currentPath.length > 1 ? psState.currentPath.slice(0, -1) : psState.currentPath.slice();
                if (p === '~') return ['This PC', 'Desktop'];
                return psState.currentPath.concat(p.split('\\').filter(Boolean));
            }
            function psFormatSize(bytes) { return _feFormatSize(bytes) || '0 B'; }
            function psFormatDate(d) { return d || ''; }
            cmdInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    var cmd = this.value.trim();
                    psPrintH('<span style="color:#569cd6;">' + psPromptStr() + '</span>' + cmd);
                    this.value = '';
                    if (cmd) { psState.cmdHistory.push(cmd); psState.histIdx = psState.cmdHistory.length; }
                    var parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
                    var command = (parts[0] || '').toLowerCase();
                    var args = parts.slice(1).map(function(a) { return a.replace(/^"|"$/g, ''); });
                    if (command === '' || command === 'cls' || command === 'clear-host') {
                        output.innerHTML = '<span style="color:#569cd6;">Windows PowerShell</span>\n<span style="color:#888;">Copyright (C) Microsoft Corporation. All rights reserved.</span>\n\n';
                        psUpdate(); return;
                    }
                    if (command === 'help' || command === 'get-help' || command === 'man') {
                        psPrint('PowerShell Commands:');
                        psPrint('  Get-ChildItem (dir, ls)     - List directory contents');
                        psPrint('  Set-Location (cd)           - Change directory');
                        psPrint('  Get-Content (cat, type)     - View file content');
                        psPrint('  Get-Location (pwd)          - Show current path');
                        psPrint('  Clear-Host (cls, clear)     - Clear screen');
                        psPrint('  Write-Output (echo)         - Write text');
                        psPrint('  New-Item -ItemType Directory (mkdir)');
                        psPrint('  New-Item (ni)               - Create file');
                        psPrint('  Remove-Item (del, rm)       - Delete file/folder');
                        psPrint('  Copy-Item (copy, cp)        - Copy file/folder');
                        psPrint('  Move-Item (move, mv)        - Move file/folder');
                        psPrint('  Get-Process (ps)            - List processes');
                        psPrint('  Get-Date (date)             - Show date/time');
                        psPrint('  Get-ChildItem Env:          - Show environment');
                        psPrint('  Get-History (history)       - Command history');
                        psPrint('  Get-Command (gcm)           - List available commands');
                        psPrint('  exit                        - Close terminal');
                        psPrint('  help <command>              - Help on command');
                        psUpdate(); return;
                    }
                    if (command === 'get-childitem' || command === 'dir' || command === 'ls') {
                        var targetPath = psState.currentPath.slice();
                        if (args.length > 0) targetPath = psResolvePath(args[0]);
                        var folder = _feGetFolder(targetPath);
                        if (!folder) { psPrint('Get-ChildItem: Cannot find path \'' + targetPath.join('\\') + '\' because it does not exist.'); psUpdate(); return; }
                        var entries = Object.entries(folder.children || {});
                        psPrintH('<span style="color:#888;">    Directory: ' + targetPath.join('\\') + '</span>\n');
                        if (entries.length === 0) { psPrint(''); psUpdate(); return; }
                        var modePad = 12, lastWritePad = 22, sizePad = 10;
                        psPrintH('<span style="color:#888;">Mode                LastWriteTime         Length Name</span>');
                        psPrintH('<span style="color:#888;">----                -------------         ------ ----</span>');
                        entries.forEach(function(_a) {
                            var n = _a[0], e = _a[1];
                            var mode = e.type === 'folder' ? 'd-----' : '-a----';
                            var date = psFormatDate(e.date).padEnd(lastWritePad).slice(0, lastWritePad);
                            var size = e.type === 'folder' ? '' : psFormatSize(e.size);
                            size = size.padStart(sizePad);
                            psPrint(mode.padEnd(modePad) + date + ' ' + size + ' ' + n);
                        });
                        psUpdate(); return;
                    }
                    if (command === 'set-location' || command === 'cd') {
                        if (args.length === 0 || args[0] === '~' || args[0] === '') { psState.currentPath = ['This PC', 'Desktop']; psUpdate(); return; }
                        var newPath = psResolvePath(args[0]);
                        var folder = _feGetFolder(newPath);
                        if (!folder) { psPrint('Set-Location: Cannot find path \'' + args[0] + '\' because it does not exist.'); } else { psState.currentPath = newPath; }
                        psUpdate(); return;
                    }
                    if (command === 'get-location' || command === 'pwd') {
                        psPrint(psState.currentPath.join('\\'));
                        psUpdate(); return;
                    }
                    if (command === 'get-content' || command === 'cat' || command === 'type') {
                        if (args.length === 0) { psPrint('Get-Content: Cannot find path because it does not exist.'); psUpdate(); return; }
                        var filePath = psResolvePath(args[0]);
                        var folder = _feGetFolder(filePath.slice(0, -1));
                        var fileName = filePath[filePath.length - 1];
                        if (folder && folder.children[fileName]) {
                            var data = folder.children[fileName].data || '';
                            psPrint(data || '(empty file)');
                        } else { psPrint('Get-Content: Cannot find path \'' + args[0] + '\' because it does not exist.'); }
                        psUpdate(); return;
                    }
                    if (command === 'write-output' || command === 'echo') {
                        psPrint(args.join(' '));
                        psUpdate(); return;
                    }
                    if (command === 'mkdir' || command === 'new-item' && args.includes('-itemtype') && (args.includes('directory') || args.includes('d'))) {
                        var folderPath = psResolvePath(args[args.length - 1] || '');
                        var parent = _feGetFolder(folderPath.slice(0, -1));
                        var name = folderPath[folderPath.length - 1];
                        if (!parent) { psPrint('New-Item: Cannot find path.'); psUpdate(); return; }
                        if (parent.children[name]) { psPrint('New-Item: Item already exists.'); psUpdate(); return; }
                        parent.children[name] = { type: 'folder', children: {} };
                        _feSaveFS();
                        psPrint('    Directory: ' + folderPath.slice(0, -1).join('\\') + '\\' + name);
                        psUpdate(); return;
                    }
                    if (command === 'ni' || command === 'new-item') {
                        var fPath = psResolvePath(args[0] || '');
                        var parent2 = _feGetFolder(fPath.slice(0, -1));
                        var n2 = fPath[fPath.length - 1];
                        if (!parent2) { psPrint('New-Item: Cannot find path.'); psUpdate(); return; }
                        if (parent2.children[n2]) { psPrint('New-Item: Item already exists.'); psUpdate(); return; }
                        parent2.children[n2] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: '' };
                        _feSaveFS();
                        psPrint('    Directory: ' + fPath.slice(0, -1).join('\\'));
                        psUpdate(); return;
                    }
                    if (command === 'remove-item' || command === 'del' || command === 'rm') {
                        var delPath = psResolvePath(args[0] || '');
                        var delParent = _feGetFolder(delPath.slice(0, -1));
                        var delName = delPath[delPath.length - 1];
                        if (delParent && delParent.children[delName]) {
                            delete delParent.children[delName];
                            _feSaveFS();
                            psPrint('Removed: ' + delName);
                        } else { psPrint('Remove-Item: Cannot find \'' + args[0] + '\'.'); }
                        psUpdate(); return;
                    }
                    if (command === 'copy-item' || command === 'copy' || command === 'cp') {
                        if (args.length < 2) { psPrint('Copy-Item: Missing arguments.'); psUpdate(); return; }
                        var srcPath = psResolvePath(args[0]);
                        var dstPath = psResolvePath(args[1]);
                        var srcParent = _feGetFolder(srcPath.slice(0, -1));
                        var srcName = srcPath[srcPath.length - 1];
                        var dstParent = _feGetFolder(dstPath);
                        if (!dstParent) dstParent = _feGetFolder(dstPath.slice(0, -1));
                        var dstName = dstPath[dstPath.length - 1];
                        if (!srcParent || !srcParent.children[srcName]) { psPrint('Copy-Item: Cannot find \'' + args[0] + '\'.'); psUpdate(); return; }
                        if (!dstParent) { psPrint('Copy-Item: Destination not found.'); psUpdate(); return; }
                        dstParent.children[dstName] = JSON.parse(JSON.stringify(srcParent.children[srcName]));
                        _feSaveFS();
                        psPrint('Copied: ' + srcName + ' to ' + dstName);
                        psUpdate(); return;
                    }
                    if (command === 'move-item' || command === 'move' || command === 'mv') {
                        if (args.length < 2) { psPrint('Move-Item: Missing arguments.'); psUpdate(); return; }
                        var srcPath2 = psResolvePath(args[0]);
                        var dstPath2 = psResolvePath(args[1]);
                        var srcParent2 = _feGetFolder(srcPath2.slice(0, -1));
                        var srcName2 = srcPath2[srcPath2.length - 1];
                        var dstParent2 = _feGetFolder(dstPath2);
                        if (!dstParent2) dstParent2 = _feGetFolder(dstPath2.slice(0, -1));
                        var dstName2 = dstPath2[dstPath2.length - 1];
                        if (!srcParent2 || !srcParent2.children[srcName2]) { psPrint('Move-Item: Cannot find \'' + args[0] + '\'.'); psUpdate(); return; }
                        if (!dstParent2) { psPrint('Move-Item: Destination not found.'); psUpdate(); return; }
                        dstParent2.children[dstName2] = srcParent2.children[srcName2];
                        delete srcParent2.children[srcName2];
                        _feSaveFS();
                        psPrint('Moved: ' + srcName2 + ' to ' + dstName2);
                        psUpdate(); return;
                    }
                    if (command === 'get-process' || command === 'ps') {
                        psPrintH('<span style="color:#888;">  PID   ProcessName            CPU(s)  Memory</span>');
                        var procs = openWindows.length > 0 ? openWindows : ['system', 'idle'];
                        procs.forEach(function(w) {
                            var pname = w === 'system' ? 'System' : w === 'idle' ? 'Idle' : w;
                            var pid = 1000 + Math.floor(Math.random() * 9000);
                            var cpu = (Math.random() * 5).toFixed(1);
                            var mem = (Math.random() * 50 + 10).toFixed(0);
                            psPrint('  ' + pid + '  ' + pname.padEnd(22).slice(0, 22) + cpu.padStart(6) + ' ' + mem.padStart(6) + 'MB');
                        });
                        psUpdate(); return;
                    }
                    if (command === 'get-date' || command === 'date') {
                        psPrint(new Date().toString());
                        psUpdate(); return;
                    }
                    if (command === 'get-childitem' && args[0] && args[0].toLowerCase() === 'env:') {
                        var envs = { COMPUTERNAME: 'CYBER-PC', OS: 'Windows_NT', PROCESSOR_ARCHITECTURE: 'AMD64', USERNAME: currentUser || 'User', USERPROFILE: 'C:\\Users\\' + (currentUser || 'User'), WINDIR: 'C:\\Windows' };
                        Object.keys(envs).forEach(function(k) { psPrint(k + ' = ' + envs[k]); });
                        psUpdate(); return;
                    }
                    if (command === 'get-history' || command === 'history') {
                        psState.cmdHistory.forEach(function(c, i) { psPrint('  ' + (i + 1) + '  ' + c); });
                        psUpdate(); return;
                    }
                    if (command === 'get-command' || command === 'gcm') {
                        psPrint('PowerShell Commands available: Get-ChildItem, Set-Location, Get-Content, Get-Location, Clear-Host, Write-Output, New-Item, Remove-Item, Copy-Item, Move-Item, Get-Process, Get-Date, Get-History, Get-Command, Get-Help');
                        psUpdate(); return;
                    }
                    if (command === 'exit') {
                        var win = el.closest('.window');
                        if (win) closeWindow(win.id);
                        return;
                    }
                    if (command === 'notepad') { toggleWindow('notes'); psPrint('Opening Notepad...'); psUpdate(); return; }
                    if (command === 'calc') { toggleWindow('calc'); psPrint('Opening Calculator...'); psUpdate(); return; }
                    psPrint('\'' + command + '\' is not recognized as the name of a cmdlet, function, script file, or operable program.');
                    psUpdate();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (psState.cmdHistory.length > 0) {
                        psState.histIdx = Math.max(0, psState.histIdx - 1);
                        cmdInput.value = psState.cmdHistory[psState.histIdx] || '';
                    }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (psState.cmdHistory.length > 0) {
                        psState.histIdx = Math.min(psState.cmdHistory.length, psState.histIdx + 1);
                        cmdInput.value = psState.histIdx < psState.cmdHistory.length ? psState.cmdHistory[psState.histIdx] : '';
                    }
                }
            });
            cmdInput.focus();
        }
    },
    ubuntu: {
        title: '\u{1F427} Ubuntu Terminal',
        icon: '\u{1F427}',
        createContent: (el, id) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;background:#300a24;';
            const output = document.createElement('div');
            output.style.cssText = 'flex:1;overflow-y:auto;padding:8px;font-family:Ubuntu,Consolas,monospace;font-size:0.8rem;color:#e0e0e0;white-space:pre-wrap;background:#300a24;';
            output.innerHTML = '<span style="color:#88ff88;">Welcome to Ubuntu Terminal (Cyber OS)</span>\n';
            const inputRow = document.createElement('div');
            inputRow.style.cssText = 'display:flex;align-items:center;padding:4px 8px;border-top:1px solid rgba(255,255,255,0.1);background:rgba(0,0,0,0.3);';
            const prompt = document.createElement('span');
            prompt.style.cssText = 'color:#88ff88;margin-right:4px;font-family:Ubuntu,Consolas,monospace;font-size:0.8rem;white-space:pre;';
            const cmdInput = document.createElement('input');
            cmdInput.type = 'text';
            cmdInput.style.cssText = 'flex:1;background:transparent;border:none;color:#e0e0e0;font-family:Ubuntu,Consolas,monospace;font-size:0.8rem;outline:none;';
            inputRow.append(prompt, cmdInput);
            el.append(output, inputRow);
            var ubState = { currentPath: ['This PC'], cmdHistory: [], histIdx: -1 };
            function ubPromptStr() {
                var p = ubState.currentPath;
                var un = currentUser || 'user';
                if (p.length === 1) return un + '@ubuntu:~$';
                var pp = '/' + p.slice(1).join('/');
                return un + '@ubuntu:' + pp + '$';
            }
            function ubUpdate() { prompt.textContent = ubPromptStr(); }
            ubUpdate();
            function ubPrint(t) { var d = document.createElement('div'); d.textContent = t; output.appendChild(d); output.scrollTop = output.scrollHeight; }
            function ubPrintH(h) { var d = document.createElement('div'); d.innerHTML = h; output.appendChild(d); output.scrollTop = output.scrollHeight; }
            function ubGetFolder() { return _feGetFolder(ubState.currentPath); }
            function ubResolvePath(p) {
                if (!p || p === '.') return ubState.currentPath.slice();
                if (p === '..') return ubState.currentPath.length > 1 ? ubState.currentPath.slice(0, -1) : ubState.currentPath.slice();
                if (p === '~') return ['This PC', 'Desktop'];
                if (p.startsWith('/')) { var parts = p.slice(1).split('/').filter(Boolean); return ['This PC'].concat(parts); }
                return ubState.currentPath.concat(p.split('/').filter(Boolean));
            }
            function ubFormatSize(bytes) { return _feFormatSize(bytes) || '0'; }
            cmdInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    var cmd = this.value.trim();
                    ubPrintH('<span style="color:#88ff88;">' + ubPromptStr() + '</span> ' + cmd);
                    this.value = '';
                    if (cmd) { ubState.cmdHistory.push(cmd); ubState.histIdx = ubState.cmdHistory.length; }
                    var parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
                    var command = (parts[0] || '').toLowerCase();
                    var args = parts.slice(1).map(function(a) { return a.replace(/^"|"$/g, ''); });
                    if (command === '' || command === 'clear') {
                        output.innerHTML = '<span style="color:#88ff88;">Welcome to Ubuntu Terminal (Cyber OS)</span>\n';
                        ubUpdate(); return;
                    }
                    if (command === 'help') {
                        ubPrint('GNU bash, version 5.1.16(1)-release');
                        ubPrint('Available commands:');
                        ubPrint('  ls        - List directory contents');
                        ubPrint('  cd        - Change directory');
                        ubPrint('  pwd       - Print working directory');
                        ubPrint('  cat       - View file content');
                        ubPrint('  echo      - Write text');
                        ubPrint('  mkdir     - Create directory');
                        ubPrint('  touch     - Create empty file');
                        ubPrint('  rm        - Remove file');
                        ubPrint('  rmdir     - Remove directory');
                        ubPrint('  cp        - Copy file/folder');
                        ubPrint('  mv        - Move file/folder');
                        ubPrint('  clear     - Clear screen');
                        ubPrint('  whoami    - Show current user');
                        ubPrint('  uname     - System info');
                        ubPrint('  ps        - List processes');
                        ubPrint('  date      - Show date/time');
                        ubPrint('  cal       - Show calendar');
                        ubPrint('  head      - First lines of file');
                        ubPrint('  tail      - Last lines of file');
                        ubPrint('  wc        - Count lines/words');
                        ubPrint('  grep      - Search in file');
                        ubPrint('  nano      - Open text editor');
                        ubPrint('  history   - Command history');
                        ubPrint('  exit      - Close terminal');
                        ubUpdate(); return;
                    }
                    if (command === 'ls') {
                        var tPath = ubState.currentPath.slice();
                        if (args.length > 0 && !args[0].startsWith('-')) tPath = ubResolvePath(args[0]);
                        var showAll = args.includes('-a') || args.includes('-la') || args.includes('-al');
                        var long = args.includes('-l') || args.includes('-la') || args.includes('-al');
                        var folder = _feGetFolder(tPath);
                        if (!folder) { ubPrint('ls: cannot access \'' + args[0] + '\': No such file or directory'); ubUpdate(); return; }
                        var entries = Object.entries(folder.children || {});
                        if (!showAll && entries.filter(function(ea){return ea[0].startsWith('.');}).length > 0) entries = entries.filter(function(ea2){return !ea2[0].startsWith('.');});
                        if (entries.length === 0) { ubUpdate(); return; }
                        if (long) {
                            entries.forEach(function(_a) {
                                var fn = _a[0], fe = _a[1];
                                var perms = fe.type === 'folder' ? 'drwxr-xr-x' : '-rw-r--r--';
                                var links = 1;
                                var owner = currentUser || 'user';
                                var size = fe.type === 'folder' ? '4096' : ubFormatSize(fe.size);
                                var d = fe.date || new Date().toLocaleString();
                                ubPrint(perms + ' ' + links + ' ' + owner + ' ' + owner + ' ' + size + ' ' + d + ' ' + fn);
                            });
                        } else {
                            var line = '';
                            entries.forEach(function(_a2) {
                                var fn2 = _a2[0], fe2 = _a2[1];
                                var suffix = fe2.type === 'folder' ? '/' : '';
                                line += fn2 + suffix + '  ';
                            });
                            ubPrint(line);
                        }
                        ubUpdate(); return;
                    }
                    if (command === 'cd') {
                        if (args.length === 0 || args[0] === '~' || args[0] === '') {
                            ubState.currentPath = ['This PC', 'Desktop'];
                        } else if (args[0] === '-') {
                            if (ubState.prevPath) ubState.currentPath = ubState.prevPath;
                        } else {
                            var prev = ubState.currentPath.slice();
                            var nPath = ubResolvePath(args[0]);
                            var fol = _feGetFolder(nPath);
                            if (!fol || fol.type !== 'folder') { ubPrint('bash: cd: ' + args[0] + ': No such file or directory'); } else {
                                ubState.prevPath = prev;
                                ubState.currentPath = nPath;
                            }
                        }
                        ubUpdate(); return;
                    }
                    if (command === 'pwd') {
                        ubPrint(ubState.currentPath.join('/'));
                        ubUpdate(); return;
                    }
                    if (command === 'cat') {
                        if (args.length === 0) { ubPrint('cat: missing operand'); ubUpdate(); return; }
                        var fPath = ubResolvePath(args[0]);
                        var fol2 = _feGetFolder(fPath.slice(0, -1));
                        var fName = fPath[fPath.length - 1];
                        if (fol2 && fol2.children[fName]) {
                            ubPrint(fol2.children[fName].data || '(empty)');
                        } else { ubPrint('cat: ' + args[0] + ': No such file or directory'); }
                        ubUpdate(); return;
                    }
                    if (command === 'echo') {
                        var txt = args.join(' ');
                        if (args[0] === '$USER') txt = currentUser || 'user';
                        else if (args[0] === '$HOME') txt = '/home/' + (currentUser || 'user');
                        else if (args[0] === '$SHELL') txt = '/bin/bash';
                        else if (args[0] === '$PWD') txt = ubState.currentPath.join('/');
                        ubPrint(txt);
                        ubUpdate(); return;
                    }
                    if (command === 'mkdir') {
                        if (args.length === 0) { ubPrint('mkdir: missing operand'); ubUpdate(); return; }
                        var mkPath = ubResolvePath(args[0]);
                        var mkParent = _feGetFolder(mkPath.slice(0, -1));
                        var mkName = mkPath[mkPath.length - 1];
                        if (!mkParent) { ubPrint('mkdir: cannot create directory \'' + args[0] + '\': No such file or directory'); ubUpdate(); return; }
                        if (mkParent.children[mkName]) { ubPrint('mkdir: cannot create directory \'' + args[0] + '\': File exists'); ubUpdate(); return; }
                        mkParent.children[mkName] = { type: 'folder', children: {} };
                        _feSaveFS();
                        ubUpdate(); return;
                    }
                    if (command === 'touch') {
                        if (args.length === 0 || args[0].startsWith('-')) { ubPrint('touch: missing file operand'); ubUpdate(); return; }
                        var tPath2 = ubResolvePath(args[0]);
                        var tParent = _feGetFolder(tPath2.slice(0, -1));
                        var tName = tPath2[tPath2.length - 1];
                        if (tParent) {
                            if (!tParent.children[tName]) tParent.children[tName] = { type: 'file', size: 0, date: new Date().toLocaleString(), data: '' };
                            else tParent.children[tName].date = new Date().toLocaleString();
                            _feSaveFS();
                        }
                        ubUpdate(); return;
                    }
                    if (command === 'rm') {
                        var recursive = args.includes('-r') || args.includes('-rf') || args.includes('-fr');
                        var force = args.includes('-f') || args.includes('-rf') || args.includes('-fr');
                        var targetArg = args.filter(function(a){return !a.startsWith('-');})[0] || '';
                        if (!targetArg) { ubPrint('rm: missing operand'); ubUpdate(); return; }
                        var rmPath = ubResolvePath(targetArg);
                        var rmParent = _feGetFolder(rmPath.slice(0, -1));
                        var rmName = rmPath[rmPath.length - 1];
                        if (!rmParent || !rmParent.children[rmName]) { ubPrint('rm: cannot remove \'' + targetArg + '\': No such file'); ubUpdate(); return; }
                        if (rmParent.children[rmName].type === 'folder' && !recursive) { ubPrint('rm: cannot remove \'' + targetArg + '\': Is a directory'); ubUpdate(); return; }
                        delete rmParent.children[rmName];
                        _feSaveFS();
                        ubUpdate(); return;
                    }
                    if (command === 'rmdir') {
                        if (args.length === 0) { ubPrint('rmdir: missing operand'); ubUpdate(); return; }
                        var rdPath = ubResolvePath(args[0]);
                        var rdParent = _feGetFolder(rdPath.slice(0, -1));
                        var rdName = rdPath[rdPath.length - 1];
                        if (!rdParent || !rdParent.children[rdName]) { ubPrint('rmdir: failed to remove \'' + args[0] + '\': No such file or directory'); ubUpdate(); return; }
                        var rdEntry = rdParent.children[rdName];
                        if (rdEntry.type !== 'folder') { ubPrint('rmdir: failed to remove \'' + args[0] + '\': Not a directory'); ubUpdate(); return; }
                        if (Object.keys(rdEntry.children || {}).length > 0) { ubPrint('rmdir: failed to remove \'' + args[0] + '\': Directory not empty'); ubUpdate(); return; }
                        delete rdParent.children[rdName];
                        _feSaveFS();
                        ubUpdate(); return;
                    }
                    if (command === 'cp') {
                        if (args.length < 2) { ubPrint('cp: missing file operand'); ubUpdate(); return; }
                        var recursive2 = args.includes('-r') || args.includes('-rf');
                        var fileArgs = args.filter(function(a){return !a.startsWith('-');});
                        var srcP = ubResolvePath(fileArgs[0]);
                        var dstP = ubResolvePath(fileArgs[1]);
                        var srcPar = _feGetFolder(srcP.slice(0, -1));
                        var srcN = srcP[srcP.length - 1];
                        var dstPar = _feGetFolder(dstP);
                        if (!dstPar) dstPar = _feGetFolder(dstP.slice(0, -1));
                        var dstN = dstP[dstP.length - 1];
                        if (!srcPar || !srcPar.children[srcN]) { ubPrint('cp: cannot stat \'' + fileArgs[0] + '\': No such file or directory'); ubUpdate(); return; }
                        if (!dstPar) { ubPrint('cp: cannot create regular file \'' + fileArgs[1] + '\': No such file or directory'); ubUpdate(); return; }
                        dstPar.children[dstN] = JSON.parse(JSON.stringify(srcPar.children[srcN]));
                        _feSaveFS();
                        ubUpdate(); return;
                    }
                    if (command === 'mv') {
                        if (args.length < 2) { ubPrint('mv: missing file operand'); ubUpdate(); return; }
                        var fileArgs2 = args.filter(function(a2){return !a2.startsWith('-');});
                        var srcP2 = ubResolvePath(fileArgs2[0]);
                        var dstP2 = ubResolvePath(fileArgs2[1]);
                        var srcPar2 = _feGetFolder(srcP2.slice(0, -1));
                        var srcN2 = srcP2[srcP2.length - 1];
                        var dstPar2 = _feGetFolder(dstP2);
                        if (!dstPar2) dstPar2 = _feGetFolder(dstP2.slice(0, -1));
                        var dstN2 = dstP2[dstP2.length - 1];
                        if (!srcPar2 || !srcPar2.children[srcN2]) { ubPrint('mv: cannot stat \'' + fileArgs2[0] + '\': No such file or directory'); ubUpdate(); return; }
                        if (!dstPar2) { ubPrint('mv: cannot move \'' + fileArgs2[0] + '\': No such file or directory'); ubUpdate(); return; }
                        dstPar2.children[dstN2] = srcPar2.children[srcN2];
                        delete srcPar2.children[srcN2];
                        _feSaveFS();
                        ubUpdate(); return;
                    }
                    if (command === 'whoami') { ubPrint(currentUser || 'user'); ubUpdate(); return; }
                    if (command === 'uname') { ubPrint('Linux'); ubUpdate(); return; }
                    if (command === 'uname' && args.includes('-a')) { ubPrint('Linux ubuntu 5.15.0-91-generic #101-Ubuntu SMP x86_64 x86_64 x86_64 GNU/Linux'); ubUpdate(); return; }
                    if (command === 'ps') {
                        ubPrint('  PID TTY          TIME CMD');
                        ubPrint('    1 ?        00:00:02 init');
                        ubPrint('  123 pts/0    00:00:01 bash');
                        ubPrint('  456 pts/0    00:00:00 ps');
                        ubUpdate(); return;
                    }
                    if (command === 'date') { ubPrint(new Date().toString()); ubUpdate(); return; }
                    if (command === 'cal') {
                        var now = new Date();
                        var y = now.getFullYear(), m = now.getMonth();
                        var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                        var first = new Date(y, m, 1).getDay();
                        var last = new Date(y, m + 1, 0).getDate();
                        ubPrint('      ' + months[m] + ' ' + y);
                        ubPrint('Su Mo Tu We Th Fr Sa');
                        var line = '';
                        for (var i = 0; i < first; i++) line += '   ';
                        for (var d = 1; d <= last; d++) {
                            line += (d < 10 ? ' ' : '') + d + ' ';
                            if ((d + first) % 7 === 0) { ubPrint(line); line = ''; }
                        }
                        if (line) ubPrint(line);
                        ubUpdate(); return;
                    }
                    if (command === 'head' || command === 'tail') {
                        if (args.length === 0 || args[args.length - 1].startsWith('-')) { ubPrint(command + ': missing operand'); ubUpdate(); return; }
                        var linesN = 10;
                        var nIdx = args.indexOf('-n');
                        if (nIdx >= 0 && nIdx + 1 < args.length) linesN = parseInt(args[nIdx + 1]) || 10;
                        var fileArg = args.filter(function(a){return !a.startsWith('-');}).pop();
                        var fp = ubResolvePath(fileArg);
                        var folf = _feGetFolder(fp.slice(0, -1));
                        var fn = fp[fp.length - 1];
                        if (!folf || !folf.children[fn]) { ubPrint(command + ': ' + fileArg + ': No such file or directory'); ubUpdate(); return; }
                        var content = folf.children[fn].data || '';
                        var clines = content.split('\n');
                        if (command === 'head') { clines.slice(0, linesN).forEach(function(l) { ubPrint(l); }); }
                        else { clines.slice(Math.max(0, clines.length - linesN)).forEach(function(l2) { ubPrint(l2); }); }
                        ubUpdate(); return;
                    }
                    if (command === 'wc') {
                        if (args.length === 0 || args[0].startsWith('-')) { ubPrint('wc: missing operand'); ubUpdate(); return; }
                        var fp2 = ubResolvePath(args[0]);
                        var folf2 = _feGetFolder(fp2.slice(0, -1));
                        var fn2 = fp2[fp2.length - 1];
                        if (!folf2 || !folf2.children[fn2]) { ubPrint('wc: ' + args[0] + ': No such file or directory'); ubUpdate(); return; }
                        var c2 = folf2.children[fn2].data || '';
                        var lines = c2.split('\n').length - (c2.endsWith('\n') ? 1 : 0);
                        var words = c2.split(/\s+/).filter(Boolean).length;
                        var chars = c2.length;
                        ubPrint(lines + ' ' + words + ' ' + chars + ' ' + fn2);
                        ubUpdate(); return;
                    }
                    if (command === 'grep') {
                        if (args.length < 2) { ubPrint('Usage: grep <pattern> <file>'); ubUpdate(); return; }
                        var pattern = args[0];
                        var fileArg2 = args[1];
                        var fp3 = ubResolvePath(fileArg2);
                        var folf3 = _feGetFolder(fp3.slice(0, -1));
                        var fn3 = fp3[fp3.length - 1];
                        if (!folf3 || !folf3.children[fn3]) { ubPrint('grep: ' + fileArg2 + ': No such file or directory'); ubUpdate(); return; }
                        var c3 = folf3.children[fn3].data || '';
                        c3.split('\n').forEach(function(l3) { if (l3.toLowerCase().includes(pattern.toLowerCase())) ubPrint(l3); });
                        ubUpdate(); return;
                    }
                    if (command === 'nano') {
                        toggleWindow('notes');
                        ubPrint('Opening nano...');
                        ubUpdate(); return;
                    }
                    if (command === 'history') {
                        ubState.cmdHistory.forEach(function(c4, i4) { ubPrint('  ' + (i4 + 1) + '  ' + c4); });
                        ubUpdate(); return;
                    }
                    if (command === 'exit') {
                        var win2 = el.closest('.window');
                        if (win2) closeWindow(win2.id);
                        return;
                    }
                    if (command === 'sudo') {
                        ubPrint('sudo: ' + (args[0] || '') + ': command not found (simulated)');
                        ubUpdate(); return;
                    }
                    if (command === 'apt' || command === 'apt-get') {
                        if (args.includes('update')) { ubPrint('Hit:1 http://archive.ubuntu.com/ubuntu jammy InRelease'); ubPrint('Reading package lists... Done'); }
                        else if (args.includes('install')) { var pkg = args[args.indexOf('install') + 1] || 'package'; ubPrint('Reading package lists... Done'); ubPrint('Building dependency tree... Done'); ubPrint('The following NEW packages will be installed:\n  ' + pkg); ubPrint('0 upgraded, 1 newly installed, 0 to remove and 0 not upgraded.'); }
                        else { ubPrint('apt: command not found (simulated)'); }
                        ubUpdate(); return;
                    }
                    if (command === 'chmod' || command === 'chown') {
                        ubPrint(command + ': operation not supported in this environment (simulated)');
                        ubUpdate(); return;
                    }
                    ubPrint('bash: ' + command + ': command not found');
                    ubUpdate();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (ubState.cmdHistory.length > 0) {
                        ubState.histIdx = Math.max(0, ubState.histIdx - 1);
                        cmdInput.value = ubState.cmdHistory[ubState.histIdx] || '';
                    }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (ubState.cmdHistory.length > 0) {
                        ubState.histIdx = Math.min(ubState.cmdHistory.length, ubState.histIdx + 1);
                        cmdInput.value = ubState.histIdx < ubState.cmdHistory.length ? ubState.cmdHistory[ubState.histIdx] : '';
                    }
                }
            });
            cmdInput.focus();
        }
    },
    snip: {
        title: '\u{2702}\uFE0F Snipping Tool',
        icon: '\u{2702}\uFE0F',
        createContent: (el) => {
            el.style.cssText = 'padding:8px;display:flex;flex-direction:column;align-items:center;gap:10px;';
            el.innerHTML = '<div style="font-size:2rem;opacity:0.5;">\u{2702}\uFE0F</div><div style="font-size:0.8rem;">Click "New Snip" to capture a region</div>';
            var btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:6px;';
            const snipBtn = document.createElement('button');
            snipBtn.textContent = 'New Snip';
            snipBtn.style.cssText = 'margin:0;padding:6px 20px;';
            var saveSnipFsBtn = document.createElement('button');
            saveSnipFsBtn.textContent = '\u{1F4BE} Save to Files';
            saveSnipFsBtn.style.cssText = 'margin:0;padding:6px 16px;';
            saveSnipFsBtn.disabled = true;
            saveSnipFsBtn.onclick = function() {
                showSaveAsDialog(function(path, name) {
                    var folder = _feGetFolder(path.slice(0, -1));
                    if (!folder) return;
                    var pngName = name.replace(/\.[^.]+$/, '') + '.png';
                    var dataUrl = canvas.toDataURL('image/png');
                    folder.children[pngName] = { type: 'file', size: dataUrl.length, date: new Date().toLocaleString(), data: dataUrl, icon: '\u{1F5BC}' };
                    _feSaveFS();
                    showToast('Snipping Tool', 'Saved to ' + path.slice(0, -1).join('\\') + '\\' + pngName, 'info');
                }, 'snip_' + Date.now() + '.png');
            };
            var downloadSnipBtn = document.createElement('button');
            downloadSnipBtn.textContent = '\u{2193}';
            downloadSnipBtn.title = 'Download PNG';
            downloadSnipBtn.style.cssText = 'margin:0;padding:6px 12px;';
            downloadSnipBtn.disabled = true;
            downloadSnipBtn.onclick = function() {
                var link = document.createElement('a');
                link.download = 'snip_' + Date.now() + '.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            };
            btnRow.appendChild(snipBtn);
            btnRow.appendChild(saveSnipFsBtn);
            btnRow.appendChild(downloadSnipBtn);
            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'border:1px solid rgba(51,255,51,0.2);border-radius:4px;max-width:100%;flex:1;background:#000;';
            el.appendChild(btnRow);
            el.appendChild(canvas);
            el._snipCanvas = canvas;
            el._snipSaveBtn = saveSnipFsBtn;
            el._snipDownloadBtn = downloadSnipBtn;
            snipBtn.onclick = function() {
                var self = this;
                self.disabled = true;
                self.textContent = 'Capturing...';
                var captureFn = function() {
                    try {
                        if (typeof html2canvas !== 'undefined') {
                            html2canvas(document.body, {
                                useCORS: true,
                                scale: window.devicePixelRatio || 1,
                                logging: false,
                                backgroundColor: null
                            }).then(function(fullCanvas) {
                                self.disabled = false;
                                self.textContent = 'New Snip';
                                showRegionSelect(fullCanvas);
                            }).catch(function(err) {
                                console.error('html2canvas error:', err);
                                self.disabled = false;
                                self.textContent = 'New Snip';
                                showToast('Snipping Tool', 'Capture failed: ' + err.message, 'error');
                            });
                        } else {
                            self.disabled = false;
                            self.textContent = 'New Snip';
                            showToast('Snipping Tool', 'html2canvas not loaded. Try refreshing.', 'error');
                        }
                    } catch(e) {
                        self.disabled = false;
                        self.textContent = 'New Snip';
                        showToast('Snipping Tool', 'Error: ' + e.message, 'error');
                    }
                };
                function showRegionSelect(fullCanvas) {
                    var overlay = document.createElement('div');
                    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;cursor:crosshair;';
                    var bgCanvas = document.createElement('canvas');
                    bgCanvas.width = fullCanvas.width;
                    bgCanvas.height = fullCanvas.height;
                    var bgCtx = bgCanvas.getContext('2d');
                    bgCtx.drawImage(fullCanvas, 0, 0);
                    bgCtx.fillStyle = 'rgba(0,0,0,0.4)';
                    bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
                    overlay.appendChild(bgCanvas);
                    var sx, sy, ex, ey, sel;
                    overlay.onmousedown = function(e) {
                        sx = e.clientX * (fullCanvas.width / window.innerWidth);
                        sy = e.clientY * (fullCanvas.height / window.innerHeight);
                        sel = document.createElement('div');
                        sel.style.cssText = 'position:fixed;border:2px dashed #33ff33;background:rgba(51,255,51,0.08);z-index:999999;pointer-events:none;';
                        document.body.appendChild(sel);
                        overlay.onmousemove = function(e2) {
                            ex = e2.clientX * (fullCanvas.width / window.innerWidth);
                            ey = e2.clientY * (fullCanvas.height / window.innerHeight);
                            var l = Math.min(sx, ex), t = Math.min(sy, ey);
                            var w2 = Math.abs(ex - sx), h2 = Math.abs(ey - sy);
                            sel.style.left = (l * window.innerWidth / fullCanvas.width) + 'px';
                            sel.style.top = (t * window.innerHeight / fullCanvas.height) + 'px';
                            sel.style.width = (w2 * window.innerWidth / fullCanvas.width) + 'px';
                            sel.style.height = (h2 * window.innerHeight / fullCanvas.height) + 'px';
                        };
                    };
                    overlay.onmouseup = function() {
                        overlay.onmousemove = null;
                        setTimeout(function() {
                            overlay.remove();
                            if (sel) sel.remove();
                            document.body.style.cursor = '';
                            var w2 = Math.abs(ex - sx) || 100, h2 = Math.abs(ey - sy) || 100;
                            var l = Math.min(sx, ex), t = Math.min(sy, ey);
                            canvas.width = Math.floor(w2);
                            canvas.height = Math.floor(h2);
                            var ctx = canvas.getContext('2d');
                            ctx.drawImage(fullCanvas, Math.floor(l), Math.floor(t), Math.floor(w2), Math.floor(h2), 0, 0, Math.floor(w2), Math.floor(h2));
                            saveSnipFsBtn.disabled = false;
                            downloadSnipBtn.disabled = false;
                            showToast('Snipping Tool', 'Snip captured! (' + Math.floor(w2) + 'x' + Math.floor(h2) + ')', 'info');
                        }, 50);
                    };
                    document.body.appendChild(overlay);
                }
                captureFn();
            };
        }
    },
    paint: {
        title: '\u{1F3A8} Paint',
        icon: '\u{1F3A8}',
        createContent: (el) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;';
            var toolbar = document.createElement('div');
            toolbar.style.cssText = 'display:flex;align-items:center;gap:3px;padding:3px 6px;border-bottom:1px solid rgba(51,255,51,0.15);flex-shrink:0;flex-wrap:wrap;';

            var tools = [
                {id:'pencil',label:'\u270F',title:'Pencil'},
                {id:'line',label:'\u2571',title:'Line'},
                {id:'rect',label:'\u25A1',title:'Rectangle'},
                {id:'frect',label:'\u25A0',title:'Filled Rectangle'},
                {id:'circle',label:'\u25CB',title:'Ellipse'},
                {id:'fcircle',label:'\u25CF',title:'Filled Ellipse'},
                {id:'eraser',label:'\u2B1B',title:'Eraser'},
                {id:'fill',label:'\u{1F7E5}',title:'Fill'},
                {id:'picker',label:'\u{1F0CF}',title:'Color Picker'},
                {id:'text',label:'A',title:'Text'},
            ];
            var currentTool = 'pencil';
            var toolBtns = [];
            tools.forEach(function(t) {
                var btn = document.createElement('button');
                btn.textContent = t.label;
                btn.title = t.title;
                btn.style.cssText = 'margin:0;padding:2px 6px;font-size:0.8rem;background:' + (t.id==='pencil'?'rgba(51,255,51,0.25)':'rgba(51,255,51,0.05)') + ';border:1px solid rgba(51,255,51,0.2);color:#33ff33;border-radius:3px;cursor:pointer;min-width:22px;';
                btn.onmouseenter = function() { if (t.id !== currentTool) this.style.background = 'rgba(51,255,51,0.15)'; };
                btn.onmouseleave = function() { if (t.id !== currentTool) this.style.background = 'rgba(51,255,51,0.05)'; };
                btn.onclick = function() {
                    toolBtns.forEach(function(b) { b.style.background = 'rgba(51,255,51,0.05)'; });
                    btn.style.background = 'rgba(51,255,51,0.25)';
                    currentTool = t.id;
                    canvas.style.cursor = t.id === 'text' ? 'text' : t.id === 'fill' ? 'crosshair' : t.id === 'picker' ? 'crosshair' : 'crosshair';
                    removeTextOverlay();
                };
                toolbar.appendChild(btn);
                toolBtns.push(btn);
            });

            var sep1 = document.createElement('span');
            sep1.style.cssText = 'width:1px;height:20px;background:rgba(51,255,51,0.2);margin:0 4px;';
            toolbar.appendChild(sep1);

            var colors = ['#33ff33','#ff3333','#33ccff','#ffcc00','#ffffff','#ff66cc','#9933ff','#ff8800','#000000'];
            var currentColor = '#33ff33';
            var colorBtns = [];
            colors.forEach(function(c) {
                var btn = document.createElement('button');
                btn.style.cssText = 'width:18px;height:18px;background:' + c + ';border:2px solid ' + (c==='#33ff33'?'rgba(255,255,255,0.6)':'rgba(255,255,255,0.15)') + ';border-radius:2px;cursor:pointer;margin:0;padding:0;';
                btn.onclick = function() {
                    currentColor = c;
                    colorBtns.forEach(function(b) { b.style.borderColor = 'rgba(255,255,255,0.15)'; });
                    btn.style.borderColor = 'rgba(255,255,255,0.6)';
                };
                toolbar.appendChild(btn);
                colorBtns.push(btn);
            });

            var sep2 = document.createElement('span');
            sep2.style.cssText = 'width:1px;height:20px;background:rgba(51,255,51,0.2);margin:0 4px;';
            toolbar.appendChild(sep2);

            var sizeLabel = document.createElement('span');
            sizeLabel.style.cssText = 'font-size:0.65rem;opacity:0.6;';
            sizeLabel.textContent = 'Size:';
            toolbar.appendChild(sizeLabel);

            var sizeSlider = document.createElement('input');
            sizeSlider.type = 'range';
            sizeSlider.min = '1'; sizeSlider.max = '30'; sizeSlider.value = '3';
            sizeSlider.style.cssText = 'width:50px;accent-color:#33ff33;margin:0;';
            toolbar.appendChild(sizeSlider);

            var sizeDisplay = document.createElement('span');
            sizeDisplay.style.cssText = 'font-size:0.65rem;opacity:0.6;min-width:20px;text-align:right;';
            sizeDisplay.textContent = '3';
            sizeSlider.oninput = function() { sizeDisplay.textContent = this.value; };
            toolbar.appendChild(sizeDisplay);

            var openBtn = document.createElement('button');
            openBtn.textContent = '\u{1F4C2} Open';
            openBtn.title = 'Open image from File Explorer';
            openBtn.style.cssText = 'margin:0;padding:2px 8px;font-size:0.75rem;background:rgba(51,255,51,0.05);border:1px solid rgba(51,255,51,0.2);color:#33ff33;border-radius:3px;cursor:pointer;';
            openBtn.onclick = function() {
                showOpenImageDialog(function(dataUrl) {
                    var img = new Image();
                    img.onload = function() {
                        canvas.width = img.width;
                        canvas.height = img.height;
                        var ctx2 = canvas.getContext('2d');
                        ctx2.fillStyle = '#020813';
                        ctx2.fillRect(0, 0, canvas.width, canvas.height);
                        ctx2.drawImage(img, 0, 0);
                        updateSizeDisplay();
                        undoStack = [];
                        redoStack = [];
                        saveState();
                        showToast('Paint', 'Opened image (' + img.width + 'x' + img.height + ')', 'info');
                    };
                    img.src = dataUrl;
                });
            };
            toolbar.appendChild(openBtn);

            var sep3 = document.createElement('span');
            sep3.style.cssText = 'width:1px;height:20px;background:rgba(51,255,51,0.2);margin:0 4px;';
            toolbar.appendChild(sep3);

            var undoBtn = document.createElement('button');
            undoBtn.textContent = '\u{21A9}';
            undoBtn.title = 'Undo';
            undoBtn.style.cssText = 'margin:0;padding:2px 8px;font-size:0.75rem;background:rgba(51,255,51,0.05);border:1px solid rgba(51,255,51,0.2);color:#33ff33;border-radius:3px;cursor:pointer;';
            toolbar.appendChild(undoBtn);

            var redoBtn = document.createElement('button');
            redoBtn.textContent = '\u{21AA}';
            redoBtn.title = 'Redo';
            redoBtn.style.cssText = 'margin:0;padding:2px 8px;font-size:0.75rem;background:rgba(51,255,51,0.05);border:1px solid rgba(51,255,51,0.2);color:#33ff33;border-radius:3px;cursor:pointer;';
            toolbar.appendChild(redoBtn);

            var clearBtn = document.createElement('button');
            clearBtn.textContent = '\u{1F5D1}';
            clearBtn.title = 'Clear canvas';
            clearBtn.style.cssText = 'margin:0;padding:2px 8px;font-size:0.75rem;background:rgba(255,50,50,0.1);border:1px solid rgba(255,50,50,0.2);color:#ff6666;border-radius:3px;cursor:pointer;';
            toolbar.appendChild(clearBtn);

            var saveFsBtn = document.createElement('button');
            saveFsBtn.textContent = '\u{1F4BE} Save to Files';
            saveFsBtn.title = 'Save to File Explorer';
            saveFsBtn.style.cssText = 'margin:0;padding:2px 8px;font-size:0.75rem;background:rgba(51,255,51,0.1);border:1px solid rgba(51,255,51,0.2);color:#33ff33;border-radius:3px;cursor:pointer;';
            saveFsBtn.onclick = function() {
                showSaveAsDialog(function(path, name) {
                    var folder = _feGetFolder(path.slice(0, -1));
                    if (!folder) return;
                    var pngName = name.replace(/\.[^.]+$/, '') + '.png';
                    var dataUrl = canvas.toDataURL('image/png');
                    folder.children[pngName] = { type: 'file', size: dataUrl.length, date: new Date().toLocaleString(), data: dataUrl, icon: '\u{1F5BC}' };
                    _feSaveFS();
                    showToast('Paint', 'Saved to ' + path.slice(0, -1).join('\\') + '\\' + pngName, 'info');
                }, 'painting.png');
            };
            toolbar.appendChild(saveFsBtn);
            var dlBtn = document.createElement('button');
            dlBtn.textContent = '\u{2193}';
            dlBtn.title = 'Download PNG';
            dlBtn.style.cssText = 'margin:0;padding:2px 8px;font-size:0.75rem;background:rgba(51,255,51,0.05);border:1px solid rgba(51,255,51,0.2);color:#33ff33;border-radius:3px;cursor:pointer;';
            dlBtn.onclick = function() {
                var link = document.createElement('a');
                link.download = 'painting_' + Date.now() + '.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            };
            toolbar.appendChild(dlBtn);

            el.appendChild(toolbar);

            var canvasContainer = document.createElement('div');
            canvasContainer.style.cssText = 'flex:1;position:relative;overflow:hidden;display:flex;';
            var canvas = document.createElement('canvas');
            canvas.style.cssText = 'flex:1;background:#020813;cursor:crosshair;display:block;';
            canvas.width = 400; canvas.height = 250;
            canvasContainer.appendChild(canvas);
            el._paintCanvas = canvas;
            el.updateSizeDisplay = function() { updateSizeDisplay(); };
            var paintScale = window.devicePixelRatio || 1;
            function resizeCanvas() {
                var rect = canvasContainer.getBoundingClientRect();
                var w = Math.max(200, Math.floor(rect.width * paintScale));
                var h = Math.max(200, Math.floor(rect.height * paintScale));
                if (canvas.width !== w || canvas.height !== h) {
                    var dataUrl = canvas.toDataURL();
                    canvas.width = w;
                    canvas.height = h;
                    canvas.style.width = Math.floor(w / paintScale) + 'px';
                    canvas.style.height = Math.floor(h / paintScale) + 'px';
                    var img = new Image();
                    img.onload = function() {
                        var ctx2 = canvas.getContext('2d');
                        ctx2.fillStyle = '#020813';
                        ctx2.fillRect(0, 0, w, h);
                        ctx2.drawImage(img, 0, 0, w, h);
                        updateSizeDisplay();
                        saveState();
                    };
                    img.src = dataUrl;
                }
            }
            var ro = new ResizeObserver(function() { resizeCanvas(); });
            ro.observe(canvasContainer);
            setTimeout(resizeCanvas, 50);
            el.appendChild(canvasContainer);

            var statusBar = document.createElement('div');
            statusBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:2px 8px;font-size:0.6rem;border-top:1px solid rgba(51,255,51,0.1);flex-shrink:0;opacity:0.6;';
            var coordsSpan = document.createElement('span');
            coordsSpan.textContent = 'X: 0  Y: 0';
            var sizeSpan = document.createElement('span');
            function updateSizeDisplay() { sizeSpan.textContent = canvas.width + ' x ' + canvas.height; }
            updateSizeDisplay();
            statusBar.appendChild(coordsSpan);
            statusBar.appendChild(sizeSpan);
            var zoomLevel = 1;
            var zoomSpan = document.createElement('span');
            var zoomOutBtn = document.createElement('button');
            zoomOutBtn.textContent = '\u{2212}';
            zoomOutBtn.title = 'Zoom Out';
            zoomOutBtn.style.cssText = 'margin:0 2px;padding:0 6px;font-size:0.65rem;background:transparent;border:1px solid var(--fg-dim);color:var(--fg);border-radius:2px;cursor:pointer;line-height:1.4;';
            var zoomInBtn = document.createElement('button');
            zoomInBtn.textContent = '+';
            zoomInBtn.title = 'Zoom In';
            zoomInBtn.style.cssText = 'margin:0 2px;padding:0 6px;font-size:0.65rem;background:transparent;border:1px solid var(--fg-dim);color:var(--fg);border-radius:2px;cursor:pointer;line-height:1.4;';
            var zoomResetBtn = document.createElement('button');
            zoomResetBtn.textContent = '\u{1F504}';
            zoomResetBtn.title = 'Reset Zoom';
            zoomResetBtn.style.cssText = 'margin:0 2px;padding:0 6px;font-size:0.65rem;background:transparent;border:1px solid var(--fg-dim);color:var(--fg);border-radius:2px;cursor:pointer;line-height:1.4;';
            function updateZoomDisplay() { zoomSpan.textContent = Math.round(zoomLevel * 100) + '%'; }
            function applyZoom() {
                updateZoomDisplay();
                canvas.style.width = Math.floor((canvas.width / paintScale) * zoomLevel) + 'px';
                canvas.style.height = Math.floor((canvas.height / paintScale) * zoomLevel) + 'px';
            }
            updateZoomDisplay();
            zoomOutBtn.onclick = function() { zoomLevel = Math.max(0.1, zoomLevel - 0.25); applyZoom(); };
            zoomInBtn.onclick = function() { zoomLevel = Math.min(10, zoomLevel + 0.25); applyZoom(); };
            zoomResetBtn.onclick = function() { zoomLevel = 1; applyZoom(); };
            var zoomGroup = document.createElement('span');
            zoomGroup.style.cssText = 'display:flex;align-items:center;gap:2px;';
            zoomGroup.appendChild(zoomOutBtn);
            zoomGroup.appendChild(zoomSpan);
            zoomGroup.appendChild(zoomInBtn);
            zoomGroup.appendChild(zoomResetBtn);
            statusBar.appendChild(zoomGroup);
            el.appendChild(statusBar);
            canvas.addEventListener('wheel', function(e) {
                e.preventDefault();
                var delta = e.deltaY > 0 ? -0.1 : 0.1;
                zoomLevel = Math.max(0.1, Math.min(10, zoomLevel + delta));
                applyZoom();
            }, { passive: false });

            var painting = false;
            var startX, startY;
            var undoStack = [];
            var redoStack = [];
            var MAX_UNDO = 30;
            var textOverlay = null;
            var savedShapeState = null;

            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#020813';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            saveState();

            var fillColor = '#33ff33';

            function getPos(e) {
                var r = canvas.getBoundingClientRect();
                return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
            }

            function saveState() {
                undoStack.push(canvas.toDataURL());
                if (undoStack.length > MAX_UNDO) undoStack.shift();
                redoStack = [];
            }

            function undo() {
                if (undoStack.length <= 1) return;
                redoStack.push(undoStack.pop());
                restoreState(undoStack[undoStack.length - 1]);
            }

            function redo() {
                if (redoStack.length === 0) return;
                undoStack.push(redoStack.pop());
                restoreState(undoStack[undoStack.length - 1]);
            }

            function restoreState(dataUrl) {
                var img = new Image();
                img.onload = function() {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                };
                img.src = dataUrl;
            }

            function floodFill(startX, startY, fillColor) {
                var w = canvas.width, h = canvas.height;
                var imageData = ctx.getImageData(0, 0, w, h);
                var data = imageData.data;
                var targetIdx = (Math.floor(startY) * w + Math.floor(startX)) * 4;
                var targetR = data[targetIdx], targetG = data[targetIdx+1], targetB = data[targetIdx+2], targetA = data[targetIdx+3];
                if (targetR === fillColor.r && targetG === fillColor.g && targetB === fillColor.b && targetA === fillColor.a) return;
                var hex = fillColor.hex || currentColor;
                var tempC = document.createElement('canvas').getContext('2d');
                tempC.canvas.width = 1; tempC.canvas.height = 1;
                tempC.fillStyle = hex;
                tempC.fillRect(0, 0, 1, 1);
                var fillData = tempC.getImageData(0, 0, 1, 1).data;
                var fillR = fillData[0], fillG = fillData[1], fillB = fillData[2], fillA = fillData[3];
                var stack = [Math.floor(startX), Math.floor(startY)];
                var visited = new Uint8Array(w * h);
                function match(idx) {
                    return data[idx] === targetR && data[idx+1] === targetG && data[idx+2] === targetB && data[idx+3] === targetA;
                }
                while (stack.length > 0) {
                    var y = stack.pop(), x = stack.pop();
                    var idx = (y * w + x) * 4;
                    if (x < 0 || x >= w || y < 0 || y >= h) continue;
                    if (visited[y * w + x]) continue;
                    if (!match(idx)) continue;
                    visited[y * w + x] = 1;
                    data[idx] = fillR; data[idx+1] = fillG; data[idx+2] = fillB; data[idx+3] = fillA;
                    stack.push(x+1, y, x-1, y, x, y+1, x, y-1);
                }
                ctx.putImageData(imageData, 0, 0);
            }

            function removeTextOverlay() {
                if (textOverlay) { textOverlay.remove(); textOverlay = null; }
            }

            function drawShape(x1, y1, x2, y2, tool, c, lw) {
                ctx.save();
                ctx.strokeStyle = c;
                ctx.fillStyle = c;
                ctx.lineWidth = lw;
                ctx.lineCap = 'round';
                var lx = Math.min(x1, x2), ly = Math.min(y1, y2);
                var rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
                if (tool === 'line') {
                    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                } else if (tool === 'rect') {
                    ctx.strokeRect(lx, ly, rw, rh);
                } else if (tool === 'frect') {
                    ctx.fillRect(lx, ly, rw, rh);
                } else if (tool === 'circle') {
                    var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
                    var rx = rw / 2, ry = rh / 2;
                    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.28); ctx.stroke();
                } else if (tool === 'fcircle') {
                    var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
                    var rx = rw / 2, ry = rh / 2;
                    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.28); ctx.fill();
                }
                ctx.restore();
            }

            canvas.onmousedown = function(e) {
                removeTextOverlay();
                var p = getPos(e);
                startX = p.x; startY = p.y;

                if (currentTool === 'text') {
                    var overlay = document.createElement('div');
                    overlay.contentEditable = true;
                    overlay.style.cssText = 'position:absolute;min-width:40px;min-height:24px;padding:4px;font-size:16px;color:' + currentColor + ';background:rgba(0,0,0,0.3);border:1px dashed ' + currentColor + ';outline:none;z-index:10;font-family:monospace;white-space:pre-wrap;overflow:hidden;resize:both;';
                    overlay.style.left = (e.offsetX || e.layerX || 0) + 'px';
                    overlay.style.top = (e.offsetY || e.layerY || 0) + 'px';
                    overlay.style.fontSize = parseInt(sizeSlider.value) + 4 + 'px';
                    overlay.textContent = '';
                    overlay.focus();
                    textOverlay = overlay;
                    canvasContainer.appendChild(overlay);
                    var commitText = function() {
                        if (overlay && overlay.textContent.trim()) {
                            ctx.save();
                            ctx.font = overlay.style.fontSize + ' monospace';
                            ctx.fillStyle = currentColor;
                            var lines = overlay.textContent.split('\n');
                            var tx = parseInt(overlay.style.left), ty = parseInt(overlay.style.top);
                            lines.forEach(function(line, i) {
                                ctx.fillText(line, tx, ty + (i+1) * parseInt(overlay.style.fontSize) * 1.2);
                            });
                            ctx.restore();
                            saveState();
                        }
                        overlay.remove(); textOverlay = null;
                    };
                    overlay.addEventListener('blur', commitText);
                    overlay.addEventListener('keydown', function(ev) {
                        if (ev.key === 'Escape') { overlay.textContent = ''; overlay.blur(); }
                        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); overlay.blur(); }
                    });
                    var isDraggingT = false, dragOffX, dragOffY;
                    overlay.addEventListener('mousedown', function(ev) {
                        if (ev.target !== overlay) return;
                        isDraggingT = true;
                        dragOffX = ev.clientX - overlay.getBoundingClientRect().left;
                        dragOffY = ev.clientY - overlay.getBoundingClientRect().top;
                        var onDragMove = function(ev2) {
                            if (!isDraggingT) return;
                            overlay.style.left = (ev2.clientX - dragOffX) + 'px';
                            overlay.style.top = (ev2.clientY - dragOffY) + 'px';
                        };
                        var onDragUp = function() {
                            isDraggingT = false;
                            document.removeEventListener('mousemove', onDragMove);
                            document.removeEventListener('mouseup', onDragUp);
                        };
                        document.addEventListener('mousemove', onDragMove);
                        document.addEventListener('mouseup', onDragUp);
                    });
                    return;
                }

                if (currentTool === 'picker') {
                    var imgData = ctx.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data;
                    var hex = '#' + [imgData[0], imgData[1], imgData[2]].map(function(v) { return v.toString(16).padStart(2,'0'); }).join('');
                    currentColor = hex;
                    colorBtns.forEach(function(b) { b.style.borderColor = 'rgba(255,255,255,0.15)'; });
                    showToast('Paint', 'Color picked: ' + hex, 'info');
                    return;
                }

                if (currentTool === 'fill') {
                    floodFill(p.x, p.y, { hex: currentColor });
                    saveState();
                    return;
                }

                painting = true;
                if (currentTool === 'pencil' || currentTool === 'eraser') {
                    ctx.save();
                    ctx.strokeStyle = currentTool === 'eraser' ? '#020813' : currentColor;
                    ctx.lineWidth = currentTool === 'eraser' ? parseInt(sizeSlider.value) * 3 : parseInt(sizeSlider.value);
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                } else if (currentTool === 'line' || currentTool === 'rect' || currentTool === 'frect' || currentTool === 'circle' || currentTool === 'fcircle') {
                    savedShapeState = ctx.getImageData(0, 0, canvas.width, canvas.height);
                }
            };

            canvas.onmousemove = function(e) {
                var p = getPos(e);
                coordsSpan.textContent = 'X: ' + Math.floor(p.x) + '  Y: ' + Math.floor(p.y);
                if (!painting) return;
                var lw = parseInt(sizeSlider.value);
                if (currentTool === 'pencil') {
                    ctx.lineTo(p.x, p.y);
                    ctx.stroke();
                } else if (currentTool === 'eraser') {
                    ctx.lineTo(p.x, p.y);
                    ctx.stroke();
                }
                if (currentTool === 'line' || currentTool === 'rect' || currentTool === 'frect' || currentTool === 'circle' || currentTool === 'fcircle') {
                    if (savedShapeState) {
                        ctx.putImageData(savedShapeState, 0, 0);
                        drawShape(startX, startY, p.x, p.y, currentTool, currentColor, lw);
                    }
                }
            };

            canvas.onmouseup = function() {
                if (painting) {
                    if (currentTool === 'pencil' || currentTool === 'eraser') {
                        ctx.restore();
                    }
                    painting = false;
                    savedShapeState = null;
                    saveState();
                }
            };

            canvas.onmouseleave = function() {
                if (painting) {
                    if (currentTool === 'pencil' || currentTool === 'eraser') {
                        ctx.restore();
                    }
                    painting = false;
                    savedShapeState = null;
                    saveState();
                }
            };

            undoBtn.onclick = function() { undo(); };
            redoBtn.onclick = function() { redo(); };
            clearBtn.onclick = function() {
                ctx.fillStyle = '#020813';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                saveState();
            };
        }
    },
    mediaplayer: {
        title: '\u{1F3B5} Media Player',
        icon: '\u{1F3B5}',
        createContent: (el, id) => {
            el.style.cssText = 'padding:8px;display:flex;flex-direction:column;align-items:center;gap:8px;';
            const video = document.createElement('video');
            video.style.cssText = 'width:100%;max-height:200px;border-radius:4px;background:#000;display:none;';
            video.controls = false;
            el.appendChild(video);
            const canvas = document.createElement('canvas');
            canvas.width = 300; canvas.height = 100;
            canvas.style.cssText = 'border:1px solid rgba(255,255,255,0.08);border-radius:6px;background:rgba(0,0,0,0.3);width:100%;';
            el.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            const info = document.createElement('div');
            info.style.cssText = 'text-align:center;font-size:0.75rem;opacity:0.7;';
            el.appendChild(info);
            const volumeRow = document.createElement('div');
            volumeRow.style.cssText = 'display:flex;align-items:center;gap:6px;width:100%;';
            const volIcon = document.createElement('span');
            volIcon.textContent = '\u{1F50A}';
            volIcon.style.cssText = 'font-size:0.85rem;';
            const volSlider = document.createElement('input');
            volSlider.type = 'range';
            volSlider.min = 0; volSlider.max = 100; volSlider.value = mediaState.volume;
            volSlider.style.cssText = 'flex:1;accent-color:var(--accent);height:4px;';
            const volLabel = document.createElement('span');
            volLabel.textContent = mediaState.volume + '%';
            volLabel.style.cssText = 'font-size:0.7rem;min-width:30px;text-align:right;opacity:0.6;';
            volumeRow.append(volIcon, volSlider, volLabel);
            el.appendChild(volumeRow);
            const progress = document.createElement('div');
            progress.style.cssText = 'width:100%;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;cursor:pointer;';
            const fill = document.createElement('div');
            fill.style.cssText = 'width:0%;height:100%;background:var(--accent);border-radius:2px;transition:width 0.3s;';
            progress.appendChild(fill);
            el.appendChild(progress);
            const controls = document.createElement('div');
            controls.style.cssText = 'display:flex;gap:8px;';
            const btnPrev = document.createElement('button');
            btnPrev.textContent = '\u{23EE}';
            btnPrev.style.cssText = 'margin:0;padding:4px 12px;font-size:1rem;';
            const btnPlay = document.createElement('button');
            btnPlay.textContent = '\u{25B6}';
            btnPlay.style.cssText = 'margin:0;padding:4px 12px;font-size:1rem;background:rgba(255,107,53,0.15);';
            const btnStop = document.createElement('button');
            btnStop.textContent = '\u{23F9}';
            btnStop.style.cssText = 'margin:0;padding:4px 12px;font-size:1rem;';
            const btnNext = document.createElement('button');
            btnNext.textContent = '\u{23ED}';
            btnNext.style.cssText = 'margin:0;padding:4px 12px;font-size:1rem;';
            controls.append(btnPrev, btnPlay, btnStop, btnNext);
            el.appendChild(controls);
            const waveTypeEl = document.createElement('div');
            waveTypeEl.style.cssText = 'display:flex;gap:4px;font-size:0.7rem;align-items:center;opacity:0.5;';
            waveTypeEl.textContent = 'Wave: ';
            el.appendChild(waveTypeEl);

            let audioCtx, oscillator, gainNode, analyser, animFrame;
            const waves = ['sine', 'sawtooth', 'square', 'triangle'];
            let currentWave = 0;

            function startAudio() {
                if (!audioCtx) {
                    try {
                        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                        analyser = audioCtx.createAnalyser();
                        analyser.fftSize = 256;
                        gainNode = audioCtx.createGain();
                        gainNode.gain.value = mediaState.volume / 100;
                        gainNode.connect(analyser);
                        analyser.connect(audioCtx.destination);
                    } catch(e) { showToast('Media Player', 'Audio not supported', 'error'); return false; }
                }
                if (audioCtx.state === 'suspended') audioCtx.resume();
                return true;
            }

            function stopOsc() {
                if (oscillator) {
                    try { oscillator.stop(); } catch(e) {}
                    oscillator.disconnect();
                    oscillator = null;
                }
                if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
            }

            function playTrack(index) {
                mediaState.trackIndex = ((index % mediaState.tracks.length) + mediaState.tracks.length) % mediaState.tracks.length;
                mediaState.currentTrack = mediaState.tracks[mediaState.trackIndex];
                mediaState.progress = 0;
                stopOsc();
                if (!startAudio()) return;
                const freq = 220 + mediaState.trackIndex * 110;
                oscillator = audioCtx.createOscillator();
                oscillator.type = waves[currentWave];
                oscillator.frequency.value = freq;
                oscillator.connect(gainNode);
                oscillator.start();
                mediaState.playing = true;
                syncPlayerUI();
                waveTypeEl.innerHTML = 'Wave: <span style="font-weight:600;">' + waves[currentWave] + '</span>';
                drawViz();
            }

            function drawViz() {
                if (!analyser || !mediaState.playing) return;
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyser.getByteTimeDomainData(dataArray);
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#ff6b35';
                ctx.beginPath();
                const sliceWidth = canvas.width / bufferLength;
                let x = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const v = dataArray[i] / 128.0;
                    const y = v * canvas.height / 2;
                    if (i === 0) ctx.lineTo(x, y);
                    else ctx.lineTo(x, y);
                    x += sliceWidth;
                }
                ctx.lineTo(canvas.width, canvas.height / 2);
                ctx.stroke();
                fill.style.width = mediaState.progress + '%';
                mediaState.progress += 0.05;
                if (mediaState.progress >= 100) {
                    mediaState.progress = 0;
                    playTrack(mediaState.trackIndex + 1);
                    return;
                }
                animFrame = requestAnimationFrame(drawViz);
            }

            function isVideoMode() { return video.style.display !== 'none' && video.src; }

            function syncPlayerUI() {
                if (isVideoMode()) {
                    info.textContent = 'Now Playing: ' + (mediaState.currentTrack || 'Video');
                    btnPlay.textContent = video.paused ? '\u{25B6}' : '\u{23F8}';
                    fill.style.width = video.duration ? (video.currentTime / video.duration * 100) + '%' : '0%';
                } else {
                    info.textContent = 'Now Playing: ' + mediaState.currentTrack;
                    btnPlay.textContent = mediaState.playing ? '\u{23F8}' : '\u{25B6}';
                }
            }

            progress.addEventListener('click', (e) => {
                const r = progress.getBoundingClientRect();
                const pct = (e.clientX - r.left) / r.width;
                mediaState.progress = pct * 100;
                if (oscillator) {
                    const freq = 220 + mediaState.trackIndex * 110;
                    oscillator.frequency.setValueAtTime(freq * (0.5 + pct), audioCtx.currentTime);
                }
            });

            btnPrev.addEventListener('click', () => {
                if (isVideoMode()) { video.currentTime = Math.max(0, video.currentTime - 10); return; }
                if (!audioCtx) { startAudio(); }
                playTrack(mediaState.trackIndex - 1);
            });
            btnPlay.addEventListener('click', () => {
                if (isVideoMode()) {
                    if (video.paused) video.play(); else video.pause();
                    syncPlayerUI(); return;
                }
                if (!mediaState.playing) {
                    if (!oscillator) { playTrack(mediaState.trackIndex); return; }
                    mediaState.playing = true;
                    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
                    drawViz();
                } else {
                    mediaState.playing = false;
                    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
                }
                syncPlayerUI();
            });
            btnStop.addEventListener('click', () => {
                if (isVideoMode()) { video.pause(); video.currentTime = 0; syncPlayerUI(); return; }
                mediaState.playing = false;
                mediaState.progress = 0;
                stopOsc();
                fill.style.width = '0%';
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                syncPlayerUI();
            });
            btnNext.addEventListener('click', () => {
                if (isVideoMode()) { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); return; }
                if (!audioCtx) { startAudio(); }
                playTrack(mediaState.trackIndex + 1);
            });
            waveTypeEl.addEventListener('click', () => {
                currentWave = (currentWave + 1) % waves.length;
                if (oscillator) {
                    oscillator.type = waves[currentWave];
                }
                waveTypeEl.innerHTML = 'Wave: <span style="font-weight:600;">' + waves[currentWave] + '</span>';
            });

            volSlider.addEventListener('input', () => {
                const v = +volSlider.value;
                volLabel.textContent = v + '%';
                mediaState.volume = v;
                if (gainNode) gainNode.gain.value = v / 100;
                volIcon.textContent = v === 0 ? '\u{1F507}' : v < 30 ? '\u{1F509}' : '\u{1F50A}';
            });

            video.addEventListener('timeupdate', syncPlayerUI);
            video.addEventListener('play', syncPlayerUI);
            video.addEventListener('pause', syncPlayerUI);
            video.addEventListener('ended', () => { video.currentTime = 0; syncPlayerUI(); });

            el._openVideo = function(dataUrl, name) {
                if (!dataUrl) { info.textContent = 'No video data for: ' + name; return; }
                stopOsc(); mediaState.playing = false;
                video.src = dataUrl;
                video.style.display = 'block';
                canvas.style.display = 'none';
                mediaState.currentTrack = name;
                video.load();
                info.textContent = 'Now Playing: ' + name + ' (video)';
                fill.style.width = '0%';
                btnPlay.textContent = '\u{25B6}';
            };
            el._closeVideo = function() {
                video.pause(); video.src = '';
                video.style.display = 'none';
                canvas.style.display = 'block';
                mediaState.currentTrack = mediaState.tracks[mediaState.trackIndex] || 'Ambient Waves \u{1F30A}';
                btnPlay.textContent = '\u{25B6}';
                syncPlayerUI();
            };

            syncPlayerUI();
            cleanups[id] = function() { video.pause(); video.src = ''; stopOsc(); if (audioCtx) audioCtx.close(); };
        }
    },
    controlpanel: {
        title: '\u2699 Control Panel',
        icon: '\u2699',
        createContent: (el) => {
            el.style.cssText = 'padding:10px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;';
            const items = [
                {i:'\u{1F4F1}', n:'Device Manager', d:'Manage hardware', action: () => {
                    var ov = document.createElement('div');
                    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;';
                    ov.innerHTML = '<div style="background:#0a1931;border:2px solid #33ff33;border-radius:8px;padding:24px;min-width:320px;max-width:90vw;color:#33ff33;font-family:monospace;">' +
                        '<h3 style="margin-bottom:12px;">\u{1F4F1} Device Manager</h3>' +
                        '<div style="font-size:0.8rem;opacity:0.8;margin-bottom:8px;">Simulated Devices:</div>' +
                        '<div style="font-size:0.75rem;line-height:2;">' +
                        '\u2705 CPU: Cyber Core i9 \u2014 Running<br>' +
                        '\u2705 GPU: Neon RTX 9090 \u2014 Running<br>' +
                        '\u2705 NIC: CyberNet Adapter \u2014 Connected<br>' +
                        '\u2705 Audio: Quantum Sound Card \u2014 Running<br>' +
                        '\u2705 Storage: SSD 1TB \u2014 Online<br>' +
                        '\u26A0\uFE0F Unknown Device \u2014 Driver missing' +
                        '</div>' +
                        '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="margin-top:16px;">Close</button></div>';
                    document.body.appendChild(ov);
                    ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
                }},
                {i:'\u{1F4BB}', n:'System', d:'View system info', action: () => {
                    var ov = document.createElement('div');
                    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;';
                    var cpuUsage = (Math.random() * 30 + 5).toFixed(1);
                    var memUsed = (Math.random() * 4 + 2).toFixed(1);
                    ov.innerHTML = '<div style="background:#0a1931;border:2px solid #33ff33;border-radius:8px;padding:24px;min-width:320px;max-width:90vw;color:#33ff33;font-family:monospace;">' +
                        '<h3 style="margin-bottom:12px;">\u{1F4BB} System Information</h3>' +
                        '<div style="font-size:0.8rem;line-height:2;">' +
                        'OS: Cyber OS v2.0<br>' +
                        'User: ' + (currentUser || 'Unknown') + '<br>' +
                        'CPU: Cyber Core i9 @ 4.2 GHz<br>' +
                        'CPU Usage: ' + cpuUsage + '%<br>' +
                        'RAM: ' + memUsed + ' GB / 16 GB<br>' +
                        'GPU: Neon RTX 9090<br>' +
                        'Storage: 512 GB SSD<br>' +
                        'Uptime: ' + Math.floor(performance.now() / 60000) + ' min<br>' +
                        'Build: CyberOS-2025-x64' +
                        '</div>' +
                        '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="margin-top:16px;">Close</button></div>';
                    document.body.appendChild(ov);
                    ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
                }},
                {i:'\u{1F3A8}', n:'Personalization', d:'Change theme', action: () => { toggleWindow('wallpapers'); }},
                {i:'\u{1F4F6}', n:'Network & Bluetooth', d:'Wi-Fi, Bluetooth', action: () => {
                    var ov = document.createElement('div');
                    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;';
                    var wifiOn = localStorage.getItem('cyberos_wifi') !== 'off';
                    var btOn = localStorage.getItem('cyberos_bluetooth') !== 'off';
                    var networks = [
                        {n:'CyberNet_5G', s:4, sec:'WPA3', connected:true},
                        {n:'Neighbor_WiFi', s:3, sec:'WPA2', connected:false},
                        {n:'Guest_Network', s:2, sec:'Open', connected:false},
                        {n:'Office_5GHz', s:4, sec:'WPA2-Ent', connected:false},
                        {n:'IoT_Hub', s:1, sec:'WPA2', connected:false},
                    ];
                    var btDevices = [
                        {n:'CyberBuds Pro', t:'🎧', paired:true, connected:true},
                        {n:'Quantum Mouse', t:'🖱️', paired:true, connected:true},
                        {n:'NeonKeys KB', t:'⌨️', paired:true, connected:false},
                        {n:'SmartWatch X1', t:'⌚', paired:false, connected:false},
                    ];
                    function renderNet() {
                        var wO = localStorage.getItem('cyberos_wifi') !== 'off';
                        var bO = localStorage.getItem('cyberos_bluetooth') !== 'off';
                        var html = '<div style="background:#0a1931;border:2px solid #33ff33;border-radius:8px;padding:24px;min-width:360px;max-width:95vw;max-height:85vh;overflow-y:auto;color:#33ff33;font-family:monospace;">' +
                            '<h3 style="margin-bottom:16px;">📶 Network & Bluetooth</h3>' +

                            // Wi-Fi section
                            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
                            '<span style="font-size:0.9rem;font-weight:bold;">📶 Wi-Fi</span>' +
                            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
                            '<span style="font-size:0.75rem;opacity:0.7;">' + (wO ? 'ON' : 'OFF') + '</span>' +
                            '<div id="cp-wifi-toggle" style="width:40px;height:20px;background:' + (wO ? '#33ff33' : 'rgba(51,255,51,0.2)') + ';border-radius:10px;cursor:pointer;position:relative;transition:background 0.2s;border:1px solid #33ff33;">' +
                            '<div style="width:16px;height:16px;background:#020813;border-radius:50%;position:absolute;top:1px;left:' + (wO ? '21px' : '1px') + ';transition:left 0.2s;"></div></div>' +
                            '</label></div>';

                        if (wO) {
                            html += '<div style="margin-bottom:16px;">';
                            networks.forEach(function(nw) {
                                var bars = '';
                                for (var i = 1; i <= 4; i++) bars += '<span style="display:inline-block;width:3px;height:' + (i*3) + 'px;background:' + (i <= nw.s ? '#33ff33' : 'rgba(51,255,51,0.2)') + ';margin:0 1px;vertical-align:bottom;"></span>';
                                html += '<div class="cp-net-row" data-net="' + nw.n + '" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;margin-bottom:3px;border:1px solid ' + (nw.connected ? '#33ff33' : 'rgba(51,255,51,0.15)') + ';border-radius:4px;cursor:pointer;background:' + (nw.connected ? 'rgba(51,255,51,0.08)' : 'transparent') + ';">' +
                                '<span>' + bars + ' <span style="margin-left:6px;">' + nw.n + '</span>' + (nw.connected ? ' <span style="color:#33ff33;font-size:0.65rem;">● Connected</span>' : '') + '</span>' +
                                '<span style="font-size:0.65rem;opacity:0.6;">' + nw.sec + '</span></div>';
                            });
                            html += '</div>';
                        } else {
                            html += '<div style="opacity:0.4;font-size:0.75rem;padding:12px;text-align:center;margin-bottom:16px;">Wi-Fi is turned off</div>';
                        }

                        // Bluetooth section
                        html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
                            '<span style="font-size:0.9rem;font-weight:bold;">🔵 Bluetooth</span>' +
                            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
                            '<span style="font-size:0.75rem;opacity:0.7;">' + (bO ? 'ON' : 'OFF') + '</span>' +
                            '<div id="cp-bt-toggle" style="width:40px;height:20px;background:' + (bO ? '#33ff33' : 'rgba(51,255,51,0.2)') + ';border-radius:10px;cursor:pointer;position:relative;transition:background 0.2s;border:1px solid #33ff33;">' +
                            '<div style="width:16px;height:16px;background:#020813;border-radius:50%;position:absolute;top:1px;left:' + (bO ? '21px' : '1px') + ';transition:left 0.2s;"></div></div>' +
                            '</label></div>';

                        if (bO) {
                            html += '<div style="margin-bottom:12px;">';
                            btDevices.forEach(function(dev) {
                                html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;margin-bottom:3px;border:1px solid ' + (dev.connected ? '#33ff33' : 'rgba(51,255,51,0.15)') + ';border-radius:4px;background:' + (dev.connected ? 'rgba(51,255,51,0.08)' : 'transparent') + ';">' +
                                '<span>' + dev.t + ' <span style="margin-left:6px;">' + dev.n + '</span></span>' +
                                '<span style="font-size:0.7rem;">' + (dev.connected ? '<span style="color:#33ff33;">Connected</span>' : dev.paired ? '<span style="opacity:0.5;">Paired</span>' : '<span style="opacity:0.4;">Available</span>') + '</span></div>';
                            });
                            html += '</div>';
                        } else {
                            html += '<div style="opacity:0.4;font-size:0.75rem;padding:12px;text-align:center;margin-bottom:12px;">Bluetooth is turned off</div>';
                        }

                        html += '<button id="cp-net-close" style="margin-top:8px;width:100%;">Close</button></div>';
                        ov.innerHTML = html;
                        ov.querySelector('#cp-net-close').onclick = function() { ov.remove(); };
                        ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
                        ov.querySelector('#cp-wifi-toggle').onclick = function(e) {
                            e.stopPropagation();
                            var cur = localStorage.getItem('cyberos_wifi') !== 'off';
                            localStorage.setItem('cyberos_wifi', cur ? 'off' : 'on');
                            document.getElementById('tray-network') && (document.getElementById('tray-network').textContent = cur ? '📵' : '📶');
                            showToast('Wi-Fi', cur ? 'Wi-Fi turned OFF' : 'Wi-Fi turned ON', 'info');
                            renderNet();
                        };
                        ov.querySelector('#cp-bt-toggle').onclick = function(e) {
                            e.stopPropagation();
                            var cur = localStorage.getItem('cyberos_bluetooth') !== 'off';
                            localStorage.setItem('cyberos_bluetooth', cur ? 'off' : 'on');
                            showToast('Bluetooth', cur ? 'Bluetooth turned OFF' : 'Bluetooth turned ON', 'info');
                            renderNet();
                        };
                        ov.querySelectorAll('.cp-net-row').forEach(function(row) {
                            row.onmouseenter = function() { if (!row.style.background.includes('0.08')) row.style.background = 'rgba(51,255,51,0.04)'; };
                            row.onmouseleave = function() { if (!row.style.background.includes('0.08')) row.style.background = 'transparent'; };
                            row.onclick = function(e) {
                                e.stopPropagation();
                                var netName = row.dataset.net;
                                if (localStorage.getItem('cyberos_wifi') === 'off') return;
                                networks.forEach(function(nw) { nw.connected = (nw.n === netName); });
                                showToast('Wi-Fi', 'Connected to ' + netName, 'info');
                                renderNet();
                            };
                        });
                    }
                    document.body.appendChild(ov);
                    renderNet();
                }},
                {i:'\u{1F50A}', n:'Sound', d:'Volume & audio', action: () => {
                    var ov = document.createElement('div');
                    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;';
                    var masterVol = parseInt(localStorage.getItem('cyberos_master_vol') || '75');
                    var appsVol = safeJsonObject('cyberos_apps_vol', {"system":80,"browser":60,"communications":50,"notifications":70});
                    var appList = [
                        {k:'system', i:'📰', n:'System Sounds'},
                        {k:'browser', i:'🌐', n:'Browser'},
                        {k:'communications', i:'📞', n:'Communications'},
                        {k:'notifications', i:'🔔', n:'Notifications'},
                    ];
                    function volIcon(v) { return v > 50 ? '🔊' : v > 0 ? '🔉' : '🔇'; }
                    function renderSound() {
                        var mv = parseInt(localStorage.getItem('cyberos_master_vol') || '75');
                        var av = safeJsonObject('cyberos_apps_vol', {"system":80,"browser":60,"communications":50,"notifications":70});
                        var html = '<div style="background:#0a1931;border:2px solid #33ff33;border-radius:8px;padding:24px;min-width:360px;max-width:95vw;color:#33ff33;font-family:monospace;">' +
                            '<h3 style="margin-bottom:16px;">🔊 Sound Settings</h3>' +

                            // Master volume
                            '<div style="margin-bottom:20px;">' +
                            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
                            '<span style="font-size:0.9rem;font-weight:bold;" id="cp-vol-icon">' + volIcon(mv) + ' Master Volume</span>' +
                            '<span id="cp-vol-label" style="font-size:0.85rem;color:#33ff33;min-width:36px;text-align:right;">' + mv + '%</span></div>' +
                            '<input id="cp-master-slider" type="range" min="0" max="100" value="' + mv + '" style="width:100%;accent-color:#33ff33;cursor:pointer;height:6px;">' +
                            '</div>' +

                            // Mute toggle
                            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding:8px 12px;border:1px solid rgba(51,255,51,0.2);border-radius:4px;">' +
                            '<span style="font-size:0.85rem;">🔇 Mute All</span>' +
                            '<div id="cp-mute-toggle" style="width:40px;height:20px;background:' + (mv === 0 ? '#33ff33' : 'rgba(51,255,51,0.2)') + ';border-radius:10px;cursor:pointer;position:relative;border:1px solid #33ff33;">' +
                            '<div style="width:16px;height:16px;background:#020813;border-radius:50%;position:absolute;top:1px;left:' + (mv === 0 ? '21px' : '1px') + ';transition:left 0.2s;"></div></div>' +
                            '</div>' +

                            // App volumes
                            '<div style="font-size:0.8rem;font-weight:bold;margin-bottom:10px;opacity:0.7;">App Volume Mixer</div>';

                        appList.forEach(function(app) {
                            var v = av[app.k] !== undefined ? av[app.k] : 50;
                            html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
                                '<span style="font-size:1rem;width:22px;text-align:center;">' + app.i + '</span>' +
                                '<span style="font-size:0.75rem;min-width:120px;">' + app.n + '</span>' +
                                '<input class="cp-app-slider" data-app="' + app.k + '" type="range" min="0" max="100" value="' + v + '" style="flex:1;accent-color:#33ff33;cursor:pointer;height:4px;">' +
                                '<span class="cp-app-label" style="font-size:0.7rem;min-width:32px;text-align:right;">' + v + '%</span></div>';
                        });

                        html += '<button id="cp-snd-close" style="margin-top:12px;width:100%;">Close</button></div>';
                        ov.innerHTML = html;

                        // Master slider interaction
                        ov.querySelector('#cp-master-slider').oninput = function() {
                            var v = parseInt(this.value);
                            localStorage.setItem('cyberos_master_vol', v);
                            ov.querySelector('#cp-vol-label').textContent = v + '%';
                            ov.querySelector('#cp-vol-icon').textContent = volIcon(v) + ' Master Volume';
                            var muteKnob = ov.querySelector('#cp-mute-toggle div');
                            var muteTrack = ov.querySelector('#cp-mute-toggle');
                            muteKnob.style.left = (v === 0 ? '21px' : '1px');
                            muteTrack.style.background = (v === 0 ? '#33ff33' : 'rgba(51,255,51,0.2)');
                            // Sync tray icon
                            var trayVol = document.getElementById('tray-volume');
                            if (trayVol) trayVol.textContent = volIcon(v);
                        };

                        // Mute toggle
                        ov.querySelector('#cp-mute-toggle').onclick = function() {
                            var cur = parseInt(localStorage.getItem('cyberos_master_vol') || '75');
                            var newVal = cur > 0 ? 0 : 75;
                            localStorage.setItem('cyberos_master_vol', newVal);
                            var trayVol = document.getElementById('tray-volume');
                            if (trayVol) trayVol.textContent = volIcon(newVal);
                            showToast('Sound', newVal === 0 ? 'Muted 🔇' : 'Unmuted 🔊', 'info');
                            renderSound();
                        };

                        // App sliders
                        ov.querySelectorAll('.cp-app-slider').forEach(function(sl) {
                            sl.oninput = function() {
                                var v = parseInt(this.value);
                                var label = this.parentElement.querySelector('.cp-app-label');
                                if (label) label.textContent = v + '%';
                                var apps = safeJsonObject('cyberos_apps_vol', {});
                                apps[this.dataset.app] = v;
                                localStorage.setItem('cyberos_apps_vol', JSON.stringify(apps));
                            };
                        });

                        ov.querySelector('#cp-snd-close').onclick = function() { ov.remove(); };
                        ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
                    }
                    document.body.appendChild(ov);
                    renderSound();
                }},
                {i:'\u{1F4C2}', n:'Administrative Tools', d:'Advanced tools', action: () => {
                    var ov = document.createElement('div');
                    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;';
                    ov.innerHTML = '<div style="background:#0a1931;border:2px solid #33ff33;border-radius:8px;padding:24px;min-width:280px;max-width:90vw;color:#33ff33;font-family:monospace;">' +
                        '<h3 style="margin-bottom:12px;">\u{1F4C2} Administrative Tools</h3>' +
                        '<div style="display:flex;flex-direction:column;gap:8px;font-size:0.85rem;">' +
                        '<button id="adm-cascade" style="margin:0;">Cascade Windows</button>' +
                        '<button id="adm-stack" style="margin:0;">Stack Windows</button>' +
                        '<button id="adm-taskmgr" style="margin:0;">Open Task Manager</button>' +
                        '</div>' +
                        '<button id="adm-close" style="margin-top:16px;">Close</button></div>';
                    document.body.appendChild(ov);
                    ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
                    ov.querySelector('#adm-cascade').onclick = function() { ov.remove(); cascadeWindows && cascadeWindows(); };
                    ov.querySelector('#adm-stack').onclick = function() { ov.remove(); stackWindows && stackWindows(); };
                    ov.querySelector('#adm-taskmgr').onclick = function() { ov.remove(); toggleWindow('taskmgr'); };
                    ov.querySelector('#adm-close').onclick = function() { ov.remove(); };
                }},
                {i:'\u{1F512}', n:'Security', d:'Security settings', action: () => {
                    var ov = document.createElement('div');
                    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;';
                    ov.innerHTML = '<div style="background:#0a1931;border:2px solid #33ff33;border-radius:8px;padding:24px;min-width:280px;max-width:90vw;color:#33ff33;font-family:monospace;">' +
                        '<h3 style="margin-bottom:12px;">\u{1F512} Security Center</h3>' +
                        '<div style="font-size:0.8rem;line-height:2;">' +
                        '\u2705 Firewall: Active<br>' +
                        '\u2705 Antivirus: Up to date<br>' +
                        '\u2705 Encryption: AES-256<br>' +
                        '\u2705 Last Scan: Today<br>' +
                        '\u26A0\uFE0F Suspicious processes: 0<br>' +
                        '\u{1F510} Session: Secure' +
                        '</div>' +
                        '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="margin-top:16px;">Close</button></div>';
                    document.body.appendChild(ov);
                    ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
                }},
                {i:'\u{1F4BE}', n:'Backup', d:'Backup and restore', action: () => {
                    var ov = document.createElement('div');
                    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;';
                    ov.innerHTML = '<div style="background:#0a1931;border:2px solid #33ff33;border-radius:8px;padding:24px;min-width:280px;max-width:90vw;color:#33ff33;font-family:monospace;">' +
                        '<h3 style="margin-bottom:12px;">\u{1F4BE} Backup & Restore</h3>' +
                        '<div style="font-size:0.8rem;line-height:2;margin-bottom:12px;">' +
                        'Last backup: Never<br>' +
                        'Storage used: ' + Math.round(JSON.stringify(localStorage).length / 1024) + ' KB<br>' +
                        'Backup location: LocalStorage<br>' +
                        '</div>' +
                        '<button id="bk-export" style="margin:0 0 8px 0;display:block;width:100%;">Export Data to File</button>' +
                        '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="margin-top:8px;">Close</button></div>';
                    document.body.appendChild(ov);
                    ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
                    ov.querySelector('#bk-export').onclick = function() {
                        var data = {};
                        for (var i = 0; i < localStorage.length; i++) {
                            var k = localStorage.key(i);
                            if (k && k.startsWith('cyberos_')) data[k] = localStorage.getItem(k);
                        }
                        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        var url = URL.createObjectURL(blob);
                        var a = document.createElement('a');
                        a.href = url; a.download = 'cyberos-backup.json'; a.click();
                        URL.revokeObjectURL(url);
                        showToast('Backup', 'Data exported successfully', 'info');
                        ov.remove();
                    };
                }},
            ];
            items.forEach(item => {
                const card = document.createElement('div');
                card.style.cssText = 'border:1px solid rgba(51,255,51,0.2);border-radius:6px;padding:12px 8px;text-align:center;cursor:pointer;background:rgba(0,0,0,0.2);';
                card.innerHTML = '<div style="font-size:1.8rem;">' + item.i + '</div><div style="font-size:0.8rem;margin-top:4px;">' + item.n + '</div><div style="font-size:0.65rem;opacity:0.5;">' + item.d + '</div>';
                card.onmouseenter = function() { this.style.borderColor = '#33ff33'; };
                card.onmouseleave = function() { this.style.borderColor = 'rgba(51,255,51,0.2)'; };
                card.onclick = function() { if (item.action) item.action(); };
                el.appendChild(card);
            });
        }
    },
    photos: {
        title: '\u{1F5BC} Photos',
        icon: '\u{1F5BC}',
        createContent: (el) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;';
            var toolbar = document.createElement('div');
            toolbar.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid rgba(51,255,51,0.15);flex-shrink:0;flex-wrap:wrap;';
            var pathSelect = document.createElement('select');
            pathSelect.style.cssText = 'background:rgba(0,0,0,0.3);color:var(--fg);border:1px solid var(--fg-dim);padding:2px 6px;border-radius:3px;font-size:0.7rem;margin:0;';
            var folders = ['Pictures', 'Screenshots', 'Desktop', 'Downloads'];
            folders.forEach(function(f) {
                var opt = document.createElement('option');
                opt.value = f; opt.textContent = '\u{1F4C1} ' + f;
                pathSelect.appendChild(opt);
            });
            toolbar.appendChild(pathSelect);
            var refreshBtn = document.createElement('button');
            refreshBtn.textContent = '\u{1F504}';
            refreshBtn.title = 'Refresh';
            refreshBtn.style.cssText = 'margin:0;padding:2px 8px;font-size:0.75rem;background:transparent;border:1px solid var(--fg-dim);color:var(--fg);border-radius:3px;cursor:pointer;';
            toolbar.appendChild(refreshBtn);
            var zoomSlider = document.createElement('input');
            zoomSlider.type = 'range';
            zoomSlider.min = '0.2'; zoomSlider.max = '3'; zoomSlider.step = '0.1'; zoomSlider.value = '1';
            zoomSlider.style.cssText = 'width:60px;accent-color:#33ff33;margin:0 4px;';
            toolbar.appendChild(zoomSlider);
            var zoomLabel = document.createElement('span');
            zoomLabel.style.cssText = 'font-size:0.65rem;opacity:0.6;min-width:30px;';
            zoomLabel.textContent = '100%';
            zoomSlider.oninput = function() { zoomLabel.textContent = Math.round(parseFloat(this.value) * 100) + '%'; if (viewerImg) applyPhotoZoom(); };
            toolbar.appendChild(zoomLabel);
            el.appendChild(toolbar);
            var gridContainer = document.createElement('div');
            gridContainer.style.cssText = 'flex:1;overflow:auto;padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;align-content:start;';
            el.appendChild(gridContainer);
            var viewerOverlay = null;
            function applyPhotoZoom() {
                if (!viewerOverlay) return;
                var vz = parseFloat(zoomSlider.value);
                var imgEl = viewerOverlay.querySelector('.pv-img');
                if (imgEl) imgEl.style.transform = 'scale(' + vz + ')';
            }
            function loadFolder(folderName) {
                gridContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;opacity:0.5;font-size:0.8rem;">Loading...</div>';
                var folderPath = ['This PC', folderName];
                if (folderName === 'Screenshots') folderPath = ['This PC', 'Pictures', 'Screenshots'];
                var folder = _feGetFolder(folderPath);
                if (!folder || !folder.children) {
                    gridContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;opacity:0.5;font-size:0.8rem;">Empty folder</div>';
                    return;
                }
                gridContainer.innerHTML = '';
                var images = [];
                Object.keys(folder.children).forEach(function(name) {
                    var entry = folder.children[name];
                    var isImg = /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(name) || (entry.data && typeof entry.data === 'string' && entry.data.indexOf('data:image/') === 0);
                    if (entry.type === 'folder' || !isImg) return;
                    images.push({ name: name, entry: entry });
                });
                images.sort(function(a, b) { return a.name.localeCompare(b.name); });
                if (images.length === 0) {
                    gridContainer.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;opacity:0.5;font-size:0.8rem;">No images found</div>';
                    return;
                }
                images.forEach(function(imgInfo) {
                    var card = document.createElement('div');
                    card.style.cssText = 'border:1px solid rgba(51,255,51,0.2);border-radius:4px;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;background:rgba(0,0,0,0.2);transition:border-color 0.2s;';
                    card.onmouseenter = function() { card.style.borderColor = '#33ff33'; };
                    card.onmouseleave = function() { card.style.borderColor = 'rgba(51,255,51,0.2)'; };
                    var thumb = document.createElement('img');
                    thumb.style.cssText = 'width:100%;height:100px;object-fit:cover;display:block;background:#020813;';
                    thumb.src = imgInfo.entry.data || '';
                    var label = document.createElement('div');
                    label.style.cssText = 'padding:4px 6px;font-size:0.6rem;text-overflow:ellipsis;overflow:hidden;white-space:nowrap;text-align:center;';
                    label.textContent = imgInfo.name;
                    card.appendChild(thumb);
                    card.appendChild(label);
                    card.onclick = function() {
                        showPhotoViewer(imgInfo.entry.data, imgInfo.name);
                    };
                    gridContainer.appendChild(card);
                });
            }
            function showPhotoViewer(dataUrl, name) {
                if (viewerOverlay) { viewerOverlay.remove(); viewerOverlay = null; }
                viewerOverlay = document.createElement('div');
                viewerOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:200000;display:flex;flex-direction:column;align-items:center;justify-content:center;';
                var headerBar = document.createElement('div');
                headerBar.style.cssText = 'position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:rgba(0,0,0,0.5);z-index:10;';
                var titleSpan = document.createElement('span');
                titleSpan.style.cssText = 'font-size:0.8rem;opacity:0.8;';
                titleSpan.textContent = name || 'Photo';
                headerBar.appendChild(titleSpan);
                var closeBtn = document.createElement('button');
                closeBtn.textContent = '\u2715';
                closeBtn.style.cssText = 'margin:0;padding:4px 12px;font-size:0.85rem;background:transparent;border:1px solid var(--fg-dim);color:var(--fg);border-radius:3px;cursor:pointer;';
                closeBtn.onclick = function() { viewerOverlay.remove(); viewerOverlay = null; };
                headerBar.appendChild(closeBtn);
                viewerOverlay.appendChild(headerBar);
                var imgContainer = document.createElement('div');
                imgContainer.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:20px;';
                var imgEl = document.createElement('img');
                imgEl.className = 'pv-img';
                imgEl.style.cssText = 'max-width:95%;max-height:90%;object-fit:contain;transition:transform 0.15s;';
                imgEl.src = dataUrl;
                imgContainer.appendChild(imgEl);
                viewerOverlay.appendChild(imgContainer);
                viewerOverlay.addEventListener('wheel', function(e) {
                    e.preventDefault();
                    var vz = parseFloat(zoomSlider.value);
                    vz += e.deltaY > 0 ? -0.1 : 0.1;
                    vz = Math.max(0.2, Math.min(3, vz));
                    zoomSlider.value = vz;
                    zoomLabel.textContent = Math.round(vz * 100) + '%';
                    applyPhotoZoom();
                }, { passive: false });
                document.body.appendChild(viewerOverlay);
            }
            pathSelect.onchange = function() { loadFolder(this.value); };
            refreshBtn.onclick = function() { loadFolder(pathSelect.value); };
            loadFolder('Pictures');
        }
    },
    camera: {
        title: '\u{1F4F7} Camera',
        icon: '\u{1F4F7}',
        createContent: (el) => {
            el.style.cssText = 'padding:8px;display:flex;flex-direction:column;align-items:center;gap:8px;';
            var video = document.createElement('video');
            video.style.cssText = 'width:100%;max-width:480px;border:2px solid var(--fg-dim);border-radius:4px;background:#000;flex:1;min-height:200px;object-fit:contain;';
            video.autoplay = true;
            video.playsinline = true;
            el.appendChild(video);
            var btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:8px;align-items:center;';
            var captureBtn = document.createElement('button');
            captureBtn.textContent = '\u{1F4F7} Capture Photo';
            captureBtn.style.cssText = 'margin:0;padding:6px 16px;font-size:0.8rem;';
            var recordBtn = document.createElement('button');
            recordBtn.textContent = '\u{25CF} Record Video';
            recordBtn.style.cssText = 'margin:0;padding:6px 16px;font-size:0.8rem;';
            var stream = null;
            var mediaRecorder = null;
            var recordedChunks = [];
            function startCamera() {
                if (stream) return;
                navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(function(s) {
                    stream = s;
                    video.srcObject = s;
                    video.play();
                    showToast('Camera', 'Camera started', 'info');
                }).catch(function(err) {
                    showToast('Camera', 'Camera error: ' + err.message, 'error');
                });
            }
            function stopCamera() {
                if (stream) {
                    stream.getTracks().forEach(function(t) { t.stop(); });
                    stream = null;
                    video.srcObject = null;
                }
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
            }
            captureBtn.onclick = function() {
                if (!stream) { showToast('Camera', 'Camera not available', 'error'); return; }
                var c = document.createElement('canvas');
                c.width = video.videoWidth || 640;
                c.height = video.videoHeight || 480;
                var cx = c.getContext('2d');
                cx.drawImage(video, 0, 0);
                var dataUrl = c.toDataURL('image/png');
                showSaveAsDialog(function(path, name) {
                    var folder = _feGetFolder(path.slice(0, -1));
                    if (!folder) return;
                    var pngName = name.replace(/\.[^.]+$/, '') + '.png';
                    folder.children[pngName] = { type: 'file', size: dataUrl.length, date: new Date().toLocaleString(), data: dataUrl, icon: '\u{1F5BC}' };
                    _feSaveFS();
                    showToast('Camera', 'Photo saved to ' + path.slice(0, -1).join('\\') + '\\' + pngName, 'info');
                }, 'photo_' + Date.now() + '.png');
            };
            recordBtn.onclick = function() {
                if (!stream) { showToast('Camera', 'Camera not available', 'error'); return; }
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    return;
                }
                recordedChunks = [];
                try {
                    mediaRecorder = new MediaRecorder(stream);
                    mediaRecorder.ondataavailable = function(e) {
                        if (e.data.size > 0) recordedChunks.push(e.data);
                    };
                    mediaRecorder.onstop = function() {
                        var blob = new Blob(recordedChunks, { type: 'video/webm' });
                        var reader = new FileReader();
                        reader.onload = function() {
                            var videoData = reader.result;
                            showSaveAsDialog(function(path, name) {
                                var folder = _feGetFolder(path.slice(0, -1));
                                if (!folder) return;
                                var vName = name.replace(/\.[^.]+$/, '') + '.webm';
                                folder.children[vName] = { type: 'file', size: videoData.length, date: new Date().toLocaleString(), data: videoData, icon: '\u{1F3AC}' };
                                _feSaveFS();
                                showToast('Camera', 'Video saved to ' + path.slice(0, -1).join('\\') + '\\' + vName, 'info');
                            }, 'video_' + Date.now() + '.webm');
                        };
                        reader.readAsDataURL(blob);
                        recordBtn.textContent = '\u{25CF} Record Video';
                        recordBtn.style.color = '';
                    };
                    mediaRecorder.start();
                    recordBtn.textContent = '\u{23F9} Stop Recording';
                    recordBtn.style.color = '#ff3333';
                    showToast('Camera', 'Recording started...', 'info');
                } catch(e) {
                    showToast('Camera', 'Recording error: ' + e.message, 'error');
                }
            };
            btnRow.appendChild(captureBtn);
            btnRow.appendChild(recordBtn);
            el.appendChild(btnRow);
            var stopBtn = document.createElement('button');
            stopBtn.textContent = '\u{274C} Stop Camera';
            stopBtn.style.cssText = 'margin:0;padding:4px 12px;font-size:0.7rem;';
            stopBtn.onclick = function() { stopCamera(); showToast('Camera', 'Camera stopped', 'info'); };
            btnRow.appendChild(stopBtn);
            startCamera();
            cleanups[el.closest('.window')?.id || ''] = function() { stopCamera(); };
        }
    },
    snake: {
        title: '\u{1F40D} Snake',
        icon: '\u{1F40D}',
        createContent: (el, id) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;';
            const header = document.createElement('div');
            header.className = 'snake-header';
            const scoreSpan = document.createElement('span');
            scoreSpan.textContent = 'Score: 0';
            const highSpan = document.createElement('span');
            const saved = safeJsonObject('cyberos_highscores', {});
            highSpan.textContent = 'Best: ' + (saved.snake || 0);
            const resetBtn = document.createElement('button');
            resetBtn.textContent = '\u{1F504}';
            resetBtn.style.cssText = 'margin:0;padding:2px 8px;font-size:0.75rem;';
            header.append(scoreSpan, highSpan, resetBtn);
            const canvas = document.createElement('canvas');
            canvas.className = 'game-canvas';
            canvas.style.cssText = 'flex:1;min-height:200px;background:#0f1720;display:block;';
            el.append(header, canvas);
            const ctx = canvas.getContext('2d');
            let gridSize = 20, tileCount = 20, snake = [{x:10,y:10}], food = {x:15,y:15}, direction = {x:0,y:0}, score = 0, gameOver = false, gameLoop;
            function resizeCanvas() {
                const s = Math.min(canvas.parentElement.clientWidth - 2, 400);
                canvas.width = s; canvas.height = s;
                tileCount = Math.floor(s / gridSize);
                if (snake.length === 1 && !gameOver) { snake = [{x:Math.floor(tileCount/2),y:Math.floor(tileCount/2)}]; food = {x:Math.floor(tileCount*0.75),y:Math.floor(tileCount*0.75)}; }
            }
            function resetGame() {
                snake = [{x:Math.floor(tileCount/2),y:Math.floor(tileCount/2)}];
                direction = {x:0,y:0};
                score = 0; gameOver = false;
                scoreSpan.textContent = 'Score: 0';
                spawnFood();
                draw();
            }
            function spawnFood() {
                let ok = false;
                while (!ok) {
                    food = {x:Math.floor(Math.random()*tileCount),y:Math.floor(Math.random()*tileCount)};
                    ok = !snake.some(s => s.x === food.x && s.y === food.y);
                }
            }
            function draw() {
                ctx.fillStyle = '#0f1720'; ctx.fillRect(0,0,canvas.width,canvas.height);
                ctx.strokeStyle = 'rgba(255,255,255,0.035)';
                ctx.lineWidth = 1;
                for (let p=0; p<=tileCount; p++) {
                    ctx.beginPath(); ctx.moveTo(p*gridSize,0); ctx.lineTo(p*gridSize,canvas.height); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(0,p*gridSize); ctx.lineTo(canvas.width,p*gridSize); ctx.stroke();
                }
                snake.forEach((seg,i) => {
                    ctx.globalAlpha = 1 - i * 0.02;
                    ctx.fillStyle = i === 0 ? '#7ee787' : '#38d16a';
                    ctx.beginPath();
                    if (ctx.roundRect) ctx.roundRect(seg.x*gridSize+2, seg.y*gridSize+2, gridSize-4, gridSize-4, 5);
                    else ctx.rect(seg.x*gridSize+2, seg.y*gridSize+2, gridSize-4, gridSize-4);
                    ctx.fill();
                });
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#ff4d5d';
                ctx.beginPath();
                ctx.arc(food.x*gridSize + gridSize/2, food.y*gridSize + gridSize/2, gridSize*0.34, 0, Math.PI*2);
                ctx.fill();
                if (!direction.x && !direction.y && !gameOver) {
                    ctx.fillStyle = 'rgba(255,255,255,0.72)';
                    ctx.font = '600 16px system-ui, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('Press arrow keys to start', canvas.width/2, canvas.height/2);
                }
                if (gameOver) {
                    ctx.fillStyle = 'rgba(0,0,0,0.6)';
                    ctx.fillRect(0,0,canvas.width,canvas.height);
                    ctx.fillStyle = '#ff3333';
                    ctx.font = 'bold 24px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText('GAME OVER', canvas.width/2, canvas.height/2);
                }
            }
            function update() {
                if (gameOver) return;
                if (direction.x === 0 && direction.y === 0) { draw(); return; }
                const head = {x:snake[0].x+direction.x, y:snake[0].y+direction.y};
                if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount || snake.some(s => s.x===head.x && s.y===head.y)) {
                    gameOver = true;
                    const hs = safeJsonObject('cyberos_highscores', {});
                    if (score > (hs.snake||0)) { hs.snake = score; localStorage.setItem('cyberos_highscores', JSON.stringify(hs)); highSpan.textContent = 'Best: ' + score; }
                    draw(); return;
                }
                snake.unshift(head);
                if (head.x === food.x && head.y === food.y) { score++; scoreSpan.textContent = 'Score: ' + score; spawnFood(); }
                else snake.pop();
                draw();
            }
            const snakeHandler = function(e) {
                const w = document.getElementById(id);
                if (!w || w.classList.contains('hidden')) return;
                if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','W','a','A','s','S','d','D'].includes(e.key)) e.preventDefault();
                if (e.key==='ArrowUp'||e.key==='w'||e.key==='W') { if (direction.y===0) direction = {x:0,y:-1}; }
                else if (e.key==='ArrowDown'||e.key==='s'||e.key==='S') { if (direction.y===0) direction = {x:0,y:1}; }
                else if (e.key==='ArrowLeft'||e.key==='a'||e.key==='A') { if (direction.x===0) direction = {x:-1,y:0}; }
                else if (e.key==='ArrowRight'||e.key==='d'||e.key==='D') { if (direction.x===0) direction = {x:1,y:0}; }
            };
            document.addEventListener('keydown', snakeHandler);
            resetBtn.onclick = resetGame;
            resizeCanvas();
            gameLoop = setInterval(update, 150);
            const ro = new ResizeObserver(() => { resizeCanvas(); draw(); });
            ro.observe(canvas.parentElement);
            cleanups[id] = function() { clearInterval(gameLoop); document.removeEventListener('keydown', snakeHandler); ro.disconnect(); };
        }
    },
    tictactoe: {
        title: '\u274C Tic Tac Toe',
        icon: '\u274C',
        createContent: (el, id) => {
            el.style.cssText = 'padding:8px;display:flex;flex-direction:column;align-items:center;';
            const status = document.createElement('div');
            status.className = 'ttt-status';
            status.textContent = 'Your turn (X)';
            const grid = document.createElement('div');
            grid.className = 'ttt-grid';
            let board = Array(9).fill(null);
            let turn = 'X', gameOver = false;
            const winPatterns = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
            function checkWinner(b) {
                for (const p of winPatterns) { if (b[p[0]] && b[p[0]]===b[p[1]] && b[p[1]]===b[p[2]]) return b[p[0]]; }
                if (b.every(c=>c)) return 'tie';
                return null;
            }
            function aiMove() {
                function scoreBoard(b, depth) {
                    const w = checkWinner(b);
                    if (w === 'O') return 10 - depth;
                    if (w === 'X') return depth - 10;
                    if (w === 'tie') return 0;
                    return null;
                }
                function minimax(b, player, depth) {
                    const scored = scoreBoard(b, depth);
                    if (scored !== null) return { score: scored };
                    const moves = b.map((c,i)=>c===null?i:null).filter(i=>i!==null);
                    let best = player === 'O' ? { score: -Infinity, idx: moves[0] } : { score: Infinity, idx: moves[0] };
                    moves.forEach(function(idx) {
                        b[idx] = player;
                        const result = minimax(b, player === 'O' ? 'X' : 'O', depth + 1).score;
                        b[idx] = null;
                        if ((player === 'O' && result > best.score) || (player === 'X' && result < best.score)) best = { score: result, idx: idx };
                    });
                    return best;
                }
                return minimax(board.slice(), 'O', 0).idx;
            }
            function makeMove(idx) {
                if (board[idx] || gameOver) return;
                board[idx] = turn;
                render();
                const w = checkWinner(board);
                if (w) { gameOver = true; status.textContent = w==='tie' ? "It's a tie!" : (w==='X' ? 'You win! \u{1F389}' : 'AI wins!'); if (w==='X') { const hs = safeJsonObject('cyberos_highscores',{}); hs.tictactoe = (hs.tictactoe||0)+1; localStorage.setItem('cyberos_highscores',JSON.stringify(hs)); } return; }
                turn = turn === 'X' ? 'O' : 'X';
                if (turn === 'O') {
                    status.textContent = 'AI thinking...';
                    setTimeout(() => { makeMove(aiMove()); }, 300);
                } else status.textContent = 'Your turn (X)';
            }
            function render() {
                grid.innerHTML = '';
                board.forEach((c,i) => {
                    const btn = document.createElement('button');
                    btn.className = 'ttt-cell';
                    btn.textContent = c || '';
                    btn.onclick = () => { if (turn==='X') makeMove(i); };
                    grid.appendChild(btn);
                });
            }
            const resetBtn = document.createElement('button');
            resetBtn.textContent = '\u{1F504} New Game';
            resetBtn.style.cssText = 'margin:8px 0 0 0;font-size:0.85rem;';
            resetBtn.onclick = () => { board = Array(9).fill(null); turn = 'X'; gameOver = false; status.textContent = 'Your turn (X)'; render(); };
            el.append(status, grid, resetBtn);
            render();
        }
    },
    solitaire: {
        title: '\u{1F0CF} Solitaire',
        icon: '\u{1F0CF}',
        createContent: (el, id) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;';
            const area = document.createElement('div');
            area.className = 'solitaire-area';
            const suits = ['\u2665','\u2666','\u2663','\u2660'];
            const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
            let deck = [], stock = [], waste = [], foundations = [[],[],[],[]], tableau = [[],[],[],[],[],[],[]];
            let selected = null;
            function createDeck() {
                const d = [];
                for (let s=0; s<4; s++) for (let r=0; r<13; r++) d.push({suit:s,rank:r,faceUp:false});
                for (let i=d.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
                return d;
            }
            function newGame() {
                deck = createDeck();
                stock = []; waste = []; foundations = [[],[],[],[]]; tableau = [[],[],[],[],[],[],[]];
                for (let i=0; i<7; i++) { for (let j=0; j<=i; j++) { const c = deck.pop(); c.faceUp = j===i; tableau[i].push(c); } }
                stock = deck;
                selected = null;
                render();
            }
            function cardLabel(c) { return ranks[c.rank] + suits[c.suit]; }
            function cardColor(c) { return c.suit < 2 ? 'red' : 'black'; }
            function topCard(location) {
                if (!location) return null;
                if (location.type === 'waste') return waste[waste.length - 1];
                if (location.type === 'tableau') return tableau[location.col][tableau[location.col].length - 1];
                return null;
            }
            function selectedCards() {
                if (!selected) return [];
                if (selected.type === 'waste') return waste.length ? [waste[waste.length - 1]] : [];
                if (selected.type === 'tableau') return tableau[selected.col].slice(selected.index);
                return [];
            }
            function clearSelection() { selected = null; }
            function removeSelected() {
                if (!selected) return [];
                let moving = [];
                if (selected.type === 'waste') {
                    if (waste.length) moving = [waste.pop()];
                } else if (selected.type === 'tableau') {
                    moving = tableau[selected.col].splice(selected.index);
                    const src = tableau[selected.col];
                    if (src.length && !src[src.length - 1].faceUp) src[src.length - 1].faceUp = true;
                }
                selected = null;
                return moving;
            }
            function canPlaceOnTableau(cards, col) {
                if (!cards.length) return false;
                const target = tableau[col][tableau[col].length - 1];
                if (!target) return cards[0].rank === 12;
                return target.faceUp && cards[0].rank === target.rank - 1 && cardColor(cards[0]) !== cardColor(target);
            }
            function canPlaceOnFoundation(card, idx) {
                if (!card || card.suit !== idx) return false;
                const stack = foundations[idx];
                return stack.length === 0 ? card.rank === 0 : card.rank === stack[stack.length - 1].rank + 1;
            }
            function moveToTableau(col) {
                const cards = selectedCards();
                if (!canPlaceOnTableau(cards, col)) { clearSelection(); render(); return; }
                tableau[col] = tableau[col].concat(removeSelected().map(c => { c.faceUp = true; return c; }));
                render();
            }
            function moveToFoundation(idx) {
                const cards = selectedCards();
                if (cards.length !== 1 || !canPlaceOnFoundation(cards[0], idx)) { clearSelection(); render(); return; }
                foundations[idx].push(removeSelected()[0]);
                if (foundations.every(f => f.length === 13)) {
                    const hs = safeJsonObject('cyberos_highscores', {});
                    hs.solitaire = (hs.solitaire || 0) + 1;
                    localStorage.setItem('cyberos_highscores', JSON.stringify(hs));
                    showToast('Solitaire', 'You cleared the deck', 'info');
                }
                render();
            }
            function makeCard(c, selectedClass) {
                const cd = document.createElement('div');
                cd.className = 'card face-up ' + cardColor(c) + (selectedClass ? ' selected' : '');
                cd.innerHTML = '<span class="card-rank">' + ranks[c.rank] + '</span><span class="card-suit">' + suits[c.suit] + '</span>';
                return cd;
            }
            function render() {
                area.innerHTML = '';
                const topRow = document.createElement('div');
                topRow.className = 'solitaire-top';
                const stockDiv = document.createElement('div');
                stockDiv.className = 'card-stock';
                const stockCard = document.createElement('div');
                stockCard.className = 'card face-down';
                stockCard.textContent = stock.length > 0 ? '\u{1F0CF}' : '';
                stockCard.title = stock.length ? 'Draw card' : 'Recycle waste';
                stockCard.onclick = () => {
                    clearSelection();
                    if (stock.length===0) { stock = waste.reverse().map(c=>{c.faceUp=false;return c;}); waste=[]; }
                    else { const c = stock.pop(); c.faceUp = true; waste.push(c); }
                    render();
                };
                stockDiv.appendChild(stockCard);
                topRow.appendChild(stockDiv);
                const wasteDiv = document.createElement('div');
                if (waste.length > 0) {
                    const wc = makeCard(waste[waste.length-1], selected && selected.type === 'waste');
                    wc.onclick = () => { selected = selected && selected.type === 'waste' ? null : { type:'waste' }; render(); };
                    wasteDiv.appendChild(wc);
                } else { const e = document.createElement('div'); e.className = 'card empty-slot'; wasteDiv.appendChild(e); }
                topRow.appendChild(wasteDiv);
                const foundDiv = document.createElement('div');
                foundDiv.className = 'solitaire-foundations';
                foundations.forEach((f,i) => {
                    const fd = document.createElement('div');
                    if (f.length>0) {
                        const c = f[f.length-1];
                        fd.className = 'card face-up ' + cardColor(c);
                        fd.innerHTML = '<span class="card-rank">' + ranks[c.rank] + '</span><span class="card-suit">' + suits[c.suit] + '</span>';
                    } else { fd.className = 'card empty-slot'; fd.textContent = suits[i]; }
                    fd.onclick = () => moveToFoundation(i);
                    foundDiv.appendChild(fd);
                });
                topRow.appendChild(foundDiv);
                area.appendChild(topRow);
                const tabDiv = document.createElement('div');
                tabDiv.className = 'solitaire-tableau';
                tableau.forEach((col,ci) => {
                    const colDiv = document.createElement('div');
                    colDiv.className = 'solitaire-column';
                    if (col.length===0) {
                        const e = document.createElement('div');
                        e.className = 'card empty-slot';
                        e.onclick = () => moveToTableau(ci);
                        colDiv.appendChild(e);
                    } else {
                        col.forEach((c,ri) => {
                            const cd = document.createElement('div');
                            if (c.faceUp) {
                                cd.className = 'card face-up ' + cardColor(c) + (selected && selected.type === 'tableau' && selected.col === ci && ri >= selected.index ? ' selected' : '');
                                cd.innerHTML = '<span class="card-rank">' + ranks[c.rank] + '</span><span class="card-suit">' + suits[c.suit] + '</span>';
                                cd.onclick = (e) => {
                                    e.stopPropagation();
                                    if (selected) {
                                        moveToTableau(ci);
                                    } else {
                                        selected = { type:'tableau', col:ci, index:ri };
                                        render();
                                    }
                                };
                            } else {
                                cd.className = 'card face-down';
                                cd.onclick = () => { if (ri===col.length-1) { c.faceUp=true; render(); } };
                            }
                            colDiv.appendChild(cd);
                        });
                    }
                    colDiv.ondragover = e => e.preventDefault();
                    colDiv.ondrop = e => { e.preventDefault(); moveToTableau(ci); };
                    tabDiv.appendChild(colDiv);
                });
                area.appendChild(tabDiv);
                const bottomRow = document.createElement('div');
                bottomRow.style.cssText = 'display:flex;justify-content:center;gap:8px;flex-shrink:0;padding:4px;';
                const newBtn = document.createElement('button');
                newBtn.textContent = '\u{1F504} New Game';
                newBtn.style.cssText = 'margin:0;padding:4px 16px;font-size:0.8rem;';
                newBtn.onclick = newGame;
                const msg = document.createElement('span');
                msg.style.cssText = 'font-size:0.7rem;opacity:0.5;line-height:2;';
                msg.textContent = selected ? 'Select destination' : 'Draw, stack alternating colors, build A-K foundations';
                const autoBtn = document.createElement('button');
                autoBtn.textContent = 'Clear';
                autoBtn.style.cssText = 'margin:0;padding:4px 8px;font-size:0.7rem;';
                autoBtn.onclick = () => { clearSelection(); render(); };
                bottomRow.append(newBtn, msg, autoBtn);
                area.appendChild(bottomRow);
                el.innerHTML = '';
                el.appendChild(area);
            }
            newGame();
        }
    },
    minesweeper: {
        title: '\u{1F4A3} Minesweeper',
        icon: '\u{1F4A3}',
        createContent: (el, id) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;';
            const header = document.createElement('div');
            header.className = 'ms-header';
            const mineCount = document.createElement('span');
            mineCount.textContent = 'Mines: 10';
            const status = document.createElement('span');
            status.textContent = '\u{1F4A3}';
            const resetBtn = document.createElement('button');
            resetBtn.textContent = '\u{1F504}';
            resetBtn.style.cssText = 'margin:0;padding:2px 8px;font-size:0.75rem;';
            header.append(mineCount, status, resetBtn);
            const grid = document.createElement('div');
            grid.className = 'ms-grid';
            const rows=9, cols=9, totalMines=10;
            let board = [], revealed = [], flagged = [], gameOver = false, flagMode = false;
            function init() {
                board = Array(rows).fill().map(()=>Array(cols).fill(0));
                revealed = Array(rows).fill().map(()=>Array(cols).fill(false));
                flagged = Array(rows).fill().map(()=>Array(cols).fill(false));
                gameOver = false; flagMode = false;
                let placed = 0;
                while (placed < totalMines) {
                    const r = Math.floor(Math.random()*rows), c = Math.floor(Math.random()*cols);
                    if (board[r][c]!==-1) { board[r][c] = -1; placed++; }
                }
                for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) if (board[r][c]!==-1) {
                    let count = 0;
                    for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++) {
                        const nr=r+dr, nc=c+dc;
                        if (nr>=0&&nr<rows&&nc>=0&&nc<cols&&board[nr][nc]===-1) count++;
                    }
                    board[r][c]=count;
                }
                render();
            }
            function reveal(r,c) {
                if (r<0||r>=rows||c<0||c>=cols||revealed[r][c]||flagged[r][c]) return;
                revealed[r][c] = true;
                if (board[r][c]===-1) { gameOver = true; status.textContent = '\u{1F4A5}'; render(); return; }
                if (board[r][c]===0) for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++) reveal(r+dr,c+dc);
                render();
                const won = revealed.flat().every((v,i)=>v || board.flat()[i]===-1);
                if (won) { gameOver = true; status.textContent = '\u{1F389}'; const hs = safeJsonParse(localStorage.getItem('cyberos_highscores'),{}); hs.minesweeper = (hs.minesweeper||0)+1; localStorage.setItem('cyberos_highscores',JSON.stringify(hs)); }
            }
            function render() {
                grid.style.gridTemplateColumns = `repeat(${cols},30px)`;
                grid.innerHTML = '';
                for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) {
                    const cell = document.createElement('div');
                    cell.className = 'ms-cell';
                    if (revealed[r][c]) {
                        cell.classList.add('revealed');
                        if (board[r][c]===-1) { cell.classList.add('mine'); cell.textContent = '\u{1F4A3}'; }
                        else cell.textContent = board[r][c]||'';
                    } else if (flagged[r][c]) { cell.classList.add('flagged'); cell.textContent = '\u{1F6A9}'; }
                    cell.oncontextmenu = (e) => { e.preventDefault(); if (gameOver||revealed[r][c]) return; flagged[r][c]=!flagged[r][c]; render(); };
                    cell.onclick = () => { if (gameOver) return; if (flagged[r][c]) return; reveal(r,c); };
                    grid.appendChild(cell);
                }
            }
            resetBtn.onclick = init;
            init();
            el.append(header, grid);
        }
    },
    blackjack: {
        title: '\u2660\uFE0F Blackjack',
        icon: '\u2660\uFE0F',
        createContent: (el, id) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;';
            const area = document.createElement('div');
            area.className = 'blackjack-area';
            const suits = ['\u2665','\u2666','\u2663','\u2660'];
            const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
            let deck = [], playerHand = [], dealerHand = [], gameOver = false, stand = false;
            function createDeck() {
                const d = [];
                for (let s=0; s<4; s++) for (let r=0; r<13; r++) d.push({suit:s,rank:r});
                for (let i=d.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; }
                return d;
            }
            function handValue(hand) {
                let v = 0, aces = 0;
                hand.forEach(c => { if (c.rank===0) aces++; else if (c.rank>=10) v+=10; else v+=c.rank+1; });
                while (aces > 0 && v+11 <= 21) { v+=11; aces--; }
                v+=aces;
                return v;
            }
            function renderCard(c, hidden) {
                const d = document.createElement('div');
                d.className = 'bj-card ' + (hidden ? 'hidden' : (c.suit<2?'red':'black'));
                d.textContent = hidden ? '' : ranks[c.rank] + suits[c.suit];
                return d;
            }
            function render() {
                area.innerHTML = '';
                const dealerSec = document.createElement('div');
                dealerSec.className = 'bj-section';
                const dh4 = document.createElement('h4');
                dh4.textContent = 'Dealer' + (gameOver ? ' ('+handValue(dealerHand)+')' : '');
                dealerSec.appendChild(dh4);
                const dc = document.createElement('div'); dc.className = 'bj-cards';
                dealerHand.forEach((c,i) => dc.appendChild(renderCard(c, !gameOver && i===1)));
                dealerSec.appendChild(dc);
                area.appendChild(dealerSec);
                const playerSec = document.createElement('div');
                playerSec.className = 'bj-section';
                const ph4 = document.createElement('h4');
                ph4.textContent = 'You (' + handValue(playerHand) + ')';
                playerSec.appendChild(ph4);
                const pc = document.createElement('div'); pc.className = 'bj-cards';
                playerHand.forEach(c => pc.appendChild(renderCard(c, false)));
                playerSec.appendChild(pc);
                area.appendChild(playerSec);
                const result = document.createElement('div');
                result.className = 'bj-result';
                if (gameOver) {
                    const pv = handValue(playerHand), dv = handValue(dealerHand);
                    if (pv>21) result.textContent = 'Bust! Dealer wins. \u{1F614}';
                    else if (dv>21) result.textContent = 'Dealer busts! You win! \u{1F389}';
                    else if (pv>dv) result.textContent = 'You win! \u{1F389}';
                    else if (pv<dv) result.textContent = 'Dealer wins. \u{1F614}';
                    else result.textContent = 'Push!';
                }
                area.appendChild(result);
                const controls = document.createElement('div');
                controls.className = 'bj-controls';
                if (!gameOver) {
                    const hitBtn = document.createElement('button'); hitBtn.textContent = 'Hit'; hitBtn.style.cssText = 'margin:0;';
                    const standBtn = document.createElement('button'); standBtn.textContent = 'Stand'; standBtn.style.cssText = 'margin:0;';
                    hitBtn.onclick = () => { playerHand.push(deck.pop()); if (handValue(playerHand)>=21) { stand=true; dealerPlay(); } render(); };
                    standBtn.onclick = () => { stand=true; dealerPlay(); render(); };
                    controls.append(hitBtn, standBtn);
                }
                const newBtn = document.createElement('button');
                newBtn.textContent = '\u{1F504} New Hand';
                newBtn.style.cssText = 'margin:0;';
                newBtn.onclick = newHand;
                controls.appendChild(newBtn);
                area.appendChild(controls);
                el.innerHTML = '';
                el.appendChild(area);
            }
            function dealerPlay() {
                gameOver = true;
                while (handValue(dealerHand) < 17) dealerHand.push(deck.pop());
                const hv = handValue(playerHand);
                if (hv<=21 && handValue(dealerHand)>21 || hv<=21 && hv>handValue(dealerHand) && hv<=21) {
                    const hs = safeJsonParse(localStorage.getItem('cyberos_highscores'),{});
                    hs.blackjack = (hs.blackjack||0)+1;
                    localStorage.setItem('cyberos_highscores',JSON.stringify(hs));
                }
                render();
            }
            function newHand() {
                deck = createDeck();
                playerHand = [deck.pop(), deck.pop()];
                dealerHand = [deck.pop(), deck.pop()];
                gameOver = false; stand = false;
                if (handValue(playerHand)===21) { stand=true; dealerPlay(); }
                render();
            }
            newHand();
        }
    },
    memory: {
        title: '\u{1F0CF} Memory',
        icon: '\u{1F0CF}',
        createContent: (el, id) => {
            el.style.cssText = 'padding:8px;display:flex;flex-direction:column;align-items:center;';
            const emojis = ['\u{1F436}','\u{1F431}','\u{1F434}','\u{1F981}','\u{1F42F}','\u{1F43B}','\u{1F437}','\u{1F63A}','\u{1F31F}','\u{1F4A0}','\u{1F47E}','\u{1F525}','\u{26A1}','\u{1F30D}','\u{1F680}','\u{1F308}'];
            const scoreDiv = document.createElement('div');
            scoreDiv.className = 'memory-score';
            let cards = [], flipped = [], matched = [], moves = 0, pairs = 4, locked = false;
            function initGame() {
                const used = emojis.slice(0, pairs);
                cards = [...used, ...used];
                for (let i=cards.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [cards[i],cards[j]]=[cards[j],cards[i]]; }
                flipped = []; matched = []; moves = 0; locked = false;
                scoreDiv.textContent = 'Moves: 0 | Matched: 0/' + pairs;
                render();
            }
            function render() {
                const grid = document.createElement('div');
                grid.className = 'memory-grid';
                grid.style.gridTemplateColumns = 'repeat(' + Math.min(4, pairs) + ',1fr)';
                cards.forEach((emoji, i) => {
                    const card = document.createElement('div');
                    card.className = 'memory-card' + (flipped.includes(i)||matched.includes(i)?' flipped':'') + (matched.includes(i)?' matched':'');
                    card.textContent = flipped.includes(i)||matched.includes(i) ? emoji : '';
                    card.onclick = () => flipCard(i);
                    grid.appendChild(card);
                });
                el.innerHTML = '';
                el.appendChild(scoreDiv);
                el.appendChild(grid);
                const resetBtn = document.createElement('button');
                resetBtn.textContent = '\u{1F504} New Game';
                resetBtn.style.cssText = 'margin:8px 0 0 0;font-size:0.85rem;';
                resetBtn.onclick = initGame;
                const lvlRow = document.createElement('div');
                lvlRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;font-size:0.75rem;';
                const lvlLabel = document.createElement('span');
                lvlLabel.textContent = 'Pairs: ' + pairs;
                const lvlSlider = document.createElement('input');
                lvlSlider.type = 'range'; lvlSlider.min = 2; lvlSlider.max = 16; lvlSlider.value = pairs;
                lvlSlider.style.cssText = 'width:100px;accent-color:#33ff33;';
                lvlSlider.oninput = () => { pairs = parseInt(lvlSlider.value); lvlLabel.textContent = 'Pairs: ' + pairs; };
                lvlSlider.onchange = initGame;
                lvlRow.append(lvlLabel, lvlSlider);
                el.append(resetBtn, lvlRow);
            }
            function flipCard(i) {
                if (locked || flipped.includes(i) || matched.includes(i)) return;
                flipped.push(i);
                render();
                if (flipped.length === 2) {
                    locked = true;
                    moves++;
                    if (cards[flipped[0]] === cards[flipped[1]]) {
                        matched.push(flipped[0], flipped[1]);
                        flipped = [];
                        locked = false;
                        if (matched.length === cards.length) {
                            const hs = safeJsonObject('cyberos_highscores',{});
                            if (!hs.memory || moves < hs.memory) { hs.memory = moves; localStorage.setItem('cyberos_highscores',JSON.stringify(hs)); }
                        }
                        render();
                    } else {
                        scoreDiv.textContent = 'Moves: ' + moves + ' | Matched: ' + (matched.length/2) + '/' + pairs;
                        setTimeout(() => { flipped = []; locked = false; render(); }, 800);
                    }
                }
            }
            initGame();
        }
    },
    game2048: {
        title: '\u{1F3B2} 2048',
        icon: '\u{1F3B2}',
        createContent: (el, id) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;';
            const header = document.createElement('div');
            header.className = 'game2048-header';
            const scoreSpan = document.createElement('span');
            scoreSpan.textContent = 'Score: 0';
            const bestSpan = document.createElement('span');
            const hs = safeJsonObject('cyberos_highscores',{});
            bestSpan.textContent = 'Best: ' + (hs['2048']||0);
            const resetBtn = document.createElement('button');
            resetBtn.textContent = '\u{1F504}';
            resetBtn.style.cssText = 'margin:0;padding:2px 8px;font-size:0.75rem;';
            header.append(scoreSpan, bestSpan, resetBtn);
            const container = document.createElement('div');
            container.className = 'game2048-container';
            const grid = document.createElement('div');
            grid.className = 'game2048-grid';
            let board = Array(4).fill().map(()=>Array(4).fill(0));
            let score = 0;
            function addTile() {
                const empty = [];
                for (let r=0; r<4; r++) for (let c=0; c<4; c++) if (!board[r][c]) empty.push({r,c});
                if (empty.length===0) return;
                const {r,c} = empty[Math.floor(Math.random()*empty.length)];
                board[r][c] = Math.random()<0.9 ? 2 : 4;
            }
            function render() {
                grid.innerHTML = '';
                for (let r=0; r<4; r++) for (let c=0; c<4; c++) {
                    const cell = document.createElement('div');
                    cell.className = 'game2048-cell';
                    if (board[r][c]) {
                        const v = board[r][c];
                        cell.classList.add('tile-' + v);
                        cell.textContent = v;
                        cell.classList.add('just-appeared');
                    }
                    grid.appendChild(cell);
                }
            }
            function slide(row) {
                const f = row.filter(v=>v);
                const merged = [];
                let sc = 0;
                for (let i=0; i<f.length; i++) {
                    if (i+1<f.length && f[i]===f[i+1]) { merged.push(f[i]*2); sc += f[i]*2; i++; }
                    else merged.push(f[i]);
                }
                while (merged.length<4) merged.push(0);
                return {row:merged, score:sc};
            }
            function move(d) {
                let moved = false, totalScore = 0;
                const old = board.map(r=>[...r]);
                if (d==='left') for (let r=0; r<4; r++) { const res = slide(board[r]); board[r] = res.row; totalScore += res.score; }
                else if (d==='right') for (let r=0; r<4; r++) { const res = slide(board[r].slice().reverse()); board[r] = res.row.reverse(); totalScore += res.score; }
                else if (d==='up') for (let c=0; c<4; c++) { const col = [board[0][c],board[1][c],board[2][c],board[3][c]]; const res = slide(col); for (let r=0; r<4; r++) board[r][c] = res.row[r]; totalScore += res.score; }
                else if (d==='down') for (let c=0; c<4; c++) { const col = [board[3][c],board[2][c],board[1][c],board[0][c]]; const res = slide(col); for (let r=0; r<4; r++) board[3-r][c] = res.row[r]; totalScore += res.score; }
                for (let r=0; r<4; r++) for (let c=0; c<4; c++) if (old[r][c]!==board[r][c]) moved=true;
                if (moved) { score += totalScore; scoreSpan.textContent = 'Score: ' + score; addTile(); render(); if (totalScore>0) { const hs2 = safeJsonParse(localStorage.getItem('cyberos_highscores'),{}); if (score>(hs2['2048']||0)) { hs2['2048']=score; localStorage.setItem('cyberos_highscores',JSON.stringify(hs2)); bestSpan.textContent = 'Best: '+score; } } }
            }
            function resetGame() {
                board = Array(4).fill().map(()=>Array(4).fill(0));
                score = 0; scoreSpan.textContent = 'Score: 0';
                addTile(); addTile(); render();
            }
            const g2048Handler = function(e) {
                const w = document.getElementById(id);
                if (!w || w.classList.contains('hidden')) return;
                if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); move(e.key.slice(5).toLowerCase()); }
            };
            document.addEventListener('keydown', g2048Handler);
            resetBtn.onclick = resetGame;
            resetGame();
            el.append(header, container);
            container.appendChild(grid);
            cleanups[id] = function() { document.removeEventListener('keydown', g2048Handler); };
        }
    },
    pacman: {
        title: '\u{1F7E1} Pac-Man',
        icon: '\u{1F7E1}',
        createContent: (el, id) => {
            el.style.cssText = 'padding:0;display:flex;flex-direction:column;';
            const header = document.createElement('div');
            header.className = 'pacman-header';
            const scoreSpan = document.createElement('span');
            scoreSpan.textContent = 'Score: 0';
            const livesSpan = document.createElement('span');
            livesSpan.textContent = 'Lives: 3';
            const resetBtn = document.createElement('button');
            resetBtn.textContent = '\u{1F504}';
            resetBtn.style.cssText = 'margin:0;padding:2px 8px;font-size:0.75rem;';
            header.append(scoreSpan, livesSpan, resetBtn);
            const canvas = document.createElement('canvas');
            canvas.className = 'pacman-canvas';
            canvas.style.cssText = 'flex:1;min-height:200px;background:#020813;display:block;';
            el.append(header, canvas);
            const ctx = canvas.getContext('2d');
            const cols=19, size=20;
            let pacman = {x:9,y:15,dir:0,nextDir:0,mouth:0};
            let ghosts = [
                {x:9,y:8,color:'#ff3333',dir:0,scared:false},
                {x:8,y:8,color:'#ff88cc',dir:1,scared:false},
                {x:10,y:8,color:'#33ccff',dir:2,scared:false},
                {x:9,y:7,color:'#ffcc00',dir:3,scared:false}
            ];
            let dots = [], score = 0, lives = 3, gameOver = false, won = false, gameLoop;
            const map = [
                "###################",
                "#........#........#",
                "#o##.###.#.###.##o#",
                "#.................#",
                "#.##.#.#####.#.##.#",
                "#....#...#...#....#",
                "###.###.#.#.###.###",
                "  #.#....#....#.#  ",
                "  #.#.##   ##.#.#  ",
                "###.##  ###  ##.###",
                "#.........#.......#",
                "#.##.#.#####.#.##.#",
                "#o..#...#...#..#o#",
                "###.#.#.#####.#.###",
                "#.....#...#.....#",
                "#.##.#######.##.#",
                "#.................#",
                "#........#........#",
                "###################"
            ];
            const rows = map.length;
            for (let r=0; r<map.length; r++) while (map[r].length<19) map[r]+='#';
            function init() {
                pacman = {x:9,y:15,dir:0,nextDir:0,mouth:0};
                ghosts = [
                    {x:8,y:8,color:'#ff3333',dir:0,scared:false},
                    {x:9,y:8,color:'#ff88cc',dir:1,scared:false},
                    {x:10,y:8,color:'#33ccff',dir:2,scared:false},
                    {x:8,y:7,color:'#ffcc00',dir:3,scared:false}
                ];
                dots = []; score = 0; lives = 3; gameOver = false; won = false;
                scoreSpan.textContent = 'Score: 0'; livesSpan.textContent = 'Lives: 3';
                for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) {
                    if (map[r] && map[r][c]==='.') dots.push({x:c,y:r,big:false});
                    else if (map[r] && map[r][c]==='o') dots.push({x:c,y:r,big:true});
                }
                canvas.width = cols*size; canvas.height = rows*size;
            }
            function canMove(x,y) {
                if (x<0||x>=cols||y<0||y>=rows) return false;
                if (map[y] && map[y][x]==='#') return false;
                return true;
            }
            function updatePacman() {
                if (gameOver||won) return;
                let nx = pacman.x, ny = pacman.y;
                if (pacman.nextDir!==pacman.dir) {
                    const nd = pacman.nextDir;
                    if ((nd===0 && canMove(pacman.x+1,pacman.y)) || (nd===1 && canMove(pacman.x,pacman.y-1)) || (nd===2 && canMove(pacman.x-1,pacman.y)) || (nd===3 && canMove(pacman.x,pacman.y+1))) pacman.dir = nd;
                }
                if (pacman.dir===0) nx++;
                else if (pacman.dir===1) ny--;
                else if (pacman.dir===2) nx--;
                else if (pacman.dir===3) ny++;
                if (nx<0) nx=cols-1; else if (nx>=cols) nx=0;
                if (canMove(nx,ny)) { pacman.x=nx; pacman.y=ny; }
                const dotIdx = dots.findIndex(d => d.x===pacman.x && d.y===pacman.y);
                if (dotIdx>=0) {
                    if (dots[dotIdx].big) { score+=50; ghosts.forEach(g=>g.scared=true); setTimeout(()=>ghosts.forEach(g=>g.scared=false),5000); }
                    else score+=10;
                    scoreSpan.textContent = 'Score: '+score;
                    dots.splice(dotIdx,1);
                    if (dots.length===0) { won=true; const hs = safeJsonObject('cyberos_highscores',{}); hs.pacman=score; localStorage.setItem('cyberos_highscores',JSON.stringify(hs)); }
                }
                ghosts.forEach(g => {
                    if (g.x===pacman.x && g.y===pacman.y) {
                        if (g.scared) { g.x=9; g.y=8; g.scared=false; score+=100; scoreSpan.textContent='Score: '+score; }
                        else { lives--; livesSpan.textContent='Lives: '+lives; if (lives<=0) gameOver=true; else { pacman.x=9; pacman.y=15; } }
                    }
                });
            }
            function updateGhosts() {
                ghosts.forEach(g => {
                    const dirs = [0,1,2,3];
                    const rev = g.dir<2 ? (g.dir+2)%4 : (g.dir+2)%4;
                    const ok = dirs.filter(d => d!==rev && canMove(g.x+(d===0?1:d===2?-1:0), g.y+(d===3?1:d===1?-1:0)));
                    if (ok.length>0) {
                        if (!g.scared) {
                            let best = ok[0], bestDist = Infinity;
                            ok.forEach(d => {
                                const nx = g.x+(d===0?1:d===2?-1:0), ny = g.y+(d===3?1:d===1?-1:0);
                                const dist = Math.abs(nx-pacman.x)+Math.abs(ny-pacman.y);
                                if (dist<bestDist) { bestDist=dist; best=d; }
                            });
                            g.dir = best;
                        } else g.dir = ok[Math.floor(Math.random()*ok.length)];
                    }
                    if (g.dir===0) g.x++;
                    else if (g.dir===1) g.y--;
                    else if (g.dir===2) g.x--;
                    else if (g.dir===3) g.y++;
                });
            }
            function draw() {
                ctx.fillStyle='#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
                for (let r=0; r<rows; r++) for (let c=0; c<cols; c++) {
                    if (map[r] && map[r][c]==='#') {
                        ctx.fillStyle='#102f9f';
                        ctx.fillRect(c*size,r*size,size,size);
                        ctx.strokeStyle='#2f68ff';
                        ctx.strokeRect(c*size+1,r*size+1,size-2,size-2);
                    }
                }
                dots.forEach(d => { ctx.fillStyle='#ffcc88'; const s=d.big?6:3; ctx.beginPath(); ctx.arc(d.x*size+size/2,d.y*size+size/2,s,0,6.28); ctx.fill(); });
                ctx.fillStyle='#ffff00';
                const mouth = gameOver?0:Math.sin(Date.now()/100)*0.4;
                ctx.beginPath();
                ctx.arc(pacman.x*size+size/2, pacman.y*size+size/2, size/2-2, mouth+0.2, 6.28-mouth-0.2);
                ctx.lineTo(pacman.x*size+size/2, pacman.y*size+size/2);
                ctx.fill();
                ghosts.forEach(g => {
                    ctx.fillStyle=g.scared?'#2536d8':g.color;
                    const gx = g.x*size, gy = g.y*size;
                    ctx.beginPath();
                    ctx.arc(gx+size/2, gy+size/2, size/2-3, Math.PI, 0);
                    ctx.lineTo(gx+size-3, gy+size-4);
                    ctx.lineTo(gx+size*0.72, gy+size-8);
                    ctx.lineTo(gx+size*0.5, gy+size-4);
                    ctx.lineTo(gx+size*0.28, gy+size-8);
                    ctx.lineTo(gx+3, gy+size-4);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.arc(gx+7, gy+8, 3, 0, 6.28); ctx.arc(gx+13, gy+8, 3, 0, 6.28); ctx.fill();
                    ctx.fillStyle = '#111';
                    ctx.beginPath(); ctx.arc(gx+8, gy+8, 1.5, 0, 6.28); ctx.arc(gx+14, gy+8, 1.5, 0, 6.28); ctx.fill();
                });
                if (gameOver) {
                    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,canvas.width,canvas.height);
                    ctx.fillStyle='#ff3333'; ctx.font='bold 20px monospace'; ctx.textAlign='center';
                    ctx.fillText('GAME OVER', canvas.width/2, canvas.height/2);
                }
                if (won) {
                    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,canvas.width,canvas.height);
                    ctx.fillStyle='#33ff33'; ctx.font='bold 20px monospace'; ctx.textAlign='center';
                    ctx.fillText('YOU WIN!', canvas.width/2, canvas.height/2);
                }
            }
            const pacHandler = function(e) {
                const w = document.getElementById(id);
                if (!w || w.classList.contains('hidden')) return;
                if (e.key==='ArrowRight') pacman.nextDir=0;
                else if (e.key==='ArrowUp') pacman.nextDir=1;
                else if (e.key==='ArrowLeft') pacman.nextDir=2;
                else if (e.key==='ArrowDown') pacman.nextDir=3;
                if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
            };
            document.addEventListener('keydown', pacHandler);
            resetBtn.onclick = () => { init(); };
            init();
            gameLoop = setInterval(() => { updatePacman(); updateGhosts(); draw(); }, 150);
            cleanups[id] = function() { clearInterval(gameLoop); document.removeEventListener('keydown', pacHandler); };
        }
    }
};

const _fileSystem = {
    'Desktop': { type: 'folder', children: {
        'Welcome.txt': { type: 'file', size: 45, date: '2024-01-01 12:00', data: 'Welcome to Cyber OS!' },
    }},
    'Downloads': { type: 'folder', children: {
        'installer.zip': { type: 'file', size: 2450000, date: '2024-05-20 14:30' },
        'readme.txt': { type: 'file', size: 1280, date: '2024-05-19 10:15' },
        'photo.jpg': { type: 'file', size: 890000, date: '2024-05-18 09:00', icon: '\u{1F5BC}' },
    }},
    'Documents': { type: 'folder', children: {
        'Project Plan.docx': { type: 'file', size: 45000, date: '2024-06-01 08:00' },
        'Budget.xlsx': { type: 'file', size: 32000, date: '2024-05-28 16:45' },
        'Notes.txt': { type: 'file', size: 1024, date: '2024-06-05 11:30' },
        'Work': { type: 'folder', children: {
            'Report.docx': { type: 'file', size: 125000, date: '2024-06-10 09:00' },
            'Presentation.pptx': { type: 'file', size: 2500000, date: '2024-06-08 14:00' },
        }},
    }},
    'Pictures': { type: 'folder', children: {
        'Screenshot 2024-01-15.png': { type: 'file', size: 245760, date: '2024-01-15 14:30', icon: '\u{1F5BC}' },
        'Vacation.jpg': { type: 'file', size: 1523000, date: '2024-02-20 09:15', icon: '\u{1F5BC}' },
        'Screenshots': { type: 'folder', children: {
            'capture1.png': { type: 'file', size: 320000, date: '2024-03-01 10:00', icon: '\u{1F5BC}' },
        }},
    }},
    'Music': { type: 'folder', children: {
        'Favorite Song.mp3': { type: 'file', size: 5120000, date: '2024-03-10 18:45', icon: '\u{1F3B5}' },
        'Playlist.m3u': { type: 'file', size: 256, date: '2024-04-01 20:00' },
    }},
    'Videos': { type: 'folder', children: {
        'Home Movie.mp4': { type: 'file', size: 256000000, date: '2024-04-05 20:00', icon: '\u{1F3AC}' },
        'Tutorial.mov': { type: 'file', size: 128000000, date: '2024-05-12 15:30', icon: '\u{1F3AC}' },
    }},
};

// Add non-enumerable children for root-level navigation in File Explorer
(function() {
    var ch = {};
    Object.keys(_fileSystem).forEach(function(k) {
        if (_fileSystem[k] && _fileSystem[k].type) ch[k] = _fileSystem[k];
    });
    Object.defineProperty(_fileSystem, 'children', { value: ch, enumerable: false, configurable: true });
})();

// Load saved file system
_feLoadFS();

function _feGetFolder(path) {
    let cur = _fileSystem;
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        if (p === 'This PC') { cur = _fileSystem; continue; }
        if (cur && cur.children && cur.children[p]) cur = cur.children[p];
        else return null;
    }
    return cur;
}

function _feFormatSize(bytes) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function _feCreateState(id) {
    const state = {
        history: [['This PC']],
        historyIndex: 0,
        currentPath: ['This PC'],
        viewMode: 'details',
        sortBy: 'name',
        sortAsc: true,
        clipboard: null,
        renameTarget: null,
        id: id,
    };
    _feStates[id] = state;
    return state;
}

function _feBtn(text, title, parent) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.title = title;
    btn.style.cssText = 'margin:0;padding:2px 6px;font-size:0.7rem;background:rgba(51,255,51,0.05);border:1px solid rgba(51,255,51,0.2);color:#33ff33;border-radius:3px;cursor:pointer;';
    btn.onmouseenter = function() { this.style.background = 'rgba(51,255,51,0.15)'; };
    btn.onmouseleave = function() { this.style.background = 'rgba(51,255,51,0.05)'; };
    return btn;
}

function _feAttachRowEvents(row, name, entry, path, state, id, fileList) {
    state._fileList = fileList;
    var isFolder = entry.type === 'folder';
    row.onclick = function(e) {
        if (state.renameTarget) return;
        fileList.querySelectorAll('.fe-selected-' + id).forEach(function(el) { el.classList.remove('fe-selected-' + id); el.style.background = ''; });
        row.style.background = 'rgba(51,255,51,0.12)';
        row.classList.add('fe-selected-' + id);
    };
    row.ondblclick = function() {
        if (isFolder) {
            const newPath = path.concat([name]);
            state.history = state.history.slice(0, state.historyIndex + 1);
            state.history.push(newPath);
            state.historyIndex = state.history.length - 1;
            state.currentPath = newPath;
            var st = _feStates[id];
            if (st) st.currentPath = newPath;
            _feRenderExp(id);
        } else if (entry.type === 'shortcut') {
            showToast('Shortcut', 'Opening ' + (entry.target || name) + '...', 'info');
        } else if (entry.isZip) {
            if (_feExtractZip(path, name)) {
                _feRender();
                showToast('Extract', name + ' extracted', 'info');
            } else {
                showToast('Extract', 'Could not extract ' + name, 'error');
            }
        } else {
            var isText = /\.(txt|md|js|html|css|json|xml|log|py|rb|sh|bat|ps1|yml|yaml|ini|cfg|conf|c|cpp|h|hpp|java|ts|tsx|jsx|go|rs|swift|kt|env|gitignore|toml|php|pl|lua|r|m|sql|graphql|svelte|vue)$/i.test(name);
            if (isText) {
                var content = entry.data || '';
                var ext = name.split('.').pop().toUpperCase();
                toggleWindow('notes');
                setTimeout(function() {
                    var ta = document.querySelector('.window:last-child textarea');
                    if (ta) {
                        ta.value = content;
                        ta.style.cssText = 'width:100%;height:100%;background:#000;color:#33ff33;font-family:monospace;font-size:0.8rem;border:none;outline:none;resize:none;padding:8px;box-sizing:border-box;';
                        var winEl = ta.closest('.window-content');
                        if (winEl) {
                            var nd = winEl._notepadData;
                            if (nd) nd.setPath(path.concat([name]), name);
                            var win = winEl.closest('.window');
                            if (win) {
                                var title = win.querySelector('.window-title');
                                if (title) title.textContent = '\u{1F4DD} ' + name;
                            }
                        }
                        showToast('File Explorer', 'Opened ' + name + ' in Notepad', 'info');
                    }
                }, 300);
            } else {
                var isImg = /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(name) || (entry.data && typeof entry.data === 'string' && entry.data.indexOf('data:image/') === 0);
                if (isImg && entry.data) {
                    toggleWindow('paint');
                    setTimeout(function() {
                        var paintWin = windowRegistry.paint;
                        if (paintWin) {
                            var contentEl = paintWin.querySelector('.window-content');
                            var pc = contentEl ? contentEl._paintCanvas : null;
                            if (pc) {
                                var img = new Image();
                                img.onload = function() {
                                    pc.width = img.width;
                                    pc.height = img.height;
                                    var pcCtx = pc.getContext('2d');
                                    pcCtx.fillStyle = '#020813';
                                    pcCtx.fillRect(0, 0, pc.width, pc.height);
                                    pcCtx.drawImage(img, 0, 0);
                                    if (typeof paintWin.updateSizeDisplay === 'function') paintWin.updateSizeDisplay();
                                    var title = paintWin.querySelector('.window-title');
                                    if (title) title.textContent = '\u{1F3A8} ' + name;
                                    showToast('File Explorer', 'Opened ' + name + ' in Paint', 'info');
                                };
                                img.src = entry.data;
                            }
                        }
                    }, 300);
                } else {
                    var isVideo = /\.(mp4|webm|avi|mov|mkv|wmv|flv)$/i.test(name);
                    if (isVideo) {
                        toggleWindow('mediaplayer');
                        setTimeout(function() {
                            var mediaContent = document.querySelector('.window:last-child .window-content');
                            if (mediaContent && mediaContent._openVideo) {
                                mediaContent._openVideo(entry.data || null, name);
                                var win = mediaContent.closest('.window');
                                if (win) {
                                    var title = win.querySelector('.window-title');
                                    if (title) title.textContent = '\u{1F3AC} ' + name;
                                }
                                showToast('File Explorer', 'Opened ' + name + ' in Media Player', 'info');
                            }
                        }, 300);
                    } else {
                        showToast('File Explorer', 'Opening ' + name + '...', 'info');
                    }
                }
            }
        }
    };
    row.oncontextmenu = function(e) {
        e.preventDefault();
        e.stopPropagation();
        _showFeContextMenu(e.clientX, e.clientY, name, entry, path, state, id);
    };
    // Drag start
    row.draggable = true;
    row.ondragstart = function(e) {
        e.dataTransfer.setData('text/plain', JSON.stringify({ name: name, path: path }));
        e.dataTransfer.effectAllowed = 'move';
    };
}

function _showFeContextMenu(x, y, name, entry, path, state, id) {
    var menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;z-index:100001;background:#0a1931;border:2px solid #33ff33;border-radius:4px;box-shadow:0 4px 20px rgba(51,255,51,0.3);min-width:170px;padding:4px 0;font-size:0.75rem;';
    var items = [];
    var isFolder = entry.type === 'folder';
    items.push({ label: 'Cut', icon: '\u2702', action: 'cut' });
    items.push({ label: 'Copy', icon: '\u{1F4CB}', action: 'copy' });
    items.push({ label: 'Paste', icon: '\u{1F4CE}', action: 'paste' });
    items.push(null);
    items.push({ label: 'Delete', icon: '\u{1F5D1}', action: 'delete' });
    items.push({ label: 'Rename', icon: '\u{270F}', action: 'rename' });
    items.push(null);
    items.push({ label: 'Create shortcut', icon: '\u{1F517}', action: 'shortcut' });
    if (isFolder) {
        items.push({ label: 'Compress to ZIP', icon: '\u{1F4E6}', action: 'compress' });
    } else if (entry.isZip) {
        items.push({ label: 'Extract here', icon: '\u{1F4C2}', action: 'extract' });
    } else {
        items.push({ label: 'Download', icon: '\u{1F4E5}', action: 'download' });
    }
    items.push(null);
    items.push({ label: 'Properties', icon: '\u{2699}', action: 'properties' });
    items.forEach(function(itemDef) {
        if (itemDef === null) {
            var sep = document.createElement('div');
            sep.style.cssText = 'height:1px;background:rgba(51,255,51,0.2);margin:4px 8px;';
            menu.appendChild(sep);
            return;
        }
        var label = itemDef.label, icon = itemDef.icon, action = itemDef.action;
        var item = document.createElement('div');
        item.innerHTML = '<span style="margin-right:8px;width:18px;display:inline-block;text-align:center;">' + icon + '</span>' + label;
        item.style.cssText = 'padding:5px 14px;cursor:pointer;color:#33ff33;display:flex;align-items:center;';
        item.onmouseenter = function() { this.style.background = 'rgba(51,255,51,0.15)'; };
        item.onmouseleave = function() { this.style.background = ''; };
        item.onclick = function() {
            menu.remove();
            if (action === 'cut') {
                state.clipboard = { action: 'cut', name: name, path: path, entry: entry };
            } else if (action === 'copy') {
                state.clipboard = { action: 'copy', name: name, path: path, entry: entry };
            } else if (action === 'paste') {
                if (state.clipboard) {
                    var targetFolder = _feGetFolder(path);
                    if (targetFolder) {
                        if (state.clipboard.action === 'cut') {
                            var srcFolder = _feGetFolder(state.clipboard.path);
                            if (srcFolder && srcFolder.children[state.clipboard.name]) {
                                delete srcFolder.children[state.clipboard.name];
                                targetFolder.children[state.clipboard.name] = state.clipboard.entry;
                            }
                        } else {
                            targetFolder.children[state.clipboard.name] = JSON.parse(JSON.stringify(state.clipboard.entry));
                        }
                        _feSaveFS();
                    }
                    state.clipboard = null;
                    _feRenderExp(id);
                }
            } else if (action === 'delete') {
                try {
                    var folder = _feGetFolder(path);
                    if (folder && folder.children[name]) {
                        var recycledEntry = JSON.parse(JSON.stringify(folder.children[name], function(key, val) { return key === 'data' ? '' : val; }));
                        recycledEntry.dataRestored = false;
                        _recycleBin.items.push({ name: name, entry: recycledEntry, origPath: path.join('\\'), origArr: path.slice(), dateDeleted: new Date().toLocaleString(), type: entry.type, size: entry.size });
                        delete folder.children[name];
                        _feSaveFS();
                        _updateRecycleBinIcon();
                        _feRenderExp(id);
                        showToast('Recycle Bin', name + ' moved to Recycle Bin', 'info');
                    } else {
                        showToast('Delete', 'File not found: ' + name, 'error');
                    }
                } catch(e) {
                    showToast('Delete', 'Error: ' + (e.message || e), 'error');
                }
            } else if (action === 'rename') {
                state.renameTarget = name;
                _feRenderExp(id);
                setTimeout(function() {
                    var span = state._fileList ? state._fileList.querySelector('[data-rename="1"]') : null;
                    if (span) {
                        span.contentEditable = true;
                        span.focus();
                        var range = document.createRange();
                        range.selectNodeContents(span);
                        var sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                        span.onblur = function() {
                            var newName = span.textContent.trim();
                            if (newName && newName !== name) {
                                var f = _feGetFolder(path);
                                if (f && f.children[name]) {
                                    f.children[newName] = f.children[name];
                                    delete f.children[name];
                                    _feSaveFS();
                                }
                            }
                            span.contentEditable = false;
                            state.renameTarget = null;
                            _feRenderExp(id);
                        };
                        span.onkeydown = function(ev) {
                            if (ev.key === 'Enter') { ev.preventDefault(); span.blur(); }
                            if (ev.key === 'Escape') { ev.preventDefault(); span.textContent = name; span.blur(); }
                        };
                    }
                }, 50);
            } else if (action === 'shortcut') {
                var shortName = name + ' - Shortcut';
                var parent = _feGetFolder(path);
                if (parent && !parent.children[shortName]) {
                    parent.children[shortName] = { type: 'shortcut', size: 1024, date: new Date().toLocaleString(), target: path.concat([name]).join('\\'), icon: '\u{1F517}' };
                    _feSaveFS();
                    _feRenderExp(id);
                    showToast('Shortcut', 'Shortcut created for ' + name, 'info');
                }
            } else if (action === 'compress') {
                var zipName = name + '.zip';
                if (_feCompressFolder(path, name, zipName)) {
                    _feRenderExp(id);
                    showToast('Compress', name + ' compressed to ' + zipName, 'info');
                } else {
                    showToast('Compress', 'Could not compress ' + name, 'error');
                }
            } else if (action === 'extract') {
                if (_feExtractZip(path, name)) {
                    _feRenderExp(id);
                    showToast('Extract', name + ' extracted', 'info');
                } else {
                    showToast('Extract', 'Could not extract ' + name, 'error');
                }
            } else if (action === 'download') {
                var feData = entry.data || '';
                var feMime = 'application/octet-stream';
                if (/\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(name)) feMime = 'image/png';
                else if (/\.(txt|md|js|html|css|json|xml|log)$/i.test(name)) feMime = 'text/plain';
                else if (/\.(mp3|wav|ogg)$/i.test(name)) feMime = 'audio/mpeg';
                else if (/\.(mp4|avi|mkv)$/i.test(name)) feMime = 'video/mp4';
                var feBlob;
                if (feData && feData.indexOf('data:') === 0) {
                    var feParts = feData.split(',');
                    var feRaw = atob(feParts[1]);
                    var feLen = feRaw.length;
                    var feBytes = new Uint8Array(feLen);
                    for (var fi = 0; fi < feLen; fi++) feBytes[fi] = feRaw.charCodeAt(fi);
                    feBlob = new Blob([feBytes], { type: feMime });
                } else {
                    feBlob = new Blob([feData], { type: feMime });
                }
                var feUrl = URL.createObjectURL(feBlob);
                var feA = document.createElement('a');
                feA.href = feUrl;
                feA.download = name;
                feA.click();
                URL.revokeObjectURL(feUrl);
                showToast('File Explorer', 'Downloaded: ' + name, 'info');
            } else if (action === 'properties') {
                var ext = entry.type === 'folder' ? 'Folder' : entry.type === 'shortcut' ? 'Shortcut' : (name.split('.').pop() || '').toUpperCase() + ' File';
                var sizeStr = entry.size ? _feFormatSize(entry.size) : (entry.type === 'folder' ? '---' : '');
                var dateStr = entry.date || '---';
                var html = '<div style="padding:12px;font-size:0.75rem;"><div style="font-weight:bold;margin-bottom:8px;">' + name + ' Properties</div>';
                html += '<div style="border:1px solid rgba(51,255,51,0.2);border-radius:4px;padding:10px;">';
                html += '<div style="margin-bottom:4px;"><span style="opacity:0.6;">Type:</span> ' + ext + '</div>';
                html += '<div style="margin-bottom:4px;"><span style="opacity:0.6;">Size:</span> ' + sizeStr + '</div>';
                html += '<div style="margin-bottom:4px;"><span style="opacity:0.6;">Date:</span> ' + dateStr + '</div>';
                html += '<div style="margin-bottom:4px;"><span style="opacity:0.6;">Location:</span> ' + path.join('\\') + '</div>';
                if (entry.target) {
                    html += '<div style="margin-bottom:4px;"><span style="opacity:0.6;">Target:</span> ' + entry.target + '</div>';
                }
                html += '<div><span style="opacity:0.6;">Attributes:</span> ' + (entry.type === 'folder' ? 'Directory' : entry.type === 'shortcut' ? 'Shortcut' : 'File') + '</div>';
                html += '</div><button id="prop-close-' + id + '" style="margin-top:10px;padding:4px 16px;font-size:0.7rem;float:right;">Close</button></div>';
                var overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:200000;display:flex;align-items:center;justify-content:center;';
                var dialog = document.createElement('div');
                dialog.style.cssText = 'background:#0a1931;border:2px solid #33ff33;border-radius:6px;min-width:300px;box-shadow:0 0 30px rgba(51,255,51,0.3);';
                dialog.innerHTML = html;
                overlay.appendChild(dialog);
                document.body.appendChild(overlay);
                document.getElementById('prop-close-' + id).onclick = function() { overlay.remove(); };
            }
        };
        if (action === 'paste' && !state.clipboard) {
            item.style.opacity = '0.3';
            item.style.cursor = 'default';
            item.onclick = function() { menu.remove(); };
        }
        menu.appendChild(item);
    });
    positionMenu(menu, x, y);
    document.body.appendChild(menu);
    function closeMenu(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeMenu); } }
    setTimeout(function() { document.addEventListener('click', closeMenu); }, 10);
}

// === Open Image Dialog for Paint ===
function showOpenImageDialog(callback) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:200000;display:flex;align-items:center;justify-content:center;';
    var dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg2);border:2px solid var(--border);border-radius:6px;min-width:400px;max-width:500px;box-shadow:0 8px 40px var(--shadow);display:flex;flex-direction:column;max-height:70vh;';
    var header = document.createElement('div');
    header.style.cssText = 'padding:10px 14px;border-bottom:1px solid var(--fg-dim);font-weight:bold;font-size:0.85rem;';
    header.textContent = 'Open Image';
    var navRow = document.createElement('div');
    navRow.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px 10px;border-bottom:1px solid var(--fg-dim);font-size:0.7rem;';
    var locSpan = document.createElement('span');
    locSpan.style.cssText = 'flex:1;opacity:0.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    locSpan.textContent = 'This PC';
    navRow.appendChild(locSpan);
    var body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;padding:4px 0;min-height:200px;';
    var footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;padding:8px 10px;border-top:1px solid var(--fg-dim);';
    var openBtn2 = document.createElement('button');
    openBtn2.textContent = 'Open';
    openBtn2.style.cssText = 'margin:0;padding:6px 20px;font-size:0.8rem;background:var(--accent);color:#fff;border:none;border-radius:3px;cursor:pointer;';
    openBtn2.disabled = true;
    var cancelBtn2 = document.createElement('button');
    cancelBtn2.textContent = 'Cancel';
    cancelBtn2.style.cssText = 'margin:0;padding:6px 16px;font-size:0.8rem;background:transparent;border:1px solid var(--border);color:var(--fg);border-radius:3px;cursor:pointer;';
    footer.append(cancelBtn2, openBtn2);
    dialog.append(header, navRow, body, footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    var currentOpenPath = ['This PC', 'Pictures'];
    var selectedFileData = null;
    function renderOpenPath() {
        locSpan.textContent = currentOpenPath.join(' \\ ');
        body.innerHTML = '';
        var folder = _feGetFolder(currentOpenPath);
        if (!folder || !folder.children) {
            body.innerHTML = '<div style="padding:16px;text-align:center;opacity:0.4;font-size:0.8rem;">Cannot access this location</div>';
            return;
        }
        var entries = Object.keys(folder.children).sort(function(a, b) {
            var ea = folder.children[a], eb = folder.children[b];
            if (ea.type === 'folder' && eb.type !== 'folder') return -1;
            if (ea.type !== 'folder' && eb.type === 'folder') return 1;
            return a.localeCompare(b);
        });
        entries.forEach(function(name) {
            var entry = folder.children[name];
            var item = document.createElement('div');
            item.style.cssText = 'padding:5px 14px;cursor:pointer;font-size:0.75rem;display:flex;align-items:center;gap:6px;border-radius:2px;';
            if (entry.type === 'folder') {
                item.innerHTML = '<span>\u{1F4C1}</span><span>' + name + '</span>';
                item.onmouseenter = function() { this.style.background = 'var(--fg-dim)'; };
                item.onmouseleave = function() { this.style.background = ''; };
                item.onclick = function() {
                    currentOpenPath = currentOpenPath.concat([name]);
                    renderOpenPath();
                };
            } else {
                var isImg = /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(name);
                if (entry.data && typeof entry.data === 'string' && entry.data.indexOf('data:image/') === 0) isImg = true;
                var icon = entry.icon || (isImg ? '\u{1F5BC}' : '\u{1F4C4}');
                item.innerHTML = '<span>' + icon + '</span><span>' + name + '</span>';
                if (isImg) {
                    item.style.color = '#88ff88';
                    item.onclick = function() {
                        body.querySelectorAll('div').forEach(function(d) { d.style.background = ''; });
                        item.style.background = 'rgba(51,255,51,0.2)';
                        selectedFileData = { path: currentOpenPath.concat([name]), name: name, entry: entry };
                        openBtn2.disabled = false;
                    };
                }
            }
            body.appendChild(item);
        });
        if (body.children.length === 0) {
            body.innerHTML = '<div style="padding:16px;text-align:center;opacity:0.4;font-size:0.8rem;">Empty folder</div>';
        }
        if (currentOpenPath.length > 2) {
            var upItem = document.createElement('div');
            upItem.style.cssText = 'padding:5px 14px;cursor:pointer;font-size:0.75rem;display:flex;align-items:center;gap:6px;border-radius:2px;border-bottom:1px solid var(--fg-dim);';
            upItem.innerHTML = '<span>\u{2B06}</span><span>Up</span>';
            upItem.onmouseenter = function() { this.style.background = 'var(--fg-dim)'; };
            upItem.onmouseleave = function() { this.style.background = ''; };
            upItem.onclick = function() {
                currentOpenPath = currentOpenPath.slice(0, -1);
                renderOpenPath();
            };
            body.insertBefore(upItem, body.firstChild);
        }
        if (currentOpenPath.length === 2 && currentOpenPath[0] === 'This PC') {
            var quickItems = ['Desktop', 'Downloads', 'Documents', 'Pictures', 'Music', 'Videos'];
            quickItems.forEach(function(q) {
                if (q === currentOpenPath[1]) return;
                var qi = document.createElement('div');
                qi.style.cssText = 'padding:5px 14px;cursor:pointer;font-size:0.75rem;display:flex;align-items:center;gap:6px;border-radius:2px;opacity:0.6;';
                qi.innerHTML = '<span>\u{1F4C1}</span><span>' + q + '</span>';
                qi.onmouseenter = function() { this.style.background = 'var(--fg-dim)'; this.style.opacity = '1'; };
                qi.onmouseleave = function() { this.style.background = ''; this.style.opacity = '0.6'; };
                qi.onclick = function() {
                    currentOpenPath = ['This PC', q];
                    renderOpenPath();
                };
                body.appendChild(qi);
            });
        }
    }
    renderOpenPath();
    openBtn2.onclick = function() {
        if (!selectedFileData) return;
        var entry = selectedFileData.entry;
        var dataUrl = entry.data;
        if (dataUrl && dataUrl.indexOf('data:image/') === 0) {
            callback(dataUrl);
        } else if (dataUrl) {
            callback(dataUrl);
        } else {
            showToast('Open Image', 'File has no image data', 'error');
        }
        overlay.remove();
    };
    cancelBtn2.onclick = function() { overlay.remove(); };
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

function _feRenderSidebar(sidebar, state, id) {
    sidebar.innerHTML = '';
    var items = [
        { label: 'Quick Access', icon: '\u{26A1}', children: ['Desktop', 'Downloads', 'Documents'] },
        { label: 'This PC', icon: '\u{1F4BB}', children: ['Desktop', 'Downloads', 'Documents', 'Pictures', 'Music', 'Videos'] },
    ];
    items.forEach(function(group) {
        var hdr = document.createElement('div');
        hdr.textContent = group.icon + ' ' + group.label;
        hdr.style.cssText = 'padding:5px 10px;font-weight:bold;font-size:0.7rem;border-bottom:1px solid rgba(51,255,51,0.1);margin-bottom:2px;';
        sidebar.appendChild(hdr);
        group.children.forEach(function(child) {
            var ci = document.createElement('div');
            ci.textContent = '\u{1F4C1} ' + child;
            ci.style.cssText = 'padding:3px 10px 3px 20px;cursor:pointer;font-size:0.7rem;border-radius:2px;';
            ci.dataset.path = child;
            ci.onmouseenter = function() { this.style.background = 'rgba(51,255,51,0.1)'; };
            ci.onmouseleave = function() { this.style.background = ''; };
            ci.onclick = function() {
                var p = child;
                var newPath = ['This PC', p];
                if (p === 'This PC') newPath = ['This PC'];
                state.history = state.history.slice(0, state.historyIndex + 1);
                state.history.push(newPath);
                state.historyIndex = state.history.length - 1;
                state.currentPath = newPath;
                _feRenderExp(id);
            };
            if (state.currentPath.length === 2 && state.currentPath[1] === child) {
                ci.style.background = 'rgba(51,255,51,0.15)';
            }
            sidebar.appendChild(ci);
        });
    });
}

function _feRenderExp(id) {
    var state = _feStates[id];
    if (!state) return;
    if (state._render) state._render();
}

// === Save As Dialog ===
function showSaveAsDialog(callback, defaultName) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:200000;display:flex;align-items:center;justify-content:center;';
    var dialog = document.createElement('div');
    dialog.style.cssText = 'background:var(--bg2);border:2px solid var(--border);border-radius:6px;min-width:400px;max-width:500px;box-shadow:0 8px 40px var(--shadow);display:flex;flex-direction:column;max-height:70vh;';
    var header = document.createElement('div');
    header.style.cssText = 'padding:10px 14px;border-bottom:1px solid var(--fg-dim);font-weight:bold;font-size:0.85rem;';
    header.textContent = 'Save As';
    var navRow = document.createElement('div');
    navRow.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px 10px;border-bottom:1px solid var(--fg-dim);font-size:0.7rem;';
    var locSpan = document.createElement('span');
    locSpan.style.cssText = 'flex:1;opacity:0.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    locSpan.textContent = 'This PC';
    navRow.appendChild(locSpan);
    var fileInputRow = document.createElement('div');
    fileInputRow.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--fg-dim);font-size:0.75rem;';
    fileInputRow.innerHTML = '<span style="opacity:0.5;flex-shrink:0;">File name:</span>';
    var fileNameInput = document.createElement('input');
    fileNameInput.type = 'text';
    fileNameInput.value = defaultName || 'Untitled.txt';
    fileNameInput.style.cssText = 'flex:1;background:rgba(0,0,0,0.3);border:1px solid var(--border);color:var(--fg);padding:4px 8px;border-radius:3px;outline:none;font-size:0.75rem;';
    fileInputRow.appendChild(fileNameInput);
    var body = document.createElement('div');
    body.style.cssText = 'flex:1;overflow-y:auto;padding:4px 0;min-height:150px;';
    var footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:flex-end;gap:6px;padding:8px 10px;border-top:1px solid var(--fg-dim);';
    var saveBtn2 = document.createElement('button');
    saveBtn2.textContent = 'Save';
    saveBtn2.style.cssText = 'margin:0;padding:6px 20px;font-size:0.8rem;background:var(--accent);color:#fff;border:none;border-radius:3px;cursor:pointer;';
    var cancelBtn2 = document.createElement('button');
    cancelBtn2.textContent = 'Cancel';
    cancelBtn2.style.cssText = 'margin:0;padding:6px 16px;font-size:0.8rem;background:transparent;border:1px solid var(--border);color:var(--fg);border-radius:3px;cursor:pointer;';
    footer.append(cancelBtn2, saveBtn2);
    dialog.append(header, navRow, fileInputRow, body, footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    var currentSavePath = ['This PC', 'Desktop'];
    function renderSavePath() {
        locSpan.textContent = currentSavePath.join(' \\ ');
        body.innerHTML = '';
        var folder = _feGetFolder(currentSavePath);
        if (!folder || !folder.children) {
            body.innerHTML = '<div style="padding:16px;text-align:center;opacity:0.4;font-size:0.8rem;">Cannot access this location</div>';
            return;
        }
        Object.keys(folder.children).forEach(function(name) {
            var entry = folder.children[name];
            if (entry.type !== 'folder') return;
            var item = document.createElement('div');
            item.style.cssText = 'padding:5px 14px;cursor:pointer;font-size:0.75rem;display:flex;align-items:center;gap:6px;border-radius:2px;';
            item.innerHTML = '<span>\u{1F4C1}</span><span>' + name + '</span>';
            item.onmouseenter = function() { this.style.background = 'var(--fg-dim)'; };
            item.onmouseleave = function() { this.style.background = ''; };
            item.onclick = function() {
                currentSavePath = currentSavePath.concat([name]);
                renderSavePath();
            };
            body.appendChild(item);
        });
        if (body.children.length === 0) {
            body.innerHTML = '<div style="padding:16px;text-align:center;opacity:0.4;font-size:0.8rem;">Empty folder</div>';
        }
        // Up button
        if (currentSavePath.length > 2) {
            var upItem = document.createElement('div');
            upItem.style.cssText = 'padding:5px 14px;cursor:pointer;font-size:0.75rem;display:flex;align-items:center;gap:6px;border-radius:2px;border-bottom:1px solid var(--fg-dim);';
            upItem.innerHTML = '<span>\u{2B06}</span><span>Up</span>';
            upItem.onmouseenter = function() { this.style.background = 'var(--fg-dim)'; };
            upItem.onmouseleave = function() { this.style.background = ''; };
            upItem.onclick = function() {
                currentSavePath = currentSavePath.slice(0, -1);
                renderSavePath();
            };
            body.insertBefore(upItem, body.firstChild);
        }
        // Quick locations
        if (currentSavePath.length === 2 && currentSavePath[0] === 'This PC') {
            var quickItems = ['Desktop', 'Downloads', 'Documents', 'Pictures', 'Music', 'Videos'];
            quickItems.forEach(function(q) {
                if (q === currentSavePath[1]) return;
                var qi = document.createElement('div');
                qi.style.cssText = 'padding:5px 14px;cursor:pointer;font-size:0.75rem;display:flex;align-items:center;gap:6px;border-radius:2px;opacity:0.6;';
                qi.innerHTML = '<span>\u{1F4C1}</span><span>' + q + '</span>';
                qi.onmouseenter = function() { this.style.background = 'var(--fg-dim)'; this.style.opacity = '1'; };
                qi.onmouseleave = function() { this.style.background = ''; this.style.opacity = '0.6'; };
                qi.onclick = function() {
                    currentSavePath = ['This PC', q];
                    renderSavePath();
                };
                body.appendChild(qi);
            });
        }
    }
    renderSavePath();
    saveBtn2.onclick = function() {
        var name = fileNameInput.value.trim();
        if (!name) { showToast('Save', 'Please enter a file name', 'error'); return; }
        var fullPath = currentSavePath.concat([name]);
        callback(fullPath, name);
        overlay.remove();
    };
    cancelBtn2.onclick = function() { overlay.remove(); };
    fileNameInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') saveBtn2.click(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    setTimeout(function() { fileNameInput.focus(); fileNameInput.select(); }, 100);
}

// Update Recycle Bin desktop icon badge
function _updateRecycleBinIcon() {
    var icons = document.getElementById('desktop-icons');
    if (!icons) return;
    var rb = icons.querySelector('[data-app="recyclebin"]');
    if (rb) {
        var count = _recycleBin.items.length;
        var img = rb.querySelector('.desktop-icon-img');
        if (img) img.textContent = count > 0 ? '\u{1F5D1}\uFE0F' : '\u{1F5D1}';
        var badge = rb.querySelector('.recycle-badge');
        if (!badge && count > 0) {
            badge = document.createElement('span');
            badge.className = 'recycle-badge';
            badge.style.cssText = 'position:absolute;top:2px;right:2px;background:#ff4444;color:#fff;border-radius:50%;padding:0 4px;font-size:0.6rem;line-height:1.2;min-width:14px;text-align:center;z-index:2;';
            rb.appendChild(badge);
        }
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? '' : 'none';
        }
    }
}

// === File System Persistence ===
function _feSaveFS() {
    try {
        localStorage.setItem('cyberos_filesystem', JSON.stringify(_fileSystem));
    } catch(e) {
        showToast('File System', 'Storage full — could not save', 'error');
    }
}

function _feLoadFS() {
    var saved = localStorage.getItem('cyberos_filesystem');
    if (saved) {
        try {
            var parsed = JSON.parse(saved);
            if (parsed && parsed.Desktop) {
                Object.keys(parsed).forEach(function(k) { _fileSystem[k] = parsed[k]; });
            }
        } catch(e) {}
    }
    // Rebuild non-enumerable children reference
    var ch = {};
    Object.keys(_fileSystem).forEach(function(k) {
        if (_fileSystem[k] && _fileSystem[k].type) ch[k] = _fileSystem[k];
    });
    Object.defineProperty(_fileSystem, 'children', { value: ch, enumerable: false });
}

function _feCreateFile(pathArr, name, content) {
    var folder = _feGetFolder(pathArr);
    if (!folder || folder.children[name]) return false;
    var now = new Date().toLocaleString();
    folder.children[name] = { type: 'file', size: (content || '').length, date: now, data: content || '' };
    _feSaveFS();
    return true;
}

function _feCreateShortcut(pathArr, name, targetPath) {
    var folder = _feGetFolder(pathArr);
    if (!folder || folder.children[name]) return false;
    folder.children[name] = { type: 'shortcut', size: 1024, date: new Date().toLocaleString(), target: targetPath, icon: '\u{1F517}' };
    _feSaveFS();
    return true;
}

function _feCompressFolder(pathArr, folderName, zipName) {
    var folder = _feGetFolder(pathArr.concat([folderName]));
    if (!folder || folder.type !== 'folder') return false;
    var data = JSON.stringify(folder.children);
    var compressed = { type: 'file', size: data.length, date: new Date().toLocaleString(), data: data, icon: '\u{1F4E6}', isZip: true };
    var parent = _feGetFolder(pathArr);
    if (!parent) return false;
    parent.children[zipName] = compressed;
    delete parent.children[folderName];
    _feSaveFS();
    return true;
}

function _feExtractZip(pathArr, zipName) {
    var zip = _feGetFolder(pathArr.concat([zipName]));
    if (!zip || !zip.isZip) return false;
    var data = JSON.parse(zip.data || '{}');
    var extractName = zipName.replace(/\.zip$/i, '') + ' extracted';
    var parent = _feGetFolder(pathArr);
    if (!parent || parent.children[extractName]) return false;
    parent.children[extractName] = { type: 'folder', children: data };
    delete parent.children[zipName];
    _feSaveFS();
    return true;
}

// Desktop "New Folder" function
function createDesktopFolder() {
    var desktopFs = _fileSystem.Desktop;
    if (!desktopFs || !desktopFs.children) { _fileSystem.Desktop = { type: 'folder', children: {} }; desktopFs = _fileSystem.Desktop; }
    var idx = 1;
    Object.keys(desktopFs.children).forEach(function(k) {
        var m = k.match(/^New Folder( \((\d+)\))?$/);
        if (m) {
            var n = m[2] ? parseInt(m[2]) : 1;
            if (n >= idx) idx = n + 1;
        }
    });
    var name = 'New Folder' + (idx > 1 ? ' (' + idx + ')' : '');
    desktopFs.children[name] = { type: 'folder', children: {} };
    _feSaveFS();
    createDesktopIcons();
    showToast('Desktop', 'Created ' + name, 'info');
}

// Wallpaper system
function hslToRgb(h,s,l){var c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h*6%2-1)),m=l-c/2;var r,g,b;if(h<1/6){r=c;g=x;b=0}else if(h<2/6){r=x;g=c;b=0}else if(h<3/6){r=0;g=c;b=x}else if(h<4/6){r=0;g=x;b=c}else if(h<5/6){r=x;g=0;b=c}else{r=c;g=0;b=x}return[(r+m)*255|0,(g+m)*255|0,(b+m)*255|0];}

function imageWp(url){return function(c,ctx){var img=new Image();img.crossOrigin='anonymous';var ld=!1;img.onload=function(){ld=!0;};img.src=url;return{draw:function(){if(!ld||!img.width)return;var s=Math.max(c.width/img.width,c.height/img.height);ctx.drawImage(img,(c.width-img.width*s)/2,(c.height-img.height*s)/2,img.width*s,img.height*s);},cleanup:function(){}};};}

var wallpapers = {
    matrix: {icon:'\u{1F4CB}',name:'Matrix Rain',interval:50,init:function(c,ctx){var fs=14,chars='\u30A2\u30A4\u30A6\u30A8\u30AA\u30AB\u30AD\u30AF\u30B1\u30B3\u30B5\u30B7\u30B9\u30BB\u30BD\u30BF\u30C1\u30C4\u30C6\u30C8\u30CA\u30CB\u30CC\u30CD\u30CE\u30CF\u30D2\u30D5\u30D8\u30DB\u30DE\u30DF\u30E0\u30E1\u30E2\u30E4\u30E6\u30E8\u30E9\u30EA\u30EB\u30EC\u30ED\u30EF\u30F2\u30F30123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';var cols,dr;function rs(){c.width=innerWidth;c.height=innerHeight;cols=Math.ceil(c.width/fs);dr=new Array(cols);for(var i=0;i<cols;i++)dr[i]=Math.floor(Math.random()*-c.height/fs);}rs();addEventListener('resize',rs);return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.08)';ctx.fillRect(0,0,c.width,c.height);ctx.font=fs+'px monospace';for(var i=0;i<dr.length;i++){var ch=chars[Math.random()*chars.length|0];ctx.fillStyle=Math.random()>0.98?'#ff6666':Math.random()>0.9?'#ff2222':'#880000';ctx.fillText(ch,i*fs,dr[i]*fs);if(dr[i]*fs>c.height&&Math.random()>0.975)dr[i]=0;dr[i]++;}},cleanup:function(){removeEventListener('resize',rs);}};}},
    stars: {icon:'\u{2B50}',name:'Starfield',interval:50,init:function(c,ctx){var stars=new Array(200);for(var i=0;i<200;i++)stars[i]={x:Math.random()*c.width,y:Math.random()*c.height,z:Math.random()*3+1};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.15)';ctx.fillRect(0,0,c.width,c.height);for(var i=0;i<stars.length;i++){var s=stars[i];s.z-=0.05;if(s.z<0){s.x=Math.random()*c.width;s.y=Math.random()*c.height;s.z=3+Math.random()*2;}var sx=(s.x-c.width/2)/s.z+c.width/2,sy=(s.y-c.height/2)/s.z+c.height/2,sz=4/s.z;ctx.fillStyle='rgba(255,255,255,'+(1/s.z)+')';ctx.fillRect(sx,sy,sz,sz);}}};}},
    aurora: {icon:'\u{1F30C}',name:'Aurora',interval:50,init:function(c,ctx){var t=0,bands=5;return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.02)';ctx.fillRect(0,0,c.width,c.height);t+=0.02;for(var b=0;b<bands;b++){ctx.beginPath();for(var x=0;x<=c.width;x+=5){var y=c.height*0.4+Math.sin(x*0.01+t+b)*30+Math.sin(x*0.005+t*0.7+b*2)*20+Math.cos(x*0.008+t*0.5+b)*15+b*20;ctx.lineTo(x,y);}ctx.strokeStyle='hsla('+(180+b*30+t*20%360)+',80%,60%,0.15)';ctx.lineWidth=3;ctx.stroke();}}};}},
    rain: {icon:'\u{1F327}',name:'Rain',interval:50,init:function(c,ctx){var drops=new Array(150);for(var i=0;i<150;i++)drops[i]={x:Math.random()*c.width,y:Math.random()*c.height,s:2+Math.random()*3,l:10+Math.random()*20};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.1)';ctx.fillRect(0,0,c.width,c.height);ctx.strokeStyle='rgba(100,150,255,0.4)';ctx.lineWidth=1.5;for(var i=0;i<drops.length;i++){var d=drops[i];d.y+=d.s;d.x-=0.5;if(d.y>c.height){d.y=-d.l;d.x=Math.random()*c.width;}ctx.beginPath();ctx.moveTo(d.x,d.y);ctx.lineTo(d.x-2,d.y-d.l);ctx.stroke();}}};}},
    snow: {icon:'\u{2744}',name:'Snow',interval:50,init:function(c,ctx){var flakes=new Array(120);for(var i=0;i<120;i++)flakes[i]={x:Math.random()*c.width,y:Math.random()*c.height,r:1+Math.random()*3,s:0.5+Math.random()*2,w:Math.random()*2-1};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.08)';ctx.fillRect(0,0,c.width,c.height);for(var i=0;i<flakes.length;i++){var f=flakes[i];f.y+=f.s;f.x+=f.w;if(f.y>c.height){f.y=-5;f.x=Math.random()*c.width;}ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,6.28);ctx.fillStyle='rgba(255,255,255,0.7)';ctx.fill();}}};}},
    bubbles: {icon:'\u{1F4E6}',name:'Bubbles',interval:50,init:function(c,ctx){var bbls=new Array(40);for(var i=0;i<40;i++)bbls[i]={x:Math.random()*c.width,y:Math.random()*c.height,r:5+Math.random()*25,s:0.3+Math.random()*1,w:Math.sin(Math.random()*6.28)*0.5};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.04)';ctx.fillRect(0,0,c.width,c.height);for(var i=0;i<bbls.length;i++){var b=bbls[i];b.y-=b.s;b.x+=Math.sin(b.y*0.05)*0.3;if(b.y<-b.r){b.y=c.height+b.r;b.x=Math.random()*c.width;}ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,6.28);ctx.strokeStyle='rgba(100,200,255,0.3)';ctx.lineWidth=1.5;ctx.stroke();ctx.beginPath();ctx.arc(b.x-b.r*0.3,b.y-b.r*0.3,b.r*0.2,0,6.28);ctx.fillStyle='rgba(255,255,255,0.2)';ctx.fill();}}};}},
    fire: {icon:'\u{1F525}',name:'Fire',interval:50,init:function(c,ctx){var pts=new Array(80);for(var i=0;i<80;i++)pts[i]={x:Math.random()*c.width,y:c.height,r:10+Math.random()*30,dy:-2-Math.random()*4,dx:(Math.random()-0.5)*1.5};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.06)';ctx.fillRect(0,0,c.width,c.height);for(var i=0;i<pts.length;i++){var p=pts[i];p.x+=p.dx;p.y+=p.dy;p.r*=0.98;if(p.r<2||p.y<0){p.x=Math.random()*c.width;p.y=c.height+Math.random()*20;p.r=20+Math.random()*30;}var g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);g.addColorStop(0,'rgba(255,255,200,'+(0.4*p.r/40)+')');g.addColorStop(0.4,'rgba(255,150,50,'+(0.3*p.r/40)+')');g.addColorStop(1,'rgba(255,50,0,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.28);ctx.fill();}}};}},
    waves: {icon:'\u{1F30A}',name:'Waves',interval:50,init:function(c,ctx){var t=0,n=6;return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.03)';ctx.fillRect(0,0,c.width,c.height);t+=0.03;for(var i=0;i<n;i++){ctx.beginPath();for(var x=0;x<=c.width;x+=4){var y=c.height/2+Math.sin(x*0.008+t+i*1.2)*40+Math.sin(x*0.015+t*0.8+i)*25;ctx.lineTo(x,y);}ctx.strokeStyle='hsla('+(200+i*30+t*30%360)+',70%,'+(50+i*5)+'%,0.08)';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();for(var x=0;x<=c.width;x+=4){var y=c.height/2+Math.sin(x*0.008+t+i*1.2+3.14)*40+Math.sin(x*0.015+t*0.8+i)*25;ctx.lineTo(x,y);}ctx.stroke();}}};}},
    particles: {icon:'\u{2728}',name:'Particles',interval:50,init:function(c,ctx){var ps=new Array(60);for(var i=0;i<60;i++)ps[i]={x:Math.random()*c.width,y:Math.random()*c.height,vx:(Math.random()-0.5)*2,vy:(Math.random()-0.5)*2,h:Math.random()*360};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.05)';ctx.fillRect(0,0,c.width,c.height);for(var i=0;i<ps.length;i++){var p=ps[i];p.x+=p.vx;p.y+=p.vy;if(p.x<0||p.x>c.width)p.vx*=-1;if(p.y<0||p.y>c.height)p.vy*=-1;ctx.fillStyle='hsla('+p.h+',80%,60%,0.6)';ctx.beginPath();ctx.arc(p.x,p.y,3,0,6.28);ctx.fill();p.h=(p.h+0.5)%360;}}};}},
    neon: {icon:'\u{1F4F1}',name:'Neon Grid',interval:50,init:function(c,ctx){var t=0,gap=40;return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.02)';ctx.fillRect(0,0,c.width,c.height);t+=0.02;ctx.strokeStyle='hsla('+(t*50%360)+',100%,60%,0.06)';ctx.lineWidth=1;for(var x=0;x<c.width;x+=gap){ctx.beginPath();ctx.moveTo(x,0);for(var y=0;y<c.height;y+=5){ctx.lineTo(x+Math.sin(y*0.02+t)*5,y);}ctx.stroke();}for(var y=0;y<c.height;y+=gap){ctx.beginPath();ctx.moveTo(0,y);for(var x=0;x<c.width;x+=5){ctx.lineTo(x,y+Math.sin(x*0.02+t)*5);}ctx.stroke();}}};}},
    pulse: {icon:'\u{1F4A1}',name:'Color Pulse',interval:100,init:function(c,ctx){var t=0;return{draw:function(){t+=0.005;var h=t*60%360;ctx.fillStyle='hsla('+h+',50%,10%,1)';ctx.fillRect(0,0,c.width,c.height);for(var i=0;i<5;i++){var y=c.height/2+Math.sin(t+i)*c.height*0.3;var g=ctx.createRadialGradient(c.width/2,y,0,c.width/2,y,200+i*50);g.addColorStop(0,'hsla('+(h+i*30%360)+',80%,60%,0.1)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height);}}};}},
    circuit: {icon:'\u{1F5A5}',name:'Circuit Board',interval:100,init:function(c,ctx){var traces=new Array(30);for(var i=0;i<30;i++)traces[i]={x:Math.random()*c.width,y:Math.random()*c.height,dx:2,dy:0,life:200};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.05)';ctx.fillRect(0,0,c.width,c.height);traces.forEach(function(t){t.life--;if(t.life<0){t.x=Math.random()*c.width;t.y=Math.random()*c.height;t.life=200+Math.random()*300;t.dx=Math.random()>0.5?2:-2;t.dy=0;}if(Math.random()<0.03){var tmp=t.dx;t.dx=t.dy;t.dy=tmp;}t.x+=t.dx;t.y+=t.dy;if(t.x<0||t.x>c.width||t.y<0||t.y>c.height)t.life=0;ctx.fillStyle='rgba(0,255,100,'+(t.life/500)+')';ctx.fillRect(t.x,t.y,3,3);if(t.dy!==0){ctx.fillRect(t.x,t.y-1,1,3);}});}};}},
    galaxy: {icon:'\u{1F30C}',name:'Galaxy Spiral',interval:50,init:function(c,ctx){var t=0,stars=new Array(800);for(var i=0;i<800;i++)stars[i]={a:Math.random()*6.28,d:Math.pow(Math.random(),0.5)*200,s:Math.random()*2+0.5};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.08)';ctx.fillRect(0,0,c.width,c.height);t+=0.005;var cx=c.width/2,cy=c.height/2;for(var i=0;i<stars.length;i++){var s=stars[i],a=s.a+t*0.5+s.d*0.001,dist=s.d*(1+Math.sin(s.a*3+t)*0.1),x=cx+Math.cos(a)*dist,y=cy+Math.sin(a)*dist;ctx.fillStyle='rgba(255,255,255,'+(0.3+s.s/5)+')';ctx.beginPath();ctx.arc(x,y,s.s*0.5,0,6.28);ctx.fill();}}};}},
    tunnel: {icon:'\u{1F573}',name:'Tunnel',interval:50,init:function(c,ctx){var t=0;return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.1)';ctx.fillRect(0,0,c.width,c.height);t+=0.02;var cx=c.width/2,cy=c.height/2;for(var i=20;i>0;i--){var r=i*15+Math.sin(t+i*0.5)*10,a=t+i*0.3,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;ctx.strokeStyle='hsla('+(i*18+t*50%360)+',80%,'+(60-i*2)+'%,'+(0.3-i*0.01)+')';ctx.lineWidth=2;ctx.beginPath();ctx.arc(cx,cy,r,0,6.28);ctx.stroke();}}};}},
    plasma: {icon:'\u{1F300}',name:'Plasma',interval:50,init:function(c,ctx){var t=0,img=ctx.createImageData(c.width,c.height),d=img.data;return{draw:function(){t+=0.02;var w=c.width,h=c.height;for(var y=0;y<h;y+=2){for(var x=0;x<w;x+=2){var v=Math.sin(x*0.01+t)+Math.sin(y*0.01+t)+Math.sin((x+y)*0.005+t*0.7)+Math.sin(Math.sqrt(x*x+y*y)*0.008+t*0.5);var hue=(v*90+180+t*20)%360,i=(y*w+x)*4,clr=hslToRgb(hue/360,0.6,0.5);d[i]=clr[0];d[i+1]=clr[1];d[i+2]=clr[2];d[i+3]=200;}}ctx.putImageData(img,0,0);}};}},
    gravity: {icon:'\u{1F30D}',name:'Gravity',interval:50,init:function(c,ctx){var ps=new Array(80);for(var i=0;i<80;i++)ps[i]={x:Math.random()*c.width,y:Math.random()*c.height,vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*3};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.04)';ctx.fillRect(0,0,c.width,c.height);var cx=c.width/2,cy=c.height/2;for(var i=0;i<ps.length;i++){var p=ps[i],dx=cx-p.x,dy=cy-p.y,d=Math.sqrt(dx*dx+dy*dy)||1,pull=0.01;p.vx+=dx/d*pull;p.vy+=dy/d*pull;p.x+=p.vx;p.y+=p.vy;ctx.fillStyle='rgba(100,200,255,0.5)';ctx.beginPath();ctx.arc(p.x,p.y,2,0,6.28);ctx.fill();for(var j=i+1;j<ps.length;j++){var o=ps[j];if(Math.abs(o.x-p.x)<60&&Math.abs(o.y-p.y)<60){ctx.strokeStyle='rgba(100,200,255,0.05)';ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(o.x,o.y);ctx.stroke();}}}}};}},
    rings: {icon:'\u{26AA}',name:'Rings',interval:50,init:function(c,ctx){var rings=[];return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.05)';ctx.fillRect(0,0,c.width,c.height);if(Math.random()<0.02)rings.push({x:Math.random()*c.width,y:Math.random()*c.height,r:5,life:1});for(var i=rings.length-1;i>=0;i--){var r=rings[i];r.r+=1.5;r.life-=0.005;ctx.strokeStyle='hsla('+(180+r.life*100)+',80%,60%,'+(r.life*0.3)+')';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,6.28);ctx.stroke();if(r.life<=0)rings.splice(i,1);}}};}},
    spiral: {icon:'\u{1F300}',name:'Spiral',interval:50,init:function(c,ctx){var t=0,pts=new Array(200);for(var i=0;i<200;i++)pts[i]={a:i*0.1,d:i*0.5,s:i};return{draw:function(){ctx.fillStyle='rgba(0,0,0,0.06)';ctx.fillRect(0,0,c.width,c.height);t+=0.02;var cx=c.width/2,cy=c.height/2;for(var i=0;i<pts.length;i++){var p=pts[i],a=p.a+t,d=p.d+Math.sin(t+p.s)*10,x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d;ctx.fillStyle='hsla('+(p.s*2+t*50%360)+',80%,60%,0.5)';ctx.beginPath();ctx.arc(x,y,2+Math.sin(t+p.s)*1.5,0,6.28);ctx.fill();}}};}},
    hex: {icon:'\u{2B21}',name:'Hexagons',interval:100,init:function(c,ctx){var t=0,s=25;return{draw:function(){t+=0.01;ctx.fillStyle='rgba(0,0,0,0.03)';ctx.fillRect(0,0,c.width,c.height);ctx.lineWidth=1;for(var row=-1;row<c.height/s+2;row++){for(var col=-1;col<c.width/(s*1.5)+2;col++){var x=col*s*1.5+(row%2?0.75*s:0),y=row*s*0.866;ctx.strokeStyle='hsla('+((row*30+col*20+t*50)%360)+',60%,50%,0.08)';ctx.beginPath();for(var i=0;i<6;i++){var a=i*1.047;if(i===0){ctx.moveTo(x+s*Math.cos(a),y+s*Math.sin(a));}else{ctx.lineTo(x+s*Math.cos(a),y+s*Math.sin(a));}}ctx.closePath();ctx.stroke();}}}};}},
    ocean: {icon:'\u{1F30A}',name:'Ocean',interval:50,init:function(c,ctx){var t=0,bands=30;return{draw:function(){ctx.fillStyle='rgba(0,5,15,0.04)';ctx.fillRect(0,0,c.width,c.height);t+=0.015;for(var i=0;i<bands;i++){var y=c.height/bands*i;ctx.beginPath();ctx.moveTo(0,y);for(var x=0;x<=c.width;x+=5){var dy=Math.sin(x*0.01+t+i*0.3)*8+Math.sin(x*0.005+t*0.7+i*0.5)*5;ctx.lineTo(x,y+dy);}ctx.strokeStyle='hsla('+(200+i*2%360)+',50%,'+(60-i*0.5)+'%,0.04)';ctx.lineWidth=1;ctx.stroke();}}};}},
    moraine: {icon:'\u{1F5FC}',name:'Moraine Lake',interval:10000,init:imageWp('https://images.pexels.com/photos/417074/pexels-photo-417074.jpeg')},
    skogafoss: {icon:'\u{1F4A7}',name:'Skogafoss',interval:10000,init:imageWp('https://images.pexels.com/photos/2387873/pexels-photo-2387873.jpeg')},
    tablemountain: {icon:'\u{1F3D4}',name:'Table Mountain',interval:10000,init:imageWp('https://images.pexels.com/photos/1659438/pexels-photo-1659438.jpeg')},
    milkyway: {icon:'\u{1F30C}',name:'Milky Way',interval:10000,init:imageWp('https://images.pexels.com/photos/1252890/pexels-photo-1252890.jpeg')},
    aurorasky: {icon:'\u{1F4AB}',name:'Aurora Sky',interval:10000,init:imageWp('https://images.pexels.com/photos/1693095/pexels-photo-1693095.jpeg')},
    nebula: {icon:'\u{2728}',name:'Nebula',interval:10000,init:imageWp('https://images.pexels.com/photos/9160637/pexels-photo-9160637.jpeg')}
};

var wpInterval = null, wpCleanup = null, wpCurrent = 'matrix';

function stopWallpaper() {
    if (wpInterval) { clearInterval(wpInterval); wpInterval = null; }
    if (wpCleanup) { wpCleanup(); wpCleanup = null; }
}

function startWallpaper(id) {
    stopWallpaper();
    var canvas = document.getElementById('matrix-canvas');
    if (!canvas) return;
    canvas.style.display = '';
    var ctx = canvas.getContext('2d');
    if (!wallpapers || !wallpapers[id]) return;
    var wp = wallpapers[id];
    if (!wp || !wp.init) return;
    var result = wp.init(canvas, ctx);
    if (!result || !result.draw) return;
    wpInterval = setInterval(result.draw, wp.interval || 50);
    wpCleanup = result.cleanup || function(){};
    wpCurrent = id;
    if (currentUser) {
        var accounts = loadAccounts();
        if (accounts[currentUser]) { accounts[currentUser].wp = id; saveAccounts(accounts); }
    }
}

function applyWp() {
    if (!currentUser) return;
    // Set a basic background color so desktop isn't blank
    document.getElementById('desktop').style.background = 'var(--bg)';
    var canvas = document.getElementById('matrix-canvas');
    if (canvas) canvas.style.display = '';
    try {
        var acc = loadAccounts();
        if (acc[currentUser] && acc[currentUser].wp) startWallpaper(acc[currentUser].wp);
        else startWallpaper('matrix');
    } catch(e) {
        console.error('Wallpaper error:', e);
    }
}

// === Toast Notifications ===
function showToast(title, body, type) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var t = document.createElement('div');
    t.className = 'toast';
    var titleEl = document.createElement('div');
    titleEl.className = 'toast-title';
    titleEl.textContent = title;
    var bodyEl = document.createElement('div');
    bodyEl.className = 'toast-body';
    bodyEl.textContent = body;
    t.appendChild(titleEl);
    t.appendChild(bodyEl);
    container.appendChild(t);
    setTimeout(function(){ t.classList.add('toast-out'); setTimeout(function(){ t.remove(); }, 300); }, 3500);
    t.onclick = function(){ t.classList.add('toast-out'); setTimeout(function(){ t.remove(); }, 300); };
}

// === Calendar Flyout ===
document.getElementById('clock').addEventListener('click', function(e) {
    e.stopPropagation();
    var flyout = document.getElementById('calendar-flyout');
    document.getElementById('action-center').classList.add('hidden');
    document.getElementById('battery-flyout').classList.add('hidden');
    document.getElementById('network-flyout').classList.add('hidden');
    document.getElementById('volume-flyout').classList.add('hidden');
    if (!flyout.classList.contains('hidden')) { flyout.classList.add('hidden'); return; }
    var now = new Date();
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    var m = now.getMonth(), y = now.getFullYear();
    var first = new Date(y, m, 1).getDay();
    var last = new Date(y, m + 1, 0).getDate();
    var html = '<div class="cal-flyout-header">' + months[m] + ' ' + y + '</div>';
    html += '<div class="cal-flyout-grid">';
    days.forEach(function(d){ html += '<div class="cal-day header">' + d + '</div>'; });
    for (var i = 0; i < first; i++) html += '<div></div>';
    for (var d = 1; d <= last; d++) {
        var isToday = d === now.getDate() ? ' today' : '';
        html += '<div class="cal-day' + isToday + '">' + d + '</div>';
    }
    html += '</div>';
    html += '<div class="cal-flyout-time">' + now.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + '</div>';
    flyout.innerHTML = html;
    flyout.classList.remove('hidden');
});

// === Action Center ===
document.getElementById('tray-action-center').addEventListener('click', function(e) {
    e.stopPropagation();
    var ac = document.getElementById('action-center');
    document.getElementById('calendar-flyout').classList.add('hidden');
    document.getElementById('battery-flyout').classList.add('hidden');
    document.getElementById('network-flyout').classList.add('hidden');
    document.getElementById('volume-flyout').classList.add('hidden');
    if (!ac.classList.contains('hidden')) { ac.classList.add('hidden'); return; }
    var html = '<div class="ac-header">\u{1F4AC} Action Center</div><div class="ac-toggles">';
    var isLight = document.body.classList.contains('light-theme');
    var toggles = [
        {id:'ac-wifi',icon:'\u{1F4F6}',label:'Wi-Fi',on:true},
        {id:'ac-bt',icon:'\u{1F5A5}',label:'Bluetooth',on:false},
        {id:'ac-nl',icon:isLight?'\u{2600}\uFE0F':'\u{1F319}',label:'Theme',on:isLight}
    ];
    toggles.forEach(function(t){
        html += '<div class="ac-toggle' + (t.on?' active':'') + '" data-ac="'+t.id+'"><span class="ac-icon">'+t.icon+'</span><span class="ac-label">'+t.label+'</span></div>';
    });
    html += '</div><div class="ac-volume"><span>\u{1F50A}</span><input type="range" min="0" max="100" value="75" id="ac-volume-slider"></div>';
    ac.innerHTML = html;
    ac.classList.remove('hidden');
    ac.querySelectorAll('.ac-toggle').forEach(function(tog){
        tog.onclick = function(){
            tog.classList.toggle('active');
            if (tog.dataset.ac === 'ac-nl') {
                var on = tog.classList.contains('active');
                document.body.classList.toggle('light-theme', on);
                localStorage.setItem('cyberos_theme', on ? 'light' : 'dark');
                tog.querySelector('.ac-icon').textContent = on ? '\u{2600}\uFE0F' : '\u{1F319}';
                var icon = document.getElementById('tray-nightlight');
                if (icon) icon.textContent = on ? '\u{2600}\uFE0F' : '\u{1F319}';
                var tr2 = localStorage.getItem('cyberos_transparency');
                if (tr2) {
                    var a2 = parseInt(tr2) / 100;
                    var base2 = on ? '255,255,255' : '2,8,19';
                    document.body.style.setProperty('--win-bg', 'rgba('+base2+','+a2+')');
                }
            }
            var label = tog.querySelector('.ac-label').textContent;
            var state = tog.classList.contains('active') ? 'ON' : 'OFF';
            showToast('Action Center', label + ' ' + state, 'info');
        };
    });
    var volSlider = ac.querySelector('#ac-volume-slider');
    volSlider.oninput = function(){
        var v = this.value;
        document.getElementById('tray-volume').textContent = v > 50 ? '\u{1F50A}' : v > 0 ? '\u{1F509}' : '\u{1F507}';
    };
});

// === Theme (Dark/Light mode) ===
function toggleTheme(light) {
    document.body.classList.toggle('light-theme', light);
    localStorage.setItem('cyberos_theme', light ? 'light' : 'dark');
    var tr = localStorage.getItem('cyberos_transparency');
    if (tr) {
        var a = parseInt(tr) / 100;
        var base = light ? '255,255,255' : '2,8,19';
        document.body.style.setProperty('--win-bg', 'rgba('+base+','+a+')');
    }
}

// Init theme on load
(function(){
    if (localStorage.getItem('cyberos_theme') === 'light') { document.body.classList.add('light-theme'); }
    // Init transparency
    var tr = localStorage.getItem('cyberos_transparency');
    if (tr) {
        var a = parseInt(tr)/100;
        var base = document.body.classList.contains('light-theme') ? '255,255,255' : '2,8,19';
        document.body.style.setProperty('--win-bg', 'rgba('+base+','+a+')');
    }
    // Init accent
    var accent = localStorage.getItem('cyberos_accent');
    if (accent) { document.documentElement.style.setProperty('--fg', accent); document.documentElement.style.setProperty('--fg-bright', accent); document.documentElement.style.setProperty('--border', accent); document.documentElement.style.setProperty('--accent', accent); document.documentElement.style.setProperty('--shadow', accent+'66'); }
})();

// === Search Bar ===
var searchInput = document.getElementById('search-input');
var searchResults = document.getElementById('search-results');
var allApps = [
    {t:'fileexplorer',i:'\u{1F4C1}',l:'File Explorer'},{t:'recyclebin',i:'\u{1F5D1}',l:'Recycle Bin'},
    {t:'notes',i:'\u{1F4DD}',l:'Notepad'},{t:'todo',i:'\u2705',l:'Todo'},{t:'calendar',i:'\u{1F4C5}',l:'Calendar'},
    {t:'calc',i:'\u{1F9EE}',l:'Calculator'},{t:'ai',i:'\u{1F916}',l:'AI Chat'},{t:'gaminghub',i:'\u{1F3AE}',l:'Gaming Hub'},
    {t:'highscores',i:'\u{1F3C6}',l:'High Scores'},{t:'wallpapers',i:'\u{1F5BC}',l:'Wallpapers'},
    {t:'settings',i:'\u2699\uFE0F',l:'Settings'},{t:'taskmgr',i:'\u{1F4CA}',l:'Task Manager'},
    {t:'brave',i:'\u{1F981}',l:'Brave Browser'},{t:'terminal',i:'\u{1F5A5}',l:'Terminal'},{t:'powershell',i:'\u{1FA9F}',l:'PowerShell'},{t:'ubuntu',i:'\u{1F427}',l:'Ubuntu Terminal'},{t:'snip',i:'\u{2702}\uFE0F',l:'Snipping Tool'},
    {t:'paint',i:'\u{1F3A8}',l:'Paint'},{t:'mediaplayer',i:'\u{1F3B5}',l:'Media Player'},
    {t:'controlpanel',i:'\u2699',l:'Control Panel'},
    {t:'photos',i:'\u{1F5BC}',l:'Photos'},
    {t:'camera',i:'\u{1F4F7}',l:'Camera'}
];
searchInput.addEventListener('input', function() {
    var q = this.value.toLowerCase().trim();
    if (!q) { searchResults.classList.add('hidden'); return; }
    var matches = allApps.filter(function(a){ return a.l.toLowerCase().includes(q) || a.t.toLowerCase().includes(q); });
    if (matches.length === 0) { searchResults.classList.add('hidden'); return; }
    searchResults.innerHTML = matches.map(function(a){ return '<div class="search-result-item" data-app="'+a.t+'"><span>'+a.i+'</span><span>'+a.l+'</span></div>'; }).join('');
    searchResults.classList.remove('hidden');
});
searchResults.addEventListener('click', function(e) {
    var item = e.target.closest('.search-result-item');
    if (!item) return;
    toggleWindow(item.dataset.app);
    searchResults.classList.add('hidden');
    searchInput.value = '';
});
document.addEventListener('click', function(e) {
    if (!e.target.closest('#taskbar-search')) searchResults.classList.add('hidden');
});

// === Emoji Picker (Win+.) ===
var emojiCats = {
    'Smileys':['\u{1F600}','\u{1F603}','\u{1F604}','\u{1F601}','\u{1F606}','\u{1F605}','\u{1F923}','\u{1F602}','\u{1F642}','\u{1F643}','\u{1F609}','\u{1F60A}','\u{1F607}','\u{1F60D}','\u{1F929}','\u{1F618}','\u{1F617}','\u{1F61A}','\u{1F619}','\u{1F61B}','\u{1F61C}','\u{1F92A}','\u{1F928}','\u{1F9D0}','\u{1F913}','\u{1F60E}','\u{1F921}','\u{1F920}','\u{1F973}','\u{1F976}','\u{1F974}','\u{1F635}'],
    'Gestures':['\u{1F44B}','\u{1F91A}','\u{1F590}','\u{270B}','\u{1F44C}','\u{1F44D}','\u{1F44E}','\u{270A}','\u{1F44A}','\u{1F91B}','\u{1F91C}','\u{1F44F}','\u{1F64C}','\u{1F450}','\u{1F932}','\u{1F91D}','\u{1F64F}'],
    'Nature':['\u{1F436}','\u{1F431}','\u{1F434}','\u{1F40E}','\u{1F435}','\u{1F433}','\u{1F437}','\u{1F43B}','\u{1F431}','\u{1F438}','\u{1F985}','\u{1F986}','\u{1F989}','\u{1F98A}','\u{1F99D}','\u{1F984}','\u{2600}','\u{1F319}','\u{2B50}','\u{1F31F}','\u{1F30C}','\u{1F308}','\u{1F33F}','\u{1F340}','\u{1F338}','\u{1F490}'],
    'Objects':['\u{1F4A1}','\u{1F526}','\u{1F4FB}','\u{1F4F1}','\u{1F4BB}','\u{1F5A5}','\u{1F4D6}','\u{2709}','\u{1F4E3}','\u{23F3}','\u{23F0}','\u{1F3B5}','\u{1F3B6}','\u{1F3A8}','\u{1F3AC}','\u{1F3AE}','\u{1F3B0}','\u{1F697}','\u{1F680}','\u{1F6F8}','\u{1F6EB}'],
    'Symbols':['\u{2764}','\u{1F5A4}','\u{2764}\uFE0F\u200D\u{1F525}','\u{1F49B}','\u{1F49A}','\u{1F499}','\u{1F49C}','\u{1F90E}','\u{1F5E3}','\u{1F4AC}','\u{1F4A6}','\u{1F4A3}','\u{26A0}','\u{1F6AB}','\u{1F4B0}','\u{1F4B5}','\u{1F3C6}','\u{1F3B1}']
};
function openEmojiPicker() {
    var picker = document.getElementById('emoji-picker');
    if (!picker.classList.contains('hidden')) { picker.classList.add('hidden'); return; }
    var cats = Object.keys(emojiCats);
    picker.innerHTML = '<div class="ep-cats">' + cats.map(function(c,i){ return '<div class="ep-cat'+(i===0?' active':'')+'" data-cat="'+c+'">'+c+'</div>'; }).join('') + '</div><div class="ep-grid" id="ep-grid"></div>';
    var grid = picker.querySelector('#ep-grid');
    function showCat(cat) {
        grid.innerHTML = emojiCats[cat].map(function(e){ return '<div class="ep-item">'+e+'</div>'; }).join('');
        picker.querySelectorAll('.ep-cat').forEach(function(c){ c.classList.toggle('active', c.dataset.cat === cat); });
    }
    showCat(cats[0]);
    picker.querySelectorAll('.ep-cat').forEach(function(c){
        c.onclick = function(){ showCat(c.dataset.cat); };
    });
    grid.addEventListener('click', function(e){
        var item = e.target.closest('.ep-item');
        if (!item) return;
        var emoji = item.textContent;
        var activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
            var start = activeEl.selectionStart, end = activeEl.selectionEnd;
            activeEl.value = activeEl.value.substring(0, start) + emoji + activeEl.value.substring(end);
            activeEl.selectionStart = activeEl.selectionEnd = start + emoji.length;
        }
        picker.classList.add('hidden');
    });
    picker.classList.remove('hidden');
}
document.addEventListener('click', function(e) {
    if (!e.target.closest('#emoji-picker')) document.getElementById('emoji-picker').classList.add('hidden');
});

// === Snap Layouts (Win+Z) ===
function showSnapLayouts() {
    var menu = document.getElementById('snap-layout-menu');
    if (!menu.classList.contains('hidden')) { menu.classList.add('hidden'); return; }
    var focusedWin = null;
    if (openWindows.length > 0) {
        var lastId = openWindows[openWindows.length - 1];
        var lastWin = document.getElementById(lastId);
        if (lastWin && !lastWin.classList.contains('hidden')) focusedWin = lastWin;
    }
    if (!focusedWin) { showToast('Snap Layouts', 'Open a window first', 'info'); return; }
    var rect = focusedWin.getBoundingClientRect();
    var layouts = [
        {name:'Left half',cols:2,preview:[1,1]},
        {name:'Right half',cols:2,preview:[0,1]},
        {name:'Left 2/3',cols:2,preview:[2,1]},
        {name:'Right 2/3',cols:2,preview:[1,2]},
        {name:'Four quarters',cols:4,preview:[1,1,1,1]}
    ];
    menu.innerHTML = '<div style="font-size:0.75rem;margin-bottom:6px;text-align:center;font-weight:bold;">Snap Layouts</div><div class="snap-layout-grid" style="grid-template-columns:repeat(5,1fr);gap:4px;">';
    layouts.forEach(function(l, idx){
        menu.innerHTML += '<div class="snap-layout-option" data-layout="'+idx+'"><div class="sl-preview">' + l.preview.map(function(p){ return '<div style="flex:'+p+'"></div>'; }).join('') + '</div><div style="font-size:0.6rem;margin-top:2px;text-align:center;">'+l.name+'</div></div>';
    });
    menu.innerHTML += '</div>';
    var mx = Math.min(rect.left, window.innerWidth - 340);
    var my = Math.max(0, rect.top - 120);
    menu.style.left = mx + 'px';
    menu.style.top = my + 'px';
    menu.classList.remove('hidden');
    menu.querySelectorAll('.snap-layout-option').forEach(function(opt){
        opt.onclick = function(){
            var idx = parseInt(opt.dataset.layout);
            var layouts_sizes = [
                {w:'50%',h:'100%',x:'0',y:'0'},
                {w:'50%',h:'100%',x:'50%',y:'0'},
                {w:'66%',h:'100%',x:'0',y:'0'},
                {w:'66%',h:'100%',x:'33%',y:'0'},
                {w:'50%',h:'50%',x:'0',y:'0'}
            ];
            var ls = layouts_sizes[idx];
            if (ls) {
                focusedWin.style.left = ls.x;
                focusedWin.style.top = ls.y;
                focusedWin.style.width = ls.w;
                focusedWin.style.height = ls.h;
            }
            menu.classList.add('hidden');
        };
    });
}
document.addEventListener('click', function(e) {
    if (!e.target.closest('#snap-layout-menu')) document.getElementById('snap-layout-menu').classList.add('hidden');
});

// === Keyboard shortcuts ===
document.addEventListener('keydown', function(e) {
    // Win+. = Emoji picker
    if (e.key === '.' && (e.metaKey || (e.ctrlKey && e.altKey))) {
        e.preventDefault();
        openEmojiPicker();
    }
    // Win+Z = Snap layouts
    if (e.key === 'z' && (e.metaKey || (e.ctrlKey && e.shiftKey))) {
        e.preventDefault();
        showSnapLayouts();
    }
    // Ctrl+Shift+Esc = Task Manager
    if (e.key === 'Escape' && e.shiftKey && e.ctrlKey) {
        e.preventDefault();
        toggleWindow('taskmgr');
    }
    // Ctrl+Shift+I = Settings
    if (e.key === 'I' && e.shiftKey && e.ctrlKey) {
        e.preventDefault();
        toggleWindow('settings');
    }
    // Win+Arrow = Snap windows
    if (e.key.startsWith('Arrow') && e.metaKey) {
        e.preventDefault();
        const focusedId = openWindows[openWindows.length - 1];
        const win = document.getElementById(focusedId);
        if (!win || win.classList.contains('hidden')) return;
        if (e.key === 'ArrowUp') {
            const wasMax = win.classList.contains('maximized');
            if (!wasMax) {
                const r = win.getBoundingClientRect();
                windowPreState[focusedId] = {
                    left: win.style.left || r.left + 'px', top: win.style.top || r.top + 'px',
                    width: win.style.width || r.width + 'px', height: win.style.height || r.height + 'px'
                };
            }
            win.classList.add('maximized');
            win.style.left = '0'; win.style.top = '0';
            win.style.width = '100%'; win.style.height = 'calc(100% - 40px)';
            win.style.transform = 'none';
        } else if (e.key === 'ArrowDown') {
            if (win.classList.contains('maximized')) {
                win.classList.remove('maximized');
                const pre = windowPreState[focusedId];
                if (pre) { win.style.left = pre.left; win.style.top = pre.top; win.style.width = pre.width; win.style.height = pre.height; }
            }
        } else if (e.key === 'ArrowLeft') {
            win.classList.remove('maximized');
            win.style.left = '0'; win.style.top = '0';
            win.style.width = (window.innerWidth / 2) + 'px';
            win.style.height = (window.innerHeight - 40) + 'px';
            win.style.transform = 'none';
        } else if (e.key === 'ArrowRight') {
            win.classList.remove('maximized');
            win.style.left = (window.innerWidth / 2) + 'px'; win.style.top = '0';
            win.style.width = (window.innerWidth / 2) + 'px';
            win.style.height = (window.innerHeight - 40) + 'px';
            win.style.transform = 'none';
        }
        updateTaskbar();
    }
    // Win+E = File Explorer
    if (e.key === 'e' && e.metaKey) { e.preventDefault(); toggleWindow('fileexplorer'); }
    // Win+R = Run
    if (e.key === 'r' && e.metaKey) { e.preventDefault(); const cmd = prompt('Run:', ''); if (cmd) showToast('Run', 'Executing: ' + cmd, 'info'); }
    // Win+I = Settings
    if (e.key === 'i' && e.metaKey) { e.preventDefault(); toggleWindow('settings'); }
    // Win+Tab = Task View
    if (e.key === 'Tab' && e.metaKey && !e.shiftKey) {
        e.preventDefault();
        showToast('Task View', 'Task View (virtual desktops coming soon)', 'info');
    }
    // Win+PrtScn = Screenshot
    if (e.key === 'PrintScreen' && e.metaKey) {
        e.preventDefault();
        showToast('Screenshot', 'Screenshot saved to Pictures\\Screenshots \u{1F5BC}', 'info');
    }
    // Win+V = Clipboard history
    if (e.key === 'v' && e.metaKey && !e.shiftKey) {
        e.preventDefault();
        showToast('Clipboard', 'Clipboard history \u{1F4CB}', 'info');
    }
    // Win+K = Connect display
    if (e.key === 'k' && e.metaKey) {
        e.preventDefault();
        showToast('Connect', 'Searching for wireless displays... \u{1F4F1}', 'info');
    }
});

// === System Tray click handlers ===
function buildVolumeFlyout() {
    const flyout = document.getElementById('volume-flyout');
    document.getElementById('battery-flyout').classList.add('hidden');
    document.getElementById('network-flyout').classList.add('hidden');
    document.getElementById('calendar-flyout').classList.add('hidden');
    document.getElementById('action-center').classList.add('hidden');
    if (!flyout.classList.contains('hidden')) { flyout.classList.add('hidden'); return; }
    const masterVol = localStorage.getItem('cyberos_master_vol') || '75';
    const appsVol = safeJsonObject('cyberos_apps_vol', {"system":80,"browser":60,"communications":50,"notifications":70});
    let html = '<div class="vf-header">\u{1F50A} Volume Mixer</div>';
    html += '<div class="vf-master">';
    html += '<span class="vf-master-icon" id="vf-master-icon">' + (masterVol > 50 ? '\u{1F50A}' : masterVol > 0 ? '\u{1F509}' : '\u{1F507}') + '</span>';
    html += '<input type="range" min="0" max="100" value="' + masterVol + '" id="vf-master-slider">';
    html += '<span class="vf-master-label" id="vf-master-label">' + masterVol + '%</span></div>';
    const appList = [
        {k:'system',i:'\u{1F4F0}',n:'System sounds'},
        {k:'browser',i:'\u{1F310}',n:'Browser'},
        {k:'communications',i:'\u{1F4DE}',n:'Communications'},
        {k:'notifications',i:'\u{1F514}',n:'Notifications'}
    ];
    appList.forEach(a => {
        const v = appsVol[a.k] || 50;
        html += '<div class="vf-app"><span class="vf-app-icon">' + a.i + '</span><span class="vf-app-name">' + a.n + '</span>';
        html += '<input type="range" min="0" max="100" value="' + v + '" data-app="' + a.k + '">';
        html += '<span class="vf-app-label">' + v + '%</span></div>';
    });
    flyout.innerHTML = html;
    flyout.classList.remove('hidden');
    document.getElementById('vf-master-slider').oninput = function() {
        const v = this.value;
        document.getElementById('vf-master-label').textContent = v + '%';
        document.getElementById('vf-master-icon').textContent = v > 50 ? '\u{1F50A}' : v > 0 ? '\u{1F509}' : '\u{1F507}';
        document.getElementById('tray-volume').textContent = v > 50 ? '\u{1F50A}' : v > 0 ? '\u{1F509}' : '\u{1F507}';
        localStorage.setItem('cyberos_master_vol', v);
    };
    flyout.querySelectorAll('.vf-app input[type=range]').forEach(sl => {
        sl.oninput = function() {
            const label = this.parentElement.querySelector('.vf-app-label');
            label.textContent = this.value + '%';
            const apps = safeJsonObject('cyberos_apps_vol', {});
            apps[this.dataset.app] = parseInt(this.value);
            localStorage.setItem('cyberos_apps_vol', JSON.stringify(apps));
        };
    });
}
function buildNetworkFlyout() {
    const flyout = document.getElementById('network-flyout');
    document.getElementById('battery-flyout').classList.add('hidden');
    document.getElementById('volume-flyout').classList.add('hidden');
    document.getElementById('calendar-flyout').classList.add('hidden');
    document.getElementById('action-center').classList.add('hidden');
    if (!flyout.classList.contains('hidden')) { flyout.classList.add('hidden'); return; }
    const wifiOn = localStorage.getItem('cyberos_wifi') !== 'off';
    const networks = [
        {n:'CyberNet',s:4,sec:'WPA2',connected:true},
        {n:'Neighbor_5G',s:3,sec:'WPA3',connected:false},
        {n:'Guest_WiFi',s:2,sec:'Open',connected:false},
        {n:'Office_Network',s:4,sec:'WPA2-Enterprise',connected:false},
        {n:'IoT_2.4G',s:1,sec:'WPA2',connected:false}
    ];
    let html = '<div class="nf-header">\u{1F4F6} Network</div>';
    html += '<div class="nf-toggle' + (wifiOn ? ' active' : '') + '" id="nf-wifi-toggle">\u{1F4F6} Wi-Fi<span class="nf-toggle-indicator">' + (wifiOn ? 'ON' : 'OFF') + '</span></div>';
    if (wifiOn) {
        html += '<div class="nf-network-list">';
        networks.forEach(n => {
            const bars = [1,2,3,4].map(i => '<span' + (i <= n.s ? ' class="active"' : '') + ' style="height:' + (i * 3) + 'px;"></span>').join('');
            html += '<div class="nf-network' + (n.connected ? ' connected' : '') + '"><span class="nf-signal">' + bars + '</span>';
            html += '<span class="nf-name">' + n.n + '</span>';
            html += '<span class="nf-status">' + (n.connected ? 'Connected' : n.sec) + '</span></div>';
        });
        html += '</div>';
    }
    flyout.innerHTML = html;
    flyout.classList.remove('hidden');
    document.getElementById('nf-wifi-toggle').onclick = function() {
        this.classList.toggle('active');
        const on = this.classList.contains('active');
        this.querySelector('.nf-toggle-indicator').textContent = on ? 'ON' : 'OFF';
        localStorage.setItem('cyberos_wifi', on ? 'on' : 'off');
        buildNetworkFlyout();
    };
}
function buildBatteryFlyout() {
    const flyout = document.getElementById('battery-flyout');
    document.getElementById('network-flyout').classList.add('hidden');
    document.getElementById('volume-flyout').classList.add('hidden');
    document.getElementById('calendar-flyout').classList.add('hidden');
    document.getElementById('action-center').classList.add('hidden');
    if (!flyout.classList.contains('hidden')) { flyout.classList.add('hidden'); return; }
    const pct = 85;
    batteryHistory.push(Math.min(100, Math.max(60, (batteryHistory[batteryHistory.length-1] || 85) + Math.floor(Math.random() * 5) - 2)));
    if (batteryHistory.length > 10) batteryHistory.shift();
    const maxH = Math.max(...batteryHistory);
    let html = '<div class="bf-header">\u{1F50B} Battery</div>';
    html += '<div class="bf-main"><div class="bf-icon">\u{1F50B}</div><div><div class="bf-pct">' + pct + '%</div><div class="bf-time">~' + (4 + Math.floor(Math.random() * 2)) + 'h ' + (Math.floor(Math.random() * 60)) + 'm remaining</div></div></div>';
    html += '<div class="bf-bar"><div class="bf-bar-fill" style="width:' + pct + '%;"></div></div>';
    html += '<div class="bf-graph-label">\u{1F4C8} Discharge (last ' + batteryHistory.length + ' min)</div>';
    html += '<div class="bf-graph">';
    batteryHistory.forEach((v, i) => {
        const h = Math.max(4, (v / maxH) * 36);
        const isLast = i === batteryHistory.length - 1;
        html += '<div class="bf-graph-bar" style="height:' + h + 'px;background:' + (isLast ? 'var(--accent)' : 'rgba(51,255,51,0.3)') + ';"></div>';
    });
    html += '</div>';
    flyout.innerHTML = html;
    flyout.classList.remove('hidden');
}

document.getElementById('tray-volume').addEventListener('click', function(e) {
    e.stopPropagation();
    buildVolumeFlyout();
});
document.getElementById('tray-network').addEventListener('click', function(e) {
    e.stopPropagation();
    buildNetworkFlyout();
});
document.getElementById('tray-battery').addEventListener('click', function(e) {
    e.stopPropagation();
    buildBatteryFlyout();
});
document.getElementById('tray-nightlight').addEventListener('click', function(e) {
    e.stopPropagation();
    var isLight = !document.body.classList.contains('light-theme');
    toggleTheme(isLight);
    this.textContent = isLight ? '\u{2600}\uFE0F' : '\u{1F319}';
    showToast('Theme', isLight ? 'Light mode \u{2600}\uFE0F' : 'Dark mode \u{1F319}', 'info');
});

// Init theme icon
(function(){
    var nl = document.getElementById('tray-nightlight');
    if (nl) nl.textContent = document.body.classList.contains('light-theme') ? '\u{2600}\uFE0F' : '\u{1F319}';
})();

// === App Usage Tracking ===
function trackAppUsage(type) {
    if (!appUsage[type]) appUsage[type] = 0;
    appUsage[type]++;
    localStorage.setItem('cyberos_app_usage', JSON.stringify(appUsage));
}

// === Notification Badges ===
function setBadge(appType, count) {
    appBadges[appType] = count;
    updateBadges();
}
function clearBadge(appType) {
    delete appBadges[appType];
    updateBadges();
}
function updateBadges() {
    document.querySelectorAll('.taskbar-btn').forEach(btn => {
        const app = btn.dataset.app;
        let badge = btn.querySelector('.taskbar-badge');
        const count = appBadges[app] || 0;
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'taskbar-badge';
                btn.appendChild(badge);
            }
            badge.textContent = count > 99 ? '99+' : count;
        } else if (badge) {
            badge.remove();
        }
    });
}


// === Taskbar icon picker ===
function showTaskbarIconPicker(addMode) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:100000;display:flex;align-items:center;justify-content:center;';
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg2);border:2px solid var(--border);border-radius:8px;padding:20px;min-width:280px;max-width:350px;max-height:70vh;box-shadow:0 8px 40px var(--shadow);display:flex;flex-direction:column;';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:0.95rem;font-weight:bold;margin-bottom:12px;';
    title.textContent = addMode ? 'Add taskbar icon' : 'Remove taskbar icon';
    card.appendChild(title);
    const list = document.createElement('div');
    list.style.cssText = 'flex:1;overflow-y:auto;margin-bottom:12px;';
    if (addMode) {
        allAppsList.forEach(function(app) {
            if (_pinnedApps.includes(app.t)) return;
            var item = document.createElement('div');
            item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:0.85rem;display:flex;align-items:center;gap:10px;border-radius:4px;';
            item.innerHTML = '<span>' + app.i + '</span><span>' + app.l + '</span>';
            item.onmouseenter = function() { this.style.background = 'var(--fg-dim)'; };
            item.onmouseleave = function() { this.style.background = 'transparent'; };
            item.onclick = function() {
                _pinnedApps.push(app.t);
                localStorage.setItem('cyberos_pinned', JSON.stringify(_pinnedApps));
                applyPinnedApps();
                overlay.remove();
                showToast('Taskbar', app.l + ' pinned', 'info');
            };
            list.appendChild(item);
        });
        if (list.children.length === 0) {
            list.innerHTML = '<div style="padding:16px;text-align:center;opacity:0.5;font-size:0.8rem;">All apps already pinned</div>';
        }
    } else {
        _pinnedApps.forEach(function(appType) {
            var app = allAppsList.find(function(a) { return a.t === appType; });
            if (!app) return;
            var item = document.createElement('div');
            item.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:0.85rem;display:flex;align-items:center;gap:10px;border-radius:4px;';
            item.innerHTML = '<span>' + app.i + '</span><span>' + app.l + '</span>';
            item.onmouseenter = function() { this.style.background = 'var(--fg-dim)'; };
            item.onmouseleave = function() { this.style.background = 'transparent'; };
            item.onclick = function() {
                var idx2 = _pinnedApps.indexOf(appType);
                if (idx2 >= 0) _pinnedApps.splice(idx2, 1);
                localStorage.setItem('cyberos_pinned', JSON.stringify(_pinnedApps));
                applyPinnedApps();
                overlay.remove();
                showToast('Taskbar', app.l + ' unpinned', 'info');
            };
            list.appendChild(item);
        });
        if (_pinnedApps.length === 0) {
            list.innerHTML = '<div style="padding:16px;text-align:center;opacity:0.5;font-size:0.8rem;">No pinned apps to remove</div>';
        }
    }
    card.appendChild(list);
    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Cancel';
    closeBtn.style.cssText = 'margin:0;padding:8px;font-size:0.85rem;background:transparent;border:1px solid var(--border);color:var(--fg);border-radius:4px;cursor:pointer;';
    closeBtn.onclick = function() { overlay.remove(); };
    card.appendChild(closeBtn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}

// === Corner Overflow ===
function updateTrayOverflow() {
    const tray = document.getElementById('system-tray');
    const btn = document.getElementById('tray-overflow-btn');
    const overflow = document.getElementById('tray-overflow');
    if (!tray || !btn || !overflow) return;
    const icons = tray.querySelectorAll('.tray-icon');
    let totalWidth = 0;
    let hiddenIcons = [];
    const maxWidth = tray.offsetWidth || 200;
    icons.forEach((icon, i) => {
        if (icon.id === 'tray-overflow-btn') return;
        totalWidth += icon.offsetWidth + 4;
        if (totalWidth > maxWidth - 30) {
            hiddenIcons.push(icon);
            icon.style.display = 'none';
        } else {
            icon.style.display = '';
        }
    });
    if (hiddenIcons.length > 0) {
        btn.style.display = '';
        overflow.innerHTML = hiddenIcons.map(icon => {
            const clone = icon.cloneNode(true);
            clone.style.display = '';
            clone.style.cssText = 'font-size:0.9rem;padding:4px 8px;text-align:left;cursor:pointer;border-radius:2px;';
            return clone.outerHTML;
        }).join('');
    } else {
        btn.style.display = 'none';
        overflow.classList.add('hidden');
    }
}
document.getElementById('tray-overflow-btn').addEventListener('click', function(e) {
    e.stopPropagation();
    const overflow = document.getElementById('tray-overflow');
    overflow.classList.toggle('hidden');
});
document.addEventListener('click', function(e) {
    const overflow = document.getElementById('tray-overflow');
    if (overflow && !e.target.closest('#tray-overflow') && !e.target.closest('#tray-overflow-btn')) {
        overflow.classList.add('hidden');
    }
});

// === Power User Menu (Win+X) ===
function buildPowerUserMenu(e) {
    const menu = document.getElementById('power-user-menu');
    if (!menu.classList.contains('hidden')) { menu.classList.add('hidden'); return; }
    const items = [
        {icon:'\u{1F4CA}', label:'Task Manager', action:'taskmgr', shortcut:'Ctrl+Shift+Esc'},
        {icon:'\u2699\uFE0F', label:'Settings', action:'settings', shortcut:'Ctrl+Shift+I'},
        {icon:'\u{1F4C1}', label:'File Explorer', action:'explorer', shortcut:''},
        null,
        {icon:'\u25B6\uFE0F', label:'Run', action:'run', shortcut:'Win+R'},
        {icon:'\u{1F50D}', label:'Search', action:'search', shortcut:'Win+S'},
        {icon:'\u{1F5A5}', label:'Terminal', action:'terminal', shortcut:''},
        {icon:'\u{1FA9F}', label:'PowerShell', action:'powershell', shortcut:''},
        {icon:'\u{1F427}', label:'Ubuntu Terminal', action:'ubuntu', shortcut:''},
        {icon:'\u2699', label:'Control Panel', action:'controlpanel', shortcut:''}
    ];
    let html = '';
    items.forEach(item => {
        if (item === null) {
            html += '<div class="pum-separator"></div>';
        } else {
            html += '<button class="pum-item" data-action="' + item.action + '"><span class="pum-icon">' + item.icon + '</span><span>' + item.label + '</span><span class="pum-shortcut">' + item.shortcut + '</span></button>';
        }
    });
    menu.innerHTML = html;
    menu.classList.remove('hidden');
    menu.querySelectorAll('.pum-item').forEach(item => {
        item.onclick = function() {
            const action = this.dataset.action;
            menu.classList.add('hidden');
            if (action === 'taskmgr') { toggleWindow('taskmgr'); }
            else if (action === 'settings') { toggleWindow('settings'); }
            else if (action === 'explorer') { toggleWindow('fileexplorer'); }
            else if (action === 'run') {
                const cmd = prompt('Run:', '');
                if (cmd) showToast('Run', 'Executing: ' + cmd, 'info');
            }
            else if (action === 'search') { document.getElementById('search-input')?.focus(); }
            else if (action === 'terminal') { toggleWindow('terminal'); }
            else if (action === 'powershell') { toggleWindow('powershell'); }
            else if (action === 'ubuntu') { toggleWindow('ubuntu'); }
            else if (action === 'controlpanel') { toggleWindow('controlpanel'); }
        };
    });
}

// === Flyout close on outside click ===
document.addEventListener('click', function(e) {
    const flyouts = ['battery-flyout','network-flyout','volume-flyout','power-user-menu'];
    flyouts.forEach(id => {
        const el = document.getElementById(id);
        const trigger = id === 'battery-flyout' ? '#tray-battery' :
                       id === 'network-flyout' ? '#tray-network' :
                       id === 'volume-flyout' ? '#tray-volume' :
                       id === 'power-user-menu' ? null : null;
        if (el && !el.classList.contains('hidden') && !e.target.closest('#' + id) && (!trigger || !e.target.closest(trigger))) {
            el.classList.add('hidden');
        }
    });
});

// === Win+X keyboard shortcut ===
document.addEventListener('keydown', function(e) {
    if (e.key === 'x' && (e.metaKey || (e.ctrlKey && e.shiftKey))) {
        e.preventDefault();
        buildPowerUserMenu(e);
    }
});

// === Init badges demo + overflow check on resize ===
setTimeout(function() {
    setBadge('ai', 2);
    setBadge('todo', 1);
    updateTrayOverflow();
}, 2000);
window.addEventListener('resize', updateTrayOverflow);
setInterval(updateTrayOverflow, 5000);

// === Wallpaper Fit Options ===
let wallpaperFit = localStorage.getItem('cyberos_wp_fit') || 'cover';
function setWallpaperFit(mode) {
    wallpaperFit = mode;
    localStorage.setItem('cyberos_wp_fit', mode);
    const canvas = document.getElementById('matrix-canvas');
    if (canvas) {
        canvas.style.objectFit = mode;
        canvas.style.backgroundSize = mode;
    }
    showToast('Wallpaper', 'Fit: ' + mode, 'info');
}

// === Screensaver / Power ===
let screensaverTimer = null;
let screensaverActive = false;
var screenTimeout = parseInt(localStorage.getItem('cyberos_timeout') || '180000', 10);
if (isNaN(screenTimeout) || screenTimeout < 1000) screenTimeout = 180000;

function resetScreensaver() {
    if (screensaverActive) {
        screensaverActive = false;
        const ss = document.getElementById('screensaver-overlay');
        if (ss) ss.remove();
        const sleepOv = document.getElementById('sleep-overlay');
        if (sleepOv) sleepOv.remove();
    }
    if (screensaverTimer) clearTimeout(screensaverTimer);
    if (!booted || bootScreen.classList.contains('hidden') === false) return;
    screensaverTimer = setTimeout(() => {
        if (!booted) return;
        const overlay = document.createElement('div');
        overlay.id = 'screensaver-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:#000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
        const text = document.createElement('div');
        text.style.cssText = 'color:#33ff33;font-family:monospace;font-size:2rem;animation:ssFade 3s infinite;';
        text.textContent = 'CYBER OS';
        overlay.appendChild(text);
        const style = document.createElement('style');
        style.textContent = '@keyframes ssFade { 0%,100% { opacity:0.2; } 50% { opacity:1; } }';
        overlay.appendChild(style);
        overlay.onclick = function() { this.remove(); screensaverActive = false; };
        overlay.onmousemove = function() { this.remove(); screensaverActive = false; };
        document.body.appendChild(overlay);
        screensaverActive = true;
    }, screenTimeout);
}
document.addEventListener('mousemove', resetScreensaver);
document.addEventListener('keydown', resetScreensaver);
document.addEventListener('click', resetScreensaver);

// === Sound Effects (Web Audio API) ===
let audioCtx = null;
function playBeep(freq, duration, type) {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.value = freq || 880;
        osc.type = type || 'square';
        gain.gain.value = 0.08;
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (duration || 0.1));
        osc.start();
        osc.stop(audioCtx.currentTime + (duration || 0.1));
    } catch(e) {}
}
const origBootUser = bootUser;
bootUser = function(username, password) {
    const result = origBootUser.call(this, username, password);
    if (result) playBeep(660, 0.15, 'sine');
    return result;
};

// === Avatar Selection ===
function showAvatarPicker(callback) {
    const avatars = ['\u{1F464}','\u{1F600}','\u{1F916}','\u{1F47E}','\u{1F431}','\u{1F436}','\u{1F98A}','\u{1F99D}','\u{1F9D0}','\u{1F913}','\u{1F920}','\u{1F921}','\u{1F973}','\u{1F60E}','\u{1F435}','\u{1F433}'];
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:999999;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;';
    overlay.innerHTML = '<div style="color:#33ff33;font-size:1.2rem;">Choose your avatar</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">' +
        avatars.map(a => '<div class="avatar-option" style="font-size:2.5rem;padding:12px;border:2px solid rgba(51,255,51,0.2);border-radius:8px;cursor:pointer;text-align:center;background:rgba(0,0,0,0.3);">' + a + '</div>').join('') +
        '</div><button id="avatar-cancel" style="margin:0;padding:6px 20px;">Cancel</button>';
    document.body.appendChild(overlay);
    overlay.querySelectorAll('.avatar-option').forEach(el => {
        el.onmouseenter = function() { this.style.borderColor = '#33ff33'; this.style.background = 'rgba(51,255,51,0.1)'; };
        el.onmouseleave = function() { this.style.borderColor = 'rgba(51,255,51,0.2)'; this.style.background = 'rgba(0,0,0,0.3)'; };
        el.onclick = function() { const av = this.textContent; overlay.remove(); if (callback) callback(av); };
    });
    document.getElementById('avatar-cancel').onclick = function() { overlay.remove(); };
}

// === Welcome Tour ===
function showWelcomeTour() {
    if (localStorage.getItem('cyberos_tour_done')) return;
    var tourActive = true;
    var tourToast = null;
    var tourStep = 0;
    var tourSteps = [
        { msg: '<b>\u{1F680} Welcome to Cyber OS!</b><br>A full web desktop experience. Click <b>Next</b> for a quick tour or <b>Finish</b> to skip.', sel: null },
        { msg: '<b>\u{1F4C1} Desktop Icons</b><br>Double-click any icon to launch an app. Right-click empty desktop area to add/remove icons, sort, or create new folders/files.', sel: '#desktop-icons' },
        { msg: '<b>\u{2757} Window Title Bar</b><br>Right-click any window\u2019s title bar for: Add/Remove from desktop, Restore, Minimize, Maximize, and Close.', sel: null },
        { msg: '<b>\u{1F9EE} Window Controls</b><br>Every window has: close (\u2715), minimize (\u2014), maximize (\u25A1), always-on-top (\u{1F4CC}), and desktop (\u{1F5A5}) buttons.', sel: null },
        { msg: '<b>\u{2194} Drag & Snap</b><br>Drag windows by the title bar. Snap to screen edges (left/right halves, corners, top half). Hover maximize button for snap layout options.', sel: null },
        { msg: '<b>\u{1F50D} Taskbar Search</b><br>Use the search bar on the taskbar to quickly find and launch any app.', sel: '#taskbar-search' },
        { msg: '<b>\u{1F4CB} Taskbar</b><br>Running apps appear here. Click to focus, right-click for pin/unpin/add/remove/close. Click again to minimize.', sel: '#taskbar' },
        { msg: '<b>\u{25BC} Show Desktop</b><br>The thin vertical bar on the right side of the taskbar hides/shows all windows instantly.', sel: '#show-desktop-btn' },
        { msg: '<b>\u{23F0} System Tray</b><br>Click tray icons for: clock & calendar, network, volume, battery, action center (Wi-Fi, Bluetooth, Night Light), hidden icons.', sel: '#system-tray' },
        { msg: '<b>\u{25B6} Start Menu</b><br>Click your profile badge on the taskbar to open the Start menu. Browse all apps, search, access Settings, power options.', sel: '#username-display' },
        { msg: '<b>\u{1F5A5} Top-Right Widgets</b><br>Analog clock, calendar, and media player widgets. Customize in Settings > Widgets.', sel: '#top-widgets' },
        { msg: '<b>\u{1F5BC} Desktop Right-Click</b><br>Right-click desktop: refresh, show/hide icons, sort, add/remove desktop icons, create new folders or text documents.', sel: null },
        { msg: '<b>\u{1F3AE} Gaming Hub</b><br>Built-in games: Snake, Tic Tac Toe, Solitaire, Minesweeper, Blackjack, Memory, 2048, Pac-Man. Track high scores!', sel: null },
        { msg: '<b>\u{1F5A5} Built-in Apps</b><br>File Explorer, Notepad, Calculator, AI Chat, Calendar, Todo, Paint, Snipping Tool, Media Player, Terminal, PowerShell, Ubuntu, Photos, Camera, Settings, Task Manager, and more.', sel: null },
        { msg: '<b>\u{2328} Keyboard Shortcuts</b><br><code>Ctrl+K</code> \u2014 Command Palette<br><code>Alt+Tab</code> \u2014 Switch windows<br><code>Win+D</code> \u2014 Show desktop', sel: null },
        { msg: '<b>\u{1F44D} You\u2019re all set!</b><br>Explore and have fun. This tour won\u2019t show again.', sel: null },
    ];
    function tourEnd() {
        tourActive = false;
        localStorage.setItem('cyberos_tour_done', '1');
        document.querySelectorAll('.tour-highlight').forEach(function(el) { el.classList.remove('tour-highlight'); });
        if (tourToast && tourToast.parentNode) tourToast.remove();
        tourToast = null;
    }
    function tourShowStep() {
        if (!tourActive) return;
        if (tourStep >= tourSteps.length) { tourEnd(); return; }
        document.querySelectorAll('.tour-highlight').forEach(function(el) { el.classList.remove('tour-highlight'); });
        var s = tourSteps[tourStep];
        var targetEl = s.sel ? document.querySelector(s.sel) : null;
        if (targetEl) targetEl.classList.add('tour-highlight');
        if (!tourToast) { tourToast = document.createElement('div'); tourToast.id = 'tour-toast'; document.body.appendChild(tourToast); }
        var maxW = 340;
        var pad = 14;
        var baseStyle = 'position:fixed;z-index:9999999;background:var(--bg2);border:2px solid var(--accent);border-radius:10px;padding:18px 20px;max-width:' + maxW + 'px;box-shadow:0 12px 48px rgba(0,0,0,0.6);font-size:0.85rem;line-height:1.5;animation:toast-in 0.3s ease-out;';
        tourToast.innerHTML = '<div style="margin-bottom:12px;">' + s.msg + '</div>' +
            '<div style="display:flex;gap:6px;justify-content:space-between;align-items:center;">' +
            '<span style="font-size:0.7rem;opacity:0.4;">' + (tourStep + 1) + ' / ' + tourSteps.length + '</span>' +
            '<div style="display:flex;gap:6px;">' +
            '<button class="tour-finish-btn" style="margin:0;padding:5px 10px;font-size:0.75rem;background:transparent;border:1px solid var(--danger);color:var(--danger);border-radius:5px;cursor:pointer;">Finish</button>' +
            '<button class="tour-next-btn" style="margin:0;padding:5px 14px;font-size:0.78rem;background:var(--accent);color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:600;">' + (tourStep < tourSteps.length - 1 ? 'Next \u25B6' : 'Done \u2713') + '</button>' +
            '</div></div>';
        if (targetEl) {
            var tr = targetEl.getBoundingClientRect();
            var cx = Math.round(tr.left + tr.width / 2);
            var cy = Math.round(tr.top + tr.height / 2);
            var idealLeft, idealTop;
            if (cy < window.innerHeight / 2) {
                idealLeft = Math.round(cx - maxW / 2);
                idealTop = tr.bottom + pad;
            } else {
                idealLeft = Math.round(cx - maxW / 2);
                idealTop = tr.top - pad;
            }
            tourToast.style.cssText = baseStyle + 'left:0;top:0;transform:none;visibility:hidden;max-height:60vh;overflow-y:auto;';
            var tw = tourToast.offsetWidth || maxW;
            var th = tourToast.offsetHeight || 200;
            var clampL = Math.max(pad, Math.min(idealLeft, window.innerWidth - tw - pad));
            var clampT;
            if (cy < window.innerHeight / 2) {
                clampT = Math.max(pad, Math.min(idealTop, window.innerHeight - th - pad));
            } else {
                clampT = Math.max(pad, Math.min(idealTop - th, window.innerHeight - th - pad));
            }
            tourToast.style.cssText = baseStyle + 'left:' + clampL + 'px;top:' + clampT + 'px;transform:none;max-height:60vh;overflow-y:auto;';
        } else {
            tourToast.style.cssText = baseStyle + 'left:50%;top:40%;transform:translate(-50%,-50%);max-height:60vh;overflow-y:auto;';
        }
        var nextBtn = tourToast.querySelector('.tour-next-btn');
        var finishBtn = tourToast.querySelector('.tour-finish-btn');
        nextBtn.onclick = function() { tourStep++; tourShowStep(); };
        finishBtn.onclick = function() { tourEnd(); };
    }
    setTimeout(tourShowStep, 1500);
}

// === Taskbar Context Menu ===
taskbar.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.target.closest('.taskbar-btn');
    const menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;z-index:100001;background:var(--bg2);border:2px solid var(--border);border-radius:4px;box-shadow:0 4px 20px var(--shadow);min-width:160px;padding:4px 0;font-size:0.75rem;';
    menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
    let html = '';
    if (btn) {
        const app = btn.dataset.app;
        const isPinned = _pinnedApps.includes(app);
        html += '<div class="cm-item" data-action="pin-' + app + '">' + (isPinned ? '\u{1F4CC} Unpin from taskbar' : '\u{1F4CC} Pin to taskbar') + '</div>';
        html += '<div class="cm-item" data-action="close-' + app + '">\u{2715} Close all windows</div>';
        const onDesktop = iconApps.some(a => a.t === app);
        html += '<div class="cm-item" data-action="desktop-' + app + '">' + (onDesktop ? '\u{1F5D1} Remove from desktop' : '\u{1F5A5} Add to desktop') + '</div>';
    }
    html += '<div class="cm-separator"></div>';
    html += '<div class="cm-item" data-action="add-taskbar">\u{2795} Add taskbar icon</div>';
    html += '<div class="cm-item" data-action="remove-taskbar">\u{2796} Remove taskbar icon</div>';
    html += '<div class="cm-separator"></div>';
    html += '<div class="cm-item" data-action="cascade">\u{1F4CB} Cascade windows</div>';
    html += '<div class="cm-item" data-action="stack">\u{25A0} Stack windows</div>';
    html += '<div class="cm-item" data-action="side">\u{25A0} Side by side</div>';
    html += '<div class="cm-separator"></div>';
    html += '<div class="cm-item" data-action="taskmgr">\u{1F4CA} Task Manager</div>';
    html += '<div class="cm-item" data-action="settings">\u{2699}\uFE0F Taskbar settings</div>';
    menu.innerHTML = html;
    positionMenu(menu, e.clientX, e.clientY);
    document.body.appendChild(menu);
    menu.querySelectorAll('.cm-item').forEach(item => {
        item.onclick = function() {
            const action = this.dataset.action;
            menu.remove();
            if (action.startsWith('pin-')) {
                const a = action.slice(4);
                const idx = _pinnedApps.indexOf(a);
                if (idx >= 0) _pinnedApps.splice(idx, 1);
                else _pinnedApps.push(a);
                localStorage.setItem('cyberos_pinned', JSON.stringify(_pinnedApps));
                showToast('Taskbar', _pinnedApps.includes(a) ? 'Pinned ' + a : 'Unpinned ' + a, 'info');
            } else if (action.startsWith('desktop-')) {
                const a = action.slice(8);
                toggleDesktopIcon(a);
            } else if (action.startsWith('close-')) {
                const a = action.slice(6);
                openWindows.filter(w => w.startsWith(a + '-')).forEach(id => closeWindow(id));
            }             else if (action === 'add-taskbar') { showTaskbarIconPicker(true); }
            else if (action === 'remove-taskbar') { showTaskbarIconPicker(false); }
            else if (action === 'cascade') { cascadeWindows(); }
            else if (action === 'stack') { stackWindows(); }
            else if (action === 'side') { sideBySideWindows(); }
            else if (action === 'taskmgr') { toggleWindow('taskmgr'); }
            else if (action === 'settings') { showToast('Taskbar Settings', 'Taskbar settings (not implemented)', 'info'); }
        };
    });
    document.addEventListener('click', function _closeCtx(e) { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', _closeCtx); } });
});

// === Pin to taskbar ===
function applyPinnedApps() {
    const tb = document.querySelector('.taskbar-buttons');
    if (!tb) return;
    tb.querySelectorAll('.taskbar-btn').forEach(b => b.remove());
    _pinnedApps.forEach(app => {
        const btn = document.createElement('button');
        btn.className = 'taskbar-btn';
        btn.dataset.app = app;
        btn.title = app;
        const icons = { fileexplorer:'\u{1F4C1}', recyclebin:'\u{1F5D1}', notes:'\u{1F4DD}', calendar:'\u{1F4C5}', calc:'\u{1F9EE}', todo:'\u2705', ai:'\u{1F916}', settings:'\u2699\uFE0F', taskmgr:'\u{1F4CA}', gaminghub:'\u{1F3AE}', highscores:'\u{1F3C6}', wallpapers:'\u{1F5BC}', brave:'\u{1F981}', terminal:'\u{1F5A5}', powershell:'\u{1FA9F}', ubuntu:'\u{1F427}', snip:'\u{2702}\uFE0F', paint:'\u{1F3A8}', mediaplayer:'\u{1F3B5}', controlpanel:'\u2699' };
        btn.textContent = icons[app] || '\u{1F4C4}';
        btn.title = allApps.find(a => a.t === app)?.l || app;
        const sep = tb.querySelector('.taskbar-separator');
        if (sep) tb.insertBefore(btn, sep);
        else tb.appendChild(btn);
    });
}

// === Multiple Monitor Support (basic) ===
function detectMonitors() {
    const screens = window.screen;
    showToast('Display', 'Main display: ' + screens.width + '\u00D7' + screens.height, 'info');
}
// Simulate multi-monitor with a setting
let multiMonitorMode = localStorage.getItem('cyberos_multimon') === '1';
function toggleMultiMonitor() {
    multiMonitorMode = !multiMonitorMode;
    localStorage.setItem('cyberos_multimon', multiMonitorMode ? '1' : '0');
    if (multiMonitorMode) {
        document.getElementById('desktop').style.minWidth = '3840px';
        showToast('Display', 'Multi-monitor mode: ON (3840x1080)', 'info');
    } else {
        document.getElementById('desktop').style.minWidth = '';
        showToast('Display', 'Multi-monitor mode: OFF', 'info');
    }
}

// === Top-Right Widgets ===
function drawClockFace(canvas) {
    if (!canvas) return;
    var fg = canvas._themeFg || '#33ff33';
    var accent = canvas._themeAccent || '#33ff33';
    var rect = canvas.parentElement.getBoundingClientRect();
    var size = Math.min(rect.width, rect.height) || 180;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var cx = size / 2;
    var cy = size / 2;
    var r = size * 0.4;

    ctx.clearRect(0, 0, size, size);

    // Outer ring glow
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = fg.replace(')', ',0.03)').replace('rgb', 'rgba');
    if (ctx.fillStyle === fg) ctx.fillStyle = 'rgba(51,255,51,0.03)';
    ctx.fill();

    // Face
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(2,8,19,0.7)';
    ctx.fill();
    ctx.strokeStyle = fg.replace(')', ',0.25)').replace('rgb', 'rgba');
    if (ctx.strokeStyle === fg) ctx.strokeStyle = 'rgba(51,255,51,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Hour markers
    for (var i = 0; i < 12; i++) {
        var angle = (i * 30 - 90) * Math.PI / 180;
        var isMain = i % 3 === 0;
        var outer = r;
        var inner = isMain ? r * 0.82 : r * 0.9;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
        ctx.strokeStyle = isMain ? fg : fg.replace(')', ',0.35)').replace('rgb', 'rgba');
        if (!isMain && ctx.strokeStyle === fg) ctx.strokeStyle = 'rgba(51,255,51,0.35)';
        ctx.lineWidth = isMain ? 2.5 : 1;
        ctx.stroke();
    }

    var now = new Date();
    var h = now.getHours() % 12;
    var m = now.getMinutes();
    var s = now.getSeconds();
    var ms = now.getMilliseconds();

    var hAngle = (h * 30 + m * 0.5 - 90) * Math.PI / 180;
    var mAngle = (m * 6 + s * 0.1 - 90) * Math.PI / 180;
    var sAngle = (s * 6 + ms * 0.006 - 90) * Math.PI / 180;

    // Hour hand
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(hAngle) * r * 0.5, cy + Math.sin(hAngle) * r * 0.5);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Minute hand
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(mAngle) * r * 0.68, cy + Math.sin(mAngle) * r * 0.68);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Second hand
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(sAngle) * r * 0.12, cy - Math.sin(sAngle) * r * 0.12);
    ctx.lineTo(cx + Math.cos(sAngle) * r * 0.78, cy + Math.sin(sAngle) * r * 0.78);
    ctx.strokeStyle = accent.replace(')', ',0.5)').replace('rgb', 'rgba');
    if (ctx.strokeStyle === accent) ctx.strokeStyle = 'rgba(51,255,51,0.5)';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Center cap
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(2,8,19,0.8)';
    ctx.fill();
}

function updateTopClock() {
    var el = document.getElementById('tw-clock');
    if (!el) return;
    var canvas = el.querySelector('canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        el.appendChild(canvas);
        var dateEl = document.createElement('div');
        dateEl.className = 'tw-clock-date';
        el.appendChild(dateEl);
    }
    if (canvas._needsRedraw || !canvas._themeFg) {
        var themeName = localStorage.getItem('cyberos_widget_theme') || 'cyber';
        var theme = widgetThemes[themeName] || widgetThemes.cyber;
        canvas._themeFg = theme.fg;
        canvas._themeAccent = theme.accent;
        canvas._themeBorder = theme.border;
        canvas._needsRedraw = false;
    }
    canvas._now = Date.now();
    drawClockFace(canvas);
    var dateEl = el.querySelector('.tw-clock-date');
    if (dateEl) {
        var now = new Date();
        dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    }
}

function renderTopCalendar() {
    const el = document.getElementById('tw-calendar');
    if (!el) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    let html = '<div class="tw-cal-header">' + monthNames[month] + ' ' + year + '</div>';
    html += '<div class="tw-cal-grid">';
    ['S','M','T','W','T','F','S'].forEach(function(d) {
        html += '<div class="tw-cal-day" style="opacity:0.35;font-size:0.6rem;font-weight:bold;">' + d + '</div>';
    });
    for (let p = firstDay - 1; p >= 0; p--) {
        html += '<div class="tw-cal-day other-month">' + (daysInPrev - p) + '</div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const cls = 'tw-cal-day' + (d === now.getDate() ? ' today' : '');
        html += '<div class="' + cls + '">' + d + '</div>';
    }
    const totalCells = firstDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let n = 1; n <= remaining; n++) {
        html += '<div class="tw-cal-day other-month">' + n + '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
}

const trackArt = [
    { bg: 'linear-gradient(135deg, #0077b6, #00b4d8)', emoji: '\u{1F30A}' },
    { bg: 'linear-gradient(135deg, #00ff41, #003b00)', emoji: '\u26A1' },
    { bg: 'linear-gradient(135deg, #ff6b9d, #c084fc)', emoji: '\u{1F30C}' },
    { bg: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)', emoji: '\u2B50' },
];

function getTrackArt(index) {
    return trackArt[index % trackArt.length] || trackArt[0];
}

function syncMiniMedia() {
    var el = document.getElementById('tw-media');
    var infoEl = document.querySelector('#tw-media .tw-media-info');
    var fillEl = document.querySelector('#tw-media .tw-media-progress-fill');
    var playBtn = document.querySelector('#tw-media .tw-media-buttons button:nth-child(2)');
    var volEl = document.querySelector('#tw-media .tw-media-volume span');
    var volInput = document.querySelector('#tw-media .tw-media-volume input');
    var artBg = document.querySelector('#tw-media .tw-media-art-bg');
    var artEmoji = document.querySelector('#tw-media .tw-media-art-emoji');

    var hasPageMedia = pageActiveMedia && !pageActiveMedia.paused && !pageActiveMedia.ended;
    var hasOsMedia = mediaState.playing;

    if (!hasPageMedia && !hasOsMedia) {
        if (el && !el.classList.contains('tw-media-blank')) {
            el.classList.add('tw-media-blank');
            if (infoEl) infoEl.textContent = '';
            if (fillEl) fillEl.style.width = '0%';
            if (playBtn) playBtn.textContent = '\u{25B6}';
        }
        updateMediaSessionMetadata();
        return;
    }

    if (el) el.classList.remove('tw-media-blank');

    if (hasPageMedia) {
        var src = pageActiveMedia.currentSrc || '';
        var name = decodeURIComponent(src.split('/').pop().split('?')[0] || 'Media');
        if (infoEl) infoEl.textContent = name;
        if (fillEl && pageActiveMedia.duration) {
            fillEl.style.width = (pageActiveMedia.currentTime / pageActiveMedia.duration * 100) + '%';
        }
        if (playBtn) playBtn.textContent = pageActiveMedia.paused ? '\u{25B6}' : '\u{23F8}';
        if (artBg) artBg.style.background = 'linear-gradient(135deg, #2d3436, #636e72)';
        if (artEmoji) artEmoji.textContent = '\u{1F3AC}';
    } else {
        var art = getTrackArt(mediaState.trackIndex);
        if (infoEl) infoEl.textContent = mediaState.currentTrack;
        if (fillEl) fillEl.style.width = mediaState.progress + '%';
        if (playBtn) playBtn.textContent = mediaState.playing ? '\u{23F8}' : '\u{25B6}';
        if (artBg) artBg.style.background = art.bg;
        if (artEmoji) artEmoji.textContent = art.emoji;
    }

    if (volEl) volEl.textContent = mediaState.volume + '%';
    if (volInput) volInput.value = mediaState.volume;
    updateMediaSessionMetadata();
}

function initMiniMedia() {
    var el = document.getElementById('tw-media');
    if (!el) return;
    var art = getTrackArt(mediaState.trackIndex);
    el.innerHTML = '<div class="tw-media-art"><div class="tw-media-art-bg" style="background:' + art.bg + ';"></div><div class="tw-media-art-emoji">' + art.emoji + '</div></div>'
        + '<div class="tw-media-info">' + mediaState.currentTrack + '</div>'
        + '<div class="tw-media-buttons">'
        + '<button data-tw-m="prev">\u{23EE}</button>'
        + '<button data-tw-m="play">\u{25B6}</button>'
        + '<button data-tw-m="next">\u{23ED}</button>'
        + '</div>'
        + '<div class="tw-media-progress"><div class="tw-media-progress-fill" style="width:' + mediaState.progress + '%;"></div></div>'
        + '<div class="tw-media-volume"><span>\u{1F50A}</span><input type="range" min="0" max="100" value="' + mediaState.volume + '"><span>' + mediaState.volume + '%</span></div>';
    el.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-tw-m]');
        if (!btn) return;
        var action = btn.dataset.twM;

        // If page media is active, control it instead
        if (pageActiveMedia && !pageActiveMedia.paused && !pageActiveMedia.ended) {
            if (action === 'play') {
                pageActiveMedia.pause();
            } else if (action === 'prev') {
                pageActiveMedia.currentTime = Math.max(0, pageActiveMedia.currentTime - 10);
            } else if (action === 'next') {
                pageActiveMedia.currentTime = Math.min(pageActiveMedia.duration || 0, pageActiveMedia.currentTime + 10);
            }
            syncMiniMedia();
            return;
        }

        if (action === 'prev') {
            mediaState.trackIndex = (mediaState.trackIndex - 1 + mediaState.tracks.length) % mediaState.tracks.length;
            mediaState.currentTrack = mediaState.tracks[mediaState.trackIndex];
            mediaState.progress = 0;
        } else if (action === 'play') {
            mediaState.playing = !mediaState.playing;
        } else if (action === 'next') {
            mediaState.trackIndex = (mediaState.trackIndex + 1) % mediaState.tracks.length;
            mediaState.currentTrack = mediaState.tracks[mediaState.trackIndex];
            mediaState.progress = 0;
        }
        syncMiniMedia();
    });
    var volInput = el.querySelector('.tw-media-volume input');
    if (volInput) {
        volInput.addEventListener('input', function() {
            mediaState.volume = parseInt(this.value);
            syncMiniMedia();
        });
    }
    setupPageMediaTracking();
    setupMediaSession();
    el.classList.add('tw-media-blank');
    syncMiniMedia();
}

const widgetThemes = {
    cyber: { name: 'Cyber', icon: '\u{1F7E2}', fg: '#33ff33', accent: '#33ff33', bg: 'rgba(22,14,34,0.8)', border: 'rgba(51,255,51,0.2)' },
    warm: { name: 'Warm', icon: '\u{1F7E0}', fg: '#ff8c42', accent: '#ff8c42', bg: 'rgba(34,22,14,0.8)', border: 'rgba(255,140,66,0.2)' },
    ocean: { name: 'Ocean', icon: '\u{1F535}', fg: '#42c6ff', accent: '#42c6ff', bg: 'rgba(14,22,34,0.8)', border: 'rgba(66,198,255,0.2)' },
    mono: { name: 'Mono', icon: '\u{26AA}', fg: '#e0e0e0', accent: '#ffffff', bg: 'rgba(20,20,20,0.8)', border: 'rgba(255,255,255,0.1)' },
    accent: { name: 'Accent', icon: '\u{1F3A8}', fg: 'var(--fg)', accent: 'var(--accent)', bg: 'var(--bg2)', border: 'var(--border)' },
};

function applyWidgetTheme() {
    var themeName = localStorage.getItem('cyberos_widget_theme') || 'cyber';
    var theme = widgetThemes[themeName] || widgetThemes.cyber;
    var widgets = document.querySelectorAll('#top-widgets > div');
    widgets.forEach(function(el) {
        el.style.setProperty('--widget-fg', theme.fg);
        el.style.setProperty('--widget-accent', theme.accent);
        el.style.setProperty('--widget-bg', theme.bg);
        el.style.setProperty('--widget-border', theme.border);
    });
    // Update clock face colors
    var clockCanvas = document.querySelector('#tw-clock canvas');
    if (clockCanvas) clockCanvas._needsRedraw = true;
}

// ===== Page Media Tracking =====
var pageActiveMedia = null;
var pageMediaTracked = false;

function findActivePageMedia() {
    var mediaEls = document.querySelectorAll('audio, video');
    for (var i = 0; i < mediaEls.length; i++) {
        var el = mediaEls[i];
        if (!el.paused && !el.ended && el.readyState > 0) {
            return el;
        }
    }
    return null;
}

function setupPageMediaTracking() {
    if (pageMediaTracked) return;
    pageMediaTracked = true;

    document.addEventListener('play', function(e) {
        var target = e.target;
        if (target && (target.tagName === 'AUDIO' || target.tagName === 'VIDEO')) {
            pageActiveMedia = target;
            syncMiniMedia();
        }
    }, true);

    document.addEventListener('pause', function(e) {
        var target = e.target;
        if (target && (target.tagName === 'AUDIO' || target.tagName === 'VIDEO')) {
            if (pageActiveMedia === target) {
                pageActiveMedia = null;
            }
            syncMiniMedia();
        }
    }, true);

    // Regularly check for any playing media
    setInterval(function() {
        var found = findActivePageMedia();
        if (found && found !== pageActiveMedia) {
            pageActiveMedia = found;
            syncMiniMedia();
        } else if (!found && pageActiveMedia) {
            pageActiveMedia = null;
            syncMiniMedia();
        }
    }, 1000);
}

// Media Session API integration
function setupMediaSession() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', function() {
            if (pageActiveMedia) {
                pageActiveMedia.play();
            } else if (windowRegistry.mediaplayer) {
                var content = windowRegistry.mediaplayer.querySelector('.window-content');
                if (content && content._playMedia) content._playMedia();
            }
            syncMiniMedia();
        });
        navigator.mediaSession.setActionHandler('pause', function() {
            if (pageActiveMedia) {
                pageActiveMedia.pause();
            } else if (windowRegistry.mediaplayer) {
                var content = windowRegistry.mediaplayer.querySelector('.window-content');
                if (content && content._pauseMedia) content._pauseMedia();
            }
            syncMiniMedia();
        });
        navigator.mediaSession.setActionHandler('previoustrack', function() {
            if (pageActiveMedia) {
                pageActiveMedia.currentTime = Math.max(0, pageActiveMedia.currentTime - 10);
            } else {
                var btn = document.querySelector('#tw-media [data-tw-m="prev"], .window-content [data-action="prev"]');
                if (btn) btn.click();
            }
        });
        navigator.mediaSession.setActionHandler('nexttrack', function() {
            if (pageActiveMedia) {
                pageActiveMedia.currentTime = Math.min(pageActiveMedia.duration || 0, pageActiveMedia.currentTime + 10);
            } else {
                var btn = document.querySelector('#tw-media [data-tw-m="next"], .window-content [data-action="next"]');
                if (btn) btn.click();
            }
        });
    }
}

function updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator)) return;
    if (pageActiveMedia) {
        var title = pageActiveMedia.currentSrc ? decodeURIComponent(pageActiveMedia.currentSrc.split('/').pop().split('?')[0] || 'Media') : 'Playing';
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: 'Cyber OS',
            album: '',
        });
        navigator.mediaSession.playbackState = pageActiveMedia.paused ? 'paused' : 'playing';
    } else if (mediaState.playing) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: mediaState.currentTrack || 'Ambient Waves',
            artist: 'Cyber OS',
            album: 'Desktop',
        });
        navigator.mediaSession.playbackState = 'playing';
    } else {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
    }
}

function applyWidgetSettings() {
    var widgets = ['clock', 'calendar', 'media'];
    widgets.forEach(function(name) {
        var el = document.getElementById('tw-' + name);
        if (!el) return;
        var vis = localStorage.getItem('cyberos_widget_' + name + '_visible');
        el.style.display = vis === 'false' ? 'none' : '';
        var trans = localStorage.getItem('cyberos_widget_' + name + '_transparent') === 'true';
        el.classList.toggle('widget-transparent', trans);
    });
    applyWidgetTheme();
}

function initTopWidgets() {
    updateTopClock();
    setInterval(updateTopClock, 100);
    renderTopCalendar();
    initMiniMedia();
    setInterval(syncMiniMedia, 500);
    applyWidgetSettings();
}

// === Init everything ===
applyPinnedApps();

// Apply saved cursor theme
(function() {
    var cur = localStorage.getItem('cyberos_cursor');
    if (cur && cur !== 'default') document.body.classList.add('cursor-' + cur);
})();

// Init bongo cat
(function() {
    var bongoCat = document.getElementById('bongo-cat');
    var bongoKeyDisplay = document.getElementById('bongo-key-display');
    var bongoPawL = document.querySelector('.bongo-paw-left');
    var bongoPawR = document.querySelector('.bongo-paw-right');
    var bongoFace = document.querySelector('.bongo-face');
    var bongoEnabled = localStorage.getItem('cyberos_bongo_enabled') !== 'false';
    var desktopVisible = false;
    function updateBongoVisibility() {
        if (!bongoCat) return;
        var show = bongoEnabled && desktopVisible;
        bongoCat.classList.toggle('bongo-show', show);
        bongoCat.classList.toggle('bongo-hidden', !show);
    }
    if (!bongoEnabled) updateBongoVisibility();
    // Monitor desktop visibility
    var desktopEl = document.getElementById('desktop');
    function checkDesktopVisible() {
        desktopVisible = desktopEl && !desktopEl.classList.contains('hidden');
        updateBongoVisibility();
    }
    checkDesktopVisible();
    var obs = new MutationObserver(checkDesktopVisible);
    if (desktopEl) obs.observe(desktopEl, { attributes: true, attributeFilter: ['class'] });
    var bongoHitTimeout;
    var expressions = ['😼','😸','😺','😻'];
    function bongoHit(e) {
        if (!bongoEnabled) return;
        if (e.repeat) return;
        if (!bongoCat || !desktopVisible) return;
        if (!bongoCat.classList.contains('bongo-show')) return;
        var key = e.key;
        if (key === ' ') key = '␣';
        if (key.length > 1) key = '⌨';
        else key = key.toUpperCase();
        if (bongoKeyDisplay) {
            bongoKeyDisplay.textContent = key;
            bongoKeyDisplay.classList.remove('bongo-pop');
            void bongoKeyDisplay.offsetWidth;
            bongoKeyDisplay.classList.add('bongo-pop');
        }
        if (bongoPawL) {
            bongoPawL.classList.remove('bongo-hit');
            void bongoPawL.offsetWidth;
            bongoPawL.classList.add('bongo-hit');
        }
        if (bongoPawR) {
            bongoPawR.classList.remove('bongo-hit');
            void bongoPawR.offsetWidth;
            bongoPawR.classList.add('bongo-hit');
        }
        if (bongoFace) bongoFace.textContent = expressions[Math.floor(Math.random() * expressions.length)];
        bongoCat.classList.add('bongo-glow');
        clearTimeout(bongoHitTimeout);
        bongoHitTimeout = setTimeout(function() {
            if (bongoPawL) bongoPawL.classList.remove('bongo-hit');
            if (bongoPawR) bongoPawR.classList.remove('bongo-hit');
            if (bongoKeyDisplay) bongoKeyDisplay.classList.remove('bongo-pop');
            if (bongoFace) bongoFace.textContent = '🐱';
            if (bongoCat) bongoCat.classList.remove('bongo-glow');
        }, 150);
    }
    document.addEventListener('keydown', bongoHit);
    window.addEventListener('keydown', bongoHit);
    // Expose toggle
    window._setBongoEnabled = function(en) {
        bongoEnabled = en;
        localStorage.setItem('cyberos_bongo_enabled', en ? 'true' : 'false');
        updateBongoVisibility();
    };
})();
function toggleBongoCat(vis) {
    if (window._setBongoEnabled) window._setBongoEnabled(vis);
}

// Init screensaver timer
setTimeout(resetScreensaver, 3000);

// Toast on boot
setTimeout(function(){ showToast('Cyber OS', 'Welcome back' + (currentUser ? ' ' + currentUser : '') + '! \u{1F680}', 'info'); }, 1500);

// Init top-right widgets
initTopWidgets();
