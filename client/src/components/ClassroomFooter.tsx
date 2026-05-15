import React from 'react';
import { Mic, MicOff, Video, VideoOff, MessageSquare, Settings, PhoneOff } from 'lucide-react';
import { Tooltip } from './Tooltip';

export const ClassroomFooter = ({ isMuted, isVideoOff, toggleMute, toggleVideo, leaveRoom }: any) => (
  <footer className="pb-4 pt-2 px-4 z-10 relative">
    <div className="max-w-sm mx-auto bg-[#0d1411]/90 backdrop-blur-xl border border-green-800/30 rounded-full px-4 py-2.5 flex items-center justify-between shadow-2xl shadow-black/50">
      
      <Tooltip text={isMuted ? 'Unmute' : 'Mute'}>
        <button onClick={toggleMute} className={`p-3 rounded-full transition-all duration-300 flex items-center justify-center ${isMuted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/30' : 'bg-green-900/60 hover:bg-green-800 text-green-100 border border-transparent'}`}>
          {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
      </Tooltip>

      <Tooltip text={isVideoOff ? 'Turn on camera' : 'Turn off camera'}>
        <button onClick={toggleVideo} className={`p-3 rounded-full transition-all duration-300 flex items-center justify-center ${isVideoOff ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/30' : 'bg-green-900/60 hover:bg-green-800 text-green-100 border border-transparent'}`}>
          {isVideoOff ? <VideoOff size={18} /> : <Video size={18} />}
        </button>
      </Tooltip>

      <Tooltip text="Chat" className="hidden sm:flex">
        <button className="p-3 rounded-full bg-green-900/60 hover:bg-green-800 text-green-100 transition-all duration-300">
          <MessageSquare size={18} />
        </button>
      </Tooltip>

      <Tooltip text="Settings" className="hidden sm:flex">
        <button className="p-3 rounded-full bg-green-900/60 hover:bg-green-800 text-green-100 transition-all duration-300">
          <Settings size={18} />
        </button>
      </Tooltip>

      <Tooltip text="Leave call">
        <button onClick={leaveRoom} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-full transition-all duration-300 flex items-center space-x-2 shadow-lg shadow-red-600/20">
          <PhoneOff size={16} />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </Tooltip>

    </div>
  </footer>
);
