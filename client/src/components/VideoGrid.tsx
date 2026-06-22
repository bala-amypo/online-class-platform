'use client';
import React, { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { LocalVideoComponent } from './LocalVideoComponent';
import { VideoComponent } from './VideoComponent';

interface VideoGridProps {
  layoutStyle: 'paginated' | 'sidebar' | 'presentation';
  localStream: MediaStream | null;
  localMediaState: {
    video: boolean;
    audio: boolean;
    isSpeaking: boolean;
  };
  peers: { [id: string]: MediaStream };
  peerMediaStates: { [id: string]: { video: boolean, audio: boolean } };
  activeSpeakers: Set<string>;
  participants: Set<string>;
  localSocketId: string | null;
  onOpenDirectory?: () => void;
}

export function VideoGrid({
  layoutStyle,
  localStream,
  localMediaState,
  peers,
  peerMediaStates,
  activeSpeakers,
  participants,
  localSocketId,
  onOpenDirectory
}: VideoGridProps) {
  const [currentPage, setCurrentPage] = useState(0);

  // 1. Compute sorted remote participants list
  const sortedRemoteParticipants = useMemo(() => {
    const remotePeers = Array.from(participants).filter(p => p !== localSocketId);
    
    // Sort so that active speakers are at the front
    const activeList = remotePeers.filter(p => activeSpeakers.has(p));
    const inactiveList = remotePeers.filter(p => !activeSpeakers.has(p));
    
    return [...activeList, ...inactiveList];
  }, [participants, localSocketId, activeSpeakers]);

  // 2. Sidebar Stage Layout Calculations
  const spotlightPeerId = useMemo(() => {
    if (sortedRemoteParticipants.length > 0) {
      return sortedRemoteParticipants[0];
    }
    return null;
  }, [sortedRemoteParticipants]);

  const sidebarSidePeers = useMemo(() => {
    if (sortedRemoteParticipants.length > 1) {
      return [sortedRemoteParticipants[1]];
    }
    return [];
  }, [sortedRemoteParticipants]);

  const hasSidebarOthers = sortedRemoteParticipants.length > 2;
  const sidebarOthersCount = sortedRemoteParticipants.length - 2;

  // 3. Paginated Layout Calculations
  const paginatedTilesList = useMemo(() => {
    return [
      { type: 'local', id: 'local' },
      ...sortedRemoteParticipants.map(peerId => ({ type: 'remote', id: peerId }))
    ];
  }, [sortedRemoteParticipants]);

  const totalPages = Math.ceil(paginatedTilesList.length / 12);
  const safeCurrentPage = Math.min(currentPage, Math.max(0, totalPages - 1));

  const pageTiles = useMemo(() => {
    return paginatedTilesList.slice(safeCurrentPage * 12, (safeCurrentPage + 1) * 12);
  }, [paginatedTilesList, safeCurrentPage]);

  // Auto reset page if totalPages changes
  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }
  }, [totalPages, currentPage]);

  const renderedTilesCount = pageTiles.length;

  let gridClass = "grid-cols-1 md:grid-cols-1 max-w-6xl mx-auto auto-rows-fr";
  if (renderedTilesCount === 2) {
    gridClass = "grid-cols-1 md:grid-cols-2 auto-rows-fr";
  } else if (renderedTilesCount >= 3 && renderedTilesCount <= 4) {
    gridClass = "grid-cols-2 md:grid-cols-2 auto-rows-fr";
  } else if (renderedTilesCount >= 5 && renderedTilesCount <= 9) {
    gridClass = "grid-cols-2 md:grid-cols-3 auto-rows-fr";
  } else if (renderedTilesCount >= 10 && renderedTilesCount <= 12) {
    gridClass = "grid-cols-2 md:grid-cols-4 auto-rows-fr";
  }

  // --- RENDER PRESENTATION FILMSTRIP ---
  if (layoutStyle === 'presentation') {
    return (
      <div className="w-full flex-shrink-0 flex items-center space-x-3 overflow-x-auto py-2 px-1 min-h-[110px] h-[110px] max-h-[110px] bg-black/30 border border-green-500/10 rounded-2xl scrollbar-thin scrollbar-thumb-green-950 scrollbar-track-transparent">
        {/* Local Webcam Tile */}
        <div className="w-36 aspect-video flex-shrink-0 relative rounded-xl overflow-hidden border border-green-500/20">
          <LocalVideoComponent
            stream={localStream}
            isVideoOff={localMediaState.video === false}
            isMuted={localMediaState.audio === false}
            isSpeaking={localMediaState.isSpeaking}
            isFilmstrip={true}
          />
        </div>

        {/* Remote Webcam Tiles */}
        {sortedRemoteParticipants.map(peerId => (
          <div key={peerId} className="w-36 aspect-video flex-shrink-0 relative rounded-xl overflow-hidden border border-green-500/10">
            <VideoComponent
              stream={peers[peerId]}
              peerId={peerId}
              hasVideo={peerMediaStates[peerId]?.video ?? true}
              hasAudio={peerMediaStates[peerId]?.audio ?? true}
              isSpeaking={activeSpeakers.has(peerId)}
              isFilmstrip={true}
            />
          </div>
        ))}
      </div>
    );
  }

  // --- RENDER SIDEBAR STAGE ---
  if (layoutStyle === 'sidebar') {
    return (
      <div className="flex-1 w-full h-full max-h-full min-h-0 flex flex-col md:flex-row gap-4">
        {/* Spotlight Main Area (75% width on desktop) */}
        <div className="flex-[3] h-full w-full min-h-0 rounded-3xl overflow-hidden relative shadow-inner">
          {spotlightPeerId ? (
            <VideoComponent
              key={spotlightPeerId}
              stream={peers[spotlightPeerId]}
              peerId={spotlightPeerId}
              hasVideo={peerMediaStates[spotlightPeerId]?.video ?? true}
              hasAudio={peerMediaStates[spotlightPeerId]?.audio ?? true}
              isSpeaking={activeSpeakers.has(spotlightPeerId)}
            />
          ) : (
            <LocalVideoComponent
              stream={localStream}
              isVideoOff={localMediaState.video === false}
              isMuted={localMediaState.audio === false}
              isSpeaking={localMediaState.isSpeaking}
            />
          )}
        </div>

        {/* Vertical Sidebar Column (25% width on desktop) */}
        {spotlightPeerId && (
          <div className="flex-[1] flex flex-row md:flex-col gap-4 h-full w-full min-h-0 max-w-none md:max-w-xs justify-center items-center">
            {/* Always include your local video on the side */}
            <div className="flex-1 min-h-0 w-full flex items-center justify-center">
              <LocalVideoComponent
                stream={localStream}
                isVideoOff={localMediaState.video === false}
                isMuted={localMediaState.audio === false}
                isSpeaking={localMediaState.isSpeaking}
              />
            </div>

            {/* Second slot (next remote peer) if exists */}
            {sidebarSidePeers.map(peerId => (
              <div key={peerId} className="flex-1 min-h-0 w-full flex items-center justify-center">
                <VideoComponent
                  stream={peers[peerId]}
                  peerId={peerId}
                  hasVideo={peerMediaStates[peerId]?.video ?? true}
                  hasAudio={peerMediaStates[peerId]?.audio ?? true}
                  isSpeaking={activeSpeakers.has(peerId)}
                />
              </div>
            ))}

            {/* Third slot: "+X More" card if there are more than 2 remote peers */}
            {hasSidebarOthers && (
              <div className="flex-1 min-h-0 w-full flex items-center justify-center">
                <div
                  onClick={onOpenDirectory}
                  className="w-full max-w-full max-h-full relative group rounded-3xl overflow-hidden bg-[#0d1411]/80 backdrop-blur-md shadow-xl border-2 border-green-900/30 flex flex-col items-center justify-center transition-all duration-300 hover:border-green-500/50 hover:bg-[#0d1411] cursor-pointer aspect-video"
                >
                  <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mb-2 border border-green-500/20 shadow-inner group-hover:bg-green-500/20 transition">
                    <Users size={20} className="text-green-500 group-hover:scale-110 transition duration-300" />
                  </div>
                  <div className="text-center">
                    <span className="block text-lg font-bold text-green-400">+{sidebarOthersCount}</span>
                    <span className="text-[9px] font-semibold text-green-600 uppercase tracking-wider block">More Participants</span>
                    <span className="text-[8px] text-green-700/80 mt-0.5 block group-hover:text-green-500 transition animate-pulse">Click to View</span>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // --- RENDER PAGINATED GRID (DEFAULT) ---
  return (
    <div className="flex-1 w-full h-full max-h-full min-h-0 flex items-center justify-between relative group/arrows">
      {/* Left Page Arrow */}
      {totalPages > 1 && (
        <button
          disabled={safeCurrentPage === 0}
          onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
          className={`absolute left-0 z-40 bg-black/60 hover:bg-green-500 hover:text-[#070a09] text-green-500 border border-green-950/40 p-3 rounded-full transition-all duration-300 backdrop-blur-md shadow-2xl flex items-center justify-center ${safeCurrentPage === 0 ? 'opacity-0 pointer-events-none' : 'opacity-100 group-hover/arrows:scale-105'}`}
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Grid Container */}
      <div className={`grid gap-4 w-full h-full max-h-full flex-1 min-h-0 items-center justify-center justify-items-center content-center ${gridClass} transition-all duration-500 ease-in-out px-10`}>
        {pageTiles.map(tile => {
          if (tile.type === 'local') {
            return (
              <LocalVideoComponent
                key="local"
                stream={localStream}
                isVideoOff={localMediaState.video === false}
                isMuted={localMediaState.audio === false}
                isSpeaking={localMediaState.isSpeaking}
              />
            );
          } else {
            const peerId = tile.id;
            return (
              <VideoComponent
                key={peerId}
                stream={peers[peerId]}
                peerId={peerId}
                hasVideo={peerMediaStates[peerId]?.video ?? true}
                hasAudio={peerMediaStates[peerId]?.audio ?? true}
                isSpeaking={activeSpeakers.has(peerId)}
              />
            );
          }
        })}
      </div>

      {/* Right Page Arrow */}
      {totalPages > 1 && (
        <button
          disabled={safeCurrentPage === totalPages - 1}
          onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
          className={`absolute right-0 z-40 bg-black/60 hover:bg-green-500 hover:text-[#070a09] text-green-500 border border-green-950/40 p-3 rounded-full transition-all duration-300 backdrop-blur-md shadow-2xl flex items-center justify-center ${safeCurrentPage === totalPages - 1 ? 'opacity-0 pointer-events-none' : 'opacity-100 group-hover/arrows:scale-105'}`}
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>
  );
}
