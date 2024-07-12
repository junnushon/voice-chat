document.addEventListener('DOMContentLoaded', () => {
    const createRoomButton = document.getElementById('createRoomButton');
    const roomList = document.getElementById('rooms');

    createRoomButton.onclick = () => {
        window.location.href = '/create_room.html';
    };

    // Fetch rooms from server
    fetch('/rooms')
        .then(response => response.json())
        .then(rooms => {
            rooms.forEach(room => {
                const li = document.createElement('li');
                li.textContent = room.name;
                li.onclick = async () => {
                    if (room.has_password) {
                        console.log(room.id)
                        const password = prompt("Enter the password for the room:");
                        if (password !== null) {
                            const response = await fetch('/check_password', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ room_id: room.id, password: password })
                            });
                            if (response.ok) {
                                window.location.href = `/room.html?room=${room.id}&password=${password}`;
                            } else {
                                alert('Invalid password. Please try again.');
                            }
                        }
                    } else {
                        window.location.href = `/room.html?room=${room.id}`;
                    }
                };
                roomList.appendChild(li);
            });
        });
});
