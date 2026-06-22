import React, { useEffect, useRef, useState } from 'react';
import { VideoOff, MicOff, Loader2 } from 'lucide-react';
import { AudioWaves } from './AudioWaves';

export const VideoComponent = ({ 
  stream, 
  peerId, 
  hasVideo, 
  hasAudio, 
  isSpeaking,
  isFilmstrip = false
}: { 
  stream?: MediaStream, 
  peerId: string, 
  hasVideo: boolean, 
  hasAudio: boolean, 
  isSpeaking: boolean,
  isFilmstrip?: boolean
}) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  useEffect(() => {
    if (ref.current && stream && stream.getTracks().length > 0) {
      ref.current.srcObject = stream;
      if (hasVideo) {
        ref.current.play().catch(err => {
          console.warn("Explicit video play failed (expected on muted/unfocused play):", err);
        });
      }
    }
  }, [stream, hasVideo]);

  // Listen to the native WebRTC unmute/mute events to know exactly when video packets arrive or stop
  useEffect(() => {
    if (!stream) {
      setIsVideoPlaying(false);
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      setIsVideoPlaying(false);
      return;
    }

    const handleUnmute = () => {
      setIsVideoPlaying(true);
    };

    const handleMute = () => {
      setIsVideoPlaying(false);
    };

    // Initialize state based on current track status
    if (hasVideo && !videoTrack.muted) {
      setIsVideoPlaying(true);
    } else {
      setIsVideoPlaying(false);
    }

    videoTrack.addEventListener('unmute', handleUnmute);
    videoTrack.addEventListener('mute', handleMute);

    // Fallback timer just in case browser doesn't dispatch unmute event instantly
    let timer: NodeJS.Timeout;
    if (hasVideo) {
      timer = setTimeout(() => {
        setIsVideoPlaying(true);
      }, 1500);
    }

    return () => {
      videoTrack.removeEventListener('unmute', handleUnmute);
      videoTrack.removeEventListener('mute', handleMute);
      if (timer) clearTimeout(timer);
    };
  }, [stream, hasVideo]);

  const hasVideoTrack = !!(stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled);
  const isConnecting = hasVideo && (!hasVideoTrack || !isVideoPlaying);
  const showCameraOffPlaceholder = !hasVideo;

  return (
    <div className={`relative group ${isFilmstrip ? 'rounded-xl' : 'rounded-3xl'} overflow-hidden bg-[#0d1411] shadow-xl border-2 transition-colors duration-300 flex items-center justify-center w-full h-auto max-w-full max-h-full aspect-video ${isSpeaking ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'border-green-900/50'}`}>
      
      {/* 1. Camera explicitly Off State */}
      {showCameraOffPlaceholder && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d1411] z-10">
          <div className={`${isFilmstrip ? 'w-8 h-8 text-xs mb-1' : 'w-16 h-16 md:w-20 md:h-20 text-xl md:text-2xl mb-4'} bg-green-900/40 rounded-full flex items-center justify-center font-bold text-green-600 shadow-inner`}>
            {peerId.substring(0, 1).toUpperCase()}
          </div>
          <div className="flex items-center space-x-1 text-green-500/80">
            <VideoOff size={isFilmstrip ? 12 : 18} />
            <span className={`${isFilmstrip ? 'text-[9px]' : 'text-sm'} font-medium`}>Camera Off</span>
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
      <div className={`absolute ${isFilmstrip ? 'bottom-1.5 left-1.5' : 'bottom-3 left-3'} z-30 flex items-center space-x-1.5`}>
        <div className={`bg-green-900/60 backdrop-blur-sm ${isFilmstrip ? 'px-1.5 py-0.5 rounded text-[9px]' : 'px-2 py-1 rounded-lg text-xs'} font-medium shadow-lg border border-green-800/50 flex items-center space-x-2 text-green-100`}>
          <span>{isFilmstrip ? peerId.substring(0, 4) : `Student ${peerId.substring(0, 4)}`}</span>
        </div>
        {!hasAudio ? (
          <div className={`bg-red-500/90 ${isFilmstrip ? 'p-0.5 rounded' : 'p-1 rounded-lg'} shadow-lg`}>
            <MicOff size={isFilmstrip ? 10 : 14} className="text-white" />
          </div>
        ) : isSpeaking ? (
          <div className={`bg-green-500/90 ${isFilmstrip ? 'p-0.5 rounded' : 'p-1 rounded-lg'} shadow-lg`}>
            <AudioWaves />
          </div>
        ) : null}
      </div>
    </div>
  );
};
