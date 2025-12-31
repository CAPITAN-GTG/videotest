'use client';

import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';

export default function Home() {
  const [roomCode, setRoomCode] = useState('');
  const [joined, setJoined] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const audioMeterRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const smoothedLevelRef = useRef<number>(0);
  const socketRef = useRef<any>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const joinRoom = async () => {
    if (!roomCode) return;
    
    try {
      setJoined(true);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setLocalStream(stream);
      
      const socket = io();
      socketRef.current = socket;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (e) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
      };

      const iceCandidates: RTCIceCandidateInit[] = [];
      let remoteId: string | null = null;

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          if (remoteId) {
            socket.emit('ice-candidate', e.candidate, remoteId);
          } else {
            iceCandidates.push(e.candidate);
          }
        }
      };

      socket.on('user-joined', async (id: string) => {
        remoteId = id;
        iceCandidates.forEach(c => socket.emit('ice-candidate', c, id));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', offer, id);
      });

      socket.on('offer', async (offer: RTCSessionDescriptionInit, fromId: string) => {
        remoteId = fromId;
        await pc.setRemoteDescription(offer);
        iceCandidates.forEach(c => socket.emit('ice-candidate', c, fromId));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', answer, fromId);
      });

      socket.on('answer', async (answer: RTCSessionDescriptionInit) => {
        await pc.setRemoteDescription(answer);
      });

      socket.on('ice-candidate', async (candidate: RTCIceCandidateInit) => {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(candidate);
        }
      });

      socket.emit('join-room', roomCode);
    } catch (err) {
      console.error('Error joining room:', err);
      setJoined(false);
    }
  };
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
      
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(localStream);
      microphone.connect(analyser);
      analyser.fftSize = 256;
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateAudioLevel = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteTimeDomainData(dataArray);
          const max = Math.max(...dataArray);
          const level = Math.abs(max - 128) * 2;
          smoothedLevelRef.current = smoothedLevelRef.current * 0.7 + level * 0.3;
          setAudioLevel(smoothedLevelRef.current);
          animationRef.current = requestAnimationFrame(updateAudioLevel);
        }
      };
      updateAudioLevel();
    }
    
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [localStream]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      pcRef.current?.close();
      socketRef.current?.disconnect();
    };
  }, []);

  if (!joined) {
    return (
      <div>
        <input value={roomCode} onChange={(e) => setRoomCode(e.target.value)} placeholder="Room code" />
        <button onClick={joinRoom}>Join</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <video ref={localVideoRef} autoPlay muted width={400} height={300} />
        <video ref={remoteVideoRef} autoPlay width={400} height={300} />
      </div>
      <div 
        ref={audioMeterRef}
        style={{
          width: '50px',
          height: '600px',
          backgroundColor: '#000',
          display: 'flex',
          alignItems: 'flex-end'
        }}
      >
        <div
          style={{
            width: '100%',
            height: `${Math.min((audioLevel / 128) * 100, 100)}%`,
            backgroundColor: '#0f0'
          }}
        />
      </div>
    </div>
  );
}
