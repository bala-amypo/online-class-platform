'use client';
import React from 'react';
import { Monitor, MonitorOff } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface ScreenShareControlsProps {
  isSharing: boolean;
  onToggleShare: () => void;
  disabled?: boolean;
}

export function ScreenShareControls({ isSharing, onToggleShare, disabled = false }: ScreenShareControlsProps) {
  return (
    <Tooltip text={isSharing ? 'Stop sharing screen' : 'Share screen'}>
      <button
        onClick={onToggleShare}
        disabled={disabled}
        className={`p-3 rounded-full transition-all duration-300 flex items-center justify-center ${
          disabled
            ? 'opacity-40 cursor-not-allowed bg-green-950/20 text-green-800'
            : isSharing
            ? 'bg-green-500 text-[#070a09] hover:bg-green-400 border border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.3)]'
            : 'bg-green-900/60 hover:bg-green-800 text-green-100 border border-transparent'
        }`}
      >
        {isSharing ? <MonitorOff size={18} /> : <Monitor size={18} />}
      </button>
    </Tooltip>
  );
}
