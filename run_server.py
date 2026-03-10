import uvicorn
import sys
import asyncio
import os

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        
    # Running from project root
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8080, log_level="info", loop="asyncio")
