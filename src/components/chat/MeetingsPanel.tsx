import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { CalendarPlus, Phone, Video } from 'lucide-react';
import { useChatMeetings } from '@/hooks/useChatMeetings';
import { useVideoCall } from '@/hooks/useVideoCall';
import { ScheduleMeetingDialog } from './ScheduleMeetingDialog';
import { MeetingsList } from './MeetingsList';
import { VideoCallDialog } from './VideoCallDialog';

interface MeetingsPanelProps {
  roomId: string | null;
  userId: string | null;
  userName: string;
}

export function MeetingsPanel({ roomId, userId, userName }: MeetingsPanelProps) {
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const { 
    meetings, 
    scheduleMeeting, 
    deleteMeeting, 
    updateMeetingStatus 
  } = useChatMeetings(roomId);

  const {
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
  } = useVideoCall(roomId, userId, userName);

  const handleStartCall = async () => {
    await joinCall();
    setShowVideoCall(true);
    setIsSheetOpen(false);
  };

  const handleEndCall = () => {
    leaveCall();
    setShowVideoCall(false);
  };

  const upcomingCount = meetings.filter(
    (m) => m.status === 'scheduled' && new Date(m.scheduled_at) > new Date()
  ).length;

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Quick Call Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleStartCall}
          disabled={isConnecting || isInCall}
          title="Start instant call"
        >
          <Phone className="h-4 w-4" />
        </Button>

        {/* Meetings Panel */}
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 relative" title="Meetings">
              <Video className="h-4 w-4" />
              {upcomingCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
                  {upcomingCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Meetings</SheetTitle>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button onClick={handleStartCall} disabled={isConnecting} className="flex-1">
                  <Phone className="h-4 w-4 mr-2" />
                  Start Instant Call
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setShowScheduleDialog(true)}
                  className="flex-1"
                >
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Schedule
                </Button>
              </div>

              {/* Meetings List */}
              <MeetingsList
                meetings={meetings}
                userId={userId}
                onStartCall={handleStartCall}
                onDeleteMeeting={deleteMeeting}
                onUpdateStatus={updateMeetingStatus}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Schedule Meeting Dialog */}
      <ScheduleMeetingDialog
        open={showScheduleDialog}
        onOpenChange={setShowScheduleDialog}
        onSchedule={scheduleMeeting}
      />

      {/* Video Call Dialog */}
      <VideoCallDialog
        open={showVideoCall}
        onOpenChange={setShowVideoCall}
        participants={participants}
        localStream={localStream}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        onLeaveCall={handleEndCall}
        currentUserId={userId}
      />
    </>
  );
}
