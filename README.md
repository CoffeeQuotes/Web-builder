# ⚡ CoffeeQutes WebBuilder
> *CoffeeQuote WebBuilder - The Ultimate Web Builder & Scratchpad*

CoffeeQutes WebBuilder is a lightweight, feature-rich Web Builder aimed at developers who need a quick, beautiful environment to test HTML, CSS, and JavaScript snippets, or build entire components without setting up a complex project.

## ✨ Features

*   **Multi-Tab Editor:** Seamlessly switch between **HTML**, **CSS**, and **JS** editing.
*   **Live Preview:** See your changes instantly in a dedicated Frame, just like CodePen.
*   **Pro Editor:** Built on CodeMirror with syntax highlighting, bracket matching, and auto-closing.
*   **Console:** Capture logs, errors, and warnings from your code in a dedicated console pane.
*   **Themeable:** Choose from popular themes like Dracula, Monokai, Nord, and more.
*   **Snippet Library:** Save your projects locally and access them anytime.
*   **Live Reloading:** (Optional) Integrated Python server for auto-refreshing when you edit the source code of the pad itself.

---

## 🚀 Quick Start (Easiest)
You don't need to install anything to use CoffeeQutes WebBuilder!

1.  Navigate to the project folder.
2.  **Double-click** the `index.html` file.
3.   The app will open in your default browser, ready to use.

---

## 🛠️ Developer Mode (Smooth Experience)
If you want to modify the source code of CoffeeQutes WebBuilder itself (edit `script.js` or `style.css`) and see changes instantly without manually refreshing, run the included Live Server.

### Prerequisites
*   **Python** installed ([Download Here](https://www.python.org/downloads/)).
    *   *Ensure "Add Python to PATH" is checked during installation.*

### Setup
1.  Open your terminal in this folder.
2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

### Running the Live Server
1.  Start the server:
    ```bash
    python live_server.py
    ```
2.  Open **[http://localhost:8000](http://localhost:8000)** in your browser.
3.  Now, any change you make to the source files will automatically reload the page!
