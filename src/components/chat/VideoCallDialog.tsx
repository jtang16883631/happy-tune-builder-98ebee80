import { useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Participant {
  id: string;
  name: string;
  stream?: MediaStream;
  isMuted: boolean;
  isVideoOff: boolean;
}

interface VideoCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participants: Participant[];
  localStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onLeaveCall: () => void;
  currentUserId: string | null;
}

function VideoTile({ participant, isLocal }: { participant: Participant; isLocal?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  return (
    <div className="relative bg-muted rounded-lg overflow-hidden aspect-video">
      {participant.stream && !participant.isVideoOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-2xl font-semibold text-primary-foreground">
              {participant.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </div>
      )}
      
      <div className="absolute bottom-2 left-2 flex items-center gap-2">
        <span className="bg-background/80 text-foreground px-2 py-1 rounded text-sm">
          {isLocal ? 'You' : participant.name}
        </span>
        {participant.isMuted && (
          <span className="bg-destructive/80 p-1 rounded">
            <MicOff className="h-3 w-3 text-destructive-foreground" />
          </span>
        )}
      </div>
    </div>
  );
}

export function VideoCallDialog({
  open,
  onOpenChange,
  participants,
  localStream,
  isMuted,
  isVideoOff,
  onToggleMute,
  onToggleVideo,
  onLeaveCall,
  currentUserId,
}: VideoCallDialogProps) {
  const handleClose = () => {
    onLeaveCall();
    onOpenChange(false);
  };

  const localParticipant = participants.find((p) => p.id === currentUserId);
  const remoteParticipants = participants.filter((p) => p.id !== currentUserId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Video Call ({participants.length} participant{participants.length !== 1 ? 's' : ''})
          </DialogTitle>
        </DialogHeader>

        {/* Video Grid */}
        <div className="flex-1 overflow-auto">
          <div className={cn(
            'grid gap-4 h-full',
            participants.length === 1 && 'grid-cols-1',
            participants.length === 2 && 'grid-cols-2',
            participants.length >= 3 && participants.length <= 4 && 'grid-cols-2 grid-rows-2',
            participants.length > 4 && 'grid-cols-3'
          )}>
            {localParticipant && (
              <VideoTile 
                participant={{ ...localParticipant, stream: localStream || undefined, isMuted, isVideoOff }} 
                isLocal 
              />
            )}
            {remoteParticipants.map((participant) => (
              <VideoTile key={participant.id} participant={participant} />
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 pt-4 border-t">
          <Button
            variant={isMuted ? 'destructive' : 'secondary'}
            size="lg"
            onClick={onToggleMute}
            className="rounded-full w-14 h-14"
          >
            {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </Button>

          <Button
            variant={isVideoOff ? 'destructive' : 'secondary'}
            size="lg"
            onClick={onToggleVideo}
            className="rounded-full w-14 h-14"
          >
            {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
          </Button>

          <Button
            variant="destructive"
            size="lg"
            onClick={handleClose}
            className="rounded-full w-14 h-14"
          >
            <PhoneOff className="h-6 w-6" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
