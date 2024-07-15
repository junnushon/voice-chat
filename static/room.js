'use strict';

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const roomPassword = urlParams.get('password');

const leaveRoomButton = document.getElementById('leaveRoomButton');
const remoteAudio = document.getElementById('remoteAudio');
const roomTitle = document.getElementById('roomTitle');
const userCountDiv = document.getElementById('userCount');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendButton = document.getElementById('sendButton');
const copyLinkButton = document.getElementById('copyLinkButton');
const nicknameDisplay = document.getElementById('nicknameDisplay');

let localStream;
let pcs = {};
let ws;
let nickname = '';

document.addEventListener('DOMContentLoaded', async () => {
    await fetchRoomTitle();
    nickname = prompt("Enter your nickname:");
    if (!nickname) {
        alert("Nickname is required!");
        window.location.href = '/';
        return;
    }
    nicknameDisplay.textContent = nickname;
    await start();
    await setupWebSocket();
    await call();
    chatInput.focus();
});

leaveRoomButton.onclick = leaveRoom;
sendButton.onclick = sendMessage;
chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

copyLinkButton.onclick = () => {
    const roomUrl = `${window.location.origin}/room.html?room=${roomId}`;
    navigator.clipboard.writeText(roomUrl).then(() => {
        alert('Room link copied to clipboard!');
    }).catch(err => {
        alert('Failed to copy the link.');
    });
};

async function fetchRoomTitle() {
    const response = await fetch('/rooms');
    const rooms = await response.json();
    const room = rooms.find(r => r.id === roomId);
    if (room) {
        roomTitle.textContent = room.name;
    }
}

async function setupWebSocket() {
    return new Promise((resolve, reject) => {
        let wsUrl = `wss://chat.deeptoon.co.kr/ws?room=${roomId}`;
        if (roomPassword) {
            wsUrl += `&password=${roomPassword}`;
        }
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connection established');
            resolve();
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            alert('Failed to connect to the room. Please check the password and try again.');
            window.location.href = '/';
            reject(error);
        };

        ws.onmessage = async (event) => {
            const message = event.data;
            let data;
            try {
                data = JSON.parse(message);
            } catch (e) {
                console.error('Invalid JSON:', message);
                return;
            }

            if (data.type === 'user_count') {
                if (userCountDiv) {
                    userCountDiv.textContent = `(${data.user_count})`;
                }
            } else if (data.from && data.sdp) {
                if (!pcs[data.from]) {
                    initializePeerConnection(data.from);
                }
                await handleRemoteDescription(data.from, data.sdp);
            } else if (data.from && data.candidate) {
                try {
                    await pcs[data.from].addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.error('Error adding received ICE candidate', e);
                }
            } else if (data.type === 'chat') {
                addChatMessage(data.message, data.nickname);
            }
        };

        ws.onclose = (event) => {
            if (event.reason === "Invalid password") {
                alert("Invalid password. Please try again.");
                window.location.href = '/';
            } else if (event.reason === "Room does not exist") {
                alert("Room does not exist. Please try again.");
                window.location.href = '/';
            }
        };
    });
}

async function start() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });
        localStream = stream;
    } catch (e) {
        console.error('Error accessing media devices:', e);
    }
}

async function call() {
    initializePeerConnection(nickname);

    localStream.getTracks().forEach(track => {
        for (let peerId in pcs) {
            pcs[peerId].addTrack(track, localStream);
        }
    });

    for (let peerId in pcs) {
        try {
            const offer = await pcs[peerId].createOffer();
            await pcs[peerId].setLocalDescription(offer);
            ws.send(JSON.stringify({ from: nickname, to: peerId, sdp: pcs[peerId].localDescription }));
        } catch (e) {
            console.error('Failed to create offer:', e);
        }
    }
}

function initializePeerConnection(peerId) {
    if (pcs[peerId]) {
        return;
    }

    pcs[peerId] = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    });

    pcs[peerId].onicecandidate = e => {
        if (e.candidate) {
            ws.send(JSON.stringify({ from: nickname, to: peerId, candidate: e.candidate }));
        }
    };

    pcs[peerId].oniceconnectionstatechange = e => {
        if (pcs[peerId].iceConnectionState === 'disconnected') {
            pcs[peerId].close();
            delete pcs[peerId];
        }
    };

    pcs[peerId].ontrack = event => {
        if (event.streams && event.streams[0]) {
            remoteAudio.srcObject = event.streams[0];
        }
    };
}

async function handleRemoteDescription(peerId, sdp) {
    try {
        if (sdp.type === 'offer' && pcs[peerId].signalingState !== 'stable') {
            return;
        }
        await pcs[peerId].setRemoteDescription(new RTCSessionDescription(sdp));
        if (sdp.type === 'offer') {
            const answer = await pcs[peerId].createAnswer();
            await pcs[peerId].setLocalDescription(answer);
            ws.send(JSON.stringify({ from: nickname, to: peerId, sdp: pcs[peerId].localDescription }));
        }
    } catch (e) {
        console.error('Error setting remote description:', e);
    }
}

function hangup() {
    for (let peerId in pcs) {
        if (pcs[peerId]) {
            pcs[peerId].close();
            pcs[peerId] = null;
        }
    }
}

function leaveRoom() {
    hangup();
    window.location.href = '/';
}

function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        ws.send(JSON.stringify({ type: 'chat', message, nickname }));
        addChatMessage(message, nickname, true);
        chatInput.value = '';
    }
}

function addChatMessage(message, nickname, isLocal = false) {
    const messageWrapper = document.createElement('div');
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');
    if (isLocal) {
        messageElement.classList.add('local');
        messageElement.innerHTML = message;
        messageWrapper.style.textAlign = 'right';
    } else {
        messageElement.innerHTML = `<strong>${nickname}:</strong> ${message}`;
        messageWrapper.style.textAlign = 'left';
    }
    messageWrapper.appendChild(messageElement);
    chatMessages.appendChild(messageWrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
