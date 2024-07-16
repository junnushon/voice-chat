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
let userId = uuidv4();
let remotePeers = []; // 방에 있는 다른 사용자들의 ID를 저장
let addedIceCandidates = {}; // 추가된 ICE 후보를 저장
let pendingIceCandidates = {}; // 대기 중인 ICE 후보를 저장
console.log('userId:', userId)

document.addEventListener('DOMContentLoaded', async () => {
    await fetchRoomTitle();
    nickname = prompt("Enter your nickname:");
    if (!nickname) {
        alert("Nickname is required!");
        window.location.href = '/';
        return;
    }
    nicknameDisplay.textContent = nickname; // 닉네임 표시 추가
    await start();
    await fetchRemotePeers();
    await setupWebSocket();
    await call();
    chatInput.focus(); // 포커스를 텍스트 입력창으로 옮기기
});

async function fetchRemotePeers() {
    try {
        const response = await fetch(`/room/${roomId}/users`);
        const data = await response.json();
        remotePeers = data.users.filter(id => id !== userId); // 자신을 제외한 사용자 목록
    } catch (e) {
        console.error('Error fetching remote peers:', e);
    }
}

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

async function handleIceCandidate(peerId, candidate) {
    const candidateId = `${candidate.sdpMid}:${candidate.sdpMLineIndex}:${candidate.candidate}`;
    if (!addedIceCandidates[peerId]) {
        addedIceCandidates[peerId] = new Set();
    }

    if (addedIceCandidates[peerId].has(candidateId)) {
        console.log(`Duplicate ICE candidate for peer ${peerId} ignored: ${candidateId}`);
        return;
    }

    addedIceCandidates[peerId].add(candidateId);

    if (pcs[peerId] && pcs[peerId].remoteDescription && pcs[peerId].remoteDescription.type) {
        try {
            await pcs[peerId].addIceCandidate(new RTCIceCandidate(candidate));
            console.log(`Added ICE candidate for peer ${peerId}`);
        } catch (e) {
            console.error(`Error adding ICE candidate for peer ${peerId}`, e);
        }
    } else {
        if (!pendingIceCandidates[peerId]) {
            pendingIceCandidates[peerId] = [];
        }
        pendingIceCandidates[peerId].push(candidate);
        console.log(`Queued ICE candidate for peer ${peerId}`);
    }
}

async function handleRemoteDescription(peerId, sdp) {
    if (!pcs[peerId]) {
        initializePeerConnection(peerId);
    }

    const rtcSessionDescription = new RTCSessionDescription(sdp);
    const currentState = pcs[peerId].signalingState;
    console.log(`Current signaling state for peer ${peerId}:`, currentState);
    
    try {
        if (rtcSessionDescription.type === 'offer' && currentState === 'stable') {
            await pcs[peerId].setRemoteDescription(rtcSessionDescription);
            console.log(`Remote description (offer) set for peer ${peerId}`);
            
            const answer = await pcs[peerId].createAnswer();
            await pcs[peerId].setLocalDescription(answer);
            console.log('Created and sent Answer:', answer);
            ws.send(JSON.stringify({ from: userId, to: peerId, sdp: pcs[peerId].localDescription }));
        } else if (rtcSessionDescription.type === 'answer' && currentState === 'have-local-offer') {
            await pcs[peerId].setRemoteDescription(rtcSessionDescription);
            console.log(`Remote description (answer) set for peer ${peerId}`);
        } else {
            console.log(`Unexpected SDP type or state: ${rtcSessionDescription.type}, ${currentState}`);
        }

        if (pendingIceCandidates[peerId]) {
            for (let candidate of pendingIceCandidates[peerId]) {
                try {
                    await pcs[peerId].addIceCandidate(new RTCIceCandidate(candidate));
                    console.log(`Added pending ICE candidate for peer ${peerId}`);
                } catch (e) {
                    console.error(`Error adding pending ICE candidate for peer ${peerId}`, e);
                }
            }
            delete pendingIceCandidates[peerId];
        }
    } catch (e) {
        console.error(`Error setting remote description for peer ${peerId}`, e);
    }
}


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
        let wsUrl = `wss://chat.deeptoon.co.kr/ws?room=${roomId}&user_id=${userId}`;
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
            const data = JSON.parse(message);
            console.log('Received message:', data);
        
            if (data.from && data.to && data.from === data.to) {
                console.log('Ignoring message from self');
                return;
            }
        
            if (data.type === 'user_count') {
                console.log(`Updating user count to ${data.user_count}`);
                if (userCountDiv) {
                    userCountDiv.textContent = `${data.user_count}`;
                }
            } else if (data.from && data.to && data.to === userId && data.sdp) {
                await handleRemoteDescription(data.from, data.sdp);
            } else if (data.from && data.to && data.to === userId && data.candidate) {
                await handleIceCandidate(data.from, data.candidate);
            } else if (data.type === 'chat') {
                addChatMessage(data.message, data.nickname);
            } else if (data.type === 'new_peer') {
                await addPeer(data.peerId);
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
    console.log('Starting local stream...');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        });
        localStream = stream;
        console.log('Local stream started:', stream);
    } catch (e) {
        console.error('Error accessing media devices:', e);
    }
}

