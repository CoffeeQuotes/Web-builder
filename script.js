/* DOM Elements */
console.log('Script loaded');
const editorContainer = document.getElementById('editor-container');
const outputDiv = document.getElementById('output');
const previewFrame = document.getElementById('preview-frame');
const runBtn = document.getElementById('run-btn');
const themeSelect = document.getElementById('theme-select');
const dragBar = document.getElementById('drag-bar');
const outputPane = document.getElementById('output-pane');
const snippetsMenu = document.getElementById('snippets-menu');
const snippetsList = document.getElementById('snippets-list');

/* State */
let appState = {
    html: '<!-- HTML -->\n<div class="card">\n    <h1>Hello World</h1>\n    <p>Welcome to CQ JSpad</p>\n</div>',
    css: '/* CSS */\nbody {\n    font-family: "Inter", sans-serif;\n    display: flex;\n    justify-content: center;\n    align-items: center;\n    height: 100vh;\n    margin: 0;\n    background: #f0f2f5;\n}\n.card {\n    background: white;\n    padding: 2rem;\n    border-radius: 8px;\n    box-shadow: 0 4px 6px rgba(0,0,0,0.1);\n    text-align: center;\n}',
    js: '// JavaScript\nconsole.log("🚀 App Started!");\n\nconst h1 = document.querySelector("h1");\nh1.onclick = () => {\n    h1.style.color = "#7c4dff";\n    console.log("Clicked header!");\n};',
    currentTab: 'html'
};

/* Restore from LocalStorage */
const saved = localStorage.getItem('cq_jspad_state');
if (saved) {
    try {
        const parsed = JSON.parse(saved);
        appState = {
            ...appState,
            ...parsed
        };
    } catch (e) {
        console.error('Failed to load state', e);
    }
}

/* Tab Modes */
const tabModes = {
    html: 'xml',
    css: 'css',
    js: 'javascript'
};

/* Editor Init */
const editor = CodeMirror(editorContainer, {
    mode: tabModes[appState.currentTab],
    value: appState[appState.currentTab],
    theme: "dracula",
    lineNumbers: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    tabSize: 4,
    indentUnit: 4,
    lineWrapping: true,
    extraKeys: {
        "Ctrl-Enter": () => updatePreview(),
        "Cmd-Enter": () => updatePreview(),
        "Ctrl-Space": "autocomplete"
    }
});

// Sync Tab UI
document.querySelectorAll('.editor-tabs .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === appState.currentTab);
});

function switchTab(type) {
    // 1. Save current buffer to state
    appState[appState.currentTab] = editor.getValue();

    // 2. Set new tab
    appState.currentTab = type;

    // 3. Update Editor
    editor.setValue(appState[type]);
    editor.setOption('mode', tabModes[type]);

    // 4. Update UI
    document.querySelectorAll('.editor-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });

    // 5. Save State
    saveState();
}

document.querySelectorAll('.editor-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.type));
});

/* Output Pane Tabs (Preview vs Console) */
document.querySelectorAll('.output-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.target;

        // Buttons
        document.querySelectorAll('.output-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Content
        document.querySelectorAll('.output-content').forEach(div => div.classList.remove('active'));
        if (target === 'preview') document.getElementById('preview-container').classList.add('active');
        else document.getElementById('output').classList.add('active');
    });
});

