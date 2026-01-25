import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Calendar, Tag, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const VERSION = '1.0.0';

interface UpdateEntry {
  date: string;
  version: string;
  changes: string[];
}

const initialLog: UpdateEntry[] = [
  {
    date: '2026-01-25',
    version: '1.0.0',
    changes: [
      'Initial release of Meridian Portal',
      'Added NDC scanning with IO-based outer pack detection',
      'Implemented Live Tracker workflow management',
      'Added Schedule Hub for job scheduling',
      'Team Chat with real-time messaging',
      'Timesheet tracking functionality',
      'Master Data (FDA) database management',
      'Compile tool for Excel aggregation',
    ],
  },
];

const UpdateLog = () => {
  const [updateLog, setUpdateLog] = useState<UpdateEntry[]>(initialLog);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    date: '',
    version: '',
    changes: '',
  });

  const openAddDialog = () => {
    setEditingIndex(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      version: '',
      changes: '',
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (index: number) => {
    const entry = updateLog[index];
    setEditingIndex(index);
    setFormData({
      date: entry.date,
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

    const newEntry: UpdateEntry = {
      date: formData.date,
      version: formData.version.trim(),
      changes: formData.changes.split('\n').filter((c) => c.trim()),
    };

    if (editingIndex !== null) {
      const updated = [...updateLog];
      updated[editingIndex] = newEntry;
      setUpdateLog(updated);
      toast.success('Entry updated');
    } else {
      setUpdateLog([newEntry, ...updateLog]);
      toast.success('Entry added');
    }

    setIsDialogOpen(false);
  };

  const handleDelete = (index: number) => {
    const updated = updateLog.filter((_, i) => i !== index);
    setUpdateLog(updated);
    toast.success('Entry deleted');
  };

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
              v{VERSION}
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
              <div className="space-y-6">
                {updateLog.map((entry, index) => (
                  <div
                    key={index}
                    className="border-l-2 border-primary pl-4 pb-4 group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="font-mono">
                          v{entry.version}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {entry.date}
                        </span>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(index)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(index)}
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
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingIndex !== null ? 'Edit Entry' : 'Add New Entry'}
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
            <Button onClick={handleSave}>
              {editingIndex !== null ? 'Update' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default UpdateLog;
