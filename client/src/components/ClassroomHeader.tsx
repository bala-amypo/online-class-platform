import React from 'react';
import { Users } from 'lucide-react';

export const ClassroomHeader = ({ roomId, totalParticipants, onToggleSidebar }: { roomId: string, totalParticipants: number, onToggleSidebar?: () => void }) => (
  <header className="flex justify-between items-center px-4 py-2 bg-[#0d1411]/90 backdrop-blur-md border-b border-green-900/50 z-10">
    <div className="flex items-center space-x-3">
      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.7)]"></div>
      <h1 className="text-md font-semibold tracking-wide text-green-100"><span className="text-green-400">{roomId}</span></h1>
    </div>
    <button
      onClick={onToggleSidebar}
      className="flex items-center space-x-4 bg-green-900/40 hover:bg-green-500/10 px-3 py-1.5 rounded-full border border-green-800/40 hover:border-green-500/30 cursor-pointer transition shadow-inner"
    >
      <div className="flex items-center space-x-2 text-green-300">
        <Users size={16} className="animate-pulse" />
        <span className="font-medium text-sm">{totalParticipants}</span>
      </div>
    </button>
  </header>
);
