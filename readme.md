# Voice Chat Application
![GitHub repo size](https://img.shields.io/github/repo-size/junnushon/voice-chat)
![GitHub issues](https://img.shields.io/github/issues/junnushon/voice-chat)
![GitHub forks](https://img.shields.io/github/forks/junnushon/voice-chat)
![GitHub stars](https://img.shields.io/github/stars/junnushon/voice-chat)
![GitHub license](https://img.shields.io/github/license/junnushon/voice-chat)


## Update
- 2024-07-16 When more than three users are connected, the connection gets dropped.
- 2024-07-16 현재 3명 이상 접속시 연결이 끊어지는 문제가 있습니다. 

---

This is a web-based voice chat application built using FastAPI and WebSockets. Users can create rooms, join existing rooms, and communicate with each other in real-time. The application ensures that rooms are deleted if they are inactive (i.e., have zero users) for more than 5 minutes. Additionally, room names must be unique.

---
FastAPI와 WebSockets를 사용하여 구축된 웹 기반 음성 채팅 애플리케이션입니다. 사용자는 방을 생성하고, 기존 방에 참여하며, 실시간으로 서로 소통할 수 있습니다. 이 애플리케이션은 방이 비활성 상태(즉, 사용자가 0명인 상태)가 5분 이상 지속되면 해당 방을 자동으로 삭제합니다. 또한, 방 이름은 중복되지 않도록 보장합니다.

## Live Site / 라이브 사이트

You can access the live site here: [voicechatweb.site](https://voicechatweb.site/)

## Features

- Real-time voice communication
- Room creation with optional password protection
- Automatic deletion of inactive rooms
- User count display in each room
- Unique room names enforced

---
- 실시간 음성 통신
- 비밀번호 보호 선택이 가능한 방 생성
- 비활성 상태인 방의 자동 삭제
- 각 방에 사용자 수 표시
- 고유한 방 이름 보장

## Getting Started

### Prerequisites

- Python 3.8 or higher
- FastAPI (for serving static files and frontend dependencies)

### Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/junnushon/voice-chat.git
    cd voice-chat
    ```

2. Create and activate a virtual environment:

    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```

3. Install the required Python packages:

    ```bash
    pip install fastapi
    ```


### Running the Application

1. Start the FastAPI server:

    ```bash
    uvicorn main:app --reload
    ```
    ```bash
    or
    python main.py
    ```

2. Open your web browser and navigate to `http://localhost:8000` to use the application.

### Project Structure
```graphql
voice-chat-app/
│
├── main.py # Main server-side application
├── requirements.txt # Python dependencies
├── static/
│ ├── create_room.html # HTML for creating a room
│ ├── index.html # HTML for the homepage
│ ├── room.html # HTML for the room page
│ ├── styles.css # CSS styles
│ ├── create_room.js # JavaScript for creating a room
│ ├── room.js # JavaScript for room functionality
│ └── ... # Other static files
└── README.md # This file
```

### API Endpoints

- `GET /rooms`: Retrieve the list of existing rooms with user counts and password protection status.
- `POST /rooms`: Create a new room. The request body should contain the room name and an optional password.
- `POST /check_password`: Verify the password for a room. The request body should contain the room ID and password.

### WebSocket Endpoint

- `ws://localhost:8000/ws?room={room_id}&password={password}`: Connect to a room for real-time voice communication. The `password` parameter is optional and required only if the room is password-protected.

### License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

### Acknowledgements

- [FastAPI](https://fastapi.tiangolo.com/)
- [WebSockets](https://websockets.readthedocs.io/)
- [Uvicorn](https://www.uvicorn.org/)
- [Node.js](https://nodejs.org/)

### Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

---