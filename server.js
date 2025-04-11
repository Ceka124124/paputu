
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinRoom', ({ roomId }) => {
        if (!rooms[roomId]) rooms[roomId] = [];
        socket.join(roomId);
    });

    socket.on('joinSeat', ({ seatId, userId }) => {
        const roomId = 'testRoom';
        if (rooms[roomId][seatId]) {
            socket.emit('seatTaken', { seatId });
        } else {
            rooms[roomId][seatId] = userId;
            io.to(roomId).emit('userJoined', { userId, seatId });
        }
    });

    socket.on('leaveRoom', ({ userId }) => {
        const roomId = 'testRoom';
        if (rooms[roomId]) {
            rooms[roomId] = rooms[roomId].map(uid => uid === userId ? null : uid);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
