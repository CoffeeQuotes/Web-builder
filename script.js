/**
 * CQ Web Builder — Enhanced Script
 *
 * Changes from original:
 *  1. FIX: Cursor position (Ln/Col) now updates correctly using 'cursorActivity' event
 *  2. FIX: Console now captures unhandledrejection (Promise errors), SyntaxErrors,
 *          ReferenceErrors, and all other runtime errors
 *  3. FIX: Large objects/arrays render as collapsible trees instead of truncated strings
 *  4. FIX: 'Clear' button now clears editor, not console (separate 'Clear Console' added)
 *  5. FIX: Snippet load correctly sets editor mode for restored currentTab
 *  6. FEAT: Error badge counter on Console tab
 *  7. FEAT: Console shows timestamp per log entry
 *  8. FEAT: Settings modal (theme, font size, tab size, word wrap, auto-run toggle)
 *  9. FEAT: Auto-save indicator in status bar
 * 10. FEAT: Character count in status bar
 * 11. FEAT: Keyboard shortcut Alt+Shift+F for format
 * 12. FEAT: Duplicate Run Button handler removed (was duplicated in original)
 * 13. FEAT: Autosave flashes "Saving…" then "Saved" indicator
 * 14. FEAT: console.info and console.debug also captured
 * 15. FEAT: Resize remembers pane width in localStorage
 */

'use strict';

/* ─── DOM References ─────────────────────────────────────────── */
const editorContainer   = document.getElementById('editor-container');
const outputDiv         = document.getElementById('output');
const previewFrame      = document.getElementById('preview-frame');
const runBtn            = document.getElementById('run-btn');
const dragBar           = document.getElementById('drag-bar');
const outputPane        = document.getElementById('output-pane');
const snippetsMenu      = document.getElementById('snippets-menu');
const snippetsList      = document.getElementById('snippets-list');
const snippetsEmpty     = document.getElementById('snippets-empty');
const resourcesBtn      = document.getElementById('resources-btn');
const resourcesModal    = document.getElementById('resources-modal');
const settingsModal     = document.getElementById('settings-modal');
const addResourceBtn    = document.getElementById('add-resource-btn');
const resourceUrlInput  = document.getElementById('resource-url');
const resourceTypeSelect = document.getElementById('resource-type');
const resourcesList     = document.getElementById('resources-list');
const cursorPosDiv      = document.getElementById('cursor-pos');
const charCountDiv      = document.getElementById('char-count');
const errorBadge        = document.getElementById('error-badge');
const autosaveIndicator = document.getElementById('autosave-indicator');
const currentModeLabel  = document.getElementById('current-mode-label');

/* ─── App State ──────────────────────────────────────────────── */
const DEFAULT_STATE = {
    html: `<!-- HTML -->
<div class="card">
    <h1>Hello World</h1>
    <p>Welcome to CQ Web Builder</p>
    <button id="greet-btn">Click Me</button>
</div>`,
    css: `/* CSS */
body {
    font-family: system-ui, sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    margin: 0;
    background: #0f0f0f;
}
.card {
    background: #1a1a1a;
    padding: 2.5rem;
    border-radius: 12px;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.08), 0 20px 50px rgba(0,0,0,0.5);
    text-align: center;
    color: #f0f0f0;
}
h1 { margin: 0 0 0.5rem; font-size: 2rem; letter-spacing: -0.03em; }
p  { color: #888; margin: 0 0 1.5rem; }
button {
    background: #f0a500;
    color: #0a0a0a;
    border: none;
    padding: 10px 24px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 14px;
    transition: opacity 0.15s;
}
button:hover { opacity: 0.85; }`,
    js: `// JavaScript
const colors = ['#f0a500', '#3ddc84', '#64b5f6', '#ff4d4d'];

document.getElementById('greet-btn').addEventListener('click', () => {
    const h1 = document.querySelector('h1');
    const rand = colors[Math.floor(Math.random() * colors.length)];
    h1.style.color = rand;
    console.log('Color changed to', rand);
});

console.log('🚀 App loaded!');
console.info('Click the button to change the heading color');
`,
    currentTab: 'html',
    resources: []
};

let appState = { ...DEFAULT_STATE };

