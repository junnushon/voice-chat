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
let peerConnection;
let ws;
let nickname = '';
let userId = uuidv4();

console.log('userId:', userId);
console.log('App version: 1.1.0');

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
    let wsUrl = `wss://chat.deeptoon.co.kr/ws?room=${roomId}&user_id=${userId}`;
    if (roomPassword) {
        wsUrl += `&password=${roomPassword}`;
    }
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connection established');
        ws.send(JSON.stringify({ type: 'new_peer', peerId: userId }));
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        alert('Failed to connect to the room. Please check the password and try again.');
        window.location.href = '/';
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        console.log('Received message:', data);
        
        switch (data.type) {
            case 'offer':
                await handleOffer(data);
                break;
            case 'answer':
                await handleAnswer(data);
                break;
            case 'ice-candidate':
                await handleIceCandidate(data);
                break;
            case 'chat':
                addChatMessage(data.message, data.nickname);
                break;
            case 'new_peer':
                if (data.peerId !== userId) {
                    await createOffer();
                }
                break;
            case 'peer_left':
                if (data.peerId !== userId) {
                    hangup();
                }
                break;
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
}

async function start() {
    console.log('Starting local stream...');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true
        });
        localStream = stream;
        console.log('Local stream started:', stream);
    } catch (e) {
        console.error('Error accessing media devices:', e);
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    });

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
        }
    };

    peerConnection.ontrack = event => {
        remoteAudio.srcObject = event.streams[0];
    };

    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });
}

async function createOffer() {
    createPeerConnection();
    
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: 'offer', sdp: offer }));
    } catch (e) {
        console.error('Failed to create offer:', e);
    }
}

async function handleOffer(data) {
    createPeerConnection();
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'answer', sdp: answer }));
    } catch (e) {
        console.error('Failed to handle offer:', e);
    }
}

async function handleAnswer(data) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
    } catch (e) {
        console.error('Failed to handle answer:', e);
    }
}

async function handleIceCandidate(data) {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
        console.error('Failed to handle ICE candidate:', e);
    }
}

function hangup() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        console.log('Peer connection closed');
    }
}

function leaveRoom() {
    hangup();
    ws.send(JSON.stringify({ type: 'peer_left', peerId: userId }));
    window.location.href = '/';
}

function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        addChatMessage(message, nickname, true);
        ws.send(JSON.stringify({ type: 'chat', message, nickname }));
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
