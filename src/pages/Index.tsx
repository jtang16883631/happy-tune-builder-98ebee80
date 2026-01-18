import { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useCloudTemplates, CloudTemplate, CloudSection } from '@/hooks/useCloudTemplates';
import { 
  Upload, Loader2, CalendarDays, Trash2, RefreshCw, FileSpreadsheet, 
  CheckCircle, XCircle, FolderOpen, ChevronDown, ChevronRight, Edit 
} from 'lucide-react';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import * as XLSX from 'xlsx';

interface FileGroup {
  name: string;
  costFile?: File;
  jobTicketFile?: File;
}

interface ImportProgress {
  status: 'idle' | 'parsing' | 'importing' | 'complete' | 'error';
  total: number; // groups
  processed: number; // completed groups
  successful: number;
  failed: number;
  errors: string[];
  currentGroup?: string;
  subProcessed?: number; // current group internal progress (e.g. cost rows inserted)
  subTotal?: number;
}

const Index = () => {
  const { isLoading: authLoading, roles } = useAuth();
  const { toast } = useToast();
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const costUpdateInputRef = useRef<HTMLInputElement>(null);

  const {
    templates,
    isLoading: dbLoading,
    isReady,
    importTemplate,
    updateCostData,
    deleteTemplate,
    getSections,
    refetch,
  } = useCloudTemplates();

  const [isUpdatingCost, setIsUpdatingCost] = useState(false);

  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [templateSections, setTemplateSections] = useState<{ [key: string]: CloudSection[] }>({});
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [importProgress, setImportProgress] = useState<ImportProgress>({
    status: 'idle',
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    errors: [],
  });

  const hasRole = roles.length > 0;

  const parseExcelFile = (file: File): Promise<{ rows: any[]; rawData: any[][] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { defval: null });
          const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
          resolve({ rows: jsonData, rawData });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const extractInvNumber = (fileName: string): string | null => {
    const s = fileName.toLowerCase();

    // 1) 优先从 "inv" / "invoice" 附近提取
    const m1 = s.match(/(?:\binv\b|invoice)[^\d]{0,5}(\d{6,12})/i);
    if (m1?.[1]) return m1[1];

    // 2) 再优先 7~9 位（你们历史上多为 7-9 位）
    const m2 = fileName.match(/\d{7,9}/g);
    if (m2?.length) return m2[0];

    // 3) 最后兜底：6~12 位里选“最像INV”的（长度最接近8）
    const matches = fileName.match(/\d{6,12}/g);
    if (!matches?.length) return null;
    return matches.sort((a, b) => Math.abs(a.length - 8) - Math.abs(b.length - 8))[0];
  };

  const isTicketFile = (fileName: string): boolean => {
    const s = fileName.toLowerCase();
    return (
      s.includes('jobticket') ||
      s.includes('job ticket') ||
      s.includes('job_ticket') ||
      s.includes('jobtickettemplate') ||
      s.includes('job ticket template') ||
      s.startsWith('jc ') ||
      s.startsWith('jt ') ||
      s.startsWith('bljc ') ||
      s.includes('bljc') ||
      s.includes(' ticket')
    );
  };

  const isCostFile = (fileName: string): boolean => {
    const s = fileName.toLowerCase();
    return (
      s.includes('cost data') ||
      s.includes('costdata') ||
      s.includes('all cost') ||
      (s.includes('cost') && s.includes('data'))
    );
  };

  const groupFiles = (files: FileList): FileGroup[] => {
    const costFiles: Record<string, File[]> = {};
    const jobTicketFiles: Record<string, File[]> = {};

    Array.from(files).forEach((file) => {
      const inv = extractInvNumber(file.name);
      if (!inv) return;

      if (isCostFile(file.name)) {
        costFiles[inv] = costFiles[inv] || [];
        costFiles[inv].push(file);
      } else if (isTicketFile(file.name)) {
        jobTicketFiles[inv] = jobTicketFiles[inv] || [];
        jobTicketFiles[inv].push(file);
      }
    });

    const groups: FileGroup[] = [];
    const invs = new Set([...Object.keys(costFiles), ...Object.keys(jobTicketFiles)]);

    for (const inv of Array.from(invs)) {
      const costs = (costFiles[inv] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
      const tickets = (jobTicketFiles[inv] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
      const pairCount = Math.min(costs.length, tickets.length);

      for (let i = 0; i < pairCount; i++) {
        groups.push({
          name: pairCount > 1 ? `${inv}-${i + 1}` : inv,
          costFile: costs[i],
          jobTicketFile: tickets[i],
        });
      }
    }

    // Stable sort for predictable order
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  };

  const handleBulkImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Refresh session first to avoid JWT expiration during upload
    try {
      await supabase.auth.refreshSession();
    } catch {
      // ignore - if offline or other failure, error will show during request
    }

    const groups = groupFiles(files);

    if (groups.length === 0) {
      toast({
        title: 'No valid pairs found',
        description: 'Make sure to upload matching cost data and job ticket files.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Import started',
      description: `Detected ${groups.length} pair(s). Importing now...`,
    });

    flushSync(() => {
      setImportProgress({
        status: 'parsing',
        total: groups.length,
        processed: 0,
        successful: 0,
        failed: 0,
        errors: [],
        currentGroup: groups[0]?.name,
        subProcessed: 0,
        subTotal: 0,
      });
    });

    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];

      flushSync(() => {
        setImportProgress((prev) => ({
          ...prev,
          status: 'importing',
          processed: i,
          currentGroup: group.name,
          subProcessed: 0,
          subTotal: 0,
        }));
      });

      // Give browser a chance to render progress bar (avoid React 18 batching causing stuck at 0)
      await new Promise((r) => setTimeout(r, 0));

      // Refresh session before each group to prevent JWT expiration during long imports
      try {
        const { data } = await supabase.auth.refreshSession();
        if (!data.session) {
          throw new Error('Session expired, please re-login');
        }
      } catch (e: any) {
        failed++;
        errors.push(`${group.name}: ${e?.message || 'Session refresh failed'}`);

        flushSync(() => {
          setImportProgress((prev) => ({
            ...prev,
            processed: i + 1,
            successful,
            failed,
            errors: errors.slice(-5),
          }));
        });
        continue;
      }

      try {
        const costData = await parseExcelFile(group.costFile!);
        const jobTicketData = await parseExcelFile(group.jobTicketFile!);

        const result = await importTemplate(
          group.name,
          costData.rows,
          jobTicketData.rawData,
          group.costFile!.name,
          group.jobTicketFile!.name,
          true,
          (p) => {
            if (p.stage !== 'cost') return;
            flushSync(() => {
              setImportProgress((prev) => ({
                ...prev,
                subProcessed: p.inserted,
                subTotal: p.total,
              }));
            });
          }
        );

        if (result.success) {
          successful++;
        } else {
          failed++;
          errors.push(`${group.name}: ${result.error}`);
        }
      } catch (err: any) {
        failed++;
        errors.push(`${group.name}: ${err.message}`);
      }

      flushSync(() => {
        setImportProgress((prev) => ({
          ...prev,
          processed: i + 1,
          successful,
          failed,
          errors: errors.slice(-5),
          subProcessed: 0,
          subTotal: 0,
        }));
      });
    }

    try {
      await refetch();
    } catch (err: any) {
      console.error('Refetch templates failed:', err);
    }

    flushSync(() => {
      setImportProgress((prev) => ({
        ...prev,
        status: failed > 0 ? 'error' : 'complete',
        currentGroup: undefined,
      }));
    });

    toast({
      title: failed > 0 ? 'Import finished with errors' : 'Import complete',
      description: `${successful} templates created, ${failed} failed.`,
      ...(failed > 0 ? { variant: 'destructive' as const } : {}),
    });

    if (bulkInputRef.current) {
      bulkInputRef.current.value = '';
    }
  };

  const handleDeleteSelected = async () => {
    for (const templateId of Array.from(selectedTemplates)) {
      await deleteTemplate(templateId);
    }
    setSelectedTemplates(new Set());
    setShowDeleteDialog(false);
    toast({ title: 'Templates deleted' });
  };

  const handleUpdateCostData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || selectedTemplates.size === 0) return;

    setIsUpdatingCost(true);

    try {
      const costData = await parseExcelFile(file);
      let successCount = 0;
      let failCount = 0;

      for (const templateId of Array.from(selectedTemplates)) {
        const result = await updateCostData(templateId, costData.rows, file.name);
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      }

      toast({
        title: 'Cost data updated',
        description: `${successCount} template(s) updated${failCount > 0 ? `, ${failCount} failed` : ''}.`,
      });

      setSelectedTemplates(new Set());
    } catch (err: any) {
      toast({
        title: 'Update failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingCost(false);
      if (costUpdateInputRef.current) {
        costUpdateInputRef.current.value = '';
      }
    }
  };

  const toggleSelectAll = () => {
    if (selectedTemplates.size === templates.length) {
      setSelectedTemplates(new Set());
    } else {
      setSelectedTemplates(new Set(templates.map(t => t.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedTemplates);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedTemplates(newSet);
  };

  const toggleExpand = async (id: string) => {
    if (expandedTemplate === id) {
      setExpandedTemplate(null);
    } else {
      setExpandedTemplate(id);
      if (!templateSections[id]) {
        const sections = await getSections(id);
        setTemplateSections(prev => ({ ...prev, [id]: sections }));
      }
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  if (authLoading || dbLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const progressPercent = (() => {
    if (importProgress.total <= 0) return 0;

    const base = importProgress.processed / importProgress.total;
    const sub =
      importProgress.status === 'importing' && (importProgress.subTotal || 0) > 0
        ? (importProgress.subProcessed || 0) / (importProgress.subTotal as number)
        : 0;

    const effective = Math.min(1, base + sub / importProgress.total);
    return Math.round(effective * 100);
  })();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Data Template</h1>
            <p className="text-muted-foreground mt-1">
              {templates.length} templates • Synced to cloud
            </p>
          </div>
          {hasRole && (
            <div className="flex gap-2">
              <input
                ref={bulkInputRef}
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv"
                onChange={handleBulkImport}
                className="hidden"
                multiple
              />
              <input
                ref={costUpdateInputRef}
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv"
                onChange={handleUpdateCostData}
                className="hidden"
              />

              {selectedTemplates.size > 0 && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => costUpdateInputRef.current?.click()}
                    disabled={isUpdatingCost}
                  >
                    {isUpdatingCost ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Edit className="mr-2 h-4 w-4" />
                    )}
                    Update Cost ({selectedTemplates.size})
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete ({selectedTemplates.size})
                  </Button>
                </>
              )}

              <Button onClick={() => bulkInputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                Bulk Import
              </Button>
            </div>
          )}
        </div>

        {/* Import Progress */}
        {importProgress.status !== 'idle' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Import Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {importProgress.status === 'parsing' && 'Parsing files...'}
                    {importProgress.status === 'importing' && (
                      <>
                        Importing {Math.min(importProgress.processed + 1, importProgress.total)} of {importProgress.total}
                        {importProgress.currentGroup ? ` • ${importProgress.currentGroup}` : ''}
                        {(importProgress.subTotal || 0) > 0 ? ` • ${importProgress.subProcessed || 0}/${importProgress.subTotal}` : ''}
                      </>
                    )}
                    {importProgress.status === 'complete' && 'Complete!'}
                    {importProgress.status === 'error' && 'Finished with errors'}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} />
              </div>

              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  {importProgress.successful} successful
                </div>
                {importProgress.failed > 0 && (
                  <div className="flex items-center gap-1 text-red-600">
                    <XCircle className="h-4 w-4" />
                    {importProgress.failed} failed
                  </div>
                )}
              </div>

              {importProgress.errors.length > 0 && (
                <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  {importProgress.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Templates List */}
        {!hasRole ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <CalendarDays className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg">No Role Assigned</h3>
              <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                Your account has been created. Please wait for a manager to assign you a role.
              </p>
            </CardContent>
          </Card>
        ) : templates.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <FolderOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg">No Data Templates Yet</h3>
              <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                Upload cost data and job ticket files to create data templates.
              </p>
              <Button className="mt-6 gap-2" onClick={() => bulkInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Bulk Import
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Templates</CardTitle>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedTemplates.size === templates.length && templates.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">Select all</span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {templates.map((template) => (
                  <Collapsible
                    key={template.id}
                    open={expandedTemplate === template.id}
                    onOpenChange={() => toggleExpand(template.id)}
                  >
                    <div className="border rounded-lg">
                      <div className="flex items-center gap-3 p-4">
                        <Checkbox
                          checked={selectedTemplates.has(template.id)}
                          onCheckedChange={() => toggleSelect(template.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <CollapsibleTrigger className="flex-1 flex items-center gap-3 text-left">
                          {expandedTemplate === template.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <div className="flex-1">
                            <div className="font-medium">{template.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {template.facility_name} • Inv. Date: {formatDate(template.inv_date)}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent>
                        <div className="px-4 pb-4 pt-0 border-t">
                          <div className="pt-4">
                            <h4 className="text-sm font-medium mb-2">Sections</h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                              {templateSections[template.id]?.map((section) => (
                                <div
                                  key={section.id}
                                  className="text-xs bg-muted px-2 py-1 rounded"
                                >
                                  {section.full_section}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Templates?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedTemplates.size} template(s) and all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Index;
