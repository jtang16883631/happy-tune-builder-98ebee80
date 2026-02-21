import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Loader2,
  CalendarDays,
  AlertCircle,
  MapPin,
  Users
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { QuickClockPanel } from '@/components/timesheet/QuickClockPanel';

export default function Dashboard() {
  const { user, roles, onlineUsers } = useAuth();

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Quick Clock */}
        {user && (
          <QuickClockPanel userId={user.id} userRole={roles[0] ?? null} />
        )}

        {/* Schedule & Issues */}
        <ScheduleAndIssuesSection />

        {/* Who's Online */}
        <OnlineUsersCard onlineUsers={onlineUsers} currentUserId={user?.id} />
      </div>
    </AppLayout>
  );
}

// Who's Online Card Component
function OnlineUsersCard({ onlineUsers, currentUserId }: { onlineUsers: Set<string>; currentUserId?: string }) {
  const { data: profiles } = useQuery({
    queryKey: ['online-profiles', Array.from(onlineUsers).sort().join(',')],
    queryFn: async () => {
      if (onlineUsers.size === 0) return [];
      const ids = Array.from(onlineUsers);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', ids);
      if (error) throw error;
      return data || [];
    },
    enabled: onlineUsers.size > 0,
    staleTime: 30000,
  });

  const getInitials = (name?: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          Who's Online
          <Badge variant="secondary" className="ml-auto">
            {onlineUsers.size}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {onlineUsers.size === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No one else is online right now
          </div>
        ) : (
          <div className="space-y-2">
            {(profiles || []).map((profile) => (
              <div key={profile.id} className="flex items-center gap-3">
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                      {getInitials(profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
                </div>
                <span className="text-sm font-medium">
                  {profile.full_name || 'User'}
                  {profile.id === currentUserId && (
                    <span className="text-xs text-muted-foreground ml-1">(you)</span>
                  )}
                </span>
              </div>
            ))}
            {onlineUsers.size > (profiles?.length || 0) && (
              <p className="text-xs text-muted-foreground">
                +{onlineUsers.size - (profiles?.length || 0)} more
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Schedule & Issues Section Component
function ScheduleAndIssuesSection() {
  const { data: upcomingJobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['dashboard-upcoming-jobs'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('scheduled_jobs')
        .select('*')
        .gte('job_date', today)
        .order('job_date', { ascending: true })
        .limit(5);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: openIssues, isLoading: issuesLoading } = useQuery({
    queryKey: ['dashboard-open-issues'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_issues')
        .select('*, data_templates(name, facility_name)')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const formatJobDate = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'MMM d');
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Upcoming Schedule */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Upcoming Schedule
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/schedule">View All</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !upcomingJobs || upcomingJobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarDays className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No upcoming jobs scheduled</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingJobs.map((job) => (
                <div key={job.id} className="flex items-start justify-between p-3 rounded-lg bg-muted/50">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={isToday(parseISO(job.job_date)) ? "default" : "secondary"} className="text-xs">
                        {formatJobDate(job.job_date)}
                      </Badge>
                      {job.start_time && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {job.start_time}
                        </span>
                      )}
                    </div>
                    <p className="font-medium">{job.client_name}</p>
                    {job.address && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {job.address}
                      </p>
                    )}
                  </div>
                  {job.event_type && (
                    <Badge variant="outline" className="capitalize">
                      {job.event_type}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open Issues */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Open Issues
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/issues">View All</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {issuesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !openIssues || openIssues.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50 text-green-500" />
              <p>No open issues - great job!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {openIssues.map((issue) => (
                <div key={issue.id} className="flex items-start justify-between p-3 rounded-lg bg-muted/50">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span className="font-medium capitalize">{issue.issue_type.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {(issue as any).data_templates?.name || 'Unknown Template'}
                    </p>
                    {issue.notes && (
                      <p className="text-sm text-muted-foreground line-clamp-1">{issue.notes}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-orange-600 border-orange-300">
                    Open
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
