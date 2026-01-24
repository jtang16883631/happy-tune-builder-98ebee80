import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { RoomMember } from '@/hooks/useTeamChat';

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  currentMembers: RoomMember[];
  onAddMember: (roomId: string, userId: string) => Promise<void>;
}

export function AddMemberDialog({ 
  open, 
  onOpenChange, 
  roomId, 
  currentMembers,
  onAddMember 
}: AddMemberDialogProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    
    const fetchProfiles = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .order('full_name');
      
      setProfiles(data || []);
      setIsLoading(false);
    };

    fetchProfiles();
    setSelectedUsers([]);
  }, [open]);

  const memberIds = currentMembers.map(m => m.user_id);
  const availableProfiles = profiles.filter(p => !memberIds.includes(p.id));

  const toggleUser = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleAdd = async () => {
    if (selectedUsers.length === 0) return;
    
    setIsAdding(true);
    for (const userId of selectedUsers) {
      await onAddMember(roomId, userId);
    }
    setIsAdding(false);
    setSelectedUsers([]);
    onOpenChange(false);
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Add Members
          </DialogTitle>
          <DialogDescription>
            Select team members to add to this chat room.
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[300px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : availableProfiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              All team members are already in this room.
            </div>
          ) : (
            <div className="space-y-2">
              {availableProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer"
                  onClick={() => toggleUser(profile.id)}
                >
                  <Checkbox 
                    checked={selectedUsers.includes(profile.id)}
                    onCheckedChange={() => toggleUser(profile.id)}
                  />
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(profile.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">
                    {profile.full_name || 'Unknown User'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleAdd} 
            disabled={selectedUsers.length === 0 || isAdding}
          >
            {isAdding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add {selectedUsers.length > 0 && `(${selectedUsers.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
