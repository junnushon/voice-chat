from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Dict

app = FastAPI()

# CORS 설정
origins = [
    "http://localhost",
    "http://127.0.0.1:8000",  # 로컬 주소 추가
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Room(BaseModel):
    name: str
    password: str = None

class PasswordCheckRequest(BaseModel):
    room_id: str
    password: str

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.rooms: Dict[str, List[WebSocket]] = {}
        self.room_details: Dict[str, Dict] = {}

    async def connect(self, websocket: WebSocket, room: str, password: str = None):
        await websocket.accept()
        if room not in self.rooms:
            await websocket.close(code=1000, reason="Room does not exist")
            return
        room_password = self.room_details[room].get('password')
        if room_password and room_password != password:
            await websocket.close(code=4001, reason="Invalid password")
            return
        self.rooms[room].append(websocket)
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        for room in self.rooms:
            if websocket in self.rooms[room]:
                self.rooms[room].remove(websocket)

    async def broadcast(self, message: str, sender: WebSocket, room: str):
        for connection in self.rooms.get(room, []):
            if connection != sender:
                await connection.send_text(message)

    def get_room_info(self):
        return [
            {
                "id": room_id,
                "name": self.room_details[room_id]['name'],
                "has_password": bool(self.room_details[room_id].get('password')),
                "user_count": len(self.rooms.get(room_id, []))
            } for room_id in self.rooms
        ]

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, room: str = Query(...), password: str = Query(None)):
    await manager.connect(websocket, room, password)
    try:
        while True:
            data = await websocket.receive_text()
            await manager.broadcast(data, websocket, room)
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/rooms")
async def get_rooms():
    return manager.get_room_info()

@app.post("/rooms")
async def create_room(room: Room):
    room_id = str(len(manager.rooms) + 1)
    manager.rooms[room_id] = []
    manager.room_details[room_id] = {"name": room.name, "password": room.password}
    return {"id": room_id, "name": room.name}

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
