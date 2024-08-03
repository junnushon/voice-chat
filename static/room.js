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
let connectedPeers = [];
console.log('userId:', userId);
console.log('App version: 1.0.27');

const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
];

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
    await setupWebSocket();
    chatInput.focus(); // 포커스를 텍스트 입력창으로 옮기기
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

    if (pcs[peerId] && pcs[peerId].iceConnectionState === 'connected') {
        console.log(`Peer ${peerId} is already connected. Ignoring ICE candidate.`);
        return;
    }

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
        if (rtcSessionDescription.type === 'offer') {
            if (currentState !== 'stable' && currentState !== 'have-local-offer') {
                console.log(`Unexpected offer in state ${currentState}. Ignoring.`);
                return;
            }

            await pcs[peerId].setRemoteDescription(rtcSessionDescription);
            console.log(`Remote description (offer) set for peer ${peerId}`);
            
            if (localStream) {
                localStream.getTracks().forEach(track => {
                    pcs[peerId].addTrack(track, localStream);
                    console.log('Added local track to peer:', track);
                });
            }

            const answer = await pcs[peerId].createAnswer();
            await pcs[peerId].setLocalDescription(answer);
            console.log('Created and sent Answer:', answer);
            ws.send(JSON.stringify({ from: userId, to: peerId, sdp: pcs[peerId].localDescription }));
        } else if (rtcSessionDescription.type === 'answer') {
            if (currentState !== 'have-local-offer') {
                console.log(`Unexpected answer in state ${currentState}. Ignoring.`);
                return;
            }

            await pcs[peerId].setRemoteDescription(rtcSessionDescription);
            console.log(`Remote description (answer) set for peer ${peerId}`);
        } else {
            console.log(`Unexpected SDP type: ${rtcSessionDescription.type}`);
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
    let wsUrl = `ws://localhost:8000/ws?room=${roomId}&user_id=${userId}`;
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
        } else if (data.to === userId) { // 목적지가 자신일 때만 처리
            if (data.sdp) {
                await handleRemoteDescription(data.from, data.sdp);
            } else if (data.candidate) {
                await handleIceCandidate(data.from, data.candidate);
            }
        } else if (data.type === 'chat') {
            if (data.nickname !== nickname) {
                addChatMessage(data.message, data.nickname);
            }
        } else if (data.type === 'new_peer') {
            if (userId !== data.peerId) {
                await addPeer(data.peerId, true); // 새로운 peer에게만 offer를 보냄
            }
        } else if (data.type === 'peer_left') {
            if (userId !== data.peerId) {
                console.log(`Peer ${data.peerId} has left the room`);
                hangup(data.peerId);
                connectedPeers = connectedPeers.filter(id => id !== data.peerId);
            }
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
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 16000, // 음질 낮추기
                channelCount: 1,
                bitrate: 32000 // 비트레이트 낮추기
            }
        });
        localStream = stream;
        console.log('Local stream started:', stream);
    } catch (e) {
        console.error('Error accessing media devices:', e);
    }
}

function initializePeerConnection(peerId) {
    if (pcs[peerId]) return;

    console.log(`Initializing peer connection for ${peerId}`);
    pcs[peerId] = new RTCPeerConnection({ iceServers });

    pcs[peerId].onicecandidate = e => {
        if (e.candidate) {
            console.log(`Generated ICE candidate for ${peerId}:`, e.candidate);
            ws.send(JSON.stringify({ from: userId, to: peerId, candidate: e.candidate }));
        }
    };

    pcs[peerId].oniceconnectionstatechange = async e => {
        console.log(`ICE connection state change for ${peerId}:`, pcs[peerId].iceConnectionState);
        if (pcs[peerId].iceConnectionState === 'disconnected' || pcs[peerId].iceConnectionState === 'failed') {
            console.log(`Connection to peer ${peerId} lost. Attempting to reconnect...`);
            await reconnectPeer(peerId);
        } else if (pcs[peerId].iceConnectionState === 'closed') {
            console.log(`ICE connection closed for peer ${peerId}`);
            hangup(peerId);
        }
    };

    pcs[peerId].onsignalingstatechange = e => {
        console.log(`Signaling state change for ${peerId}:`, pcs[peerId].signalingState);
    };

    pcs[peerId].onconnectionstatechange = e => {
        console.log(`Peer connection state change for ${peerId}:`, pcs[peerId].connectionState);
        if (pcs[peerId].connectionState === 'disconnected' || pcs[peerId].connectionState === 'failed') {
            console.log(`Peer connection state is ${pcs[peerId].connectionState} for ${peerId}. Cleaning up.`);
            hangup(peerId);
        }
    };

    pcs[peerId].ontrack = event => {
        if (event.streams && event.streams[0]) {
            console.log(`Received remote stream from ${peerId}:`, event.streams[0]);
            if (peerId !== userId) {
                remoteAudio.srcObject = event.streams[0];
            }
        }
    };
}


