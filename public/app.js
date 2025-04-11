
const socket = io();
let localStream;
const constraints = { audio: true, video: false };

document.getElementById('start-button').onclick = startChat;
document.getElementById('mute-button').onclick = toggleMute;
document.getElementById('leave-button').onclick = leaveChat;

async function startChat() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        socket.emit('joinRoom', { roomId: 'testRoom' });
        displaySeats();
    } catch (err) {
        console.error('Media Error:', err);
    }
}

function displaySeats() {
    const seatsContainer = document.getElementById('seats-container');
    seatsContainer.innerHTML = "";
    for (let i = 0; i < 5; i++) {
        let seat = document.createElement('div');
        seat.classList.add('seat');
        seat.innerHTML = `Koltuk ${i + 1}`;
        seat.onclick = () => joinSeat(i);
        seatsContainer.appendChild(seat);
    }
}

function joinSeat(seatId) {
    socket.emit('joinSeat', { seatId, userId: socket.id });
}

socket.on('userJoined', (data) => {
    console.log('User Joined:', data);
});

socket.on('seatTaken', (data) => {
    alert(`Koltuk ${data.seatId} zaten dolu.`);
});

function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
    }
}

function leaveChat() {
    socket.emit('leaveRoom', { userId: socket.id });
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
}
