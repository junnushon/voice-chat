# Voice Chat Application
![GitHub repo size](https://img.shields.io/github/repo-size/junnushon/voice-chat)
![GitHub issues](https://img.shields.io/github/issues/junnushon/voice-chat)
![GitHub forks](https://img.shields.io/github/forks/junnushon/voice-chat)
![GitHub stars](https://img.shields.io/github/stars/junnushon/voice-chat)
![GitHub license](https://img.shields.io/github/license/junnushon/voice-chat)

This is a web-based voice chat application built using FastAPI and WebSockets. Users can create rooms, join existing rooms, and communicate with each other in real-time. The application ensures that rooms are deleted if they are inactive (i.e., have zero users) for more than 5 minutes. Additionally, room names must be unique.

## Features

- Real-time voice communication
- Room creation with optional password protection
- Automatic deletion of inactive rooms
- User count display in each room
- Unique room names enforced

## Getting Started

### Prerequisites

- Python 3.8 or higher
- Node.js (for serving static files and frontend dependencies)

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
    pip install -r requirements.txt
    ```

4. Install frontend dependencies (if any):

    ```bash
    # Example if using npm
    cd static
    npm install
    cd ..
    ```

### Running the Application

1. Start the FastAPI server:

    ```bash
    uvicorn main:app --reload
    ```

2. Open your web browser and navigate to `http://127.0.0.1:8000` to use the application.

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