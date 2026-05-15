import React, { useEffect, useRef } from 'react';
import { useSpeakingDetection } from '../hooks/useSpeakingDetection';

export const AudioParticipant = ({ 
  stream, 
  peerId, 
  isMuted, 
  onSpeakingChange 
}: { 
  stream?: MediaStream, 
  peerId: string, 
  isMuted: boolean, 
  onSpeakingChange: (peerId: string, isSpeaking: boolean) => void 
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const isSpeaking = useSpeakingDetection(stream || null, isMuted);

  useEffect(() => {
    onSpeakingChange(peerId, isSpeaking);
  }, [isSpeaking, peerId, onSpeakingChange]);

  useEffect(() => {
    if (audioRef.current && stream && stream.getAudioTracks().length > 0) {
      const audioStream = new MediaStream([stream.getAudioTracks()[0]]);
      audioRef.current.srcObject = audioStream;
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline muted={false} className="hidden" />;
};
