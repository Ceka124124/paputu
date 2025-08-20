// server.js
// Node.js + Express + Socket.IO ile "Çiz & Bul" (Pictionary tarzı) oyunu sunucusu
// Özellikler: Oda oluştur/katıl, metinli chat + tahmin, WebRTC sesli sohbet işaretleşmesi,
// TR/AZ kelime havuzları, 10 raund, skor tablosu. Demo amaçlı bellek‑içi kullanıcı yönetimi.

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ======= Demo Kullanıcı Yönetimi (In‑Memory) =======
// Not: Gerçekte bir veritabanı (örn. PostgreSQL, MongoDB) ve JWT kullanın.
const users = new Map(); // username => { passwordHash }

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, error: 'Eksik alan' });
    if (users.has(username)) return res.status(409).json({ ok: false, error: 'Kullanıcı var' });
    const passwordHash = await bcrypt.hash(password, 10);
    users.set(username, { passwordHash });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Sunucu hatası' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const u = users.get(username);
    if (!u) return res.status(404).json({ ok: false, error: 'Kullanıcı bulunamadı' });
    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) return res.status(401).json({ ok: false, error: 'Şifre yanlış' });
    // Demo: token yok, istemci socket.auth.username ile bağlanacak
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Sunucu hatası' });
  }
});

// ======= Kelime Havuzları (TR & AZ) =======
// Kategoriler: esyalar (eşyalar) ve meyveler
const WORDS = {
  tr: {
    esyalar: [
      'kalem','silgi','defter','kitap','masa','sandalye','bilgisayar','fare','klavye','telefon','kulaklık','lamba','kupa','şemsiye','cüzdan','ayakkabı','anahtar','çanta','pencere','kapı','televizyon','kumanda','priz','saat','tencere','tabak','çatal','bıçak','kaşık','fırça','çekiç','makas','balon','yastık','battaniye','halı','vazo','ayna','bisiklet'
    ],
    meyveler: [
      'elma','armut','muz','çilek','kiraz','kavun','karpuz','şeftali','üzüm','nar','portakal','mandalina','greyfurt','ananas','avokado','vişne','yabanmersini','ahududu','incir','hurma','dut','erik','ayva','limon'
    ],
  },
  az: {
    esyalar: [
      'qələm','pozən','dəftər','kitab','masa','stul','kompüter','siçan','klaviatura','telefon','qulaqcıq','lampa','fincan','çətir','pulqabı','ayaqqabı','açar','sumka','pəncərə','qapı','televizor','pult','rozetka','saat','qazan','boşqab','çəngəl','bıçaq','qaşıq','fırça','çəkic','qayçı','şar','yastıq','yorğan','xalı','vaza','güzgü','velosiped'
    ],
    meyveler: [
      'alma','armud','banan','çiyələk','albalı','qarpız','qovun','şaftalı','üzüm','nar','portağal','mandarin','qreyfrut','ananas','avokado','vişnə','yaban mersini','moruq','incir','xurma','tut','gavalı','heyva','limon'
    ],
  },
};

// ======= Oyun Durumları =======
const rooms = new Map();
/* Room yapısı:
roomId: {
  hostId: socket.id,
  language: 'tr' | 'az',
  category: 'esyalar' | 'meyveler',
  maxPlayers: number,
  players: Map<socketId, { username, score, guessed: boolean }>,
  round: 0,
  maxRounds: 10,
  drawerOrder: string[], // socketId dizisi
  currentWord: string | null,
  currentDrawer: string | null, // socketId
  roundEndsAt: number | null,
  chat: Array<{ from, text, ts }>,
}
*/

// Yardımcılar
function pickWord(lang, category) {
  const pool = WORDS[lang]?.[category] || [];
  const i = Math.floor(Math.random() * pool.length);
  return pool[i];
}

function maskWord(word) {
  return word.replace(/[^\s]/g, '•'); // harfleri noktala
}

function normalizeGuess(s, lang) {
  try {
    return s
      .trim()
      .toLocaleLowerCase(lang === 'az' ? 'az' : 'tr')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '');
  } catch {
    return s.trim().toLowerCase();
  }
}

function nextDrawerId(room) {
  if (!room.drawerOrder || room.drawerOrder.length === 0) {
    room.drawerOrder = Array.from(room.players.keys());
  }
  const next = room.drawerOrder.shift();
  room.drawerOrder.push(next);
  return next;
}

function broadcastRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const players = Array.from(room.players.entries()).map(([id, p]) => ({ id, username: p.username, score: p.score, guessed: p.guessed }));
  io.to(roomId).emit('room:state', {
    roomId,
    language: room.language,
    category: room.category,
    round: room.round,
    maxRounds: room.maxRounds,
    drawerId: room.currentDrawer,
    maskedWord: room.currentWord ? maskWord(room.currentWord) : null,
    roundEndsAt: room.roundEndsAt,
    players,
  });
}

function endRound(roomId, reason = 'time') {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit('round:end', { reason, word: room.currentWord });
  room.currentWord = null;
  room.currentDrawer = null;
  room.roundEndsAt = null;
  // reset guessed flags
  for (const p of room.players.values()) p.guessed = false;

  if (room.round >= room.maxRounds) {
    // Oyun bitti
    const results = Array.from(room.players.values())
      .map(p => ({ username: p.username, score: p.score }))
      .sort((a, b) => b.score - a.score);
    io.to(roomId).emit('game:over', { results });
    return;
  }

  setTimeout(() => startRound(roomId), 2500);
}

function startRound(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.round += 1;
  const drawerId = nextDrawerId(room);
  room.currentDrawer = drawerId;
  const word = pickWord(room.language, room.category);
  room.currentWord = word;
  room.roundEndsAt = Date.now() + 80 * 1000; // 80 saniye raund

  // Çizen kişiye kelimeyi gönder
  io.to(drawerId).emit('round:start:drawer', { word, round: room.round, maxRounds: room.maxRounds });
  // Odaya maske ve çizeni duyur
  io.to(roomId).except(drawerId).emit('round:start', {
    maskedWord: maskWord(word),
    drawerId,
    round: room.round,
    maxRounds: room.maxRounds,
    roundEndsAt: room.roundEndsAt,
  });
  broadcastRoomState(roomId);

  // Süre dolunca bitir
  setTimeout(() => {
    const r = rooms.get(roomId);
    if (!r || r.currentWord === null) return; // zaten bitmiş olabilir
    endRound(roomId, 'time');
  }, 80 * 1000 + 200);
}

// ======= Socket.IO Olayları =======
io.use((socket, next) => {
  // Basit kimlik: socket.handshake.auth.username ile gelir
  const { username } = socket.handshake.auth || {};
  if (!username) return next(new Error('Kimlik gerekli'));
  // Kayıtlı değilse demo amaçlı bağlanmaya izin verelim (veya users.has ile kontrol edin)
  socket.data.username = username;
  next();
});

