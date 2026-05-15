import React from 'react';
import { MicOff, Maximize } from 'lucide-react';
import { AudioWaves } from './AudioWaves';

export const LocalVideoComponent = ({ videoRef, isVideoOff, isMuted, isSpeaking }: any) => (
  <div className={`relative group rounded-3xl overflow-hidden bg-[#0d1411] shadow-xl border-2 transition-colors duration-300 flex items-center justify-center ${isSpeaking ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'border-green-900/50'}`}>
    {isVideoOff && (
      <div className="absolute inset-0 flex items-center justify-center bg-[#0d1411] z-10">
        <div className="w-16 h-16 md:w-20 md:h-20 bg-green-900/40 rounded-full flex items-center justify-center text-xl md:text-2xl font-bold text-green-600 shadow-inner">
          You
        </div>
      </div>
    )}
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className={`w-full h-full object-cover transform -scale-x-100 transition-transform duration-300`}
    />
    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />
    <div className="absolute bottom-3 left-3 flex items-center space-x-2 z-20">
      <div className="bg-green-600/90 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-medium shadow-lg flex items-center space-x-2 text-white">
        <span>You</span>
      </div>
      {isMuted ? (
        <div className="bg-red-500/90 p-1 rounded-lg shadow-lg">
          <MicOff size={14} className="text-white" />
        </div>
      ) : isSpeaking ? (
        <div className="bg-green-500/90 p-1 rounded-lg shadow-lg">
          <AudioWaves />
        </div>
      ) : null}
    </div>
    <div className="absolute top-3 right-3 z-20">
      <button className="bg-black/50 hover:bg-black/70 p-1.5 rounded-full backdrop-blur-md transition">
        <Maximize size={14} className="text-gray-300" />
      </button>
    </div>
  </div>
);
