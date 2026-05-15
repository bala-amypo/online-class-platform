import React, { useEffect, useRef } from 'react';
import { VideoOff, MicOff } from 'lucide-react';
import { AudioWaves } from './AudioWaves';

export const VideoComponent = ({ stream, peerId, hasVideo, hasAudio, isSpeaking }: { stream?: MediaStream, peerId: string, hasVideo: boolean, hasAudio: boolean, isSpeaking: boolean }) => {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current && stream && stream.getTracks().length > 0) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`relative group rounded-3xl overflow-hidden bg-[#0d1411] shadow-xl border-2 transition-colors duration-300 flex items-center justify-center h-full w-full ${isSpeaking ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'border-green-900/50'}`}>
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d1411] z-10">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-green-900/40 rounded-full flex items-center justify-center text-xl md:text-2xl font-bold text-green-600 shadow-inner mb-4">
            {peerId.substring(0, 1).toUpperCase()}
          </div>
          <div className="flex items-center space-x-2 text-green-500">
            <VideoOff size={18} />
            <span className="text-sm font-medium">Camera Off</span>
          </div>
        </div>
      )}
      <video ref={ref} autoPlay playsInline muted className={`w-full h-full object-cover`} />
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
