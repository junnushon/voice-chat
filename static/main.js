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
            roomList.innerHTML = '';  // 이전 목록을 지우고 새로 업데이트

            // 전체 방의 수를 업데이트
            const roomCount = document.getElementById('roomCount');
            roomCount.textContent = `(${rooms.length})`;

            rooms.forEach(room => {
                if (room.is_private) return;  // 비공개 방은 목록에서 제외

                const li = document.createElement('li');
                li.innerHTML = `
                    ${room.name} (${room.user_count})
                    ${room.has_password ? '<i class="fas fa-lock"></i>' : ''}
                `;
                li.onclick = async () => {
                    if (room.has_password) {
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
