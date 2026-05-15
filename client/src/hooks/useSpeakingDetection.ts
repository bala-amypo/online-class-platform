import { useState, useEffect } from 'react';

export const useSpeakingDetection = (stream: MediaStream | null, isMuted: boolean) => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || isMuted) {
      setIsSpeaking(false);
      return;
    }

    let audioContext: AudioContext;
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      return;
    }

    const analyser = audioContext.createAnalyser();
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.85;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const audioStream = new MediaStream([audioTracks[0]]);
    const source = audioContext.createMediaStreamSource(audioStream);
    source.connect(analyser);

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let intervalId: NodeJS.Timeout;

    const detectSpeaking = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const average = sum / bufferLength;

      if (average > 15) setIsSpeaking(true);
      else setIsSpeaking(false);
    };

    intervalId = setInterval(detectSpeaking, 150);

    return () => {
      clearInterval(intervalId);
      source.disconnect();
      if (audioContext.state !== 'closed') {
        audioContext.close().catch(console.error);
      }
    };
  }, [stream, isMuted]);

  return isSpeaking;
};
