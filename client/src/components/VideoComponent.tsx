import React, { useEffect, useRef, useState } from 'react';
import { VideoOff, MicOff, Loader2 } from 'lucide-react';
import { AudioWaves } from './AudioWaves';

export const VideoComponent = ({ stream, peerId, hasVideo, hasAudio, isSpeaking }: { stream?: MediaStream, peerId: string, hasVideo: boolean, hasAudio: boolean, isSpeaking: boolean }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  useEffect(() => {
    if (ref.current && stream && stream.getTracks().length > 0) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  // Reset video loaded state if stream changes or when camera toggles
  useEffect(() => {
    setIsVideoPlaying(false);
    if (hasVideo) {
      // Dynamic fallback timer in case standard onLoadedData event fails to dispatch
      const timer = setTimeout(() => {
        setIsVideoPlaying(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [stream, hasVideo]);

  const hasVideoTrack = !!(stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled);
  const isConnecting = hasVideo && (!hasVideoTrack || !isVideoPlaying);
  const showCameraOffPlaceholder = !hasVideo;

  return (
    <div className={`relative group rounded-3xl overflow-hidden bg-[#0d1411] shadow-xl border-2 transition-colors duration-300 flex items-center justify-center w-full h-auto max-w-full max-h-full aspect-video ${isSpeaking ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'border-green-900/50'}`}>
      
      {/* 1. Camera explicitly Off State */}
      {showCameraOffPlaceholder && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d1411] z-10">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-green-900/40 rounded-full flex items-center justify-center text-xl md:text-2xl font-bold text-green-600 shadow-inner mb-4">
            {peerId.substring(0, 1).toUpperCase()}
          </div>
          <div className="flex items-center space-x-2 text-green-500/80">
            <VideoOff size={18} />
            <span className="text-sm font-medium">Camera Off</span>
          </div>
        </div>
      )}

      {/* 2. Stream Connecting/Loading State */}
      {!showCameraOffPlaceholder && isConnecting && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080d0b] z-20 overflow-hidden">
          {/* Concentric Pulsing Radar Rings */}
          <div className="absolute w-36 h-36 rounded-full border border-green-500/10 animate-[ping_3s_infinite]" />
          <div className="absolute w-48 h-48 rounded-full border border-green-500/5 animate-[ping_4s_infinite]" />
          
          {/* Scanning laser sweep */}
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-green-500 to-transparent opacity-40 animate-[bounce_2s_infinite]" />

          {/* Rotating Tech Circle */}
          <div className="relative flex items-center justify-center w-16 h-16 rounded-full border border-dashed border-green-500/20 animate-spin" style={{ animationDuration: '8s' }} />

          {/* Central Pulsing Tech Core */}
          <div className="absolute flex items-center justify-center w-10 h-10 bg-[#0f1915] border border-green-500/40 rounded-full shadow-[0_0_20px_rgba(34,197,94,0.2)]">
            <Loader2 className="w-4 h-4 text-green-400 animate-spin" />
          </div>

          {/* Glowing Text */}
          <div className="mt-4 flex flex-col items-center text-center z-10 px-4">
            <span className="text-[10px] font-bold tracking-wider text-green-400 uppercase animate-pulse">
              Connecting video...
            </span>
            <span className="text-[8px] text-green-700/80 mt-0.5 font-mono tracking-widest">
              Setting up connection
            </span>
          </div>
        </div>
      )}

      <video 
        ref={ref} 
        autoPlay 
        playsInline 
        muted 
        onLoadedData={() => setIsVideoPlaying(true)}
        onPlaying={() => setIsVideoPlaying(true)}
        className={`w-full h-full object-cover`} 
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none z-20" />
      <div className="absolute bottom-3 left-3 z-30 flex items-center space-x-2">
        <div className="bg-green-900/60 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium shadow-lg border border-green-800/50 flex items-center space-x-2 text-green-100">
          <span>Student {peerId.substring(0, 4)}</span>
        </div>
        {!hasAudio ? (
          <div className="bg-red-500/90 p-1 rounded-lg shadow-lg">
            <MicOff size={14} className="text-white" />
          </div>
        ) : isSpeaking ? (
          <div className="bg-green-500/90 p-1 rounded-lg shadow-lg">
            <AudioWaves />
          </div>
        ) : null}
      </div>
    </div>
  );
};
