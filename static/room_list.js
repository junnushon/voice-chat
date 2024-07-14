document.addEventListener('DOMContentLoaded', () => {
    const roomList = document.getElementById('rooms');
    const leaveRoomListButton = document.getElementById('leaveRoomListButton');

    leaveRoomListButton.onclick = () => {
        window.location.href = '/';
    };

    // Fetch rooms from server
    fetch('/rooms')
        .then(response => response.json())
        .then(rooms => {
            roomList.innerHTML = '';  // 이전 목록을 지우고 새로 업데이트

            // 비공개 방을 제외한 방의 수를 계산
            const visibleRooms = rooms.filter(room => !room.is_private);

            const roomCount = document.getElementById('roomCount');
            roomCount.textContent = `(${rooms.length})`;  // 전체 방의 수를 카운트

            visibleRooms.forEach(room => {
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
        })
        .catch(error => {
            console.error("Error fetching rooms:", error);
        });
});
