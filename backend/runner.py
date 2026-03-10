
if __name__ == "__main__":
    import uvicorn
    import sys
    import asyncio
    
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8080, log_level="info")
