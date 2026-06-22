'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, Volume2, Play, Check, AlertCircle, Users } from 'lucide-react';
import { io } from 'socket.io-client';

interface DeviceSetupProps {
  roomName: string;
  role: string;
  onJoin: (config: {
    videoDeviceId: string;
    audioDeviceId: string;
    speakerDeviceId: string;
    isVideoOff: boolean;
    isMuted: boolean;
  }) => void;
}

export function DeviceSetup({ roomName, role, onJoin }: DeviceSetupProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Media states
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);

  const [selectedVideo, setSelectedVideo] = useState('');
  const [selectedAudio, setSelectedAudio] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');

  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false);
  const previewStreamRef = useRef<MediaStream | null>(null);

  interface ParticipantInfo {
    socketId: string;
    userId: string;
    role: string;
  }
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);

  // Fetch active participants in the classroom dynamically using sockets
  useEffect(() => {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https:' : 'http:';
    const defaultBackendUrl = `${protocol}//${hostname}:3001`;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || defaultBackendUrl;

    const socket = io(backendUrl, {
      transports: ['websocket']
    });

    socket.emit('subscribeRoomPreview', { roomId: roomName }, (response: any) => {
      if (response && response.participants) {
        setParticipants(response.participants);
      }
    });

    socket.on('user-joined', (data: any) => {
      const newPart = {
        socketId: data.userId,
        userId: data.userId,
        role: data.role || 'student'
      };
      setParticipants(prev => {
        if (prev.some(p => p.socketId === newPart.socketId)) return prev;
        return [...prev, newPart];
      });
    });

    socket.on('user-disconnected', (socketId: string) => {
      setParticipants(prev => prev.filter(p => p.socketId !== socketId));
    });

    return () => {
      socket.disconnect();
    };
  }, [roomName]);

  // Request initial media permissions & enumerate devices
  useEffect(() => {
    async function initDevices() {
      try {
        // Force media permission request to get device labels
        const initialStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

        // Enumerate devices once permission is granted
        const allDevices = await navigator.mediaDevices.enumerateDevices();

        const videoInputs = allDevices.filter(d => d.kind === 'videoinput');
        const audioInputs = allDevices.filter(d => d.kind === 'audioinput');
        const audioOutputs = allDevices.filter(d => d.kind === 'audiooutput');

        setVideoDevices(videoInputs);
        setAudioDevices(audioInputs);
        setSpeakerDevices(audioOutputs);

        // Select defaults
        if (videoInputs.length > 0) setSelectedVideo(videoInputs[0].deviceId);
        if (audioInputs.length > 0) setSelectedAudio(audioInputs[0].deviceId);
        if (audioOutputs.length > 0) setSelectedSpeaker(audioOutputs[0].deviceId);

        // Keep initial stream as starting preview stream
        setPreviewStream(initialStream);
        previewStreamRef.current = initialStream;
        setPermissionError(null);
      } catch (err: unknown) {
        console.error('Error accessing media devices:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setPermissionError(errMsg || 'Media permission denied. Please allow camera and microphone access.');
      }
    }
    initDevices();
  }, []);

  // Update preview stream when selected video/audio input changes
  useEffect(() => {
    let active = true;

    async function updatePreview() {
      if (permissionError) return;

      // Stop previous preview tracks
      if (previewStreamRef.current) {
        previewStreamRef.current.getTracks().forEach(t => t.stop());
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: isVideoOff ? false : (selectedVideo ? { deviceId: { exact: selectedVideo } } : true),
          audio: isMuted ? false : (selectedAudio ? { deviceId: { exact: selectedAudio } } : true)
        };

        // Only request getUserMedia if at least one track is requested
        if (constraints.video || constraints.audio) {
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (active) {
            setPreviewStream(stream);
            previewStreamRef.current = stream;
          } else {
            stream.getTracks().forEach(t => t.stop());
          }
        } else {
          setPreviewStream(null);
          previewStreamRef.current = null;
        }
      } catch (err) {
        console.warn('Failed to update preview stream:', err);
      }
    }

    updatePreview();

    return () => {
      active = false;
    };
  }, [selectedVideo, selectedAudio, isVideoOff, isMuted, permissionError]);

  // Hook stream to video element
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      if (previewStream && previewStream.getVideoTracks().length > 0) {
        video.srcObject = previewStream;
        video.play().catch(e => console.warn(e));
      } else {
        video.srcObject = null;
      }
    }
  }, [previewStream]);

  // Microphone Sensitivity Level Indicator
  useEffect(() => {
    if (!previewStream || isMuted) {
      const timer = setTimeout(() => setMicLevel(0), 0);
      return () => clearTimeout(timer);
    }
    const audioTrack = previewStream.getAudioTracks()[0];
    if (!audioTrack || !audioTrack.enabled) {
      const timer = setTimeout(() => setMicLevel(0), 0);
      return () => clearTimeout(timer);
    }

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let animationFrameId: number;

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContext = new AudioContextClass();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyser) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const levelPercentage = Math.min(100, Math.round((average / 128) * 100));
        setMicLevel(levelPercentage);
        animationFrameId = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (e) {
      console.warn('AudioContext volume meter setup failed:', e);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (source) source.disconnect();
      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(console.error);
      }
    };
  }, [previewStream, isMuted]);

  // Cleanup preview stream on unmount
  useEffect(() => {
    return () => {
      if (previewStream) {
        previewStream.getTracks().forEach(t => t.stop());
      }
    };
  }, [previewStream]);

  // Speaker Testing (Dynamic audio generation played on selected sink ID)
  const testSpeaker = async () => {
    if (isTestingSpeaker) return;
    setIsTestingSpeaker(true);

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioContextClass();

      // Set output device if supported by browser (setSinkId)
      interface AudioContextWithSinkId extends AudioContext {
        setSinkId?: (sinkId: string) => Promise<void>;
      }
      const audioCtxWithSink = audioCtx as AudioContextWithSinkId;
      if (audioCtxWithSink.setSinkId && selectedSpeaker) {
        await audioCtxWithSink.setSinkId(selectedSpeaker);
      }

      // Generate a pleasant synth ding sound
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5 note
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.15); // E5 note
      osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.30); // G5 note

      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 1.2);

      setTimeout(() => {
        setIsTestingSpeaker(false);
      }, 1200);
    } catch (e) {
      console.warn('Speaker test failed:', e);
      setIsTestingSpeaker(false);
    }
  };

  const handleJoinClick = () => {
    // Stop all preview stream tracks before joining the classroom
    if (previewStream) {
      previewStream.getTracks().forEach(t => t.stop());
    }

    onJoin({
      videoDeviceId: selectedVideo,
      audioDeviceId: selectedAudio,
      speakerDeviceId: selectedSpeaker,
      isVideoOff,
      isMuted
    });
  };

  const maxAvatars = 2;
  const displayParticipants = participants.slice(0, maxAvatars);
  const remainingCount = participants.length - displayParticipants.length;

  const getAvatarBg = (role: string, socketId: string) => {
    if (role === 'trainer') {
      return 'from-emerald-500 to-teal-600';
    }
    const charCode = socketId.charCodeAt(0) || 0;
    const colors = [
      'from-blue-500 to-indigo-600',
      'from-purple-500 to-pink-600',
      'from-amber-500 to-orange-600',
      'from-cyan-500 to-blue-600',
      'from-pink-500 to-rose-600',
    ];
    return colors[charCode % colors.length];
  };

  const renderNamesText = () => {
    if (participants.length === 0) return null;

    const names = displayParticipants.map(p => {
      const roleDisplay = p.role === 'trainer' ? 'Trainer' : 'Student';
      return `${roleDisplay}-${p.socketId.slice(0, 4)}`;
    });

    if (participants.length === 1) {
      return (
        <div className="text-[11px] text-gray-600 leading-tight">
          <span className="font-bold text-gray-800">{names[0]}</span> joined
        </div>
      );
    }

    if (participants.length === 2) {
      return (
        <div className="text-[11px] text-gray-600 leading-tight">
          <span className="font-bold text-gray-800">{names[0]}</span> and <span className="font-bold text-gray-800">{names[1]}</span> joined
        </div>
      );
    }

    return (
      <div className="text-[11px] text-gray-600 leading-tight">
        <span className="font-bold text-gray-800">{names[0]}</span>, <span className="font-bold text-gray-800">{names[1]}</span> and <span className="font-semibold text-green-700">{remainingCount} + others</span> joined
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-[#f4fbf7] to-emerald-50 text-gray-800 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Ambient gradient glows */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-green-200/30 blur-[130px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-teal-200/20 blur-[130px] animate-pulse" />
      </div>

      <div className="z-10 text-center mb-6 max-w-lg">
        <h2 className="text-2xl md:text-3xl text-gray-900 font-extrabold tracking-tight uppercase">
          Joining <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 to-emerald-700">{roomName}</span>
        </h2>
        <p className="text-green-700/80 text-[10px] uppercase tracking-widest font-mono mt-3">
          Role: {role} • Configure camera, microphone, and speakers
        </p>
      </div>

      <div className="z-10 bg-white/95 border border-green-200/60 backdrop-blur-md p-6 md:p-8 rounded-[2rem] shadow-[0_20px_50px_rgba(4,120,87,0.06)] w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Left Column: Live Preview & Volume Indicator */}
        <div className="flex flex-col space-y-4">
          <div className="relative aspect-video bg-gray-950 border border-green-100 rounded-2xl overflow-hidden shadow-md flex items-center justify-center group">
            {isVideoOff ? (
              <div className="flex flex-col items-center justify-center text-green-750 space-y-2">
                <CameraOff size={44} className="opacity-50 text-red-200" />
                <span className="text-[10px] font-bold tracking-wider uppercase font-mono text-gray-500">Camera is Turned Off</span>
              </div>
            ) : permissionError ? (
              <div className="flex flex-col items-center justify-center text-amber-600 p-6 text-center space-y-2">
                <AlertCircle size={40} className="animate-pulse text-amber-500" />
                <span className="text-[10px] font-bold tracking-wider uppercase font-mono">Permissions Required</span>
                <p className="text-[9px] text-amber-650 max-w-xs">{permissionError}</p>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover scale-x-[-1]"
              />
            )}

            {/* Quick Media Controls Overlay */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 flex space-x-2 bg-white/15 backdrop-blur-md px-2 py-1 rounded-3xl border border-green-200/40 shadow-lg transition duration-300">
              <button
                type="button"
                onClick={() => setIsMuted(prev => !prev)}
                className={`p-2.5 rounded-full transition duration-300 ${isMuted ? 'bg-red-500 text-white border border-red-200/60' : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200/30'}`}
              >
                {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button
                type="button"
                onClick={() => setIsVideoOff(prev => !prev)}
                className={`p-2.5 rounded-full transition duration-300 ${isVideoOff ? 'bg-red-500 text-white border border-red-200/60' : 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200/30'}`}
              >
                {isVideoOff ? <CameraOff size={16} /> : <Camera size={16} />}
              </button>
            </div>
          </div>

          {/* Active Participants Preview */}
          {participants.length > 0 ? (
            <div className="flex items-center space-x-3 bg-green-50/40 border border-green-100/60 rounded-2xl py-1.5 px-3 shadow-[0_4px_12px_rgba(4,120,87,0.03)] mt-1">
              <div className="flex -space-x-2.5">
                {displayParticipants.map((p) => {
                  const initial = p.role === 'trainer' ? 'T' : 'S';
                  const bgClass = getAvatarBg(p.role, p.socketId);
                  return (
                    <div key={p.socketId} className="relative shrink-0">
                      <div className={`w-7 h-7 rounded-full bg-gradient-to-tr ${bgClass} border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-sm select-none`}>
                        {initial}
                      </div>
                      <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-400 border border-white rounded-full"></span>
                    </div>
                  );
                })}
                {remainingCount > 0 && (
                  <div className="relative w-7 h-7 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-[9px] font-extrabold text-gray-600 shadow-sm select-none shrink-0">
                    +{remainingCount}
                  </div>
                )}
              </div>
              {renderNamesText()}
            </div>
          ) : (
            <div className="flex items-center space-x-3 bg-green-50/15 border border-green-100/30 rounded-2xl p-3 mt-2 shadow-[0_4px_12px_rgba(4,120,87,0.01)]">
              <div className="w-7 h-7 rounded-full bg-green-100/30 border border-green-200/20 flex items-center justify-center text-green-700 shadow-sm shrink-0">
                <Users className="w-3.5 h-3.5 text-green-600" />
              </div>
              <div className="text-[11px] text-gray-500 font-mono tracking-wide leading-tight">
                No one else has joined this classroom yet.
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Dropdowns & Joining */}
        <div className="flex flex-col justify-start space-y-8">
          <div className="space-y-4">
            {/* Camera Select */}
            <div className="space-y-1.5">
              <label htmlFor="camera-select" className="block text-[9px] font-bold tracking-widest text-green-800 uppercase font-mono">
                Camera (Video Input)
              </label>
              <select
                id="camera-select"
                disabled={isVideoOff || permissionError !== null}
                value={selectedVideo}
                onChange={e => setSelectedVideo(e.target.value)}
                className="w-full bg-gray-50 border border-gray-250 hover:border-green-300 focus:border-green-500 focus:bg-white rounded-xl px-2.5 py-2 text-xs text-gray-800 focus:outline-none transition duration-300 font-semibold cursor-pointer disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed shadow-sm"
              >
                {videoDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId} className="bg-white text-gray-800">
                    {d.label || `Camera ${videoDevices.indexOf(d) + 1}`}
                  </option>
                ))}
                {videoDevices.length === 0 && (
                  <option value="" className="bg-white text-gray-850">No Camera Found</option>
                )}
              </select>
            </div>

            {/* Microphone Select */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="mic-select" className="block text-[9px] font-bold tracking-widest text-green-800 uppercase font-mono">
                  Microphone (Audio Input)
                </label>
                {/* Mini Microphone Level Indicator */}
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-mono font-bold text-green-700">{isMuted ? 'Muted' : `${micLevel}%`}</span>
                  <div className="w-28 h-3 bg-gray-100 border border-gray-200/80 rounded-full overflow-hidden p-0.5 shadow-inner">
                    <div
                      className="h-1.5 bg-gradient-to-r from-green-500 to-emerald-100 rounded-full transition-all duration-75"
                      style={{ width: `${isMuted ? 0 : micLevel}%` }}
                    />
                  </div>
                </div>
              </div>
              <select
                id="mic-select"
                disabled={isMuted || permissionError !== null}
                value={selectedAudio}
                onChange={e => setSelectedAudio(e.target.value)}
                className="w-full bg-gray-50 border border-gray-250 hover:border-green-300 focus:border-green-500 focus:bg-white rounded-xl px-2.5 py-2 text-xs text-gray-800 focus:outline-none transition duration-300 font-semibold cursor-pointer disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed shadow-sm"
              >
                {audioDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId} className="bg-white text-gray-800">
                    {d.label || `Microphone ${audioDevices.indexOf(d) + 1}`}
                  </option>
                ))}
                {audioDevices.length === 0 && (
                  <option value="" className="bg-white text-gray-850">No Microphone Found</option>
                )}
              </select>
            </div>

            {/* Speaker Select */}
            <div className="space-y-1.5">
              <label htmlFor="speaker-select" className="block text-[9px] font-bold tracking-widest text-green-800 uppercase font-mono">
                Audio Output (Speaker)
              </label>
              <div className="w-full flex space-x-2 items-stretch">
                <select
                  id="speaker-select"
                  disabled={permissionError !== null}
                  value={selectedSpeaker}
                  onChange={e => setSelectedSpeaker(e.target.value)}
                  className="flex-1 min-w-0 bg-gray-50 border border-gray-250 hover:border-green-300 focus:border-green-500 focus:bg-white rounded-xl px-2.5 py-2 text-xs text-gray-800 focus:outline-none transition duration-300 font-semibold cursor-pointer disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed shadow-sm"
                >
                  {speakerDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId} className="bg-white text-gray-800">
                      {d.label || `Speaker ${speakerDevices.indexOf(d) + 1}`}
                    </option>
                  ))}
                  {speakerDevices.length === 0 && (
                    <option value="" className="bg-white text-gray-855">Default Speaker Device</option>
                  )}
                </select>
                <button
                  type="button"
                  onClick={testSpeaker}
                  disabled={isTestingSpeaker || permissionError !== null}
                  className="flex-shrink-0 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 hover:border-green-400 px-4 rounded-xl flex items-center justify-center transition duration-300 active:scale-[0.97] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                  title="Test Audio Output"
                >
                  {isTestingSpeaker ? (
                    <Play className="w-4 h-4 text-green-600 animate-pulse" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-green-600" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Join Classroom submit */}
          <button
            type="button"
            onClick={handleJoinClick}
            className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold rounded-xl py-3 flex items-center justify-center space-x-2 shadow-md shadow-green-600/10 hover:shadow-lg hover:shadow-green-600/20 transform active:scale-[0.98] transition-all duration-300 cursor-pointer text-xs md:text-sm tracking-widest uppercase font-mono mt-1 border border-green-600/20"
          >
            <Check size={16} />
            <span>Enter Classroom</span>
          </button>
        </div>

      </div>
    </div>
  );
}
