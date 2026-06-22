'use client';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Device } from 'mediasoup-client';
import { useRouter } from 'next/navigation';
import { useSpeakingDetection } from '../hooks/useSpeakingDetection';
import { ClassroomHeader } from './ClassroomHeader';
import { ClassroomFooter } from './ClassroomFooter';
import { VideoGrid } from './VideoGrid';
import { ScreenSharePresenter } from './ScreenSharePresenter';
import { AudioParticipant } from './AudioParticipant';
import { DeviceSetup } from './DeviceSetup';
import { Users, Mic, MicOff, Camera, CameraOff, ChevronLeft, Settings, AlertTriangle } from 'lucide-react';


export default function LiveClassRoom({ roomId, initialRole = 'student' }: { roomId: string, initialRole?: string }) {
  const router = useRouter();
  const [stream, setStream] = useState<MediaStream | null>(null);

  // peers will store MediaStreams constructed from Mediasoup Consumers
  const [peers, setPeers] = useState<{ [id: string]: MediaStream }>({});
  const [peerMediaStates, setPeerMediaStates] = useState<{ [id: string]: { video: boolean, audio: boolean } }>({});
  const [peerRoles, setPeerRoles] = useState<{ [id: string]: string }>({});
  const [participants, setParticipants] = useState<Set<string>>(new Set());
  const [localSocketId, setLocalSocketId] = useState<string | null>(null);
  const localSocketIdRef = useRef<string | null>(null);
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
  const [isDuplicateSession, setIsDuplicateSession] = useState(false);

  // Pre-join device check states
  const [hasJoined, setHasJoined] = useState(false);
  const [videoDeviceId, setVideoDeviceId] = useState('');
  const [audioDeviceId, setAudioDeviceId] = useState('');
  const [speakerDeviceId, setSpeakerDeviceId] = useState('');

  // Screen share state variables
  const [remoteScreenShares, setRemoteScreenShares] = useState<{ [peerId: string]: { stream: MediaStream, producerId: string, consumerId: string } }>({});
  const [isLocalScreenSharing, setIsLocalScreenSharing] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const screenProducerRef = useRef<any>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);

  const [isMuted, setIsMuted] = useState(true);
  const [isVideoOff, setIsVideoOff] = useState(true);
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const isSpeaking = useSpeakingDetection(stream, isMuted);

  // Dynamically update document title based on room name and join state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const displayId = roomId.charAt(0).toUpperCase() + roomId.slice(1);
      if (!hasJoined) {
        document.title = `Setup: ${displayId} | Dot Live`;
      } else {
        document.title = `Classroom: ${displayId} | Dot Live`;
      }
    }
  }, [roomId, hasJoined]);

  const triggerToast = useCallback((message: string, type: 'join' | 'leave') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => {
      const next = [...prev, { id, message, type }];
      return next.slice(-4);
    });
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  }, []);



  const socketRef = useRef<Socket | null>(null);
  const isDuplicateSessionRef = useRef(false);

  // Mediasoup refs
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<any>(null);
  const recvTransportRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const userIdRef = useRef<string>('');
  const pendingProducers = useRef<{ producerId: string, peerId: string, appData?: any }[]>([]);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      let id = localStorage.getItem('dotlive_user_id');
      if (!id) {
        id = 'usr_' + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('dotlive_user_id', id);
      }
      userIdRef.current = id;
    }
  }, []);

  useEffect(() => {
    if (!hasJoined) return;

    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https:' : 'http:';
    const defaultBackendUrl = `${protocol}//${hostname}:3001`;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || defaultBackendUrl;
    const socket = io(
      backendUrl,
      {
        transports: ['websocket']
      }
    );
    socketRef.current = socket;

    // Connect listener registered below startSFU to allow lexical reference on reconnect

    const startSFU = async () => {
      let localStream: MediaStream | null = streamRef.current;
      
      const isStreamActive = localStream && 
                             localStream.active && 
                             localStream.getTracks().length > 0 && 
                             localStream.getTracks().every(track => track.readyState === 'live');
                             
      if (!isStreamActive) {
        localStream = null;
      }

      try {
        if (!localStream) {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Secure context required for camera/microphone access. IP based access requires HTTPS or browser flag configuration.");
          }

          // 1. Get Local Media using selected devices
          const mediaConstraints = {
            video: {
              deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined,
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 30 }
            },
            audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true
          };
          localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

          // Disable tracks initially based on pre-join user selections
          const audioTrack = localStream.getAudioTracks()[0];
          if (audioTrack) audioTrack.enabled = !isMuted;
          const videoTrack = localStream.getVideoTracks()[0];
          if (videoTrack) videoTrack.enabled = !isVideoOff;

          setStream(localStream);
          streamRef.current = localStream;
        }
      } catch (err: any) {
        console.warn("Could not get local media stream:", err);
        setMediaError(err.message || "Failed to access camera or microphone.");
        setIsVideoOff(true);
        setIsMuted(true);
      }

      // 2. Join Room & Setup Device
      socket.emit('joinRoom', { 
        roomId, 
        role: initialRole, 
        userId: userIdRef.current,
        mediaState: { video: localStream ? !isVideoOff : false, audio: localStream ? !isMuted : false } 
      }, async ({ rtpCapabilities, participants: existingParticipants, peerMediaStates: existingMediaStates, peerRoles: existingRoles }: any) => {
        setLocalSocketId(socket.id || null);
        setParticipants(new Set(existingParticipants));
        if (existingMediaStates) {
          setPeerMediaStates(existingMediaStates);
        }
        if (existingRoles) {
          setPeerRoles(existingRoles);
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
                rtpParameters: parameters.rtpParameters,
                appData: parameters.appData
              }, (response: any) => {
                if (response.error) {
                  errback(new Error(response.error));
                } else {
                  callback({ id: response.id });
                }
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
            producers.forEach(p => consumeRemote(p.producerId, p.peerId, recvTransport, device, p.appData));

            const existingIds = new Set(producers.map(p => p.producerId));
            pendingProducers.current.forEach(p => {
              if (!existingIds.has(p.producerId)) {
                consumeRemote(p.producerId, p.peerId, recvTransport, device, p.appData);
              }
            });
            pendingProducers.current = [];
            setIsJoining(false);
          });
        });
      });
    };

    startSFU();

    socket.on('connect', () => {
      if (isDuplicateSessionRef.current) {
        console.log("Socket connected but duplicate session is active. Disconnecting and ignoring.");
        socket.disconnect();
        return;
      }
      const oldSocketId = localSocketIdRef.current;
      setLocalSocketId(socket.id || null);
      localSocketIdRef.current = socket.id || null;
      
      // Reconnection detection: if device already exists and we had a previous socket ID, we are reconnecting!
      if (deviceRef.current && oldSocketId && oldSocketId !== socket.id) {
        console.log("Socket reconnected! Re-joining room with new Socket ID...");
        
        // Clean up previous peer states to avoid duplicates
        setPeers({});
        setParticipants(new Set());
        setPeerMediaStates({});
        setPeerRoles({});
        
        // Close old transports if they exist
        try {
          if (sendTransportRef.current) sendTransportRef.current.close();
          if (recvTransportRef.current) recvTransportRef.current.close();
        } catch (e) {
          console.warn("Error closing old transports on reconnect:", e);
        }
        
        // Restart room join and WebRTC setup
        startSFU();
      } else {
        localSocketIdRef.current = socket.id || null;
      }
    });

    const consumeRemote = (producerId: string, peerId: string, transport: any, device: Device, appData?: any) => {
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

          if (appData && appData.mediaType === 'screen') {
            setRemoteScreenShares(prev => ({
              ...prev,
              [peerId]: {
                stream: new MediaStream([track]),
                producerId,
                consumerId: consumer.id
              }
            }));
            triggerToast(`User-${peerId.substring(0, 4)} is sharing screen`, 'join');
          } else {
            setPeers(prev => {
              const existingStream = prev[peerId] || new MediaStream();
              const newStream = new MediaStream(existingStream.getTracks());
              newStream.addTrack(track);
              return { ...prev, [peerId]: newStream };
            });
          }

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

    socket.on('new-producer', ({ producerId, peerId, appData }) => {
      if (recvTransportRef.current && deviceRef.current) {
        consumeRemote(producerId, peerId, recvTransportRef.current, deviceRef.current, appData);
      } else {
        pendingProducers.current.push({ producerId, peerId, appData });
      }
    });

    socket.on('user-joined', (data: string | { userId: string, mediaState?: { video: boolean, audio: boolean }, role?: string }) => {
      const userId = typeof data === 'string' ? data : data.userId;
      const mediaState = typeof data === 'string' ? undefined : data.mediaState;
      const peerRole = typeof data === 'string' ? 'student' : (data.role || 'student');

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

      setPeerRoles(prev => ({
        ...prev,
        [userId]: peerRole
      }));

      const roleDisplay = peerRole === 'trainer' ? 'Trainer' : 'Student';
      triggerToast(`${roleDisplay} ${userId.substring(0, 4)} entered the classroom`, 'join');
    });

    socket.on('user-disconnected', (userId) => {
      const peerRole = peerRoles[userId] || 'student';
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
      setPeerRoles((prev) => {
        const newRoles = { ...prev };
        delete newRoles[userId];
        return newRoles;
      });

      const roleDisplay = peerRole === 'trainer' ? 'Trainer' : 'Student';
      triggerToast(`${roleDisplay} ${userId.substring(0, 4)} left the classroom`, 'leave');
    });

    socket.on('producer-closed', ({ producerId }) => {
      setRemoteScreenShares(prev => {
        const next = { ...prev };
        for (const peerId in next) {
          if (next[peerId].producerId === producerId) {
            next[peerId].stream.getTracks().forEach(t => t.stop());
            delete next[peerId];
            triggerToast(`User-${peerId.substring(0, 4)} stopped screen sharing`, 'leave');
            break;
          }
        }
        return next;
      });
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

    socket.on('duplicate-session', () => {
      isDuplicateSessionRef.current = true;
      setIsDuplicateSession(true);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      setTimeout(() => {
        router.push('/');
      }, 4000);
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

      if (localScreenStreamRef.current) {
        localScreenStreamRef.current.getTracks().forEach(t => t.stop());
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, hasJoined, videoDeviceId, audioDeviceId]);

  interface JoinRoomConfig {
    videoDeviceId: string;
    audioDeviceId: string;
    speakerDeviceId: string;
    isVideoOff: boolean;
    isMuted: boolean;
  }

  const handleJoinRoom = ({ videoDeviceId, audioDeviceId, speakerDeviceId, isVideoOff, isMuted }: JoinRoomConfig) => {
    setVideoDeviceId(videoDeviceId);
    setAudioDeviceId(audioDeviceId);
    setSpeakerDeviceId(speakerDeviceId);
    setIsVideoOff(isVideoOff);
    setIsMuted(isMuted);
    setHasJoined(true);
  };

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

  const startScreenShare = async () => {
    if (!sendTransportRef.current) {
      triggerToast("WebRTC send transport not ready", "leave");
      return;
    }
    
    let screenStream: MediaStream;
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });
    } catch (err: unknown) {
      console.warn("Screen capture cancelled or failed:", err);
      return;
    }

    const track = screenStream.getVideoTracks()[0];
    if (!track) return;

    try {
      const screenProducer = await sendTransportRef.current.produce({
        track,
        appData: { mediaType: 'screen' }
      });
      
      screenProducerRef.current = screenProducer;
      localScreenStreamRef.current = screenStream;
      setLocalScreenStream(screenStream);
      setIsLocalScreenSharing(true);
      triggerToast("You started sharing your screen", "join");

      track.onended = () => {
        stopScreenShare();
      };
    } catch (err: unknown) {
      console.error("Screen share produce failed:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      triggerToast(errorMsg, "leave");
      screenStream.getTracks().forEach(t => t.stop());
    }
  };

  const stopScreenShare = async () => {
    if (!localScreenStreamRef.current && !screenProducerRef.current) {
      return;
    }

    if (screenProducerRef.current) {
      const producerId = screenProducerRef.current.id;
      try {
        screenProducerRef.current.close();
      } catch (e) {
        console.warn(e);
      }
      screenProducerRef.current = null;
      socketRef.current?.emit('closeProducer', { producerId });
    }
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach(t => t.stop());
      localScreenStreamRef.current = null;
    }
    setLocalScreenStream(null);
    setIsLocalScreenSharing(false);
    triggerToast("You stopped sharing your screen", "leave");
  };

  const toggleScreenShare = async () => {
    if (isLocalScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  };

  const activeRemotePresenterId = useMemo(() => {
    const ids = Object.keys(remoteScreenShares);
    return ids.length > 0 ? ids[0] : null;
  }, [remoteScreenShares]);

  const activePresenterName = isLocalScreenSharing
    ? "You"
    : activeRemotePresenterId
    ? `User-${activeRemotePresenterId.substring(0, 4)}`
    : "";

  const activeScreenShareStream = isLocalScreenSharing
    ? localScreenStream
    : activeRemotePresenterId
    ? remoteScreenShares[activeRemotePresenterId].stream
    : null;

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



  const selfId = localSocketId || '';

  if (!hasJoined) {
    return (
      <DeviceSetup
        roomName={roomId}
        role={initialRole}
        onJoin={handleJoinRoom}
      />
    );
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

      {/* 3. Duplicate Session / Connection Terminated Overlay */}
      {isDuplicateSession && (
        <div className="fixed inset-0 bg-[#080d0b] z-[10000] flex flex-col items-center justify-center overflow-hidden">
          {/* Cyberpunk ambient warnings */}
          <div className="absolute w-[400px] h-[400px] rounded-full border border-amber-500/5 animate-[ping_4s_infinite]" />
          <div className="absolute w-[600px] h-[600px] rounded-full border border-amber-500/5 animate-[ping_6s_infinite]" />

          {/* Central warning sphere with spinning cyber rings */}
          <div className="relative flex items-center justify-center w-36 h-36">
            {/* Spinning Outer Amber Ring */}
            <div className="absolute inset-0 rounded-full border border-dashed border-amber-500/20 animate-spin" style={{ animationDuration: '10s' }} />
            
            {/* Spinning Inner Counter-Ring */}
            <div className="absolute inset-2 rounded-full border-2 border-dashed border-amber-500/10 animate-spin" style={{ animationDuration: '5s', animationDirection: 'reverse' }} />

            {/* Glowing neon amber center core */}
            <div className="w-24 h-24 rounded-full bg-[#14100a]/90 border border-amber-500/40 shadow-[0_0_50px_rgba(245,158,11,0.25)] flex flex-col items-center justify-center relative">
              {/* Laser vertical sweep inside the core */}
              <div className="absolute w-full h-0.5 bg-amber-500/30 animate-[bounce_2s_infinite]" />

              <AlertTriangle className="w-8 h-8 text-amber-500 animate-pulse" />
            </div>
          </div>

          <div className="mt-8 text-center max-w-sm px-6 z-10">
            <h2 className="text-sm font-bold tracking-widest text-amber-400 uppercase animate-pulse">
              Session Terminated
            </h2>
            <p className="text-[11px] text-amber-200/80 font-semibold tracking-wide mt-3 leading-relaxed">
              This classroom has been opened in another browser tab or window.
            </p>
            <p className="text-[10px] text-amber-600/70 font-mono tracking-wider uppercase mt-2">
              Redirecting to home page...
            </p>
            <div className="mt-5 flex items-center justify-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500/50 animate-bounce" style={{ animationDelay: '300ms' }} />
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
        <div className="flex-1 min-h-0 flex flex-col relative h-full w-full gap-4">
          {mediaError && (() => {
            const errStr = mediaError.toLowerCase();
            const isPermissionDenied = errStr.includes("permission") || errStr.includes("allowed") || errStr.includes("denied");
            const isDeviceNotFound = errStr.includes("notfound") || errStr.includes("not found") || errStr.includes("devices") || errStr.includes("found");

            if (isPermissionDenied) {
              return (
                <div className="mb-4 bg-amber-500/10 border border-amber-500/30 text-amber-200 px-4 py-3 rounded-2xl flex items-start space-x-3 text-xs md:text-sm shadow-lg max-w-2xl mx-auto z-50 relative shrink-0">
                  <div className="font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-md uppercase text-[10px] tracking-wider mt-0.5 shrink-0">Permission Blocked</div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold mb-1 text-amber-300">Camera & Microphone Access Denied</p>
                    <p className="text-[11px] md:text-xs text-amber-300/80 leading-relaxed">
                      You blocked access to your camera or microphone. You can still watch and participate! If you want to turn on your media:
                      <span className="block mt-1.5 font-medium text-amber-200">
                        1. Click the site settings icon (lock/sliders icon next to URL) in your browser address bar.
                        <br />
                        2. Reset/Allow Camera and Microphone permissions.
                        <br />
                        3. Refresh the page to apply.
                      </span>
                    </p>
                  </div>
                </div>
              );
            }

            if (isDeviceNotFound) {
              return (
                <div className="mb-4 bg-amber-500/10 border border-amber-500/30 text-amber-200 px-4 py-3 rounded-2xl flex items-start space-x-3 text-xs md:text-sm shadow-lg max-w-2xl mx-auto z-50 relative shrink-0">
                  <div className="font-bold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-md uppercase text-[10px] tracking-wider mt-0.5 shrink-0">No Devices</div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold mb-1 text-amber-300">No Media Devices Found</p>
                    <p className="text-[11px] md:text-xs text-amber-300/80 leading-relaxed font-mono">
                      {mediaError}
                    </p>
                    <p className="text-[11px] md:text-xs text-amber-300/60 leading-relaxed mt-1">
                      Please plug in a camera or microphone and refresh this page.
                    </p>
                  </div>
                </div>
              );
            }

            // Insecure Context or fallback error
            return (
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
            );
          })()}

          {activeScreenShareStream ? (
            <div className="flex-1 flex flex-col gap-4 min-h-0 h-full w-full min-w-0">
              {/* Screen Share Spotlight */}
              <ScreenSharePresenter
                stream={activeScreenShareStream}
                presenterName={activePresenterName}
                isLocal={isLocalScreenSharing}
                onStopShare={stopScreenShare}
              />
              
              {/* Participant Webcam Filmstrip */}
              <VideoGrid
                layoutStyle="presentation"
                localStream={stream}
                localMediaState={{
                  video: !isVideoOff,
                  audio: !isMuted,
                  isSpeaking
                }}
                peers={peers}
                peerMediaStates={peerMediaStates}
                activeSpeakers={activeSpeakers}
                participants={participants}
                localSocketId={localSocketId}
              />
            </div>
          ) : (
            <VideoGrid
              layoutStyle={layoutStyle}
              localStream={stream}
              localMediaState={{
                video: !isVideoOff,
                audio: !isMuted,
                isSpeaking
              }}
              peers={peers}
              peerMediaStates={peerMediaStates}
              activeSpeakers={activeSpeakers}
              participants={participants}
              localSocketId={localSocketId}
              onOpenDirectory={() => setIsSidebarOpen(true)}
            />
          )}

          {/* Hidden audio consumers for all participants to track speaking status */}
          <div className="hidden">
            {Array.from(participants).filter(p => p !== selfId).map(peerId => (
              <AudioParticipant
                key={peerId}
                peerId={peerId}
                stream={peers[peerId]}
                isMuted={!(peerMediaStates[peerId]?.audio ?? true)}
                onSpeakingChange={handleSpeakingChange}
                speakerDeviceId={speakerDeviceId}
              />
            ))}
          </div>
        </div>

        {/* Sleek Dynamic Inline Sidebar/Settings Panel */}
        <div className={`h-full bg-[#0d1411]/90 backdrop-blur-md flex flex-col shrink-0 overflow-hidden shadow-2xl transition-all duration-500 ease-in-out ${(isSidebarOpen || isSettingsOpen)
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
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border ${
                      initialRole === 'trainer'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-green-500/10 text-green-500 border-green-500/20'
                    }`}>
                      {initialRole === 'trainer' ? 'T' : 'S'}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-green-200">You ({initialRole === 'trainer' ? 'Trainer' : 'Student'})</div>
                      <div className="text-[10px] text-green-500/70">{initialRole === 'trainer' ? 'Instructor' : 'Attendee'}</div>
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
                  .filter(peerId => peerId !== selfId)
                  .map(peerId => {
                    const peerHasVideo = peerMediaStates[peerId]?.video ?? true;
                    const peerHasAudio = peerMediaStates[peerId]?.audio ?? true;
                    const peerIsSpeaking = activeSpeakers.has(peerId);
                    const peerRole = peerRoles[peerId] || 'student';

                    return (
                      <div key={peerId} className="bg-[#0e1612]/60 border border-green-950/30 rounded-2xl p-3 flex items-center justify-between hover:border-green-500/10 transition">
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border ${
                            peerRole === 'trainer'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-green-900/30 text-green-600 border-green-900/20'
                          }`}>
                            {peerRole === 'trainer' ? 'T' : 'S'}
                          </div>
                          <div>
                            <div className="text-xs font-medium text-green-300">
                              {peerRole === 'trainer' ? 'Trainer' : 'Student'}-{peerId.slice(0, 4)}
                            </div>
                            <div className="text-[10px] text-green-700">
                              {peerRole === 'trainer' ? 'Instructor' : 'Attendee'}
                            </div>
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
        isSharingScreen={isLocalScreenSharing}
        toggleScreenShare={toggleScreenShare}
        isScreenShareDisabled={!!activeRemotePresenterId}
      />

      {/* Small Glassmorphic Closable Notifications in Bottom-Right */}
      <div className="fixed bottom-24 right-6 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
        {toasts.slice(-3).map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-2xl border backdrop-blur-md shadow-2xl transition-all duration-300 transform translate-x-0 animate-in fade-in slide-in-from-right-4 duration-300 ${toast.type === 'join'
              ? 'bg-[#0d1411]/90 border-green-500/30 text-green-200 shadow-green-950/20'
              : 'bg-[#180d0d]/90 border-red-500/20 text-red-200 shadow-red-950/20'
              }`}
          >
            <div className="flex items-center space-x-3">
              <div className={`p-1.5 rounded-xl flex items-center justify-center shrink-0 border ${toast.type === 'join'
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
