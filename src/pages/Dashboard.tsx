import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Activity, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Eye, 
  FileText, 
  FolderSync, 
  Plus,
  TrendingUp,
  Loader2,
  CalendarDays,
  AlertCircle,
  MapPin,
  Users
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, isToday, isTomorrow, isThisWeek, parseISO } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { QuickClockPanel } from '@/components/timesheet/QuickClockPanel';

interface ScanRecord {
  id: string;
  qty: string;
  ndc: string;
  loc: string;
  drugName: string;
  timestamp: string;
}

interface TemplateStats {
  templateId: string;
  templateName: string;
  facilityName: string;
  totalSections: number;
  sectionsWithScans: number;
  totalScans: number;
  lastActivity: string | null;
}

export default function Dashboard() {
  const { user, onlineUsers, isOnline: checkIsOnline } = useAuth();
  const [templateStats, setTemplateStats] = useState<TemplateStats[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const [recentActivity, setRecentActivity] = useState<{ time: string; message: string }[]>([]);

  // Fetch templates from database
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ['dashboard-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_templates')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch all sections from database
  const { data: sections, isLoading: sectionsLoading } = useQuery({
    queryKey: ['dashboard-sections'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('template_sections')
        .select('*');
      if (error) throw error;
      return data;
    },
  });

  // Calculate stats from localStorage scan records
  useEffect(() => {
    if (!templates || !sections) return;

    const stats: TemplateStats[] = [];
    let totalScanCount = 0;
    const activities: { time: Date; message: string }[] = [];

    templates.forEach(template => {
      const templateSections = sections.filter(s => s.template_id === template.id);
      let sectionsWithScans = 0;
      let templateTotalScans = 0;
      let lastActivityTime: Date | null = null;

      templateSections.forEach(section => {
        const key = `scan_records_${template.id}_${section.id}`;
        const savedData = localStorage.getItem(key);
        if (savedData) {
          try {
            const records: ScanRecord[] = JSON.parse(savedData);
            if (records.length > 0) {
              sectionsWithScans++;
              templateTotalScans += records.length;
              totalScanCount += records.length;

              // Find latest activity
              records.forEach(record => {
                const recordTime = new Date(record.timestamp);
                if (!lastActivityTime || recordTime > lastActivityTime) {
                  lastActivityTime = recordTime;
                }
                
                // Add to activities
                activities.push({
                  time: recordTime,
                  message: `Scanned ${record.drugName || record.ndc} at ${template.facility_name || template.name}`
                });
              });
            }
          } catch (e) {
            console.error('Error parsing scan records:', e);
          }
        }
      });

      stats.push({
        templateId: template.id,
        templateName: template.name,
        facilityName: template.facility_name || 'Unknown Facility',
        totalSections: templateSections.length,
        sectionsWithScans,
        totalScans: templateTotalScans,
        lastActivity: lastActivityTime ? formatTimeAgo(lastActivityTime) : null
      });
    });

    setTemplateStats(stats);
    setTotalScans(totalScanCount);

    // Get recent activities (last 5)
    const sortedActivities = activities
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 5)
      .map(a => ({
        time: formatTime(a.time),
        message: a.message
      }));
    setRecentActivity(sortedActivities);
  }, [templates, sections]);

  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const isLoading = templatesLoading || sectionsLoading;

  // Calculate aggregate stats
  const activeTemplates = templateStats.filter(t => t.totalScans > 0).length;
  const totalTemplates = templateStats.length;
  const totalSections = templateStats.reduce((acc, t) => acc + t.totalSections, 0);
  const sectionsWithData = templateStats.reduce((acc, t) => acc + t.sectionsWithScans, 0);
  const overallProgress = totalSections > 0 ? Math.round((sectionsWithData / totalSections) * 100) : 0;
  const nearCompletion = templateStats.filter(t => t.totalSections > 0 && t.sectionsWithScans / t.totalSections >= 0.8).length;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Quick Clock - available to all users */}
        {user && (
          <QuickClockPanel userId={user.id} />
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Templates
              </CardTitle>
              <Badge variant="outline" className="text-primary border-primary">
                {isLoading ? '...' : `${activeTemplates}/${totalTemplates}`}
              </Badge>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="text-4xl font-bold">{activeTemplates}</div>
                  <p className="text-sm text-green-600 flex items-center gap-1 mt-1">
                    <TrendingUp className="h-4 w-4" />
                    {nearCompletion} Near Completion
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sections Progress
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="text-4xl font-bold">{overallProgress}%</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {sectionsWithData} of {totalSections} sections scanned
                  </p>
                  <Progress value={overallProgress} className="mt-3 h-2" />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Scans
              </CardTitle>
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="text-4xl font-bold">{totalScans}</div>
                  <p className="text-sm text-muted-foreground mt-1">Items scanned across all templates</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Schedule & Issues Cards */}
        <ScheduleAndIssuesSection />

        {/* Main Content Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Template Tracker */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Template Progress</CardTitle>
              <Badge variant="secondary">{overallProgress}%</Badge>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : templateStats.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No templates yet. Create one to get started.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead>Facility</TableHead>
                      <TableHead>Sections</TableHead>
                      <TableHead>Scans</TableHead>
                      <TableHead>Progress</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templateStats.map((template) => {
                      const progress = template.totalSections > 0 
                        ? Math.round((template.sectionsWithScans / template.totalSections) * 100) 
                        : 0;
                      return (
                        <TableRow key={template.templateId}>
                          <TableCell className="font-medium">{template.templateName}</TableCell>
                          <TableCell>{template.facilityName}</TableCell>
                          <TableCell>{template.sectionsWithScans}/{template.totalSections}</TableCell>
                          <TableCell>{template.totalScans}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={progress} className="h-2 w-16" />
                              <span className="text-sm text-muted-foreground">{progress}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {template.lastActivity || 'No activity'}
                          </TableCell>
                          <TableCell>
                            <Button variant="link" size="sm" className="p-0 h-auto text-primary" asChild>
                              <Link to="/scan">
                                <Eye className="h-4 w-4 mr-1" />
                                Scan
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Right column: Activity + Online */}
          <div className="space-y-6">
            {/* Who's Online */}
            <OnlineUsersCard onlineUsers={onlineUsers} currentUserId={user?.id} />

            {/* Activity Feed */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : recentActivity.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No recent activity</p>
                  </div>
                ) : (
                  recentActivity.map((activity, index) => (
                    <div key={index} className="flex gap-3 text-sm">
                      <div className="flex-shrink-0 mt-1">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                      <div>
                        <span className="text-muted-foreground">{activity.time}</span>
                        <p className="text-muted-foreground mt-0.5">{activity.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/data-template">
                  <FileText className="h-4 w-4" />
                  Manage Templates
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/scan">
                  <FolderSync className="h-4 w-4" />
                  Start Scanning
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/fda">
                  <CheckCircle2 className="h-4 w-4" />
                  FDA Database
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/schedule">
                  <CalendarDays className="h-4 w-4" />
                  Schedule Hub
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/issues">
                  <AlertCircle className="h-4 w-4" />
                  View Issues
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
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
  // Fetch upcoming scheduled jobs
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
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchOnWindowFocus: true,
  });

  // Fetch open issues - auto-refresh every 30s
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
    refetchInterval: 30000, // Auto-refresh every 30 seconds
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
