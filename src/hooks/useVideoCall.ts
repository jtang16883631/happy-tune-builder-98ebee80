import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Participant {
  id: string;
  name: string;
  stream?: MediaStream;
  isMuted: boolean;
  isVideoOff: boolean;
}

interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave' | 'mute-change' | 'video-change';
  from: string;
  to?: string;
  data?: unknown;
  isMuted?: boolean;
  isVideoOff?: boolean;
}

export function useVideoCall(roomId: string | null, userId: string | null, userName: string) {
  const [isInCall, setIsInCall] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const createPeerConnection = useCallback((peerId: string) => {
    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'ice-candidate',
            from: userId,
            to: peerId,
            data: event.candidate,
          } as SignalMessage,
        });
      }
    };

    pc.ontrack = (event) => {
      setParticipants((prev) => {
        const existing = prev.find((p) => p.id === peerId);
        if (existing) {
          return prev.map((p) =>
            p.id === peerId ? { ...p, stream: event.streams[0] } : p
          );
        }
        return [...prev, { id: peerId, name: 'User', stream: event.streams[0], isMuted: false, isVideoOff: false }];
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        peerConnections.current.delete(peerId);
        setParticipants((prev) => prev.filter((p) => p.id !== peerId));
      }
    };

    return pc;
  }, [userId]);

  const handleSignal = useCallback(async (message: SignalMessage) => {
    if (!userId || message.from === userId) return;
    if (message.to && message.to !== userId) return;

    switch (message.type) {
      case 'join': {
        // Someone joined, send them an offer
        let pc = peerConnections.current.get(message.from);
        if (!pc) {
          pc = createPeerConnection(message.from);
          peerConnections.current.set(message.from, pc);
        }

        if (localStream) {
          localStream.getTracks().forEach((track) => {
            pc!.addTrack(track, localStream);
          });
        }

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        channelRef.current?.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'offer',
            from: userId,
            to: message.from,
            data: offer,
          } as SignalMessage,
        });
        break;
      }

      case 'offer': {
        let pc = peerConnections.current.get(message.from);
        if (!pc) {
          pc = createPeerConnection(message.from);
          peerConnections.current.set(message.from, pc);
        }

        if (localStream) {
          localStream.getTracks().forEach((track) => {
            pc!.addTrack(track, localStream);
          });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(message.data as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        channelRef.current?.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'answer',
            from: userId,
            to: message.from,
            data: answer,
          } as SignalMessage,
        });
        break;
      }

      case 'answer': {
        const pc = peerConnections.current.get(message.from);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(message.data as RTCSessionDescriptionInit));
        }
        break;
      }

      case 'ice-candidate': {
        const pc = peerConnections.current.get(message.from);
        if (pc && message.data) {
          await pc.addIceCandidate(new RTCIceCandidate(message.data as RTCIceCandidateInit));
        }
        break;
      }

      case 'leave': {
        const pc = peerConnections.current.get(message.from);
        if (pc) {
          pc.close();
          peerConnections.current.delete(message.from);
        }
        setParticipants((prev) => prev.filter((p) => p.id !== message.from));
        break;
      }

      case 'mute-change': {
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === message.from ? { ...p, isMuted: message.isMuted ?? false } : p
          )
        );
        break;
      }

      case 'video-change': {
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === message.from ? { ...p, isVideoOff: message.isVideoOff ?? false } : p
          )
        );
        break;
      }
    }
  }, [userId, localStream, createPeerConnection]);

  const joinCall = useCallback(async () => {
    if (!roomId || !userId) return;

    setIsConnecting(true);
    try {
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);

      // Join the signaling channel
      const channel = supabase.channel(`video-call-${roomId}`);
      channelRef.current = channel;

      channel
        .on('broadcast', { event: 'signal' }, ({ payload }) => {
          handleSignal(payload as SignalMessage);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // Announce joining
            channel.send({
              type: 'broadcast',
              event: 'signal',
              payload: {
                type: 'join',
                from: userId,
              } as SignalMessage,
            });
          }
        });

      setIsInCall(true);
      setParticipants([{ id: userId, name: userName || 'You', stream, isMuted: false, isVideoOff: false }]);
    } catch (error) {
      console.error('Error joining call:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [roomId, userId, userName, handleSignal]);

  const leaveCall = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'signal',
        payload: {
          type: 'leave',
          from: userId,
        } as SignalMessage,
      });
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    // Close all peer connections
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();

    setIsInCall(false);
    setParticipants([]);
    setIsMuted(false);
    setIsVideoOff(false);
  }, [userId, localStream]);

  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);

        channelRef.current?.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'mute-change',
            from: userId,
            isMuted: !audioTrack.enabled,
          } as SignalMessage,
        });
      }
    }
  }, [localStream, userId]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);

        channelRef.current?.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            type: 'video-change',
            from: userId,
            isVideoOff: !videoTrack.enabled,
          } as SignalMessage,
        });
      }
    }
  }, [localStream, userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isInCall) {
        leaveCall();
      }
    };
  }, [isInCall, leaveCall]);

  return {
    isInCall,
    isConnecting,
    participants,
    localStream,
    isMuted,
    isVideoOff,
    joinCall,
    leaveCall,
    toggleMute,
    toggleVideo,
  };
}
