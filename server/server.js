const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mediasoup = require('mediasoup');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    cors: {
      origin: process.env.FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true
    }
  }
});

let worker;
let rooms = {}; // roomId -> { router, peers: { peerId: { transports, producers, consumers } } }

// Media codecs required for WebRTC audio/video
const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000
    }
  }
];

async function createWorker() {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: 2000,
    rtcMaxPort: 10000,
  });

  worker.on('died', () => {
    console.error('Mediasoup worker died');
    process.exit(1);
  });
}

app.get('/', (req, res) => {
  res.send('RTC Server Running');
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 1. Join Room & Return Router RTP Capabilities
  socket.on('joinRoom', async ({ roomId, mediaState }, callback) => {
    try {
      if (!worker) {
        console.error('Mediasoup worker is not initialized yet');
        return callback({ error: 'Worker not ready' });
      }

      socket.roomId = roomId;
      await socket.join(roomId);

      if (!rooms[roomId]) {
        const router = await worker.createRouter({ mediaCodecs });
        rooms[roomId] = { router, peers: {} };
      }

      rooms[roomId].peers[socket.id] = {
        transports: {},
        producers: {},
        consumers: {},
        mediaState: mediaState || { video: true, audio: true }
      };

      socket.to(roomId).emit('user-joined', {
        userId: socket.id,
        mediaState: mediaState || { video: true, audio: true }
      });

      const router = rooms[roomId].router;
      const participants = Object.keys(rooms[roomId].peers);

      const peerMediaStates = {};
      for (const peerId in rooms[roomId].peers) {
        peerMediaStates[peerId] = rooms[roomId].peers[peerId].mediaState || { video: true, audio: true };
      }

      callback({ rtpCapabilities: router.rtpCapabilities, participants, peerMediaStates });
    } catch (err) {
      console.error('[joinRoom] Error:', err);
      callback({ error: err.message });
    }
  });

  // 2. Create WebRTC Transport (For Sending or Receiving)
  socket.on('createWebRtcTransport', async ({ sender, hostname }, callback) => {
    try {
      if (!socket.roomId || !rooms[socket.roomId]) {
        console.warn(`[createWebRtcTransport] Room not found for socket ${socket.id}`);
        return callback({ error: 'Room not found' });
      }
      const room = rooms[socket.roomId];
      const peer = room.peers[socket.id];
      if (!peer) {
        console.warn(`[createWebRtcTransport] Peer not found for socket ${socket.id} in room ${socket.roomId}`);
        return callback({ error: 'Peer not registered' });
      }

      const router = room.router;

      // Dynamically bind to the exact interface IP the client is using to connect
      let localIp = '127.0.0.1';

      if (hostname === '192.168.56.1') {
        localIp = '192.168.56.1';
      } else if (hostname === '10.102.85.88') {
        localIp = '10.102.85.88';
      } else if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        localIp = hostname;
      }

      const transport = await router.createWebRtcTransport({
        listenIps: [
          {
            ip: '0.0.0.0',
            announcedIp: process.env.ANNOUNCED_IP
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      transport.on('dtlsstatechange', dtlsState => {
        if (dtlsState === 'closed') transport.close();
      });

      transport.on('close', () => {
        console.log('transport closed');
      });

      // Store the transport safely
      peer.transports[transport.id] = transport;

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (err) {
      console.error('[createWebRtcTransport] Error:', err);
      callback({ error: err.message });
    }
  });

  // 3. Connect Transport
  socket.on('transport-connect', async ({ transportId, dtlsParameters }, callback) => {
    try {
      if (!socket.roomId || !rooms[socket.roomId] || !rooms[socket.roomId].peers[socket.id]) {
        return callback({ error: 'Session not active' });
      }
      const transport = rooms[socket.roomId].peers[socket.id].transports[transportId];
      if (!transport) {
        return callback({ error: 'Transport not found' });
      }
      await transport.connect({ dtlsParameters });
      callback();
    } catch (err) {
      console.error('[transport-connect] Error:', err);
      callback({ error: err.message });
    }
  });

  // 4. Produce Media (Sender)
  socket.on('transport-produce', async ({ transportId, kind, rtpParameters }, callback) => {
    try {
      if (!socket.roomId || !rooms[socket.roomId] || !rooms[socket.roomId].peers[socket.id]) {
        return callback({ error: 'Session not active' });
      }
      const peer = rooms[socket.roomId].peers[socket.id];
      const transport = peer.transports[transportId];
      if (!transport) {
        return callback({ error: 'Transport not found' });
      }

      const producer = await transport.produce({ kind, rtpParameters });

      peer.producers[producer.id] = producer;

      producer.on('transportclose', () => {
        producer.close();
      });

      // Broadcast to others in the room that a new producer is available
      socket.to(socket.roomId).emit('new-producer', {
        producerId: producer.id,
        peerId: socket.id,
        kind: producer.kind
      });

      callback({ id: producer.id });
    } catch (err) {
      console.error('[transport-produce] Error:', err);
      callback({ error: err.message });
    }
  });

  // 5. Consume Media (Receiver)
  socket.on('consume', async ({ rtpCapabilities, transportId, producerId }, callback) => {
    try {
      if (!socket.roomId || !rooms[socket.roomId]) {
        return callback({ error: 'Room not found' });
      }
      const room = rooms[socket.roomId];
      const peer = room.peers[socket.id];
      if (!peer) {
        return callback({ error: 'Peer not found' });
      }
      const router = room.router;
      const transport = peer.transports[transportId];
      if (!transport) {
        return callback({ error: 'Transport not found' });
      }

      if (!router.canConsume({ producerId, rtpCapabilities })) {
        console.error('Cannot consume');
        return callback({ error: 'cannot consume' });
      }

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true // Must be paused initially until frontend resumes
      });

      peer.consumers[consumer.id] = consumer;

      consumer.on('transportclose', () => {
        consumer.close();
      });

      consumer.on('producerclose', () => {
        socket.emit('producer-closed', { producerId });
        consumer.close();
      });

      callback({
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (err) {
      console.error('[consume] Error:', err);
      callback({ error: err.message });
    }
  });

  socket.on('resume-consumer', async ({ consumerId }, callback) => {
    try {
      if (socket.roomId && rooms[socket.roomId] && rooms[socket.roomId].peers[socket.id]) {
        const consumer = rooms[socket.roomId].peers[socket.id].consumers[consumerId];
        if (consumer) {
          await consumer.resume();
        }
      }
      if (callback) callback();
    } catch (err) {
      console.error('[resume-consumer] Error:', err);
      if (callback) callback({ error: err.message });
    }
  });

  socket.on('pause-consumer', async ({ consumerId }, callback) => {
    try {
      if (socket.roomId && rooms[socket.roomId] && rooms[socket.roomId].peers[socket.id]) {
        const consumer = rooms[socket.roomId].peers[socket.id].consumers[consumerId];
        if (consumer) {
          await consumer.pause();
        }
      }
      if (callback) callback();
    } catch (err) {
      console.error('[pause-consumer] Error:', err);
      if (callback) callback({ error: err.message });
    }
  });

  // 6. Get Existing Producers
  socket.on('getProducers', (data, callback) => {
    try {
      const producersList = [];
      if (socket.roomId && rooms[socket.roomId]) {
        const room = rooms[socket.roomId];

        for (const peerId in room.peers) {
          if (peerId !== socket.id) {
            const peerProducers = room.peers[peerId].producers;
            for (const producerId in peerProducers) {
              producersList.push({
                producerId: producerId,
                peerId: peerId,
                kind: peerProducers[producerId].kind
              });
            }
          }
        }
      }
      callback(producersList);
    } catch (err) {
      console.error('[getProducers] Error:', err);
      callback([]);
    }
  });

  // Relay media states (camera off/mic off) since SFU doesn't do UI state
  socket.on('toggle-media', (payload) => {
    if (socket.roomId && rooms[socket.roomId]) {
      const peer = rooms[socket.roomId].peers[socket.id];
      if (peer) {
        peer.mediaState = {
          ...(peer.mediaState || { video: true, audio: true }),
          [payload.type]: !payload.isOff
        };
      }
      socket.to(socket.roomId).emit('toggle-media', payload);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (socket.roomId && rooms[socket.roomId]) {
      const room = rooms[socket.roomId];
      const peer = room.peers[socket.id];
      if (peer) {
        // Cleanup all transports (this cleans up producers and consumers too)
        for (const transportId in peer.transports) {
          peer.transports[transportId].close();
        }
        delete room.peers[socket.id];
      }

      socket.to(socket.roomId).emit('user-disconnected', socket.id);
    }
  });
});

(async () => {
  try {
    await createWorker();
    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      console.log(`SFU Signalling server is running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start SFU Signalling server:', err);
    process.exit(1);
  }
})();
