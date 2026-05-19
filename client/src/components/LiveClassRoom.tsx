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
import { Users, Mic, MicOff, Camera, CameraOff, ChevronLeft, ChevronRight, Settings } from 'lucide-react';

export default function LiveClassRoom({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [stream, setStream] = useState<MediaStream | null>(null);

  // peers will store MediaStreams constructed from Mediasoup Consumers
  const [peers, setPeers] = useState<{ [id: string]: MediaStream }>({});
  const [peerMediaStates, setPeerMediaStates] = useState<{ [id: string]: { video: boolean, audio: boolean } }>({});
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [localSocketId, setLocalSocketId] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{ send: string, recv: string }>({ send: 'new', recv: 'new' });
  const [isMounted, setIsMounted] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [layoutStyle, setLayoutStyle] = useState<'sidebar' | 'paginated'>('paginated');
  const [currentPage, setCurrentPage] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLayoutDropdownOpen, setIsLayoutDropdownOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: string, message: string, type: 'join' | 'leave' }[]>([]);
  const [isJoining, setIsJoining] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);

  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const [orderedParticipants, setOrderedParticipants] = useState<string[]>([]);
  const isSpeaking = useSpeakingDetection(stream, isMuted);

  const videoNodeRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = useCallback((node: HTMLVideoElement | null) => {
    videoNodeRef.current = node;
    if (node && stream) {
      node.srcObject = stream;
    }
  }, [stream]);

  const socketRef = useRef<Socket | null>(null);

  // Mediasoup refs
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const pendingProducers = useRef<{ producerId: string, peerId: string }[]>([]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const defaultBackendUrl = `http://${hostname}:3001`;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || defaultBackendUrl;
    const socket = io(backendUrl);
    socketRef.current = socket;

    socket.on('connect', () => {
      setLocalSocketId(socket.id || null);
    });

    const triggerToast = (message: string, type: 'join' | 'leave') => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts(prev => {
        const next = [...prev, { id, message, type }];
        return next.slice(-4);
      });
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4500);
    };

    const startSFU = async () => {
      let localStream: MediaStream | null = null;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Secure context required for camera/microphone access. IP based access requires HTTPS or browser flag configuration.");
        }

        // 1. Get Local Media
        const mediaConstraints = {
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: true
        };
        localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

        // Disable tracks initially so user joins with camera off and muted by default
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) audioTrack.enabled = false;
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) videoTrack.enabled = false;

        setStream(localStream);
        if (videoNodeRef.current) videoNodeRef.current.srcObject = localStream;
      } catch (err: any) {
        console.warn("Could not get local media stream:", err);
        setMediaError(err.message || "Failed to access camera or microphone.");
        setIsVideoOff(true);
        setIsMuted(true);
      }

      // 2. Join Room & Setup Device
      socket.emit('joinRoom', { roomId, mediaState: { video: localStream ? !isVideoOff : false, audio: localStream ? !isMuted : false } }, async ({ rtpCapabilities, participants: existingParticipants, peerMediaStates: existingMediaStates }: any) => {
        setLocalSocketId(socket.id || null);
        setParticipants(new Set(existingParticipants));
        if (existingMediaStates) {
          setPeerMediaStates(existingMediaStates);
        }
        const device = new Device();
        deviceRef.current = device;
        await device.load({ routerRtpCapabilities: rtpCapabilities });

        // 3. Create Send Transport (Only if local stream is successfully acquired)
        if (localStream) {
          const activeStream = localStream;
          socket.emit('createWebRtcTransport', { sender: true, hostname }, async (params: any) => {
            const sendTransport = device.createSendTransport(params);
            sendTransportRef.current = sendTransport;

            sendTransport.on('connectionstatechange', (state: string) => {
              setConnectionStatus(prev => ({ ...prev, send: state }));
            });

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
            const audioTrack = activeStream.getAudioTracks()[0];
            const videoTrack = activeStream.getVideoTracks()[0];

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
        }

        // 4. Create Receive Transport (Always run so we can watch/hear other participants)
        socket.emit('createWebRtcTransport', { sender: false, hostname }, async (params: any) => {
          const recvTransport = device.createRecvTransport(params);
          recvTransportRef.current = recvTransport;

          recvTransport.on('connectionstatechange', (state: string) => {
            setConnectionStatus(prev => ({ ...prev, recv: state }));
          });

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
            setIsJoining(false);
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
        try {
          if (transport.closed) return;
          const consumer = await transport.consume({ id, producerId, kind, rtpParameters });
          const track = consumer.track;

          setPeers(prev => {
            const existingStream = prev[peerId] || new MediaStream();
            const newStream = new MediaStream(existingStream.getTracks());
            newStream.addTrack(track);
            return { ...prev, [peerId]: newStream };
          });

          // Ensure peer is in participants list so they are rendered
          setParticipants(prev => {
            if (prev.has(peerId)) return prev;
            const next = new Set(prev);
            next.add(peerId);
            return next;
          });

          socket.emit('resume-consumer', { consumerId: id }, () => { });
        } catch (err) {
          console.warn("Mediasoup consume failed during teardown:", err);
        }
      });
    };

    socket.on('new-producer', ({ producerId, peerId }) => {
      if (recvTransportRef.current && deviceRef.current) {
        consumeRemote(producerId, peerId, recvTransportRef.current, deviceRef.current);
      } else {
        pendingProducers.current.push({ producerId, peerId });
      }
    });

    socket.on('user-joined', (data: string | { userId: string, mediaState?: { video: boolean, audio: boolean } }) => {
      const userId = typeof data === 'string' ? data : data.userId;
      const mediaState = typeof data === 'string' ? undefined : data.mediaState;

      setParticipants(prev => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });

      if (mediaState) {
        setPeerMediaStates(prev => ({
          ...prev,
          [userId]: mediaState
        }));
      }

      triggerToast(`Student ${userId.substring(0, 4)} entered the classroom`, 'join');
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

      triggerToast(`Student ${userId.substring(0, 4)} left the classroom`, 'leave');
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
      // Add global listener to intercept and swallow asynchronous AwaitQueue promise rejections
      const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        if (event.reason && (
          event.reason.message === 'queue stopped' || 
          event.reason.name === 'AwaitQueueStoppedError' ||
          String(event.reason).includes('queue stopped')
        )) {
          event.preventDefault();
        }
      };
      
      if (typeof window !== 'undefined') {
        window.addEventListener('unhandledrejection', handleUnhandledRejection);
      }

      socket.disconnect();
      if (stream) stream.getTracks().forEach((track) => track.stop());
      
      try {
        if (sendTransportRef.current) {
          sendTransportRef.current.close();
        }
      } catch (err) {
        console.warn("Mediasoup send transport closed:", err);
      }

      try {
        if (recvTransportRef.current) {
          recvTransportRef.current.close();
        }
      } catch (err) {
        console.warn("Mediasoup recv transport closed:", err);
      }

      // Cleanup global interceptor once asynchronous event loop completes
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        }
      }, 1000);
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
    setIsLeaving(true);
    setTimeout(() => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (socketRef.current) socketRef.current.disconnect();
      router.push('/');
    }, 1200);
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

  const totalParticipants = Math.max(participants.size, Object.keys(peers).length + 1);

  // Synchronize orderedParticipants when participants join or leave
  useEffect(() => {
    const selfId = localSocketId || socketRef.current?.id;
    const remotePeers = Array.from(participants).filter(p => p !== selfId);
    
    setOrderedParticipants(prev => {
      // 1. Filter out any participants who left
      const filtered = prev.filter(p => remotePeers.includes(p));
      
      // 2. Add any new participants who joined
      const newPeers = remotePeers.filter(p => !filtered.includes(p));
      
      return [...filtered, ...newPeers];
    });
  }, [participants, localSocketId]);

  // Move speaking participants to the front of orderedParticipants in real-time
  // but let them stay at the front when they stop speaking!
  useEffect(() => {
    if (activeSpeakers.size === 0) return;
    
    setOrderedParticipants(prev => {
      const currentSpeakers = Array.from(activeSpeakers);
      
      // Filter out speakers from their current positions
      const nonSpeakers = prev.filter(p => !currentSpeakers.includes(p));
      
      // Filter the speakers who actually exist in our current remote list
      const validSpeakers = currentSpeakers.filter(p => prev.includes(p));
      
      // Put valid speakers at the very front
      return [...validSpeakers, ...nonSpeakers];
    });
  }, [activeSpeakers]);

  const sortedRemoteParticipants = orderedParticipants;

  // --- Sidebar Layout Calculations ---
  // Spotlight is the first remote participant if available, otherwise yourself (local)
  const spotlightPeerId = useMemo(() => {
    if (sortedRemoteParticipants.length > 0) {
      return sortedRemoteParticipants[0];
    }
    return null;
  }, [sortedRemoteParticipants]);

  // Sidebar side list items: Local Video, next remote participant if any, and "+X More" if length > 2
  const sidebarSidePeers = useMemo(() => {
    if (sortedRemoteParticipants.length > 1) {
      return [sortedRemoteParticipants[1]];
    }
    return [];
  }, [sortedRemoteParticipants]);

  const hasSidebarOthers = sortedRemoteParticipants.length > 2;
  const sidebarOthersCount = sortedRemoteParticipants.length - 2;

  // --- Paginated Layout Calculations ---
  const paginatedTilesList = useMemo(() => {
    return [
      { type: 'local', id: 'local' },
      ...sortedRemoteParticipants.map(peerId => ({ type: 'remote', id: peerId }))
    ];
  }, [sortedRemoteParticipants]);

  const totalPages = Math.ceil(paginatedTilesList.length / 12);
  const safeCurrentPage = Math.min(currentPage, Math.max(0, totalPages - 1));

  const pageTiles = useMemo(() => {
    return paginatedTilesList.slice(safeCurrentPage * 12, (safeCurrentPage + 1) * 12);
  }, [paginatedTilesList, safeCurrentPage]);

  const renderedTilesCount = pageTiles.length;

  let gridClass = "grid-cols-1 md:grid-cols-1 max-w-6xl mx-auto auto-rows-fr";
  if (renderedTilesCount === 2) {
    gridClass = "grid-cols-1 md:grid-cols-2 auto-rows-fr";
  } else if (renderedTilesCount >= 3 && renderedTilesCount <= 4) {
    gridClass = "grid-cols-2 md:grid-cols-2 auto-rows-fr";
  } else if (renderedTilesCount >= 5 && renderedTilesCount <= 9) {
    gridClass = "grid-cols-2 md:grid-cols-3 auto-rows-fr";
  } else if (renderedTilesCount >= 10 && renderedTilesCount <= 12) {
    gridClass = "grid-cols-2 md:grid-cols-4 auto-rows-fr";
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0f0d] font-sans text-green-50 overflow-hidden">
      {/* 1. Entrance / Joining Loader */}
      {isJoining && (
        <div className="fixed inset-0 bg-[#080d0b] z-[9999] flex flex-col items-center justify-center overflow-hidden">
          {/* Futuristic Scanning Tech Rings */}
          <div className="absolute w-[400px] h-[400px] rounded-full border border-green-500/5 animate-[ping_4s_infinite]" />
          <div className="absolute w-[600px] h-[600px] rounded-full border border-green-500/5 animate-[ping_6s_infinite]" />

          {/* Glowing central sphere with spinning rings */}
          <div className="relative flex items-center justify-center w-36 h-36">
            {/* Spinning Outer Ring */}
            <div className="absolute inset-0 rounded-full border border-dashed border-green-500/20 animate-spin" style={{ animationDuration: '12s' }} />
            
            {/* Spinning Inner Counter-Ring */}
            <div className="absolute inset-2 rounded-full border-2 border-dashed border-green-500/10 animate-spin" style={{ animationDuration: '6s', animationDirection: 'reverse' }} />

            {/* Glowing neon green center core */}
            <div className="w-24 h-24 rounded-full bg-[#0a1411]/90 border border-green-500/40 shadow-[0_0_50px_rgba(34,197,94,0.3)] flex flex-col items-center justify-center relative">
              {/* Laser vertical sweep inside the core */}
              <div className="absolute w-full h-0.5 bg-green-500/30 animate-[bounce_2s_infinite]" />
              
              <Users className="w-8 h-8 text-green-400 animate-pulse" />
            </div>
          </div>

          <div className="mt-8 text-center max-w-sm px-6 z-10">
            <h2 className="text-sm font-bold tracking-widest text-green-400 uppercase animate-pulse">
              Entering Classroom...
            </h2>
            <p className="text-[10px] text-green-700 font-mono tracking-wider uppercase mt-2 leading-relaxed">
              Connecting you to the live class
            </p>
            <div className="mt-4 flex items-center justify-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500/50 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-green-500/50 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-green-500/50 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      {/* 2. Departure / Leaving Loader */}
      {isLeaving && (
        <div className="fixed inset-0 bg-[#080d0b] z-[9999] flex flex-col items-center justify-center overflow-hidden">
          {/* Concentric red circles */}
          <div className="absolute w-[400px] h-[400px] rounded-full border border-red-500/5 animate-[ping_4s_infinite]" />

          {/* Central departure sphere */}
          <div className="relative flex items-center justify-center w-36 h-36">
            {/* Spinning Outer Ring */}
            <div className="absolute inset-0 rounded-full border border-dashed border-red-500/20 animate-spin" style={{ animationDuration: '10s' }} />

            {/* Glowing neon red center core */}
            <div className="w-24 h-24 rounded-full bg-[#140a0a]/90 border border-red-500/40 shadow-[0_0_50px_rgba(239,68,68,0.2)] flex flex-col items-center justify-center relative">
              <div className="absolute w-full h-0.5 bg-red-500/20 animate-[bounce_2s_infinite]" />
              <MicOff className="w-8 h-8 text-red-500 animate-pulse" />
            </div>
          </div>

          <div className="mt-8 text-center max-w-sm px-6 z-10">
            <h2 className="text-sm font-bold tracking-widest text-red-400 uppercase animate-pulse">
              Leaving Class...
            </h2>
            <p className="text-[10px] text-red-700 font-mono tracking-wider uppercase mt-2 leading-relaxed">
              Closing your connection safely
            </p>
            <div className="mt-4 flex items-center justify-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500/50 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-red-500/50 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-red-500/50 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}
      <ClassroomHeader
        roomId={roomId}
        totalParticipants={totalParticipants}
        onToggleSidebar={() => {
          setIsSidebarOpen(prev => !prev);
          setIsSettingsOpen(false);
        }}
      />

      <main className="flex-1 p-4 md:p-6 overflow-hidden relative flex flex-col md:flex-row gap-4 h-full w-full min-h-0">
        <div className="flex-1 min-h-0 flex flex-col relative h-full w-full">
        {mediaError && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/30 text-amber-200 px-4 py-3 rounded-2xl flex items-start space-x-3 text-xs md:text-sm shadow-lg max-w-2xl mx-auto z-50 relative shrink-0">
            <div className="font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-md uppercase text-[10px] tracking-wider mt-0.5 shrink-0">Security Alert</div>
            <div className="flex-1 text-left">
              <p className="font-semibold mb-1 text-amber-300">Camera & Microphone Blocked (Insecure Context)</p>
              <p className="text-[11px] md:text-xs text-amber-300/80 leading-relaxed">
                Browsers disable media capture on IP addresses by default. You can still watch the class! To turn on your camera/mic:
                <span className="block mt-1 font-medium text-amber-200">
                  1. Visit <code className="bg-amber-950/60 px-1 py-0.5 rounded text-amber-400 font-mono text-[11px] select-all">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>
                  <br />
                  2. Add <code className="bg-amber-950/60 px-1 py-0.5 rounded text-amber-400 font-mono text-[11px] select-all">http://{isMounted ? window.location.hostname : 'localhost'}:3000</code> to the list and set it to <strong className="text-amber-300">Enabled</strong>.
                  <br />
                  3. Relaunch your browser.
                </span>
              </p>
            </div>
          </div>
        )}
        {layoutStyle === 'paginated' ? (
          <div className="flex-1 w-full h-full max-h-full min-h-0 flex items-center justify-between relative group/arrows">
            {/* Left Page Arrow */}
            {totalPages > 1 && (
              <button
                disabled={safeCurrentPage === 0}
                onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                className={`absolute left-0 z-40 bg-black/60 hover:bg-green-500 hover:text-[#070a09] text-green-500 border border-green-950/40 p-3 rounded-full transition-all duration-300 backdrop-blur-md shadow-2xl flex items-center justify-center ${safeCurrentPage === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100 group-hover/arrows:scale-105'
                  }`}
              >
                <ChevronLeft size={24} />
              </button>
            )}

            {/* Grid Container */}
            <div className={`grid gap-4 w-full h-full max-h-full flex-1 min-h-0 items-center justify-center justify-items-center content-center ${gridClass} transition-all duration-500 ease-in-out px-10`}>
              {pageTiles.map(tile => {
                if (tile.type === 'local') {
                  return (
                    <LocalVideoComponent
                      key="local"
                      videoRef={videoRef}
                      isVideoOff={isVideoOff}
                      isMuted={isMuted}
                      isSpeaking={isSpeaking}
                    />
                  );
                } else {
                  const peerId = tile.id;
                  return (
                    <VideoComponent
                      key={peerId}
                      stream={peers[peerId]}
                      peerId={peerId}
                      hasVideo={peerMediaStates[peerId]?.video ?? true}
                      hasAudio={peerMediaStates[peerId]?.audio ?? true}
                      isSpeaking={activeSpeakers.has(peerId)}
                    />
                  );
                }
              })}
            </div>

            {/* Right Page Arrow */}
            {totalPages > 1 && (
              <button
                disabled={safeCurrentPage === totalPages - 1}
                onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                className={`absolute right-0 z-40 bg-black/60 hover:bg-green-500 hover:text-[#070a09] text-green-500 border border-green-950/40 p-3 rounded-full transition-all duration-300 backdrop-blur-md shadow-2xl flex items-center justify-center ${safeCurrentPage === totalPages - 1 ? 'opacity-0 pointer-events-none' : 'opacity-100 group-hover/arrows:scale-105'
                  }`}
              >
                <ChevronRight size={24} />
              </button>
            )}
          </div>
        ) : (
          // Sidebar Stage Layout
          <div className="flex-1 w-full h-full max-h-full min-h-0 flex flex-col md:flex-row gap-4">
            {/* Spotlight Main Area (75% width on desktop) */}
            <div className="flex-[3] h-full w-full min-h-0 rounded-3xl overflow-hidden relative shadow-inner">
              {spotlightPeerId ? (
                <VideoComponent
                  key={spotlightPeerId}
                  stream={peers[spotlightPeerId]}
                  peerId={spotlightPeerId}
                  hasVideo={peerMediaStates[spotlightPeerId]?.video ?? true}
                  hasAudio={peerMediaStates[spotlightPeerId]?.audio ?? true}
                  isSpeaking={activeSpeakers.has(spotlightPeerId)}
                />
              ) : (
                <LocalVideoComponent
                  videoRef={videoRef}
                  isVideoOff={isVideoOff}
                  isMuted={isMuted}
                  isSpeaking={isSpeaking}
                />
              )}
            </div>

            {/* Vertical Sidebar Column (25% width on desktop) */}
            {spotlightPeerId && (
              <div className="flex-[1] flex flex-row md:flex-col gap-4 h-full w-full min-h-0 max-w-none md:max-w-xs justify-center items-center">
                {/* Always include your local video on the side */}
                <div className="flex-1 min-h-0 w-full flex items-center justify-center">
                  <LocalVideoComponent
                    videoRef={videoRef}
                    isVideoOff={isVideoOff}
                    isMuted={isMuted}
                    isSpeaking={isSpeaking}
                  />
                </div>

                {/* Second slot (next remote peer) if exists */}
                {sidebarSidePeers.map(peerId => (
                  <div key={peerId} className="flex-1 min-h-0 w-full flex items-center justify-center">
                    <VideoComponent
                      stream={peers[peerId]}
                      peerId={peerId}
                      hasVideo={peerMediaStates[peerId]?.video ?? true}
                      hasAudio={peerMediaStates[peerId]?.audio ?? true}
                      isSpeaking={activeSpeakers.has(peerId)}
                    />
                  </div>
                ))}

                {/* Third slot: "+X More" card if there are more than 2 remote peers */}
                {hasSidebarOthers && (
                  <div className="flex-1 min-h-0 w-full flex items-center justify-center">
                    <div
                      onClick={() => setIsSidebarOpen(true)}
                      className="w-full max-w-full max-h-full relative group rounded-3xl overflow-hidden bg-[#0d1411]/80 backdrop-blur-md shadow-xl border-2 border-green-900/30 flex flex-col items-center justify-center transition-all duration-300 hover:border-green-500/50 hover:bg-[#0d1411] cursor-pointer aspect-video"
                    >
                      <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mb-2 border border-green-500/20 shadow-inner group-hover:bg-green-500/20 transition">
                        <Users size={20} className="text-green-500 group-hover:scale-110 transition duration-300" />
                      </div>
                      <div className="text-center">
                        <span className="block text-lg font-bold text-green-400">+{sidebarOthersCount}</span>
                        <span className="text-[9px] font-semibold text-green-600 uppercase tracking-wider block">More Participants</span>
                        <span className="text-[8px] text-green-700/80 mt-0.5 block group-hover:text-green-500 transition animate-pulse">Click to View</span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Hidden audio consumers for all participants to track speaking status */}
        <div className="hidden">
          {Array.from(participants).filter(p => p !== (localSocketId || socketRef.current?.id)).map(peerId => (
            <AudioParticipant
              key={peerId}
              peerId={peerId}
              stream={peers[peerId]}
              isMuted={!(peerMediaStates[peerId]?.audio ?? true)}
              onSpeakingChange={handleSpeakingChange}
            />
          ))}
        </div>
      </div>

      {/* Sleek Dynamic Inline Sidebar/Settings Panel */}
      <div className={`h-full bg-[#0d1411]/90 backdrop-blur-md flex flex-col shrink-0 overflow-hidden shadow-2xl transition-all duration-500 ease-in-out ${
        (isSidebarOpen || isSettingsOpen)
          ? 'w-80 opacity-100 scale-100 border border-green-950/60 ml-4'
          : 'w-0 opacity-0 scale-95 border-none ml-0 pointer-events-none'
      }`}>
        {isSidebarOpen && (
          <>
            <div className="p-5 border-b border-green-950/60 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users size={18} className="text-green-500" />
                <h3 className="font-semibold text-green-100 text-xs tracking-wider uppercase">Classroom Directory</h3>
              </div>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="text-gray-400 hover:text-green-400 text-xs font-mono border border-green-950/50 hover:border-green-500/30 px-2.5 py-1 rounded-xl transition"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Local User */}
              <div className="bg-[#0f1814] border border-green-950/40 rounded-2xl p-3 flex items-center justify-between hover:border-green-500/20 transition">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center font-bold text-green-500 text-xs border border-green-500/20">
                    Y
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-green-200">You (Local)</div>
                    <div className="text-[10px] text-green-500/70">Broadcaster</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${isSpeaking ? 'bg-green-500 animate-pulse' : 'bg-transparent'}`}></span>
                  {isMuted ? <MicOff size={14} className="text-red-500" /> : <Mic size={14} className="text-green-500" />}
                  {isVideoOff ? <CameraOff size={14} className="text-red-500" /> : <Camera size={14} className="text-green-500" />}
                </div>
              </div>

              {/* Remote Peers */}
              {Array.from(participants)
                .filter(peerId => peerId !== (localSocketId || socketRef.current?.id))
                .map(peerId => {
                  const peerHasVideo = peerMediaStates[peerId]?.video ?? true;
                  const peerHasAudio = peerMediaStates[peerId]?.audio ?? true;
                  const peerIsSpeaking = activeSpeakers.has(peerId);

                  return (
                    <div key={peerId} className="bg-[#0e1612]/60 border border-green-950/30 rounded-2xl p-3 flex items-center justify-between hover:border-green-500/10 transition">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-green-900/30 flex items-center justify-center font-bold text-green-600 text-xs border border-green-900/20">
                          S
                        </div>
                        <div>
                          <div className="text-xs font-medium text-green-300">Student-{peerId.slice(0, 4)}</div>
                          <div className="text-[10px] text-green-700">Viewer</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${peerIsSpeaking ? 'bg-green-500 animate-pulse' : 'bg-transparent'}`}></span>
                        {peerHasAudio ? <Mic size={14} className="text-green-600" /> : <MicOff size={14} className="text-red-500" />}
                        {peerHasVideo ? <Camera size={14} className="text-green-600" /> : <CameraOff size={14} className="text-red-500" />}
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        )}

        {isSettingsOpen && (
          <>
            <div className="p-5 border-b border-green-950/60 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Settings className="text-green-500 animate-spin" style={{ animationDuration: '6s' }} size={18} />
                <h3 className="font-semibold text-green-100 text-xs tracking-wider uppercase">Classroom Settings</h3>
              </div>
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  setIsLayoutDropdownOpen(false);
                }}
                className="text-gray-400 hover:text-green-400 text-xs font-mono border border-green-950/50 hover:border-green-500/30 px-2.5 py-1 rounded-xl transition"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Classroom Layout Style Dropdown */}
              <div className="space-y-3 relative">
                <label className="block text-xs font-semibold text-green-600 uppercase tracking-widest">
                  Classroom Layout
                </label>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsLayoutDropdownOpen(prev => !prev)}
                    className="w-full flex items-center justify-between bg-[#0e1713] hover:bg-[#14221b] border border-green-950/40 hover:border-green-500/30 px-4 py-3 rounded-2xl transition duration-300 text-left cursor-pointer"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-green-500/10 rounded-xl border border-green-500/20 text-green-500">
                        {layoutStyle === 'paginated' ? <Users size={16} /> : <Settings size={16} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-green-100 truncate">
                          {layoutStyle === 'paginated' ? 'Paginated Grid' : 'Sidebar Stage'}
                        </span>
                      </div>
                    </div>
                    <ChevronLeft
                      size={18}
                      className={`text-green-500 transition-transform duration-300 transform ${isLayoutDropdownOpen ? '-rotate-90' : 'rotate-180'}`}
                    />
                  </button>

                  {isLayoutDropdownOpen && (
                    <div className="absolute left-0 right-0 mt-2 bg-[#0c1310] border border-green-500/20 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <button
                        type="button"
                        onClick={() => {
                          setLayoutStyle('paginated');
                          setIsLayoutDropdownOpen(false);
                        }}
                        className={`w-full flex items-center space-x-3 px-4 py-3 text-left transition hover:bg-green-500/10 ${layoutStyle === 'paginated' ? 'bg-green-500/5 text-green-400 font-semibold' : 'text-gray-300'
                          }`}
                      >
                        <Users size={16} className={layoutStyle === 'paginated' ? 'text-green-400' : 'text-gray-400'} />
                        <div>
                          <span className="block text-xs font-semibold">Paginated Grid</span>
                          <span className="block text-[9px] text-gray-500 leading-normal">Dynamic grid with 2x2, 3x3, 4x3 scaling</span>
                        </div>
                      </button>
                      <div className="border-t border-green-950/20" />
                      <button
                        type="button"
                        onClick={() => {
                          setLayoutStyle('sidebar');
                          setIsLayoutDropdownOpen(false);
                        }}
                        className={`w-full flex items-center space-x-3 px-4 py-3 text-left transition hover:bg-green-500/10 ${layoutStyle === 'sidebar' ? 'bg-green-500/5 text-green-400 font-semibold' : 'text-gray-300'
                          }`}
                      >
                        <Settings size={16} className={layoutStyle === 'sidebar' ? 'text-green-400' : 'text-gray-400'} />
                        <div>
                          <span className="block text-xs font-semibold">Sidebar Stage</span>
                          <span className="block text-[9px] text-gray-500 leading-normal">Main speaker spotlight with sidebar list</span>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-green-950/60 flex justify-end">
              <button
                onClick={() => {
                  setIsSettingsOpen(false);
                  setIsLayoutDropdownOpen(false);
                }}
                className="w-full bg-green-600 hover:bg-green-500 text-[#070a09] font-bold text-xs py-3 rounded-xl transition shadow-lg shadow-green-600/20"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </main>

    <ClassroomFooter
      isMuted={isMuted}
      isVideoOff={isVideoOff}
      toggleMute={toggleMute}
      toggleVideo={toggleVideo}
      leaveRoom={leaveRoom}
      onToggleSettings={() => {
        setIsSettingsOpen(prev => !prev);
        setIsSidebarOpen(false);
      }}
    />

    {/* Small Glassmorphic Closable Notifications in Bottom-Right */}
    <div className="fixed bottom-24 right-6 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
      {toasts.slice(-3).map(toast => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-2xl border backdrop-blur-md shadow-2xl transition-all duration-300 transform translate-x-0 animate-in fade-in slide-in-from-right-4 duration-300 ${
            toast.type === 'join'
              ? 'bg-[#0d1411]/90 border-green-500/30 text-green-200 shadow-green-950/20'
              : 'bg-[#180d0d]/90 border-red-500/20 text-red-200 shadow-red-950/20'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className={`p-1.5 rounded-xl flex items-center justify-center shrink-0 border ${
              toast.type === 'join'
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-red-500/10 border-red-500/20 text-red-400'
            }`}>
              <Users size={12} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold leading-normal truncate">{toast.message}</p>
              <span className="text-[8px] text-gray-500 font-mono tracking-wider uppercase block mt-0.5">
                {toast.type === 'join' ? 'Classroom Active' : 'Disconnected'}
              </span>
            </div>
          </div>
          <button
            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
            className="ml-3 p-1 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition shrink-0"
          >
            <span className="text-xs font-semibold font-mono leading-none">×</span>
          </button>
        </div>
      ))}
    </div>
  </div>
);
}
