import React from 'react';

export const AudioWaves = () => (
  <div className="flex items-center justify-center space-x-[2px] h-3 px-1 w-5">
    <style dangerouslySetInnerHTML={{
      __html: `
      @keyframes audioWave {
        0%, 100% { height: 3px; }
        50% { height: 12px; }
      }
      .wave-bar {
        width: 2px;
        background-color: white;
        border-radius: 9999px;
        animation: audioWave 1s ease-in-out infinite;
      }
    `}} />
    <div className="wave-bar" style={{ animationDelay: '0.0s' }}></div>
    <div className="wave-bar" style={{ animationDelay: '0.2s' }}></div>
    <div className="wave-bar" style={{ animationDelay: '0.4s' }}></div>
  </div>
);
