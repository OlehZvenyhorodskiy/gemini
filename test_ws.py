import asyncio
import websockets
import json

async def test():
    async with websockets.connect('ws://127.0.0.1:8080/ws?user_id=123') as ws:
        print('Connected')
        try:
            msg = await ws.recv()
            data = json.loads(msg)
            with open('ws_error.txt', 'w') as f:
                f.write(data.get('message', ''))
        except Exception as e:
            print(f'Error: {e}')

asyncio.run(test())
