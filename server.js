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
        if (!rooms[roomId]) rooms[roomId] = new Array(6).fill(null);
        socket.join(roomId);
        io.to(roomId).emit('userJoined', { allSeats: rooms[roomId] });
    });

    socket.on('joinSeat', ({ seatId, userId }) => {
        const roomId = 'testRoom';
        if (!rooms[roomId]) rooms[roomId] = new Array(6).fill(null);

        if (rooms[roomId][seatId] && rooms[roomId][seatId] !== userId) {
            socket.emit('seatTaken', { seatId });
            return;
        }

        for (let i = 0; i < rooms[roomId].length; i++) {
            if (rooms[roomId][i] === userId) {
                rooms[roomId][i] = null;
            }
        }

        rooms[roomId][seatId] = userId;
        io.to(roomId).emit('userJoined', { allSeats: rooms[roomId] });
    });

    socket.on('leaveRoom', ({ userId }) => {
        const roomId = 'testRoom';
        if (rooms[roomId]) {
            rooms[roomId] = rooms[roomId].map(uid => uid === userId ? null : uid);
            io.to(roomId).emit('userJoined', { allSeats: rooms[roomId] });
        }
    });

    socket.on('disconnect', () => {
        const roomId = 'testRoom';
        if (rooms[roomId]) {
            rooms[roomId] = rooms[roomId].map(uid => uid === socket.id ? null : uid);
            io.to(roomId).emit('userJoined', { allSeats: rooms[roomId] });
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
