const socket = io();
let localStream;
const constraints = { audio: true, video: false };
let currentSeat = null;
let microphoneEnabled = false;

document.getElementById('start-button').onclick = startChat;
document.getElementById('leave-button').onclick = leaveChat;
document.getElementById('microphone-icon').onclick = toggleMute; // Mikrofon simgesine tıklama işlevi

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
    for (let i = 0; i < 6; i++) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('seat-wrapper');

        const seat = document.createElement('div');
        seat.classList.add('seat');
        seat.id = `seat-${i}`;
        seat.onclick = () => joinSeat(i);

        const label = document.createElement('div');
        label.classList.add('seat-label');
        label.textContent = `Koltuk ${i + 1}`;

        wrapper.appendChild(seat);
        wrapper.appendChild(label);
        seatsContainer.appendChild(wrapper);
    }
}

function joinSeat(seatId) {
    if (currentSeat === seatId) return;
    socket.emit('joinSeat', { seatId, userId: socket.id });
}

socket.on('userJoined', (data) => {
    const allSeats = document.querySelectorAll('.seat');
    allSeats.forEach(seat => seat.classList.remove('taken'));

    data.allSeats.forEach((userId, index) => {
        if (userId && userId !== socket.id) {
            const seat = document.getElementById(`seat-${index}`);
            if (seat) seat.classList.add('taken');
        }
        if (userId === socket.id) {
            currentSeat = index;
        }
    });
});

socket.on('seatTaken', (data) => {
    alert(`Koltuk ${data.seatId + 1} zaten dolu.`);
});

function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        microphoneEnabled = !microphoneEnabled;

        // Mikrofon simgesi değişimi
        const microphoneIcon = document.getElementById('microphone-icon');
        if (microphoneEnabled) {
            microphoneIcon.src = 'public/microphone-on.png';
        } else {
            microphoneIcon.src = 'public/microphone-off.png';
        }
    }
}

function leaveChat() {
    socket.emit('leaveRoom', { userId: socket.id });
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
}
