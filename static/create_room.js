document.addEventListener('DOMContentLoaded', () => {
    const createButton = document.getElementById('createButton');
    const roomNameInput = document.getElementById('roomName');
    const roomPasswordInput = document.getElementById('roomPassword');
    const isPrivateInput = document.getElementById('isPrivate');

    // Set focus to the room name input field
    roomNameInput.focus();

    createButton.onclick = () => {
        const roomName = roomNameInput.value;
        const roomPassword = roomPasswordInput.value;
        const isPrivate = isPrivateInput.checked;
        if (roomName) {
            fetch('/rooms', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: roomName, password: roomPassword, is_private: isPrivate })
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(error => { throw new Error(error.detail); });
                }
                return response.json();
            })
            .then(data => {
                const roomUrl = isPrivate
                    ? `/room.html?room=${data.id}&password=${roomPassword}`
                    : `/room.html?room=${data.id}`;
                const fullUrl = `${window.location.origin}${roomUrl}`;

                // Copy to clipboard
                navigator.clipboard.writeText(fullUrl).then(() => {
                    alert(`Room created! Link copied to clipboard: ${fullUrl}`);
                }).catch(err => {
                    console.error('Could not copy text: ', err);
                    alert(`Room created! Share this link to invite others: ${fullUrl}`);
                });

                window.location.href = roomUrl;
            })
            .catch(error => {
                alert(error.message);
            });
        } else {
            alert("Room name is required");
        }
    };
});