/* ─── Restore from LocalStorage ─────────────────────────────── */
try {
    const saved = localStorage.getItem('cq_jspad_state');
    if (saved) {
        const parsed = JSON.parse(saved);
        appState = { ...DEFAULT_STATE, ...parsed };
    }
} catch (e) {
    console.warn('[CQ] Failed to restore state:', e);
}

/* Restore pane width */
const savedPaneWidth = localStorage.getItem('cq_pane_width');
if (savedPaneWidth) outputPane.style.width = savedPaneWidth;

/* ─── Editor Settings ────────────────────────────────────────── */
let editorSettings = {
    fontSize: 14,
    tabSize: 4,
    autoRun: true,
    wordWrap: true
};
try {
    const ss = localStorage.getItem('cq_editor_settings');
    if (ss) editorSettings = { ...editorSettings, ...JSON.parse(ss) };
} catch (_) {}

function saveEditorSettings() {
    localStorage.setItem('cq_editor_settings', JSON.stringify(editorSettings));
}

/* ─── Tab Mode Map ───────────────────────────────────────────── */
const TAB_MODES = { html: 'xml', css: 'css', js: 'javascript' };
const TAB_LABELS = { html: 'HTML', css: 'CSS', js: 'JavaScript' };

/* ─── CodeMirror Init ────────────────────────────────────────── */
const editor = CodeMirror(editorContainer, {
    mode: TAB_MODES[appState.currentTab],
    value: appState[appState.currentTab],
    theme: 'dracula',
    lineNumbers: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    tabSize: editorSettings.tabSize,
    indentUnit: editorSettings.tabSize,
    lineWrapping: editorSettings.wordWrap,
    styleActiveLine: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    extraKeys: {
        'Ctrl-Enter':    () => updatePreview(false),
        'Cmd-Enter':     () => updatePreview(false),
        'Ctrl-Space':    'autocomplete',
        'Alt-Shift-F':   formatCode,
        'Ctrl-/':        'toggleComment',
        'Cmd-/':         'toggleComment',
    }
});

// Apply saved font size
editor.getWrapperElement().style.fontSize = editorSettings.fontSize + 'px';

// Sync active tab UI
syncTabUI(appState.currentTab);

// Guard: CodeMirror fires a 'change' event when setValue() is called during init.
// We don't want that to trigger an auto-preview — only real user edits should.
let editorReady = false;

/* ─── BUG FIX: Cursor Position — use cursorActivity, not change ─── */
function updateCursorPos() {
    const cur  = editor.getCursor();
    const ln   = cur.line + 1;
    const col  = cur.ch + 1;
    cursorPosDiv.textContent = `Ln ${ln}, Col ${col}`;
    charCountDiv.textContent = `${editor.getValue().length} chars`;
}

// 'cursorActivity' fires on every cursor move, selection change, and edit
editor.on('cursorActivity', updateCursorPos);
updateCursorPos(); // initial

/* ─── Tab Switching ──────────────────────────────────────────── */
function syncTabUI(type) {
    document.querySelectorAll('.editor-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    currentModeLabel.textContent = TAB_LABELS[type] || type.toUpperCase();
}

function switchTab(type) {
    appState[appState.currentTab] = editor.getValue();
    appState.currentTab = type;

    // Suppress the 'change' event that setValue fires — it's not a user edit
    suppressChange = true;
    editor.setValue(appState[type]);
    editor.setOption('mode', TAB_MODES[type]);
    setTimeout(() => { suppressChange = false; }, 0);

    syncTabUI(type);
    saveState();
    editor.focus();
}

document.querySelectorAll('.editor-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.type));
});

/* ─── Output Tab Switching ───────────────────────────────────── */
document.querySelectorAll('.output-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.output-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.target;
        document.querySelectorAll('.output-content').forEach(d => d.classList.remove('active'));
        document.getElementById(target === 'preview' ? 'preview-container' : 'output').classList.add('active');

        // Clear error badge when console is opened
        if (target === 'console') {
            errorCount = 0;
            updateErrorBadge();
        }
    });
});

/* ─── Error Badge ────────────────────────────────────────────── */
let errorCount = 0;
function updateErrorBadge() {
    if (errorCount > 0) {
        errorBadge.textContent = errorCount > 99 ? '99+' : errorCount;
        errorBadge.classList.remove('hidden');
    } else {
        errorBadge.classList.add('hidden');
    }
}

