import asyncio
import json
import hashlib
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Dict

app = FastAPI()

# CORS 설정
origins = [
    "http://localhost",
    "http://127.0.0.1:8000",
    "https://chat.deeptoon.co.kr"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def generate_room_hash(room_name):
    hash_object = hashlib.sha256()
    hash_object.update((room_name + str(time.time())).encode('utf-8'))
    return hash_object.hexdigest()[:8]  # 앞의 8자리만 사용


class Room(BaseModel):
    name: str
    password: str = None
    is_private: bool = False  # 비공개 방 여부 추가

class PasswordCheckRequest(BaseModel):
    room_id: str
    password: str

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}  # Dict로 변경
        self.rooms: Dict[str, Dict] = {}
        self.room_timers: Dict[str, asyncio.TimerHandle] = {}

    async def connect(self, websocket: WebSocket, room: str, password: str = None):
        await websocket.accept()
        if room not in self.rooms:
            await websocket.close(code=1000, reason="Room does not exist")
            return
        room_password = self.rooms[room].get('password')
        if room_password and room_password != password:
            await websocket.close(code=4001, reason="Invalid password")
            return
        if room not in self.active_connections:
            self.active_connections[room] = []
        self.active_connections[room].append(websocket)
        if room in self.room_timers:
            self.room_timers[room].cancel()
            del self.room_timers[room]
        asyncio.create_task(self.send_user_count(room))

    def disconnect(self, websocket: WebSocket, room: str):
        self.active_connections[room].remove(websocket)
        if not self.active_connections[room]:
            self.room_timers[room] = asyncio.get_event_loop().call_later(300, self.delete_room, room)
        asyncio.create_task(self.send_user_count(room))

    async def broadcast(self, message: str, sender: WebSocket, room: str):
        for connection in self.active_connections.get(room, []):
            if connection != sender:
                await connection.send_text(message)

    def get_room_info(self):
        return [
            {
                "id": room_id,
                "name": self.rooms[room_id]['name'],
                "has_password": bool(self.rooms[room_id].get('password')),
                "is_private": self.rooms[room_id].get('is_private', False),
                "user_count": len(self.active_connections.get(room_id, []))
            } for room_id in self.rooms
        ]

    async def send_user_count(self, room: str):
        while room in self.active_connections:
            user_count = len(self.active_connections[room])
            for connection in self.active_connections[room]:
                try:
                    await connection.send_json({"type": "user_count", "user_count": user_count})
                except Exception as e:
                    print(f'Error sending user count: {e}')
            await asyncio.sleep(5)

    def delete_room(self, room: str):
        if room in self.active_connections and not self.active_connections[room]:
            del self.active_connections[room]
            del self.rooms[room]
            del self.room_timers[room]
            print(f'Room {room} deleted due to inactivity')

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, room: str = Query(...), password: str = Query(None)):
    await manager.connect(websocket, room, password)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                data_json = json.loads(data)
                message_type = data_json.get("type")
                if message_type == "chat":
                    await manager.broadcast(json.dumps(data_json), websocket, room)
                else:
                    await manager.broadcast(data, websocket, room)
            except json.JSONDecodeError:
                print("Received message is not a valid JSON")
    except WebSocketDisconnect:
        manager.disconnect(websocket, room)

@app.get("/rooms")
async def get_rooms():
    return manager.get_room_info()

@app.post("/rooms")
async def create_room(room: Room):
    # Check for duplicate room names
    if any(details["name"] == room.name for details in manager.rooms.values()):
        raise HTTPException(status_code=400, detail="Room name already exists")
    
    if room.is_private:
        room_id = generate_room_hash(room.name)
    else:
        room_id = str(len(manager.rooms) + 1)
        
    manager.rooms[room_id] = {
        "name": room.name,
        "password": room.password,
        "is_private": room.is_private
    }
    manager.active_connections[room_id] = []
    return {"id": room_id, "name": room.name, "is_private": room.is_private}

@app.post("/check_password")
async def check_password(payload: PasswordCheckRequest):
    room = manager.rooms.get(payload.room_id)
    if room is None:
        return JSONResponse(content={"detail": "Room does not exist"}, status_code=404)
    if room['password'] != payload.password:
        return JSONResponse(content={"detail": "Invalid password"}, status_code=403)
    return {"detail": "Password is correct"}

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def get():
    with open("static/index.html", "r") as f:
        return f.read()

@app.get("/create_room.html", response_class=HTMLResponse)
async def create_room_page():
    with open("static/create_room.html", "r") as f:
        return f.read()

@app.get("/room.html", response_class=HTMLResponse)
async def room_page():
    with open("static/room.html", "r") as f:
        return f.read()

@app.get("/room_list.html", response_class=HTMLResponse)
async def room_list_page():
    with open("static/room_list.html", "r") as f:
        return f.read()
    
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
