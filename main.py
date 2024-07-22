from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Dict
import asyncio
import json
import hashlib
import time

app = FastAPI()

# CORS 설정
origins = [
    "http://localhost",
    "http://127.0.0.1:8000",
    "http://chat.deeptoon.co.kr"
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

class RoomInfoResponse(BaseModel):
    room_id: str
    users: List[str]

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.rooms: Dict[str, Dict[str, WebSocket]] = {}
        self.room_details: Dict[str, Dict] = {}
        self.room_timers: Dict[str, asyncio.TimerHandle] = {}

    async def connect(self, websocket: WebSocket, room: str, user_id: str, password: str = None):
        await websocket.accept()
        if room not in self.rooms:
            await websocket.close(code=1000, reason="Room does not exist")
            return
        room_password = self.room_details[room].get('password')
        if room_password and room_password != password:
            await websocket.close(code=4001, reason="Invalid password")
            return
        if room not in self.rooms:
            self.rooms[room] = {}
        self.rooms[room][user_id] = websocket
        self.active_connections.append(websocket)
        if room in self.room_timers:
            self.room_timers[room].cancel()
            del self.room_timers[room]

        # await self.broadcast_new_peer(room, user_id)
        asyncio.create_task(self.send_user_count(room))

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        for room in self.rooms:
            for user_id, ws in list(self.rooms[room].items()):
                if ws == websocket:
                    del self.rooms[room][user_id]
                    if not self.rooms[room]:
                        self.room_timers[room] = asyncio.get_event_loop().call_later(300, self.delete_room, room)
                    asyncio.create_task(self.send_user_count(room))
                    return

    async def broadcast(self, message: str, sender: WebSocket, room: str):
        if room not in self.rooms:
            print(f'Room {room} not found')
            return
        for connection in self.rooms[room].values():
            if connection != sender:
                try:
                    await connection.send_text(message)
                    # print(f'Message sent to connection in room {room}')
                except Exception as e:
                    print(f'Error sending message to connection in room {room}: {e}')

    async def broadcast_new_peer(self, room: str, new_peer_id: str):
        message = json.dumps({"type": "new_peer", "peerId": new_peer_id})
        for user_id, connection in self.rooms[room].items():
            if user_id != new_peer_id:
                try:
                    await connection.send_text(message)
                    print(f'New peer message sent to connection in room {room}')
                except Exception as e:
                    print(f'Error sending new peer message to connection in room {room}: {e}')

    def get_room_info(self):
        return [
            {
                "id": room_id,
                "name": self.room_details[room_id]['name'],
                "has_password": bool(self.room_details[room_id].get('password')),
                "is_private": self.room_details[room_id].get('is_private', False),
                "user_count": len(self.rooms.get(room_id, {}))
            } for room_id in self.rooms
        ]

    async def send_user_count(self, room: str):
        while room in self.rooms:
            user_count = len(self.rooms[room])
            for connection in self.rooms[room].values():
                try:
                    await connection.send_json({"type": "user_count", "user_count": user_count})
                except Exception as e:
                    print(f'Error sending user count: {e}')
            await asyncio.sleep(5)

    def delete_room(self, room: str):
        if room in self.rooms and not self.rooms[room]:
            del self.rooms[room]
            del self.room_details[room]
            del self.room_timers[room]
            print(f'Room {room} deleted due to inactivity')

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, room: str = Query(...), user_id: str = Query(...), password: str = Query(None)):
    await manager.connect(websocket, room, user_id, password)
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
        manager.disconnect(websocket)

@app.get("/room/{room_id}/users", response_model=RoomInfoResponse)
async def get_room_users(room_id: str):
    if room_id not in manager.rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    users = list(manager.rooms[room_id].keys())
    return {"room_id": room_id, "users": users}

@app.get("/rooms")
async def get_rooms():
    return manager.get_room_info()

@app.post("/rooms")
async def create_room(room: Room):
    # Check for duplicate room names
    if any(details["name"] == room.name for details in manager.room_details.values()):
        raise HTTPException(status_code=400, detail="Room name already exists")
    
    if room.is_private:
        room_id = generate_room_hash(room.name)
    else:
        room_id = str(len(manager.rooms) + 1)
        
    manager.rooms[room_id] = {}
    manager.room_details[room_id] = {
        "name": room.name,
        "password": room.password,
        "is_private": room.is_private
    }
    return {"id": room_id, "name": room.name, "is_private": room.is_private}


@app.post("/check_password")
async def check_password(payload: PasswordCheckRequest):
    room = manager.room_details.get(payload.room_id)
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
