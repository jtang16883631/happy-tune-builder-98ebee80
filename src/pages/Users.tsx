import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UserCog, Crown, Code, ClipboardCheck, Search, Trash2, Briefcase } from 'lucide-react';

type AppRole = 'auditor' | 'developer' | 'coordinator' | 'owner' | 'office_admin';

interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: AppRole;
}

interface UserWithRoles extends Profile {
  roles: AppRole[];
}

const roleConfig: Record<AppRole, { label: string; icon: React.ElementType; color: string }> = {
  owner: { label: 'Owner', icon: Crown, color: 'bg-amber-500 text-white' },
  developer: { label: 'Developer', icon: Code, color: 'bg-purple-500 text-white' },
  office_admin: { label: 'Office Admin', icon: Briefcase, color: 'bg-rose-500 text-white' },
  coordinator: { label: 'Coordinator', icon: ClipboardCheck, color: 'bg-blue-500 text-white' },
  auditor: { label: 'Auditor', icon: Search, color: 'bg-green-500 text-white' },
};

const Users = () => {
  const { isPrivileged, isDeveloper, isLoading: authLoading, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithRoles | null>(null);

  useEffect(() => {
    if (!authLoading && !isPrivileged) {
      navigate('/');
    }
  }, [authLoading, isPrivileged, navigate]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('user_roles').select('user_id, role'),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (rolesRes.error) throw rolesRes.error;

      const rolesMap = new Map<string, AppRole[]>();
      (rolesRes.data || []).forEach((r: UserRole) => {
        const existing = rolesMap.get(r.user_id) || [];
        existing.push(r.role);
        rolesMap.set(r.user_id, existing);
      });

      const usersWithRoles: UserWithRoles[] = (profilesRes.data || []).map((p: Profile) => ({
        ...p,
        roles: rolesMap.get(p.id) || [],
      }));

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: AppRole | 'none') => {
    try {
      // First, delete existing roles for this user
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // If a role is selected (not 'none'), insert the new role
      if (newRole !== 'none') {
        const { error: insertError } = await supabase.from('user_roles').insert({
          user_id: userId,
          role: newRole,
          assigned_by: user?.id,
        });

        if (insertError) throw insertError;
      }

      toast({
        title: 'Success',
        description: newRole === 'none' ? 'Role removed' : `Role updated to ${roleConfig[newRole].label}`,
      });

      fetchUsers();
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: 'Error',
        description: 'Failed to update role',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      // Delete user roles first
      const { error: roleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userToDelete.id);

      if (roleError) throw roleError;

      // Delete the user's profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userToDelete.id);

      if (profileError) throw profileError;

      toast({
        title: 'Success',
        description: `User ${userToDelete.full_name || userToDelete.email} has been removed`,
      });

      setDeleteDialogOpen(false);
      setUserToDelete(null);
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete user',
        variant: 'destructive',
      });
    }
  };

  const getInitials = (name?: string | null, email?: string | null) => {
    const displayName = name || email || 'U';
    return displayName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getCurrentRole = (roles: AppRole[]): AppRole | 'none' => {
    if (roles.includes('owner')) return 'owner';
    if (roles.includes('developer')) return 'developer';
    if (roles.includes('office_admin')) return 'office_admin';
    if (roles.includes('coordinator')) return 'coordinator';
    if (roles.includes('auditor')) return 'auditor';
    return 'none';
  };

  if (authLoading || isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage user roles and permissions. Developers can remove users.
          </p>
        </div>

        {/* Role Legend */}
        <div className="flex flex-wrap gap-3">
          {Object.entries(roleConfig).map(([role, config]) => {
            const Icon = config.icon;
            return (
              <div key={role} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge className={`${config.color} gap-1`}>
                  <Icon className="h-3 w-3" />
                  {config.label}
                </Badge>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4">
          {users.map((u) => {
            const currentRole = getCurrentRole(u.roles);
            const isCurrentUser = u.id === user?.id;
            const config = currentRole !== 'none' ? roleConfig[currentRole] : null;
            const canDelete = isDeveloper && !isCurrentUser;

            return (
              <Card key={u.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12 ring-2 ring-offset-2 ring-offset-background ring-primary/20">
                        <AvatarImage src={u.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                          {getInitials(u.full_name, u.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{u.full_name || 'Unnamed User'}</p>
                          {isCurrentUser && (
                            <Badge variant="outline" className="text-xs">
                              You
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {config && (
                        <Badge className={`${config.color} gap-1`}>
                          <config.icon className="h-3 w-3" />
                          {config.label}
                        </Badge>
                      )}

                      <Select
                        value={currentRole}
                        onValueChange={(value) =>
                          handleRoleChange(u.id, value as AppRole | 'none')
                        }
                        disabled={isCurrentUser}
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No Role</SelectItem>
                          <SelectItem value="auditor">Auditor</SelectItem>
                          <SelectItem value="coordinator">Coordinator</SelectItem>
                          <SelectItem value="office_admin">Office Admin</SelectItem>
                          <SelectItem value="developer">Developer</SelectItem>
                          <SelectItem value="owner">Owner</SelectItem>
                        </SelectContent>
                      </Select>

                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            setUserToDelete(u);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {users.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <UserCog className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-medium text-lg">No users yet</h3>
                <p className="text-muted-foreground mt-1">
                  Users will appear here after they sign in with Google.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {userToDelete?.full_name || userToDelete?.email}? 
              This will remove all their roles and access to the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Users;