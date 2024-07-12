document.addEventListener('DOMContentLoaded', () => {
    const createButton = document.getElementById('createButton');
    const roomNameInput = document.getElementById('roomName');
    const roomPasswordInput = document.getElementById('roomPassword');

    createButton.onclick = () => {
        const roomName = roomNameInput.value;
        const roomPassword = roomPasswordInput.value;
        if (roomName) {
            fetch('/rooms', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: roomName, password: roomPassword })
            })
            .then(response => response.json())
            .then(data => {
                if (roomPassword) {
                    window.location.href = `/room.html?room=${data.id}&password=${roomPassword}`;
                } else {
                    window.location.href = `/room.html?room=${data.id}`;
                }
            });
        }
    };
});
