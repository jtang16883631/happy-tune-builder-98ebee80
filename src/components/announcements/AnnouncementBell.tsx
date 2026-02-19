import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Bell, X, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface Announcement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  created_by: string | null;
  creator_name?: string | null;
  is_read?: boolean;
}

export function AnnouncementBell() {
  const { user, isPrivileged } = useAuth();
  const { toast } = useToast();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', content: '' });
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);

  const fetchAnnouncements = async () => {
    if (!user) return;

    try {
      // Fetch active announcements
      const { data: announcementsData, error: annError } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (annError) throw annError;

      // Fetch read status
      const { data: readsData, error: readsError } = await supabase
        .from('announcement_reads')
        .select('announcement_id')
        .eq('user_id', user.id);

      if (readsError) throw readsError;

      // Fetch profile names for creators
      const creatorIds = [...new Set((announcementsData || []).map(a => a.created_by).filter(Boolean))] as string[];
      let profileMap: Record<string, string> = {};
      if (creatorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds);
        if (profilesData) {
          profilesData.forEach(p => { if (p.full_name) profileMap[p.id] = p.full_name; });
        }
      }

      const readIds = new Set((readsData || []).map((r) => r.announcement_id));

      const announcementsWithReadStatus = (announcementsData || []).map((a) => ({
        ...a,
        creator_name: a.created_by ? profileMap[a.created_by] || null : null,
        is_read: readIds.has(a.id),
      }));

      setAnnouncements(announcementsWithReadStatus);
      setUnreadCount(announcementsWithReadStatus.filter((a) => !a.is_read).length);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, [user]);

  const markAsRead = async (announcementId: string) => {
    if (!user) return;

    try {
      await supabase.from('announcement_reads').insert({
        announcement_id: announcementId,
        user_id: user.id,
      });

      setAnnouncements((prev) =>
        prev.map((a) => (a.id === announcementId ? { ...a, is_read: true } : a))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      // Ignore duplicate errors
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    const unreadAnnouncements = announcements.filter((a) => !a.is_read);
    
    try {
      await Promise.all(
        unreadAnnouncements.map((a) =>
          supabase.from('announcement_reads').insert({
            announcement_id: a.id,
            user_id: user.id,
          })
        )
      );

      setAnnouncements((prev) => prev.map((a) => ({ ...a, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      // Ignore duplicate errors
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!newAnnouncement.title.trim() || !newAnnouncement.content.trim()) {
      toast({
        title: 'Error',
        description: 'Please fill in both title and content',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data: insertedData, error } = await supabase.from('announcements').insert({
        title: newAnnouncement.title.trim(),
        content: newAnnouncement.content.trim(),
        created_by: user?.id,
      }).select('id').single();

      if (error) throw error;

      // Send email notification to all users
      if (insertedData?.id) {
        try {
          await supabase.functions.invoke('send-announcement-email', {
            body: { announcementId: insertedData.id },
          });
        } catch (emailErr) {
          console.warn('Failed to send announcement email:', emailErr);
        }
      }

      toast({
        title: 'Success',
        description: 'Announcement created and email sent to all users',
      });

      setNewAnnouncement({ title: '', content: '' });
      setCreateDialogOpen(false);
      fetchAnnouncements();
    } catch (error) {
      console.error('Error creating announcement:', error);
      toast({
        title: 'Error',
        description: 'Failed to create announcement',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
      
      toast({
        title: 'Deleted',
        description: 'Announcement removed',
      });
      fetchAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete announcement',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end">
          <div className="flex items-center justify-between border-b p-3">
            <h4 className="font-semibold">Announcements</h4>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllAsRead}>
                  Mark all read
                </Button>
              )}
              {isPrivileged && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setIsOpen(false);
                    setCreateDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <ScrollArea className="h-[300px]">
            {announcements.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Bell className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No announcements yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {announcements.map((announcement) => (
                  <div
                    key={announcement.id}
                    className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                      !announcement.is_read ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => {
                      markAsRead(announcement.id);
                      setIsOpen(false);
                      setSelectedAnnouncement(announcement);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {!announcement.is_read && (
                            <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                          <h5 className="font-medium text-sm truncate">
                            {announcement.title}
                          </h5>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {announcement.content}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {announcement.creator_name && (
                            <span className="font-medium">{announcement.creator_name} · </span>
                          )}
                          {formatDistanceToNow(new Date(announcement.created_at), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                      {isPrivileged && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteAnnouncement(announcement.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Announcement Detail Dialog */}
      <Dialog open={!!selectedAnnouncement} onOpenChange={(open) => !open && setSelectedAnnouncement(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedAnnouncement?.title}</DialogTitle>
            <DialogDescription>
              {selectedAnnouncement?.creator_name && (
                <span className="font-medium">{selectedAnnouncement.creator_name} · </span>
              )}
              {selectedAnnouncement?.created_at && formatDistanceToNow(new Date(selectedAnnouncement.created_at), { addSuffix: true })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm whitespace-pre-wrap">{selectedAnnouncement?.content}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAnnouncement(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Announcement Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Announcement</DialogTitle>
            <DialogDescription>
              This announcement will be visible to all users.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newAnnouncement.title}
                onChange={(e) =>
                  setNewAnnouncement((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Announcement title"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={newAnnouncement.content}
                onChange={(e) =>
                  setNewAnnouncement((prev) => ({ ...prev, content: e.target.value }))
                }
                placeholder="Write your announcement..."
                rows={4}
                maxLength={1000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateAnnouncement} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
