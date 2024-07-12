document.addEventListener('DOMContentLoaded', () => {
    const createButton = document.getElementById('createButton');
    const roomNameInput = document.getElementById('roomName');
    const roomPasswordInput = document.getElementById('roomPassword');

    // Set focus to the room name input field
    roomNameInput.focus();

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
            .then(response => {
                if (!response.ok) {
                    return response.json().then(error => { throw new Error(error.detail); });
                }
                return response.json();
            })
            .then(data => {
                if (roomPassword) {
                    window.location.href = `/room.html?room=${data.id}&password=${roomPassword}`;
                } else {
                    window.location.href = `/room.html?room=${data.id}`;
                }
            })
            .catch(error => {
                alert(error.message);
            });
        } else {
            alert("Room name is required");
        }
    };
});
