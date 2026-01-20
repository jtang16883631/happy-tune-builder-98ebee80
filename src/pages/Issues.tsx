import { useState, useEffect } from 'react';
import { useOfflineIssues, IssueType, TemplateIssue } from '@/hooks/useOfflineIssues';
import { useCloudTemplates } from '@/hooks/useCloudTemplates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  Building2,
  MapPin,
  Plus,
  Wifi,
  WifiOff,
  RefreshCw,
  Check,
  Trash2,
  Edit,
  Clock,
  CheckCircle2,
  Home,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function Issues() {
  const {
    isLoading,
    isSyncing,
    isOnline,
    syncMeta,
    getIssues,
    createIssue,
    updateIssue,
    deleteIssue,
    syncWithCloud,
    pendingChanges,
  } = useOfflineIssues();

  const { templates: cloudTemplates, isLoading: templatesLoading } = useCloudTemplates();

  const [activeTab, setActiveTab] = useState<IssueType>('office');
  const [issues, setIssues] = useState<TemplateIssue[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [editingIssue, setEditingIssue] = useState<TemplateIssue | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  // Auto-sync on mount when online
  useEffect(() => {
    if (!isLoading && isOnline) {
      syncWithCloud();
    }
  }, [isLoading, isOnline]);

  // Auto-sync every 30 seconds when online
  useEffect(() => {
    if (!isOnline || isLoading) return;

    const interval = setInterval(() => {
      syncWithCloud();
    }, 30000);

    return () => clearInterval(interval);
  }, [isOnline, isLoading, syncWithCloud]);

  // Refresh issues when tab changes or after sync
  useEffect(() => {
    if (!isLoading) {
      const allIssues = getIssues(activeTab);
      setIssues(showResolved ? allIssues : allIssues.filter(i => !i.is_resolved));
    }
  }, [isLoading, activeTab, isSyncing, showResolved, getIssues]);

  const handleCreate = async () => {
    if (selectedTemplates.length === 0) {
      toast.error('Please select at least one template');
      return;
    }

    let created = 0;
    for (const templateId of selectedTemplates) {
      const template = cloudTemplates.find(t => t.id === templateId);
      if (template) {
        const result = await createIssue(templateId, template.name, activeTab, notes);
        if (result.success) created++;
      }
    }

    if (created > 0) {
      toast.success(`Created ${created} ${activeTab} issue(s)`);
      setShowCreateDialog(false);
      setSelectedTemplates([]);
      setNotes('');
      
      // Refresh issues
      const allIssues = getIssues(activeTab);
      setIssues(showResolved ? allIssues : allIssues.filter(i => !i.is_resolved));
    }
  };

  const handleUpdate = async () => {
    if (!editingIssue) return;

    const result = await updateIssue(editingIssue.id, { notes });
    if (result.success) {
      toast.success('Issue updated');
      setShowEditDialog(false);
      setEditingIssue(null);
      setNotes('');
      
      const allIssues = getIssues(activeTab);
      setIssues(showResolved ? allIssues : allIssues.filter(i => !i.is_resolved));
    }
  };

  const handleResolve = async (issue: TemplateIssue) => {
    const result = await updateIssue(issue.id, { is_resolved: !issue.is_resolved });
    if (result.success) {
      toast.success(issue.is_resolved ? 'Issue reopened' : 'Issue resolved');
      const allIssues = getIssues(activeTab);
      setIssues(showResolved ? allIssues : allIssues.filter(i => !i.is_resolved));
    }
  };

  const handleDelete = async (issue: TemplateIssue) => {
    const result = await deleteIssue(issue.id);
    if (result.success) {
      toast.success('Issue deleted');
      const allIssues = getIssues(activeTab);
      setIssues(showResolved ? allIssues : allIssues.filter(i => !i.is_resolved));
    }
  };

  const openEdit = (issue: TemplateIssue) => {
    setEditingIssue(issue);
    setNotes(issue.notes || '');
    setShowEditDialog(true);
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-4 md:p-6 max-w-4xl">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Issues</h1>
                <p className="text-sm text-muted-foreground">Track office & field issues</p>
              </div>
            </div>

            {/* Status indicators + Home */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" asChild>
                <Link to="/">
                  <Home className="h-4 w-4" />
                </Link>
              </Button>
              
              <Badge variant={isOnline ? 'default' : 'secondary'} className="gap-1">
                {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {isOnline ? 'Online' : 'Offline'}
              </Badge>
              
              {pendingChanges > 0 && (
                <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
                  <Clock className="h-3 w-3" />
                  {pendingChanges} pending
                </Badge>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => syncWithCloud()}
                disabled={isSyncing || !isOnline}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                Sync
              </Button>
            </div>
          </div>

          {syncMeta.lastSyncedAt && (
            <p className="text-xs text-muted-foreground">
              Last synced: {formatDate(syncMeta.lastSyncedAt)}
            </p>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as IssueType)} className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <TabsList className="grid w-full sm:w-[300px] grid-cols-2">
              <TabsTrigger value="office" className="gap-2">
                <Building2 className="h-4 w-4" />
                Office
              </TabsTrigger>
              <TabsTrigger value="field" className="gap-2">
                <MapPin className="h-4 w-4" />
                Field
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox 
                  checked={showResolved} 
                  onCheckedChange={(c) => setShowResolved(c === true)} 
                />
                Show resolved
              </label>
              
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                New Issue
              </Button>
            </div>
          </div>

          <TabsContent value="office" className="space-y-4">
            <IssuesList
              issues={issues}
              onResolve={handleResolve}
              onEdit={openEdit}
              onDelete={handleDelete}
              formatDate={formatDate}
              type="office"
            />
          </TabsContent>

          <TabsContent value="field" className="space-y-4">
            <IssuesList
              issues={issues}
              onResolve={handleResolve}
              onEdit={openEdit}
              onDelete={handleDelete}
              formatDate={formatDate}
              type="field"
            />
          </TabsContent>
        </Tabs>

        {/* Create Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {activeTab === 'office' ? (
                  <Building2 className="h-5 w-5 text-blue-500" />
                ) : (
                  <MapPin className="h-5 w-5 text-green-500" />
                )}
                New {activeTab === 'office' ? 'Office' : 'Field'} Issue
              </DialogTitle>
              <DialogDescription>
                Select templates with issues and add notes
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Select Templates</label>
                <ScrollArea className="h-[200px] border rounded-md p-2">
                  {templatesLoading ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      Loading templates...
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cloudTemplates.map(template => (
                        <div
                          key={template.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedTemplates.includes(template.id) 
                              ? 'bg-primary/10 border-primary/50' 
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => {
                            setSelectedTemplates(prev =>
                              prev.includes(template.id)
                                ? prev.filter(id => id !== template.id)
                                : [...prev, template.id]
                            );
                          }}
                        >
                          <Checkbox checked={selectedTemplates.includes(template.id)} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{template.name}</p>
                            <p className="text-sm text-muted-foreground truncate">
                              {template.facility_name || 'No facility'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                <p className="text-xs text-muted-foreground mt-1">
                  {selectedTemplates.length} selected
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Notes</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe the issue..."
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={selectedTemplates.length === 0}>
                Create Issue{selectedTemplates.length > 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Issue</DialogTitle>
              <DialogDescription>
                {editingIssue?.template_name}
              </DialogDescription>
            </DialogHeader>

            <div>
              <label className="text-sm font-medium mb-2 block">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe the issue..."
                rows={4}
                className="resize-none"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

interface IssuesListProps {
  issues: TemplateIssue[];
  onResolve: (issue: TemplateIssue) => void;
  onEdit: (issue: TemplateIssue) => void;
  onDelete: (issue: TemplateIssue) => void;
  formatDate: (date: string) => string;
  type: IssueType;
}

function IssuesList({ issues, onResolve, onEdit, onDelete, formatDate, type }: IssuesListProps) {
  if (issues.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          {type === 'office' ? (
            <Building2 className="h-12 w-12 mb-4 opacity-50" />
          ) : (
            <MapPin className="h-12 w-12 mb-4 opacity-50" />
          )}
          <p className="text-lg font-medium">No {type} issues</p>
          <p className="text-sm">Create a new issue to get started</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {issues.map(issue => (
        <Card 
          key={issue.id} 
          className={`transition-all hover:shadow-md ${
            issue.is_resolved ? 'opacity-60' : ''
          } ${issue.is_dirty ? 'border-l-4 border-l-amber-400' : ''}`}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-base flex items-center gap-2">
                  {issue.is_resolved && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {issue.template_name || 'Unknown Template'}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDate(issue.created_at)}
                  {issue.is_dirty && (
                    <span className="ml-2 text-amber-600">• Pending sync</span>
                  )}
                </p>
              </div>
              
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onResolve(issue)}
                >
                  <Check className={`h-4 w-4 ${issue.is_resolved ? 'text-green-500' : ''}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onEdit(issue)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => onDelete(issue)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          
          {issue.notes && (
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {issue.notes}
              </p>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
