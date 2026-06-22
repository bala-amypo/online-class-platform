'use client';
import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Monitor, Square } from 'lucide-react';

interface ScreenSharePresenterProps {
  stream: MediaStream | null;
  presenterName: string;
  isLocal: boolean;
  onStopShare?: () => void;
}

export function ScreenSharePresenter({ stream, presenterName, isLocal, onStopShare }: ScreenSharePresenterProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream && !isLocal) {
      video.srcObject = stream;
      video.play().catch(err => {
        console.warn('Error auto-playing screen share video:', err);
      });
    }
  }, [stream, isLocal]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error('Error entering fullscreen:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <div 
      ref={containerRef}
      className="relative flex-1 bg-[#050706] border border-green-500/20 rounded-3xl overflow-hidden shadow-[0_0_30px_rgba(34,197,94,0.05)] flex items-center justify-center min-h-[300px] h-full group"
    >
      {isLocal ? (
        /* Presenter Mirror Loop Prevention Placeholder */
        <div className="flex flex-col items-center justify-center text-center p-8 space-y-5 z-10 select-none">
          <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center shadow-[0_0_40px_rgba(34,197,94,0.15)] relative">
            <div className="absolute inset-0 rounded-full border border-green-500/20 animate-ping" style={{ animationDuration: '3s' }} />
            <Monitor className="w-10 h-10 text-green-400" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-base font-bold text-green-300 tracking-widest uppercase font-mono">
              You are sharing your screen
            </h3>
            <p className="text-[10px] text-green-700/90 max-w-sm mx-auto uppercase tracking-wider font-mono leading-relaxed">
              To avoid a feedback mirror loop, switch to the other tab or window you want to display.
            </p>
          </div>

          {onStopShare && (
            <button
              onClick={onStopShare}
              className="px-5 py-2.5 bg-red-650/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 hover:border-transparent text-[10px] font-bold font-mono tracking-widest uppercase rounded-full transition duration-300 flex items-center space-x-2 shadow-lg hover:shadow-red-650/10 cursor-pointer"
            >
              <Square size={12} className="fill-current" />
              <span>Stop Presenting</span>
            </button>
          )}
        </div>
      ) : (
        /* Video Element for Remote Watchers */
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain max-h-full"
        />
      )}

      {/* Presentation Badge Indicator */}
      <div className="absolute top-4 left-4 z-10 flex items-center space-x-2 bg-black/70 backdrop-blur-md px-3.5 py-2 rounded-full border border-green-500/30">
        <Monitor className="w-4 h-4 text-green-400 animate-pulse" />
        <span className="text-[11px] font-bold tracking-wider text-green-300 font-mono uppercase">
          {isLocal ? 'You are presenting' : `${presenterName.substring(0, 5)} is presenting`}
        </span>
      </div>

      {/* Screen Controls Toolbar (Fullscreen Open & Close Button at top-right) */}
      <div className="absolute top-4 right-4 z-30">
        <button
          onClick={toggleFullscreen}
          className="bg-black/70 hover:bg-green-500 hover:text-[#070a09] text-green-400 border border-green-500/30 hover:border-green-500 p-2 rounded-full transition duration-300 backdrop-blur-sm shadow-xl flex items-center justify-center cursor-pointer active:scale-95"
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* Cyberpunk Scanline Aesthetic (Only over placeholder) */}
      {isLocal && (
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.15)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[size:100%_4px,3px_100%] opacity-20" />
      )}
    </div>
  );
}
