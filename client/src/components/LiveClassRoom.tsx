'use client';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Device } from 'mediasoup-client';
import { useRouter } from 'next/navigation';
import { useSpeakingDetection } from '../hooks/useSpeakingDetection';
import { ClassroomHeader } from './ClassroomHeader';
import { ClassroomFooter } from './ClassroomFooter';
import { LocalVideoComponent } from './LocalVideoComponent';
import { VideoComponent } from './VideoComponent';
import { AudioParticipant } from './AudioParticipant';
import { Users } from 'lucide-react';

export default function LiveClassRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [stream, setStream] = useState<MediaStream | null>(null);

  // peers will store MediaStreams constructed from Mediasoup Consumers
  const [peers, setPeers] = useState<{ [id: string]: MediaStream }>({});
  const [peerMediaStates, setPeerMediaStates] = useState<{ [id: string]: { video: boolean, audio: boolean } }>({});
  const [participants, setParticipants] = useState<Set<string>>(new Set());

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const isSpeaking = useSpeakingDetection(stream, isMuted);

  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);

  // Mediasoup refs
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const pendingProducers = useRef<{ producerId: string, peerId: string }[]>([]);

  useEffect(() => {
    const socket = io('http://192.168.56.1:3001');
    socketRef.current = socket;

    const startSFU = async () => {
      // 1. Get Local Media
      const mediaConstraints = {
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: true
      };
      const localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      setStream(localStream);
      if (videoRef.current) videoRef.current.srcObject = localStream;

      // 2. Join Room & Setup Device
      socket.emit('joinRoom', { roomId }, async ({ rtpCapabilities, participants: existingParticipants }: any) => {
        setParticipants(new Set(existingParticipants));
        const device = new Device();
        deviceRef.current = device;
        await device.load({ routerRtpCapabilities: rtpCapabilities });

        // 3. Create Send Transport
        socket.emit('createWebRtcTransport', { sender: true }, async (params: any) => {
          const sendTransport = device.createSendTransport(params);
          sendTransportRef.current = sendTransport;

          sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            socket.emit('transport-connect', { transportId: sendTransport.id, dtlsParameters }, callback);
          });

          sendTransport.on('produce', async (parameters, callback, errback) => {
            socket.emit('transport-produce', {
              transportId: sendTransport.id,
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters
            }, ({ id }: any) => {
              callback({ id });
            });
          });

          // Produce Local Audio and Video
          const audioTrack = localStream.getAudioTracks()[0];
          const videoTrack = localStream.getVideoTracks()[0];

          if (audioTrack) {
            await sendTransport.produce({ track: audioTrack });
          }

          if (videoTrack) {
            // Simulcast: send 3 different video quality layers so SFU can dynamically choose based on network
            await sendTransport.produce({
              track: videoTrack,
              encodings: [
                { maxBitrate: 100000, scaleResolutionDownBy: 4 }, // Low quality
                { maxBitrate: 300000, scaleResolutionDownBy: 2 }, // Medium quality
                { maxBitrate: 900000, scaleResolutionDownBy: 1 }  // High quality
              ],
              codecOptions: { videoGoogleStartBitrate: 1000 }
            });
          }
        });

        // 4. Create Receive Transport
        socket.emit('createWebRtcTransport', { sender: false }, async (params: any) => {
          const recvTransport = device.createRecvTransport(params);
          recvTransportRef.current = recvTransport;

          recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
            socket.emit('transport-connect', { transportId: recvTransport.id, dtlsParameters }, callback);
          });

          // Consume existing producers
          socket.emit('getProducers', {}, (producers: any[]) => {
            producers.forEach(p => consumeRemote(p.producerId, p.peerId, recvTransport, device));
            
            const existingIds = new Set(producers.map(p => p.producerId));
            pendingProducers.current.forEach(p => {
              if (!existingIds.has(p.producerId)) {
                consumeRemote(p.producerId, p.peerId, recvTransport, device);
              }
            });
            pendingProducers.current = [];
          });
        });
      });
    };

    startSFU();

    const consumeRemote = (producerId: string, peerId: string, transport: any, device: Device) => {
      socket.emit('consume', {
        rtpCapabilities: device.rtpCapabilities,
        transportId: transport.id,
        producerId
      }, async ({ id, kind, rtpParameters, error }: any) => {
        if (error) return;
        const consumer = await transport.consume({ id, producerId, kind, rtpParameters });
        const track = consumer.track;

        setPeers(prev => {
          const existingStream = prev[peerId] || new MediaStream();
          const newStream = new MediaStream(existingStream.getTracks());
          newStream.addTrack(track);
          return { ...prev, [peerId]: newStream };
        });

        socket.emit('resume-consumer', { consumerId: id }, () => { });
      });
    };

    socket.on('new-producer', ({ producerId, peerId }) => {
      if (recvTransportRef.current && deviceRef.current) {
        consumeRemote(producerId, peerId, recvTransportRef.current, deviceRef.current);
      } else {
        pendingProducers.current.push({ producerId, peerId });
      }
    });

    socket.on('user-joined', (userId: string) => {
      setParticipants(prev => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    });

    socket.on('user-disconnected', (userId) => {
      setParticipants(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      setPeers((prev) => {
        const newPeers = { ...prev };
        delete newPeers[userId];
        return newPeers;
      });
      setPeerMediaStates((prev) => {
        const newStates = { ...prev };
        delete newStates[userId];
        return newStates;
      });
    });

    socket.on('producer-closed', ({ producerId }) => {
      // Complex to handle without storing consumers, but standard WebRTC automatically fires track.onended
    });

    socket.on('toggle-media', (payload: { userId: string, type: 'video' | 'audio', isOff: boolean }) => {
      setPeerMediaStates(prev => ({
        ...prev,
        [payload.userId]: {
          ...(prev[payload.userId] || { video: true, audio: true }),
          [payload.type]: !payload.isOff
        }
      }));
    });

    return () => {
      socket.disconnect();
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (sendTransportRef.current) sendTransportRef.current.close();
      if (recvTransportRef.current) recvTransportRef.current.close();
    };
  }, [roomId]);

  const toggleMute = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        if (socketRef.current) {
          socketRef.current.emit('toggle-media', { userId: socketRef.current.id, type: 'audio', isOff: !audioTrack.enabled });
        }
      }
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        if (socketRef.current) {
          socketRef.current.emit('toggle-media', { userId: socketRef.current.id, type: 'video', isOff: !videoTrack.enabled });
        }
      }
    }
  };

  const leaveRoom = () => {
    if (stream) stream.getTracks().forEach(track => track.stop());
    if (socketRef.current) socketRef.current.disconnect();
    router.push('/');
  };

  const handleSpeakingChange = useCallback((id: string, speaking: boolean) => {
    setActiveSpeakers(prev => {
      if (prev.has(id) === speaking) return prev;
      const next = new Set(prev);
      if (speaking) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const sortedRemoteParticipants = useMemo(() => {
    return Array.from(participants)
      .filter(p => p !== socketRef.current?.id)
      .sort((a, b) => {
        const aSpeaking = activeSpeakers.has(a);
        const bSpeaking = activeSpeakers.has(b);
        if (aSpeaking && !bSpeaking) return -1;
        if (!aSpeaking && bSpeaking) return 1;
        return 0;
      });
  }, [participants, activeSpeakers]);

  const displayParticipants = sortedRemoteParticipants.slice(0, 6);
  const hasOthers = sortedRemoteParticipants.length > 7;
  const othersCount = sortedRemoteParticipants.length - 6;

  const totalParticipants = Math.max(participants.size, Object.keys(peers).length + 1);
  const gridClass = "grid-cols-2 md:grid-cols-4 auto-rows-fr";

  return (
    <div className="flex flex-col h-screen bg-[#0a0f0d] font-sans text-green-50 overflow-hidden">
      <ClassroomHeader roomId={roomId} totalParticipants={totalParticipants} />

      <main className="flex-1 p-4 md:p-6 overflow-hidden relative">
        <div className={`grid gap-4 w-full h-full ${gridClass} transition-all duration-500 ease-in-out`}>
          <LocalVideoComponent 
            videoRef={videoRef} 
            isVideoOff={isVideoOff} 
            isMuted={isMuted} 
            isSpeaking={isSpeaking} 
          />

          {displayParticipants.map(peerId => (
            <VideoComponent
              key={peerId}
              stream={peers[peerId]}
              peerId={peerId}
              hasVideo={peerMediaStates[peerId]?.video ?? true}
              hasAudio={peerMediaStates[peerId]?.audio ?? true}
              isSpeaking={activeSpeakers.has(peerId)}
            />
          ))}

          {sortedRemoteParticipants.length === 7 && (
            <VideoComponent
              key={sortedRemoteParticipants[6]}
              stream={peers[sortedRemoteParticipants[6]]}
              peerId={sortedRemoteParticipants[6]}
              hasVideo={peerMediaStates[sortedRemoteParticipants[6]]?.video ?? true}
              hasAudio={peerMediaStates[sortedRemoteParticipants[6]]?.audio ?? true}
              isSpeaking={activeSpeakers.has(sortedRemoteParticipants[6])}
            />
          )}

          {hasOthers && (
            <div className="relative group rounded-3xl overflow-hidden bg-[#0d1411]/80 backdrop-blur-md shadow-xl border-2 border-green-900/30 flex flex-col items-center justify-center transition-all duration-300 hover:border-green-500/50 hover:bg-[#0d1411]">
               <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-4 border border-green-500/20 shadow-inner">
                  <Users size={32} className="text-green-500" />
               </div>
               <div className="text-center">
                  <span className="block text-2xl font-bold text-green-400">+{othersCount}</span>
                  <span className="text-xs font-medium text-green-600 uppercase tracking-widest">Participants</span>
               </div>
               <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
            </div>
          )}
        </div>

        {/* Hidden audio consumers for all participants to track speaking status */}
        <div className="hidden">
          {Array.from(participants).filter(p => p !== socketRef.current?.id).map(peerId => (
            <AudioParticipant
              key={peerId}
              peerId={peerId}
              stream={peers[peerId]}
              isMuted={!(peerMediaStates[peerId]?.audio ?? true)}
              onSpeakingChange={handleSpeakingChange}
            />
          ))}
        </div>
      </main>

      <ClassroomFooter 
        isMuted={isMuted} 
        isVideoOff={isVideoOff} 
        toggleMute={toggleMute} 
        toggleVideo={toggleVideo} 
        leaveRoom={leaveRoom} 
      />
    </div>
  );
}
