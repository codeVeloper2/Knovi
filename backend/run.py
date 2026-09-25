"""Dev entry point for the Knovi backend.

Run with:  python run.py

psycopg's async mode cannot use Windows' default ProactorEventLoop, and
uvicorn (on Python 3.14) creates its own loop that ignores the event-loop
policy. So we build a SelectorEventLoop ourselves and run the uvicorn
Server inside it via asyncio.run(loop_factory=...).
"""
import asyncio
import selectors
import sys

import uvicorn


def _make_selector_loop() -> asyncio.AbstractEventLoop:
    return asyncio.SelectorEventLoop(selectors.SelectSelector())


def main() -> None:
    config = uvicorn.Config(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=False,
    )
    server = uvicorn.Server(config)

    if sys.platform == "win32":
        # Python 3.12+ supports loop_factory; run the server on a Selector loop.
        asyncio.run(server.serve(), loop_factory=_make_selector_loop)
    else:
        asyncio.run(server.serve())


if __name__ == "__main__":
    main()