/* Preview Logic */
function updatePreview(isAuto = false) {
    // Save current editor content first
    appState[appState.currentTab] = editor.getValue();
    saveState();

    const {
        html,
        css,
        js
    } = appState;

    const source = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            ${css}
        </style>
    </head>
    <body>
        ${html}
        <script>
            // Capture Console
            function send(type, args) {
                // Serialize for better output
                const serialized = args.map(arg => {
                    if (arg === null) return 'null';
                    if (arg === undefined) return 'undefined';
                    if (typeof arg === 'object') {
                        try { return JSON.stringify(arg, null, 2); } catch(e) { return String(arg); }
                    }
                    return String(arg);
                });
                window.parent.postMessage({ type, args: serialized }, '*');
            }
            const _log = console.log;
            const _error = console.error;
            const _warn = console.warn;
            
            console.log = (...args) => { send('log', args); _log(...args); };
            console.error = (...args) => { send('error', args); _error(...args); };
            console.warn = (...args) => { send('warn', args); _warn(...args); };
            
            window.onerror = (msg, url, line) => {
                send('error', [msg + " (Line: " + line + ")"]);
            };

            try {
                ${js}
            } catch (err) {
                console.error(err);
            }
        <\/script>
    </body>
    </html>
    `;

    previewFrame.srcdoc = source;

    // Switch to preview tab on run
    // Intelligent Tab Switching
    if (!isAuto) {
        if (appState.currentTab === 'js') {
            document.querySelector('[data-target="console"]').click();
        } else {
            document.querySelector('[data-target="preview"]').click();
        }
    }
}

/* Console Message Handling */
window.addEventListener('message', (e) => {
    if (e.data && e.data.type) {
        appendOutput(e.data.args, e.data.type);
    }
});

function appendOutput(args, type = 'log') {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `› ${args.join(' ')}`;
    outputDiv.appendChild(entry);
    outputDiv.scrollTop = outputDiv.scrollHeight;
}

document.getElementById('copy-output').addEventListener('click', () => {
    const text = document.getElementById('output').innerText;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copy-output');
        const originalText = btn.textContent;
        btn.textContent = 'COPIED!';
        setTimeout(() => btn.textContent = originalText, 2000);
    });
});

document.getElementById('clear-btn').addEventListener('click', () => outputDiv.innerHTML = '');

/* Helper: Save State */
function saveState() {
    localStorage.setItem('cq_jspad_state', JSON.stringify(appState));
}

let debounceTimer;
editor.on('change', () => {
    appState[appState.currentTab] = editor.getValue();
    saveState();

    // Auto-Preview for HTML/CSS
    if (appState.currentTab === 'html' || appState.currentTab === 'css') {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            updatePreview(true); // true = isAuto
        }, 1000);
    }
});

/* Theme Handling */
function loadTheme(themeName) {
    if (!['dracula', 'default'].includes(themeName)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.12/theme/${themeName}.min.css`;
        document.head.appendChild(link);
    }
    editor.setOption('theme', themeName);
}
themeSelect.addEventListener('change', (e) => {
    loadTheme(e.target.value);
    localStorage.setItem('cq_jspad_theme', e.target.value);
});
// Init Theme
const savedTheme = localStorage.getItem('cq_jspad_theme');
if (savedTheme) {
    themeSelect.value = savedTheme;
    loadTheme(savedTheme);
}

/* Drag Resizing */
let isDragging = false;
dragBar.addEventListener('mousedown', () => isDragging = true);
document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const width = window.innerWidth - e.clientX;
    if (width > 200 && width < window.innerWidth * 0.8) {
        outputPane.style.width = width + 'px';
    }
});
document.addEventListener('mouseup', () => isDragging = false);

/* Run Button */
document.addEventListener('mouseup', () => isDragging = false);

/* Button Listeners */
/* Button Listeners */
runBtn.addEventListener('click', () => updatePreview(false));

document.getElementById('format-btn').addEventListener('click', () => {
    const totalLines = editor.lineCount();
    editor.operation(() => {
        for (let i = 0; i < totalLines; i++) {
            editor.indentLine(i);
        }
    });
});

document.getElementById('download-btn').addEventListener('click', () => {
    const {
        html,
        css,
        js
    } = appState;
    const source = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exported Project</title>
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

    const blob = new Blob([source], {
        type: 'text/html'
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'project.html';
    a.click();
});

/* Snippets (Modified for Combined State) */
document.getElementById('toggle-snippets').addEventListener('click', () => {
    snippetsMenu.classList.toggle('open');
    if (snippetsMenu.classList.contains('open')) renderSnippets();
});

document.getElementById('save-snippet').addEventListener('click', () => {
    const name = prompt("Name this project:");
    if (!name) return;

    // Save all 3 buffers
    appState[appState.currentTab] = editor.getValue();

    const library = JSON.parse(localStorage.getItem('cq_jspad_library') || '{}');
    library[name] = {
        html: appState.html,
        css: appState.css,
        js: appState.js
    };
    localStorage.setItem('cq_jspad_library', JSON.stringify(library));

    renderSnippets();
});

function renderSnippets() {
    const library = JSON.parse(localStorage.getItem('cq_jspad_library') || '{}');
    snippetsList.innerHTML = '';

    Object.keys(library).forEach(name => {
        const item = document.createElement('div');
        item.className = 'snippet-item';
        item.innerHTML = `<span>${name}</span><button style="color:var(--error);background:none;border:none;">&times;</button>`;

        item.onclick = (e) => {
            if (e.target.tagName === 'BUTTON') {
                delete library[name];
                localStorage.setItem('cq_jspad_library', JSON.stringify(library));
                renderSnippets();
            } else {
                // Load Project
                const data = library[name];
                if (data) {
                    appState = {
                        ...appState,
                        ...data
                    };
                    // Refresh current tab
                    editor.setValue(appState[appState.currentTab]);
                    snippetsMenu.classList.remove('open');
                    saveState();
                    updatePreview(); // Auto-run on load
                }
            }
        };
        snippetsList.appendChild(item);
    });
}

// Initial Run to show something
updatePreview();