async function call() {
    console.log('Starting call...');

    localStream.getTracks().forEach(track => {
        for (let peerId of remotePeers) { // remotePeers를 사용하여 피어 연결 초기화
            if (!pcs[peerId]) {
                initializePeerConnection(peerId);
            }
            pcs[peerId].addTrack(track, localStream);
            console.log('Added local track:', track);
        }
    });

    for (let peerId of remotePeers) { // remotePeers를 사용하여 피어 연결 초기화
        try {
            const offer = await pcs[peerId].createOffer();
            console.log('Created offer:', offer);
            await pcs[peerId].setLocalDescription(offer);
            console.log('Set local description:', pcs[peerId].localDescription);
            ws.send(JSON.stringify({ from: userId, to: peerId, sdp: pcs[peerId].localDescription }));
            console.log('Sent offer SDP:', pcs[peerId].localDescription, peerId);
        } catch (e) {
            console.error('Failed to create offer:', e);
        }
    }
}

function initializePeerConnection(peerId) {
    console.log("initializePeerConnection called !!")
    if (pcs[peerId]) return; // 이미 초기화된 경우 무시
    pcs[peerId] = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
        ]
    });
    console.log("initializePeerConnection events on !!")
    pcs[peerId].onicecandidate = e => {
        if (e.candidate) {
            console.log('Generated ICE candidate:', e.candidate);
            ws.send(JSON.stringify({ from: userId, to: peerId, candidate: e.candidate }));
        }
    };

    pcs[peerId].oniceconnectionstatechange = e => {
        console.log('ICE connection state change:', pcs[peerId].iceConnectionState);
    };

    pcs[peerId].onconnectionstatechange = e => {
        console.log('Peer connection state change:', pcs[peerId].connectionState);
    };

    pcs[peerId].ontrack = event => {
        if (event.streams && event.streams[0]) {
            console.log('Received remote stream:', event.streams[0]);
            remoteAudio.srcObject = event.streams[0];
        }
    };
}


// 새로운 사용자가 방에 들어올 때 호출되는 함수
async function addPeer(peerId) {
    if (!remotePeers.includes(peerId)) {
        remotePeers.push(peerId);
        if (localStream) {
            localStream.getTracks().forEach(track => {
                initializePeerConnection(peerId);
                pcs[peerId].addTrack(track, localStream);
                console.log('Added local track to new peer:', track);
            });

            try {
                const offer = await pcs[peerId].createOffer();
                console.log('Created offer for new peer:', offer);
                await pcs[peerId].setLocalDescription(offer);
                console.log('Set local description for new peer:', pcs[peerId].localDescription);
                ws.send(JSON.stringify({ from: userId, to: peerId, sdp: pcs[peerId].localDescription }));
                console.log('Sent offer SDP to new peer:', pcs[peerId].localDescription, peerId);
            } catch (e) {
                console.error('Failed to create offer for new peer:', e);
            }
        }
    }
}

function hangup() {
    for (let peerId in pcs) {
        if (pcs[peerId]) {
            pcs[peerId].close();
            pcs[peerId] = null;
            console.log('Peer connection closed for peer:', peerId);
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