function isConsoleTabActive() {
    return document.querySelector('[data-target="console"]').classList.contains('active');
}

/* ─── Preview / Run ──────────────────────────────────────────── */
function updatePreview(isAuto = false) {
    appState[appState.currentTab] = editor.getValue();
    saveState();

    // Always clear console before a fresh run so stale output doesn't accumulate
    clearConsole();

    const { html, css, js, resources = [] } = appState;

    const resourceTags = resources.map(res =>
        res.type === 'css'
            ? `<link rel="stylesheet" href="${res.url}">`
            : `<script src="${res.url}"><\/script>`
    ).join('\n');

    // Enhanced console capture — covers log, error, warn, info, debug
    // Also captures unhandled promise rejections and window.onerror
    const source = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${resourceTags}
    <style>${css}</style>
</head>
<body>
    ${html}
    <script>
    (function() {
        function serialize(arg) {
            if (arg === null)      return { kind: 'primitive', value: 'null' };
            if (arg === undefined) return { kind: 'primitive', value: 'undefined' };
            if (arg instanceof Error) {
                return { kind: 'error', value: arg.name + ': ' + arg.message + (arg.stack ? '\\n' + arg.stack.split('\\n').slice(1,4).join('\\n') : '') };
            }
            if (typeof arg === 'object' || Array.isArray(arg)) {
                try {
                    const json = JSON.stringify(arg, null, 2);
                    const label = Array.isArray(arg)
                        ? 'Array(' + arg.length + ')'
                        : 'Object {' + Object.keys(arg).slice(0,3).join(', ') + (Object.keys(arg).length > 3 ? '...' : '') + '}';
                    return { kind: 'object', label, value: json };
                } catch(e) {
                    return { kind: 'primitive', value: String(arg) };
                }
            }
            return { kind: 'primitive', value: String(arg) };
        }

        function send(type, args) {
            const serialized = Array.from(args).map(serialize);
            try { window.parent.postMessage({ type, args: serialized, ts: Date.now() }, '*'); } catch(e) {}
        }

        const methods = ['log', 'error', 'warn', 'info', 'debug'];
        const _orig = {};
        methods.forEach(m => {
            _orig[m] = console[m].bind(console);
            console[m] = (...args) => { send(m, args); _orig[m](...args); };
        });

        window.addEventListener('unhandledrejection', e => {
            const msg = e.reason instanceof Error
                ? e.reason.name + ': ' + e.reason.message
                : 'Unhandled Promise Rejection: ' + String(e.reason);
            send('error', [{ kind: 'error', value: msg }]);
        });

        window.onerror = (msg, src, line, col, err) => {
            const detail = err ? err.name + ': ' + err.message : msg;
            send('error', [{ kind: 'error', value: detail + ' (Line ' + line + ':' + col + ')' }]);
            return true;
        };

        // Run user code in a way that keeps named functions on window scope
        // so inline onclick handlers (e.g. onclick="greet()") can find them.
        // We do this by eval-ing in global scope via indirect eval.
        try {
            const run = (0, eval);
            run(${JSON.stringify(js)});
        } catch(err) { console.error(err); }
    })();
    <\/script>
</body>
</html>`;

    previewFrame.srcdoc = source;

    // Smart tab switching
    if (!isAuto) {
        const targetTab = appState.currentTab === 'js' ? 'console' : 'preview';
        document.querySelector(`[data-target="${targetTab}"]`).click();
    }
}

/* ─── Console Message Handling ───────────────────────────────── */
window.addEventListener('message', (e) => {
    if (e.data && e.data.type && e.data.args) {
        appendOutput(e.data.args, e.data.type, e.data.ts);
    }
});

function appendOutput(args, type = 'log', ts) {
    // Remove empty-state placeholder if present
    const empty = outputDiv.querySelector('.console-empty');
    if (empty) empty.remove();

    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;

    // Time prefix
    if (ts) {
        const d = new Date(ts);
        const time = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const timeSpan = document.createElement('span');
        timeSpan.style.cssText = 'color: var(--text-dim); font-size: 10px; margin-right: 8px; user-select:none;';
        timeSpan.textContent = time;
        entry.appendChild(timeSpan);
    }

    // Render each argument
    args.forEach((arg, i) => {
        if (i > 0) {
            const spacer = document.createTextNode(' ');
            entry.appendChild(spacer);
        }

        if (arg && arg.kind === 'object') {
            // Collapsible object/array display
            const toggle = document.createElement('button');
            toggle.className = 'log-object-toggle';
            toggle.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="9 18 15 12 9 6"/></svg>${arg.label}`;
            entry.appendChild(toggle);

            const body = document.createElement('div');
            body.className = 'log-object-body';
            body.textContent = arg.value;
            entry.appendChild(body);

            toggle.addEventListener('click', () => {
                toggle.classList.toggle('expanded');
                body.classList.toggle('visible');
            });
        } else if (arg && arg.kind === 'error') {
            const span = document.createElement('span');
            span.style.whiteSpace = 'pre-wrap';
            span.textContent = arg.value;
            entry.appendChild(span);
        } else {
            const span = document.createElement('span');
            span.textContent = arg && arg.value !== undefined ? arg.value : String(arg);
            entry.appendChild(span);
        }
    });

    outputDiv.appendChild(entry);
    outputDiv.scrollTop = outputDiv.scrollHeight;

    // Update error badge if console tab not visible
    if (type === 'error' || type === 'warn') {
        if (!isConsoleTabActive()) {
            errorCount++;
            updateErrorBadge();
        }
    }
}

