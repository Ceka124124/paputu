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

    socket.on('joinRoom', ({ roomId, userName }) => {
        // Oda yoksa, oda oluşturuluyor
        if (!rooms[roomId]) {
            rooms[roomId] = {
                seats: new Array(6).fill(null),
                users: {}
            };
        }

        // Kullanıcıya oda ve adı ile birlikte katılım sağlanıyor
        rooms[roomId].users[socket.id] = userName;
        socket.join(roomId);
        io.to(roomId).emit('userJoined', { allSeats: rooms[roomId].seats });

        console.log(`${userName} katıldı: ${socket.id}`);
    });

    socket.on('joinSeat', ({ seatId, userId }) => {
        const roomId = 'testRoom';
        if (!rooms[roomId]) rooms[roomId] = { seats: new Array(6).fill(null) };

        // Koltuk doluysa uyarı gönderiyoruz
        if (rooms[roomId].seats[seatId] && rooms[roomId].seats[seatId] !== userId) {
            socket.emit('seatTaken', { seatId });
            return;
        }

        // Koltuktan çıkıp yeni koltuğa geçiş işlemi
        for (let i = 0; i < rooms[roomId].seats.length; i++) {
            if (rooms[roomId].seats[i] === userId) {
                rooms[roomId].seats[i] = null;
            }
        }

        rooms[roomId].seats[seatId] = userId;
        io.to(roomId).emit('userJoined', { allSeats: rooms[roomId].seats });
    });

    socket.on('leaveRoom', ({ userId }) => {
        const roomId = 'testRoom';
        if (rooms[roomId]) {
            rooms[roomId].seats = rooms[roomId].seats.map(uid => uid === userId ? null : uid);
            delete rooms[roomId].users[userId];
            io.to(roomId).emit('userJoined', { allSeats: rooms[roomId].seats });
        }
    });

    socket.on('disconnect', () => {
        const roomId = 'testRoom';
        if (rooms[roomId]) {
            rooms[roomId].seats = rooms[roomId].seats.map(uid => uid === socket.id ? null : uid);
            delete rooms[roomId].users[socket.id];
            io.to(roomId).emit('userJoined', { allSeats: rooms[roomId].seats });
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
