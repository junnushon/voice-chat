document.addEventListener('DOMContentLoaded', () => {
    const roomListButton = document.getElementById('roomListButton');
    const createRoomButton = document.getElementById('createRoomButton');
    const roomCount = document.getElementById('roomCount');

    roomListButton.onclick = () => {
        window.location.href = '/room_list.html';
    };

    createRoomButton.onclick = () => {
        window.location.href = '/create_room.html';
    };

    // Fetch rooms from server to update room count
    fetch('/rooms')
        .then(response => response.json())
        .then(rooms => {
            // 비공개 방을 제외한 방의 수를 계산
            roomCount.textContent = `(${rooms.length})`;
        })
        .catch(error => {
            console.error("Error fetching rooms:", error);
        });
});