async function reconnectPeer(peerId) {
    if (!pcs[peerId]) {
        initializePeerConnection(peerId);
    }

    try {
        const offer = await pcs[peerId].createOffer();
        console.log(`Created offer for peer ${peerId}:`, offer);
        await pcs[peerId].setLocalDescription(offer);
        console.log(`Set local description for peer ${peerId}:`, pcs[peerId].localDescription);
        ws.send(JSON.stringify({ from: userId, to: peerId, sdp: pcs[peerId].localDescription }));
        console.log(`Sent offer SDP to peer ${peerId}`);
    } catch (e) {
        console.error(`Failed to create offer for peer ${peerId}:`, e);
    }
}

async function reconnectAllPeers() {
    console.log('Reconnecting all peers');
    for (let i = 0; i < connectedPeers.length; i++) {
        const peerId = connectedPeers[i];
        if (peerId !== userId) {
            try {
                const offer = await pcs[peerId].createOffer();
                console.log(`Created offer for peer ${peerId}:`, offer);
                await pcs[peerId].setLocalDescription(offer);
                console.log(`Set local description for peer ${peerId}:`, pcs[peerId].localDescription);
                ws.send(JSON.stringify({ from: userId, to: peerId, sdp: pcs[peerId].localDescription }));
                console.log(`Sent offer SDP to peer ${peerId}`);
            } catch (e) {
                console.error(`Failed to create offer for peer ${peerId}:`, e);
            }
        }
    }
}


async function addPeer(peerId, sendOffer = false) {
    console.log(`Adding new peer: ${peerId}`);
    if (!connectedPeers.includes(peerId)) {
        connectedPeers.push(peerId);
        initializePeerConnection(peerId);

        if (localStream) {
            localStream.getTracks().forEach(track => {
                pcs[peerId].addTrack(track, localStream);
                console.log(`Added local track to peer ${peerId}:`, track);
            });
        }

        if (sendOffer) {
            try {
                const offer = await pcs[peerId].createOffer();
                console.log(`Created offer for peer ${peerId}:`, offer);
                await pcs[peerId].setLocalDescription(offer);
                console.log(`Set local description for peer ${peerId}:`, pcs[peerId].localDescription);
                ws.send(JSON.stringify({ from: userId, to: peerId, sdp: pcs[peerId].localDescription }));
                console.log(`Sent offer SDP to peer ${peerId}`);
            } catch (e) {
                console.error(`Failed to create offer for peer ${peerId}:`, e);
            }
        }

        if (connectedPeers.length === 3) {
            // Disconnect peers 1 and 2
            let peer1 = connectedPeers[0];
            let peer2 = connectedPeers[1];
            hangup(peer1);
            hangup(peer2);

            // Reinitialize and reconnect peers 1 and 2
            initializePeerConnection(peer1);
            initializePeerConnection(peer2);

            if (localStream) {
                localStream.getTracks().forEach(track => {
                    pcs[peer1].addTrack(track, localStream);
                    pcs[peer2].addTrack(track, localStream);
                });
            }

            try {
                const offer = await pcs[peer1].createOffer();
                await pcs[peer1].setLocalDescription(offer);
                ws.send(JSON.stringify({ from: userId, to: peer2, sdp: pcs[peer1].localDescription }));
            } catch (e) {
                console.error(`Failed to create offer for peer ${peer1}:`, e);
            }
        }
    } else {
        console.log(`Peer ${peerId} already exists`);
    }
}


function hangup(peerId) {
    if (pcs[peerId]) {
        pcs[peerId].close();
        delete pcs[peerId];
        console.log(`Peer connection closed for peer: ${peerId}`);
    }
}

function leaveRoom() {
    for (let peerId in pcs) {
        hangup(peerId);
    }
    ws.send(JSON.stringify({ type: 'peer_left', peerId: userId }));
    window.location.href = '/';
}

function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        // Add message locally first
        addChatMessage(message, nickname, true);

        // Send message to others via WebSocket
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
