import { format, isPast, isFuture } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Clock, Play, Trash2, User, Video } from 'lucide-react';
import { ChatMeeting } from '@/hooks/useChatMeetings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface MeetingsListProps {
  meetings: ChatMeeting[];
  userId: string | null;
  onStartCall: () => void;
  onDeleteMeeting: (meetingId: string) => void;
  onUpdateStatus: (meetingId: string, status: ChatMeeting['status']) => void;
}

export function MeetingsList({ 
  meetings, 
  userId, 
  onStartCall, 
  onDeleteMeeting,
  onUpdateStatus 
}: MeetingsListProps) {
  const upcomingMeetings = meetings.filter(
    (m) => m.status === 'scheduled' && isFuture(new Date(m.scheduled_at))
  );
  const pastMeetings = meetings.filter(
    (m) => m.status !== 'scheduled' || isPast(new Date(m.scheduled_at))
  );

  const getStatusBadge = (meeting: ChatMeeting) => {
    switch (meeting.status) {
      case 'scheduled':
        if (isPast(new Date(meeting.scheduled_at))) {
          return <Badge variant="secondary">Missed</Badge>;
        }
        return <Badge variant="default">Scheduled</Badge>;
      case 'in_progress':
        return <Badge className="bg-primary text-primary-foreground">In Progress</Badge>;
      case 'completed':
        return <Badge variant="secondary">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return null;
    }
  };

  const canStartMeeting = (meeting: ChatMeeting) => {
    const scheduledTime = new Date(meeting.scheduled_at);
    const now = new Date();
    const timeDiff = scheduledTime.getTime() - now.getTime();
    // Can start 5 minutes before scheduled time
    return timeDiff <= 5 * 60 * 1000 && meeting.status === 'scheduled';
  };

  if (meetings.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No meetings scheduled yet</p>
        <p className="text-sm">Schedule a meeting or start an instant call</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {upcomingMeetings.length > 0 && (
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Video className="h-4 w-4" />
            Upcoming Meetings
          </h4>
          <div className="space-y-3">
            {upcomingMeetings.map((meeting) => (
              <Card key={meeting.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{meeting.title}</CardTitle>
                      {meeting.description && (
                        <CardDescription className="mt-1">{meeting.description}</CardDescription>
                      )}
                    </div>
                    {getStatusBadge(meeting)}
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                    <div className="flex items-center gap-1">
                      <CalendarDays className="h-4 w-4" />
                      {format(new Date(meeting.scheduled_at), 'MMM d, yyyy')}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {format(new Date(meeting.scheduled_at), 'h:mm a')}
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {meeting.creator_name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canStartMeeting(meeting) && (
                      <Button 
                        size="sm" 
                        onClick={() => {
                          onUpdateStatus(meeting.id, 'in_progress');
                          onStartCall();
                        }}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Start
                      </Button>
                    )}
                    {userId === meeting.created_by && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{meeting.title}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onDeleteMeeting(meeting.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {pastMeetings.length > 0 && (
        <div>
          <h4 className="font-medium mb-3 text-muted-foreground">Past Meetings</h4>
          <div className="space-y-2">
            {pastMeetings.slice(0, 5).map((meeting) => (
              <div 
                key={meeting.id} 
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div>
                  <p className="font-medium text-sm">{meeting.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(meeting.scheduled_at), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
                {getStatusBadge(meeting)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