io.on('connection', (socket) => {
  const username = socket.data.username;
  socket.emit('hello', { message: `Bağlandı: ${username}` });

  socket.on('room:create', ({ roomId, language = 'tr', category = 'esyalar', maxPlayers = 8 } = {}, cb) => {
    try {
      if (!roomId) roomId = Math.random().toString(36).slice(2, 8);
      if (rooms.has(roomId)) throw new Error('Oda zaten var');
      if (!WORDS[language] || !WORDS[language][category]) throw new Error('Dil/Kategori geçersiz');
      const room = {
        hostId: socket.id,
        language,
        category,
        maxPlayers,
        players: new Map(),
        round: 0,
        maxRounds: 10,
        drawerOrder: [],
        currentWord: null,
        currentDrawer: null,
        roundEndsAt: null,
        chat: [],
      };
      rooms.set(roomId, room);
      // otomatik katıl
      joinRoomInternal(socket, roomId);
      cb?.({ ok: true, roomId });
    } catch (e) {
      cb?.({ ok: false, error: e.message });
    }
  });

  socket.on('room:join', ({ roomId } = {}, cb) => {
    try {
      if (!rooms.has(roomId)) throw new Error('Oda yok');
      joinRoomInternal(socket, roomId);
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false, error: e.message });
    }
  });

  socket.on('game:start', ({ roomId } = {}, cb) => {
    try {
      const room = rooms.get(roomId);
      if (!room) throw new Error('Oda yok');
      if (socket.id !== room.hostId) throw new Error('Sadece host başlatabilir');
      if (room.players.size < 2) throw new Error('En az 2 oyuncu gerek');
      if (room.round > 0) throw new Error('Oyun zaten başladı');
      startRound(roomId);
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false, error: e.message });
    }
  });

  // Çizim verisi (canvas stroke vs.) sadece çizen kişiden kabul edilir
  socket.on('draw:data', ({ roomId, payload } = {}) => {
    const room = rooms.get(roomId);
    if (!room || room.currentDrawer !== socket.id) return;
    socket.to(roomId).emit('draw:data', payload);
  });

  // Chat ve tahmin
  socket.on('chat:send', ({ roomId, text } = {}) => {
    const room = rooms.get(roomId);
    if (!room || !text) return;
    const entry = { from: username, text: String(text).slice(0, 300), ts: Date.now() };
    room.chat.push(entry);
    io.to(roomId).emit('chat:new', entry);

    // Tahmin kontrolü (çizen tahmin edemez)
    if (room.currentWord && socket.id !== room.currentDrawer) {
      const guess = normalizeGuess(text, room.language);
      const target = normalizeGuess(room.currentWord, room.language);
      if (guess === target) {
        const p = room.players.get(socket.id);
        if (p && !p.guessed) {
          p.guessed = true;
          let award = 10;
          // erken tahmin daha yüksek puan (kalan süreye göre 5 ek)
          const remaining = Math.max(0, room.roundEndsAt - Date.now());
          award += Math.floor(5 * (remaining / (80 * 1000)));
          p.score += award;
          // çizen kişiye küçük puan
          const drawer = room.players.get(room.currentDrawer);
          if (drawer) drawer.score += 3;

          io.to(roomId).emit('guess:correct', { by: p.username, award, total: p.score });
          broadcastRoomState(roomId);

          // Herkes bildi mi?
          const allGuessed = Array.from(room.players.entries())
            .filter(([id]) => id !== room.currentDrawer)
            .every(([_, pl]) => pl.guessed);
          if (allGuessed) endRound(roomId, 'all-guessed');
        }
      }
    }
  });

  // WebRTC işaretleşmesi (sesli sohbet)
  // İstemci, aynı odadaki hedef socketId'ye teklif/yanıt/ice yollar
  socket.on('webrtc:offer', ({ roomId, targetId, offer }) => {
    if (!rooms.has(roomId)) return;
    socket.to(targetId).emit('webrtc:offer', { fromId: socket.id, offer });
  });
  socket.on('webrtc:answer', ({ roomId, targetId, answer }) => {
    if (!rooms.has(roomId)) return;
    socket.to(targetId).emit('webrtc:answer', { fromId: socket.id, answer });
  });
  socket.on('webrtc:ice', ({ roomId, targetId, candidate }) => {
    if (!rooms.has(roomId)) return;
    socket.to(targetId).emit('webrtc:ice', { fromId: socket.id, candidate });
  });

  socket.on('room:leave', ({ roomId } = {}) => {
    leaveRoomInternal(socket, roomId);
  });

  socket.on('disconnect', () => {
    // Socket ayrılırken bulunduğu tüm odalardan düşür
    for (const [roomId, room] of rooms.entries()) {
      if (room.players.has(socket.id)) leaveRoomInternal(socket, roomId, true);
    }
  });
});

function joinRoomInternal(socket, roomId) {
  const room = rooms.get(roomId);
  if (!room) throw new Error('Oda yok');
  if (room.players.size >= room.maxPlayers) throw new Error('Oda dolu');
  room.players.set(socket.id, { username: socket.data.username, score: 0, guessed: false });
  socket.join(roomId);
  io.to(roomId).emit('system', { text: `${socket.data.username} odaya katıldı` });
  broadcastRoomState(roomId);
}

function leaveRoomInternal(socket, roomId, silent = false) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.players.delete(socket.id);
  socket.leave(roomId);
  if (!silent) io.to(roomId).emit('system', { text: `${socket.data.username} odadan ayrıldı` });

  // Host ayrılırsa yeni host ata
  if (room.hostId === socket.id) {
    const nextHost = room.players.keys().next().value || null;
    room.hostId = nextHost;
  }

  // Çizen ayrılırsa raundu bitir
  if (room.currentDrawer === socket.id) {
    endRound(roomId, 'drawer-left');
  }

  // Oda boşsa sil
  if (room.players.size === 0) {
    rooms.delete(roomId);
  } else {
    broadcastRoomState(roomId);
  }
}

// ======= Sunucuyu Başlat =======
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Çiz-Bul sunucusu ${PORT} portunda çalışıyor`);
});
