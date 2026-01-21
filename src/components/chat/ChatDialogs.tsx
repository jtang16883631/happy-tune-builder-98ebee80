import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, UserPlus, Trash2, Loader2, Crown } from 'lucide-react';

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface Member {
  id: string;
  user_id: string;
  is_admin: boolean;
  profile?: Profile;
}

function getInitials(name?: string | null) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// Create Room Dialog
interface CreateRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, description: string) => Promise<void>;
}

export function CreateRoomDialog({ open, onOpenChange, onCreate }: CreateRoomDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    try {
      await onCreate(name.trim(), description.trim());
      setName('');
      setDescription('');
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Channel</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Channel Name</label>
            <Input
              placeholder="e.g., general, announcements"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description (optional)</label>
            <Input
              placeholder="What's this channel for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || isCreating}>
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Add Member Dialog
interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableUsers: Profile[];
  isLoading: boolean;
  onAddMember: (userId: string) => Promise<void>;
}

export function AddMemberDialog({ open, onOpenChange, availableUsers, isLoading, onAddMember }: AddMemberDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);

  const filteredUsers = availableUsers.filter(u => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(query) ||
      u.email?.toLowerCase().includes(query)
    );
  });

  const handleAdd = async (userId: string) => {
    setAddingId(userId);
    try {
      await onAddMember(userId);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length > 0 ? (
            <ScrollArea className="h-64">
              <div className="space-y-2 pr-4">
                {filteredUsers.map((profile) => (
                  <div
                    key={profile.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={profile.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {getInitials(profile.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{profile.full_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{profile.email}</p>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => handleAdd(profile.id)}
                      disabled={addingId === profile.id}
                    >
                      {addingId === profile.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              {searchQuery ? 'No users found' : 'All users are already members'}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// View Members Dialog
interface ViewMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  currentUserId: string | undefined;
  isAdmin: boolean;
  onRemoveMember: (memberId: string) => Promise<void>;
}

export function ViewMembersDialog({ 
  open, 
  onOpenChange, 
  members, 
  currentUserId, 
  isAdmin,
  onRemoveMember 
}: ViewMembersDialogProps) {
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = async (memberId: string) => {
    setRemovingId(memberId);
    try {
      await onRemoveMember(memberId);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Channel Members ({members.length})</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-80">
          <div className="space-y-2 py-2 pr-4">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={member.profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(member.profile?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">
                        {member.profile?.full_name || 'Unknown'}
                      </p>
                      {member.is_admin && (
                        <Crown className="h-3 w-3 text-primary" />
                      )}
                      {member.user_id === currentUserId && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">You</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{member.profile?.email}</p>
                  </div>
                </div>
                {isAdmin && member.user_id !== currentUserId && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleRemove(member.id)}
                    disabled={removingId === member.id}
                  >
                    {removingId === member.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
