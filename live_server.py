import asyncio
import http.server
import socketserver
import threading
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import websockets

PORT = 8000
WS_PORT = 8765

clients = set()
loop = None
last_reload = 0
RELOAD_DEBOUNCE = 0.2

# ---------------- WebSocket ----------------


async def ws_handler(ws):
    clients.add(ws)
    try:
        await ws.wait_closed()
    finally:
        clients.remove(ws)


async def send_reload():
    if clients:
        # Create tasks to avoid blocking if one client is slow
        await asyncio.gather(
            *(ws.send("reload") for ws in clients), return_exceptions=True
        )


def start_ws():
    global loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    async def runner():
        print(f"🔁 Live reload WS on ws://localhost:{WS_PORT}")
        async with websockets.serve(ws_handler, "localhost", WS_PORT):
            await asyncio.Future()  # run forever

    loop.run_until_complete(runner())


# ---------------- File Watcher ----------------


class ReloadHandler(FileSystemEventHandler):
    def on_modified(self, event):
        global last_reload

        # Filter for relevant web files
        if not event.src_path.endswith(
            (".html", ".css", ".js", ".png", ".jpg", ".svg")
        ):
            return

        now = time.time()
        if now - last_reload < RELOAD_DEBOUNCE:
            return

        last_reload = now
        if loop:
            print(f"⚡ File changed: {event.src_path}, reloading...")
            asyncio.run_coroutine_threadsafe(send_reload(), loop)


# ---------------- HTTP Server (FIXED) ----------------

# Replace the NoCacheHandler in the code above with this:
class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        # Let the parent handle file finding
        super().do_GET()

    def copyfile(self, source, outputfile):
        # Override to inject script into HTML files
        if self.path.endswith(".html") or self.path.endswith("/"):
            content = source.read().decode("utf-8", errors="ignore")
            injection = f"""
            <script>
                (function() {{
                    const ws = new WebSocket("ws://localhost:{WS_PORT}");
                    ws.onmessage = () => location.reload();
                    ws.onclose = () => console.log("Live reload disconnected");
                }})();
            </script>
            </body>
            """
            # Insert before </body>, or append if not found
            if "</body>" in content:
                content = content.replace("</body>", injection)
            else:
                content += injection

            outputfile.write(content.encode("utf-8"))
        else:
            # Standard copy for images/css
            super().copyfile(source, outputfile)


# This class enables multi-threading for the HTTP server
class ThreadingServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True  # Prevents "Address already in use" errors on restart
    daemon_threads = True  # Ensures threads die when main program dies


def start_http():
    # Usage of ThreadingServer handles multiple requests (images/css) simultaneously
    with ThreadingServer(("", PORT), NoCacheHandler) as httpd:
        print(f"🌐 Serving http://localhost:{PORT}")
        httpd.serve_forever()


# ---------------- Main ----------------

if __name__ == "__main__":
    print("🚀 Live reload server starting...")

    # Start WebSocket in a separate thread
    ws_thread = threading.Thread(target=start_ws, daemon=True)
    ws_thread.start()

    # Start HTTP Server in a separate thread
    http_thread = threading.Thread(target=start_http, daemon=True)
    http_thread.start()

    # Start File Watcher
    observer = Observer()
    observer.schedule(ReloadHandler(), ".", recursive=True)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n🛑 Stopping server...")
        observer.stop()

    observer.join()
