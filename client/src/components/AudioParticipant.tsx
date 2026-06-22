import React, { useEffect, useRef } from 'react';
import { useSpeakingDetection } from '../hooks/useSpeakingDetection';

export const AudioParticipant = ({ 
  stream, 
  peerId, 
  isMuted, 
  onSpeakingChange,
  speakerDeviceId
}: { 
  stream?: MediaStream, 
  peerId: string, 
  isMuted: boolean, 
  onSpeakingChange: (peerId: string, isSpeaking: boolean) => void,
  speakerDeviceId?: string
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
      if (!isMuted) {
        audioRef.current.play().catch(err => {
          console.warn("Audio play failed for peer:", peerId, err);
        });
      }
    }
  }, [stream, isMuted, peerId]);

  // Apply selected speaker device (audio output sink ID)
  useEffect(() => {
    interface HTMLAudioElementWithSinkId extends HTMLAudioElement {
      setSinkId(sinkId: string): Promise<void>;
    }
    const audioElement = audioRef.current as HTMLAudioElementWithSinkId | null;
    if (audioElement && typeof audioElement.setSinkId === 'function' && speakerDeviceId) {
      audioElement.setSinkId(speakerDeviceId)
        .catch((err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(`Failed to set Sink ID ${speakerDeviceId} for peer ${peerId}:`, errMsg);
        });
    }
  }, [speakerDeviceId, peerId]);

  return <audio ref={audioRef} autoPlay playsInline muted={false} className="hidden" />;
};
