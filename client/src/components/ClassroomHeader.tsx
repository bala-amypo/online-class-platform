import React from 'react';
import { Users } from 'lucide-react';

export const ClassroomHeader = ({ roomId, totalParticipants }: { roomId: string, totalParticipants: number }) => (
  <header className="flex justify-between items-center px-4 py-2 bg-[#0d1411]/90 backdrop-blur-md border-b border-green-900/50 z-10">
    <div className="flex items-center space-x-3">
      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.7)]"></div>
      <h1 className="text-lg font-semibold tracking-wide text-green-100">Classroom: <span className="text-green-400">{roomId}</span></h1>
      <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded-md border border-green-500/30">SFU Powered</span>
    </div>
    <div className="flex items-center space-x-4 bg-green-900/50 px-3 py-1.5 rounded-full border border-green-800/50">
      <div className="flex items-center space-x-2 text-green-300">
        <Users size={16} />
        <span className="font-medium text-sm">{totalParticipants}</span>
      </div>
    </div>
  </header>
);
