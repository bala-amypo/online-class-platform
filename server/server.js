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
    origin: '*',
    methods: ['GET', 'POST']
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
createWorker();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 1. Join Room & Return Router RTP Capabilities
  socket.on('joinRoom', async ({ roomId }, callback) => {
    socket.roomId = roomId;
    socket.join(roomId);

    if (!rooms[roomId]) {
      const router = await worker.createRouter({ mediaCodecs });
      rooms[roomId] = { router, peers: {} };
    }

    rooms[roomId].peers[socket.id] = {
      transports: {},
      producers: {},
      consumers: {}
    };

    socket.to(roomId).emit('user-joined', socket.id);

    const router = rooms[roomId].router;
    const participants = Object.keys(rooms[roomId].peers);
    callback({ rtpCapabilities: router.rtpCapabilities, participants });
  });

  // 2. Create WebRTC Transport (For Sending or Receiving)
  socket.on('createWebRtcTransport', async ({ sender }, callback) => {
    const router = rooms[socket.roomId].router;

    const transport = await router.createWebRtcTransport({
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp: '192.168.56.1' // Bind to the local IP you used previously
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

    // Store the transport
    rooms[socket.roomId].peers[socket.id].transports[transport.id] = transport;

    callback({
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    });
  });

  // 3. Connect Transport
  socket.on('transport-connect', async ({ transportId, dtlsParameters }, callback) => {
    const transport = rooms[socket.roomId].peers[socket.id].transports[transportId];
    await transport.connect({ dtlsParameters });
    callback();
  });

  // 4. Produce Media (Sender)
  socket.on('transport-produce', async ({ transportId, kind, rtpParameters }, callback) => {
    const transport = rooms[socket.roomId].peers[socket.id].transports[transportId];
    const producer = await transport.produce({ kind, rtpParameters });

    rooms[socket.roomId].peers[socket.id].producers[producer.id] = producer;

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
  });

  // 5. Consume Media (Receiver)
  socket.on('consume', async ({ rtpCapabilities, transportId, producerId }, callback) => {
    const router = rooms[socket.roomId].router;
    const transport = rooms[socket.roomId].peers[socket.id].transports[transportId];

    if (!router.canConsume({ producerId, rtpCapabilities })) {
      console.error('Cannot consume');
      return callback({ error: 'cannot consume' });
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true // Must be paused initially until frontend resumes
    });

    rooms[socket.roomId].peers[socket.id].consumers[consumer.id] = consumer;

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
  });

  socket.on('resume-consumer', async ({ consumerId }, callback) => {
    const consumer = rooms[socket.roomId].peers[socket.id].consumers[consumerId];
    if (consumer) {
      await consumer.resume();
    }
    if (callback) callback();
  });

  socket.on('pause-consumer', async ({ consumerId }, callback) => {
    const consumer = rooms[socket.roomId].peers[socket.id].consumers[consumerId];
    if (consumer) {
      await consumer.pause();
    }
    if (callback) callback();
  });

  // 6. Get Existing Producers
  socket.on('getProducers', (data, callback) => {
    const producersList = [];
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
    callback(producersList);
  });

  // Relay media states (camera off/mic off) since SFU doesn't do UI state
  socket.on('toggle-media', (payload) => {
    if (socket.roomId) {
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`SFU Signalling server is running on port ${PORT}`);
});