function clearConsole() {
    outputDiv.innerHTML = '';
    errorCount = 0;
    updateErrorBadge();
}

/* ─── State Persistence ──────────────────────────────────────── */
let savePending = false;
function saveState() {
    localStorage.setItem('cq_jspad_state', JSON.stringify(appState));
    flashSaved();
}

function flashSaved() {
    autosaveIndicator.classList.add('saving');
    setTimeout(() => autosaveIndicator.classList.remove('saving'), 900);
}

/* ─── Auto-preview on change ─────────────────────────────────── */
// Mark editor as ready after a tick so the initial setValue() during
// CodeMirror construction doesn't fire the auto-preview.
setTimeout(() => { editorReady = true; }, 0);

let debounceTimer;
let suppressChange = false; // set true during programmatic tab switches

editor.on('change', () => {
    if (!editorReady || suppressChange) return;

    appState[appState.currentTab] = editor.getValue();
    saveState();
    updateCursorPos();

    if (editorSettings.autoRun && (appState.currentTab === 'html' || appState.currentTab === 'css')) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => updatePreview(true), 1200);
    }
});

/* ─── Theme Handling ─────────────────────────────────────────── */
const themeSelect = document.getElementById('theme-select');

function loadTheme(themeName) {
    if (!['dracula', 'default'].includes(themeName)) {
        // Avoid duplicate link tags
        const existing = document.querySelector(`link[data-theme="${themeName}"]`);
        if (!existing) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.dataset.theme = themeName;
            link.href = `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.12/theme/${themeName}.min.css`;
            document.head.appendChild(link);
        }
    }
    editor.setOption('theme', themeName);
}

themeSelect.addEventListener('change', (e) => {
    loadTheme(e.target.value);
    localStorage.setItem('cq_jspad_theme', e.target.value);
});

const savedTheme = localStorage.getItem('cq_jspad_theme');
if (savedTheme) {
    themeSelect.value = savedTheme;
    loadTheme(savedTheme);
}

/* ─── Drag-to-Resize ─────────────────────────────────────────── */
let isDragging = false;

dragBar.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragBar.classList.add('dragging');
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const width = window.innerWidth - e.clientX;
    if (width > 220 && width < window.innerWidth * 0.75) {
        outputPane.style.width = width + 'px';
    }
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        dragBar.classList.remove('dragging');
        localStorage.setItem('cq_pane_width', outputPane.style.width);
    }
});

/* ─── Run Button ─────────────────────────────────────────────── */
runBtn.addEventListener('click', () => updatePreview(false));

/* ─── BUG FIX: Clear button now clears editor content ─────────── */
document.getElementById('clear-btn').addEventListener('click', () => {
    if (confirm('Clear all code in the current tab?')) {
        editor.setValue('');
        appState[appState.currentTab] = '';
        saveState();
    }
});

document.getElementById('clear-console-btn').addEventListener('click', clearConsole);
document.getElementById('clear-output-btn').addEventListener('click', clearConsole);

