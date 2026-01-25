import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Calendar, Tag, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ChangelogEntry {
  id: string;
  version: string;
  release_date: string;
  changes: string[];
}

const UpdateLog = () => {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ChangelogEntry | null>(null);
  const [formData, setFormData] = useState({
    date: '',
    version: '',
    changes: '',
  });

  // Fetch changelog entries
  const { data: updateLog = [], isLoading } = useQuery({
    queryKey: ['changelog-entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('changelog_entries')
        .select('*')
        .order('release_date', { ascending: false });

      if (error) throw error;
      return data as ChangelogEntry[];
    },
  });

  // Get current version (latest entry)
  const currentVersion = updateLog[0]?.version || '1.0.0';

  // Insert mutation
  const insertMutation = useMutation({
    mutationFn: async (entry: { version: string; release_date: string; changes: string[] }) => {
      const { error } = await supabase.from('changelog_entries').insert(entry);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      toast.success('Entry added');
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(`Failed to add: ${error.message}`);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...entry }: { id: string; version: string; release_date: string; changes: string[] }) => {
      const { error } = await supabase
        .from('changelog_entries')
        .update(entry)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      toast.success('Entry updated');
      setIsDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('changelog_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      toast.success('Entry deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  const openAddDialog = () => {
    setEditingEntry(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      version: '',
      changes: '',
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (entry: ChangelogEntry) => {
    setEditingEntry(entry);
    setFormData({
      date: entry.release_date,
      version: entry.version,
      changes: entry.changes.join('\n'),
    });
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.version.trim() || !formData.changes.trim()) {
      toast.error('Please fill in version and changes');
      return;
    }

    const changes = formData.changes.split('\n').filter((c) => c.trim());

    if (editingEntry) {
      updateMutation.mutate({
        id: editingEntry.id,
        version: formData.version.trim(),
        release_date: formData.date,
        changes,
      });
    } else {
      insertMutation.mutate({
        version: formData.version.trim(),
        release_date: formData.date,
        changes,
      });
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const isSaving = insertMutation.isPending || updateMutation.isPending;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Update Log</h1>
            <p className="text-muted-foreground">
              Version history and changelog
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={openAddDialog} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Entry
            </Button>
            <Badge variant="outline" className="text-lg px-4 py-2 font-mono">
              <Tag className="h-4 w-4 mr-2" />
              v{currentVersion}
            </Badge>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Changelog
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-280px)]">
              {isLoading ? (
                <div className="space-y-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="border-l-2 border-muted pl-4 pb-4">
                      <Skeleton className="h-6 w-32 mb-2" />
                      <Skeleton className="h-4 w-full mb-1" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {updateLog.map((entry) => (
                    <div
                      key={entry.id}
                      className="border-l-2 border-primary pl-4 pb-4 group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className="font-mono">
                            v{entry.version}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {entry.release_date}
                          </span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditDialog(entry)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDelete(entry.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <ul className="space-y-1">
                        {entry.changes.map((change, changeIndex) => (
                          <li
                            key={changeIndex}
                            className="text-sm text-foreground flex items-start gap-2"
                          >
                            <span className="text-primary mt-1">•</span>
                            {change}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? 'Edit Entry' : 'Add New Entry'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="version">Version</Label>
                <Input
                  id="version"
                  placeholder="1.0.1"
                  value={formData.version}
                  onChange={(e) =>
                    setFormData({ ...formData, version: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="changes">Changes (one per line)</Label>
              <Textarea
                id="changes"
                placeholder="Added new feature&#10;Fixed bug&#10;Improved performance"
                rows={6}
                value={formData.changes}
                onChange={(e) =>
                  setFormData({ ...formData, changes: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingEntry ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default UpdateLog;