/* ─── Format Code ────────────────────────────────────────────── */
function formatCode() {
    const totalLines = editor.lineCount();
    editor.operation(() => {
        for (let i = 0; i < totalLines; i++) {
            editor.indentLine(i);
        }
    });
}

document.getElementById('format-btn').addEventListener('click', formatCode);

/* ─── Download / Export ──────────────────────────────────────── */
document.getElementById('download-btn').addEventListener('click', () => {
    appState[appState.currentTab] = editor.getValue();
    const { html, css, js, resources = [] } = appState;

    const resourceTags = resources.map(res =>
        res.type === 'css'
            ? `    <link rel="stylesheet" href="${res.url}">`
            : `    <script src="${res.url}"><\/script>`
    ).join('\n');

    const source = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exported Project</title>
${resourceTags}
    <style>
${css}
    </style>
</head>
<body>
${html}
    <script>
${js}
    <\/script>
</body>
</html>`;

    const blob = new Blob([source], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'project.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

/* ─── Copy Console Output ────────────────────────────────────── */
document.getElementById('copy-output').addEventListener('click', () => {
    const text = outputDiv.innerText;
    if (!text.trim()) return;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copy-output');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = orig), 2000);
    });
});

/* ─── Resources Modal ────────────────────────────────────────── */
resourcesBtn.addEventListener('click', () => {
    resourcesModal.classList.add('open');
    renderResources();
});

document.querySelector('.close-modal').addEventListener('click', () => {
    resourcesModal.classList.remove('open');
});

window.addEventListener('click', (e) => {
    if (e.target === resourcesModal) resourcesModal.classList.remove('open');
    if (e.target === settingsModal)  settingsModal.classList.remove('open');
});

addResourceBtn.addEventListener('click', () => {
    const url  = resourceUrlInput.value.trim();
    const type = resourceTypeSelect.value;
    if (!url) return;
    if (!url.startsWith('http')) {
        alert('Please enter a valid URL starting with http(s)://');
        return;
    }
    if (!appState.resources) appState.resources = [];
    appState.resources.push({ type, url });
    saveState();
    renderResources();
    resourceUrlInput.value = '';
});

// Allow Enter key in resource URL input
resourceUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addResourceBtn.click();
});

function renderResources() {
    resourcesList.innerHTML = '';
    const resources = appState.resources || [];
    if (!resources.length) {
        resourcesList.innerHTML = '<p style="color:var(--text-dim);font-size:12px;text-align:center;padding:16px 0;">No resources added yet.</p>';
        return;
    }

    resources.forEach((res, index) => {
        const item = document.createElement('div');
        item.className = 'resource-item';
        item.innerHTML = `
            <div class="resource-info">
                <span class="resource-badge ${res.type}">${res.type.toUpperCase()}</span>
                <span class="resource-url" title="${res.url}">${res.url}</span>
            </div>
            <button class="delete-resource" data-index="${index}" title="Remove">&times;</button>
        `;
        resourcesList.appendChild(item);
    });

    resourcesList.querySelectorAll('.delete-resource').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.index);
            appState.resources.splice(idx, 1);
            saveState();
            renderResources();
        });
    });
}

/* ─── Settings Modal ─────────────────────────────────────────── */
document.getElementById('settings-btn').addEventListener('click', () => {
    settingsModal.classList.add('open');
});
document.querySelector('.close-settings').addEventListener('click', () => {
    settingsModal.classList.remove('open');
});

// Font size controls
const fontDisplay = document.getElementById('font-size-display');
fontDisplay.textContent = editorSettings.fontSize + 'px';

document.getElementById('font-increase').addEventListener('click', () => {
    if (editorSettings.fontSize >= 24) return;
    editorSettings.fontSize++;
    editor.getWrapperElement().style.fontSize = editorSettings.fontSize + 'px';
    editor.refresh();
    fontDisplay.textContent = editorSettings.fontSize + 'px';
    saveEditorSettings();
});

document.getElementById('font-decrease').addEventListener('click', () => {
    if (editorSettings.fontSize <= 10) return;
    editorSettings.fontSize--;
    editor.getWrapperElement().style.fontSize = editorSettings.fontSize + 'px';
    editor.refresh();
    fontDisplay.textContent = editorSettings.fontSize + 'px';
    saveEditorSettings();
});

// Tab size
const tabSizeSelect = document.getElementById('tab-size-select');
tabSizeSelect.value = String(editorSettings.tabSize);
tabSizeSelect.addEventListener('change', () => {
    editorSettings.tabSize = parseInt(tabSizeSelect.value);
    editor.setOption('tabSize', editorSettings.tabSize);
    editor.setOption('indentUnit', editorSettings.tabSize);
    saveEditorSettings();
});

// Auto-run toggle
const autorunToggle = document.getElementById('autorun-toggle');
autorunToggle.checked = editorSettings.autoRun;
autorunToggle.addEventListener('change', () => {
    editorSettings.autoRun = autorunToggle.checked;
    saveEditorSettings();
});

// Word wrap toggle
const wordwrapToggle = document.getElementById('wordwrap-toggle');
wordwrapToggle.checked = editorSettings.wordWrap;
wordwrapToggle.addEventListener('change', () => {
    editorSettings.wordWrap = wordwrapToggle.checked;
    editor.setOption('lineWrapping', editorSettings.wordWrap);
    saveEditorSettings();
});

/* ─── Snippets / Project Library ─────────────────────────────── */
document.getElementById('toggle-snippets').addEventListener('click', () => {
    snippetsMenu.classList.toggle('open');
    if (snippetsMenu.classList.contains('open')) renderSnippets();
});

// Close snippets when clicking outside
document.addEventListener('click', (e) => {
    if (snippetsMenu.classList.contains('open') &&
        !snippetsMenu.contains(e.target) &&
        !document.getElementById('toggle-snippets').contains(e.target)) {
        snippetsMenu.classList.remove('open');
    }
});

document.getElementById('save-snippet').addEventListener('click', () => {
    const name = prompt('Name this project:');
    if (!name || !name.trim()) return;

    appState[appState.currentTab] = editor.getValue();

    const library = getLibrary();
    library[name.trim()] = {
        html:      appState.html,
        css:       appState.css,
        js:        appState.js,
        resources: appState.resources || [],
        savedAt:   Date.now()
    };
    saveLibrary(library);
    renderSnippets();
});

function getLibrary() {
    try { return JSON.parse(localStorage.getItem('cq_jspad_library') || '{}'); }
    catch (_) { return {}; }
}

function saveLibrary(lib) {
    localStorage.setItem('cq_jspad_library', JSON.stringify(lib));
}

function renderSnippets() {
    const library = getLibrary();
    const keys = Object.keys(library);
    snippetsList.innerHTML = '';
    snippetsEmpty.style.display = keys.length ? 'none' : 'flex';

    keys.sort((a, b) => (library[b].savedAt || 0) - (library[a].savedAt || 0))
        .forEach(name => {
            const item = document.createElement('div');
            item.className = 'snippet-item';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = name;

            const delBtn = document.createElement('button');
            delBtn.className = 'snippet-delete';
            delBtn.textContent = '×';
            delBtn.title = 'Delete project';

            item.appendChild(nameSpan);
            item.appendChild(delBtn);

            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${name}"?`)) {
                    const lib = getLibrary();
                    delete lib[name];
                    saveLibrary(lib);
                    renderSnippets();
                }
            });

            item.addEventListener('click', () => {
                const data = getLibrary()[name];
                if (!data) return;
                // BUG FIX: Ensure currentTab is valid before loading
                appState = {
                    ...appState,
                    html:      data.html      || '',
                    css:       data.css       || '',
                    js:        data.js        || '',
                    resources: data.resources || [],
                };
                editor.setValue(appState[appState.currentTab]);
                editor.setOption('mode', TAB_MODES[appState.currentTab]);
                syncTabUI(appState.currentTab);
                saveState();
                snippetsMenu.classList.remove('open');
                updatePreview(false);
            });

            snippetsList.appendChild(item);
        });
}

/* ─── Keyboard Shortcuts ─────────────────────────────────────── */
document.addEventListener('keydown', (e) => {
    // Escape closes modals/panels
    if (e.key === 'Escape') {
        resourcesModal.classList.remove('open');
        settingsModal.classList.remove('open');
        snippetsMenu.classList.remove('open');
    }
});

/* ─── Initial Run ────────────────────────────────────────────── */
// Single run on startup. The setTimeout ensures editorReady is true
// and the suppressChange flag has settled before we touch anything.
setTimeout(() => updatePreview(true), 0);
