import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useDataTemplates, DataTemplate } from '@/hooks/useDataTemplates';
import { 
  Upload, Loader2, CalendarDays, Trash2, RefreshCw, FileSpreadsheet, 
  CheckCircle, XCircle, FolderOpen, ChevronDown, ChevronRight 
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
  total: number;
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
}

const Index = () => {
  const { isLoading: authLoading, roles } = useAuth();
  const { toast } = useToast();
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const updateInputRef = useRef<HTMLInputElement>(null);

  const {
    isLoading: dbLoading,
    isReady,
    extractTemplateName,
    importTemplate,
    updateTemplateCost,
    getTemplates,
    getTemplateSections,
    getCostItemCount,
    deleteTemplates,
    getTemplateCount,
  } = useDataTemplates();

  const [templates, setTemplates] = useState<DataTemplate[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<number>>(new Set());
  const [expandedTemplate, setExpandedTemplate] = useState<number | null>(null);
  const [templateSections, setTemplateSections] = useState<{ [key: number]: any[] }>({});
  const [updateTemplateId, setUpdateTemplateId] = useState<number | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const [importProgress, setImportProgress] = useState<ImportProgress>({
    status: 'idle',
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    errors: [],
  });

  // Load templates when ready
  useEffect(() => {
    if (isReady) {
      setTemplates(getTemplates());
    }
  }, [isReady, getTemplates]);

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
          // Also get raw 2D array for scanning cells
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

  // Extract the invoice number from filename (7-9 digits)
  const extractInvNumber = (fileName: string): string | null => {
    const match = fileName.match(/\b(\d{7,9})\b/);
    return match ? match[1] : null;
  };

  // Check if file is a job ticket
  const isTicketFile = (fileName: string): boolean => {
    const s = fileName.toLowerCase();
    return s.includes('jobticket') || s.includes('jobtickettemplate') || s.startsWith('jc ');
  };

  // Check if file is a cost data file
  const isCostFile = (fileName: string): boolean => {
    const s = fileName.toLowerCase();
    return s.includes('cost data');
  };

  // Group files by the invoice number in the filename
  const groupFiles = (files: FileList): FileGroup[] => {
    const costFiles: { [inv: string]: File } = {};
    const jobTicketFiles: { [inv: string]: File } = {};

    Array.from(files).forEach(file => {
      const inv = extractInvNumber(file.name);
      
      if (!inv) return;

      if (isCostFile(file.name)) {
        costFiles[inv] = file;
      } else if (isTicketFile(file.name)) {
        jobTicketFiles[inv] = file;
      }
    });

    // Match pairs by invoice number
    const groups: FileGroup[] = [];
    for (const inv of Object.keys(costFiles)) {
      if (jobTicketFiles[inv]) {
        groups.push({
          name: inv, // Will be replaced with proper name after parsing
          costFile: costFiles[inv],
          jobTicketFile: jobTicketFiles[inv],
        });
      }
    }

    return groups;
  };

  const handleBulkImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const groups = groupFiles(files);

    if (groups.length === 0) {
      toast({
        title: 'No valid pairs found',
        description: 'Make sure to upload matching cost data and job ticket files.',
        variant: 'destructive',
      });
      return;
    }

    setImportProgress({
      status: 'parsing',
      total: groups.length,
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [],
    });

    let successful = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];

      try {
        setImportProgress(prev => ({ ...prev, status: 'importing' }));

        const costData = await parseExcelFile(group.costFile!);
        const jobTicketData = await parseExcelFile(group.jobTicketFile!);

        const result = await importTemplate(
          group.name,
          costData.rows,
          jobTicketData.rows,
          jobTicketData.rawData,
          group.costFile!.name,
          group.jobTicketFile!.name
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

      setImportProgress(prev => ({
        ...prev,
        processed: i + 1,
        successful,
        failed,
        errors: errors.slice(-5),
      }));
    }

    setImportProgress(prev => ({ ...prev, status: 'complete' }));
    setTemplates(getTemplates());

    toast({
      title: 'Import complete',
      description: `${successful} templates created, ${failed} failed.`,
    });

    if (bulkInputRef.current) {
      bulkInputRef.current.value = '';
    }
  };

  const handleUpdateCost = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || updateTemplateId === null) return;

    try {
      toast({ title: 'Parsing cost data...' });
      const costData = await parseExcelFile(file);

      const result = await updateTemplateCost(updateTemplateId, costData.rows, file.name);

      if (result.success) {
        toast({
          title: 'Cost data updated',
          description: `${result.updated} items updated.`,
        });
        setTemplates(getTemplates());
      } else {
        toast({ title: 'Update failed', description: result.error, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    }

    setUpdateTemplateId(null);
    if (updateInputRef.current) {
      updateInputRef.current.value = '';
    }
  };

  const handleDeleteSelected = async () => {
    await deleteTemplates(Array.from(selectedTemplates));
    setSelectedTemplates(new Set());
    setTemplates(getTemplates());
    setShowDeleteDialog(false);
    toast({ title: 'Templates deleted' });
  };

  const toggleSelectAll = () => {
    if (selectedTemplates.size === templates.length) {
      setSelectedTemplates(new Set());
    } else {
      setSelectedTemplates(new Set(templates.map(t => t.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedTemplates);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedTemplates(newSet);
  };

  const toggleExpand = (id: number) => {
    if (expandedTemplate === id) {
      setExpandedTemplate(null);
    } else {
      setExpandedTemplate(id);
      if (!templateSections[id]) {
        const sections = getTemplateSections(id);
        setTemplateSections(prev => ({ ...prev, [id]: sections }));
      }
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      // Handle various date formats
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

  const progressPercent = importProgress.total > 0
    ? Math.round((importProgress.processed / importProgress.total) * 100)
    : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Data Template</h1>
            <p className="text-muted-foreground mt-1">
              {templates.length} templates • Sorted by inventory date
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
                ref={updateInputRef}
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv"
                onChange={handleUpdateCost}
                className="hidden"
              />

              {selectedTemplates.size > 0 && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (selectedTemplates.size === 1) {
                        setUpdateTemplateId(Array.from(selectedTemplates)[0]);
                        updateInputRef.current?.click();
                      }
                    }}
                    disabled={selectedTemplates.size !== 1}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Update Cost
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
                    {importProgress.status === 'importing' && `Importing ${importProgress.processed} of ${importProgress.total} templates`}
                    {importProgress.status === 'complete' && 'Complete!'}
                    {importProgress.status === 'error' && 'Error occurred'}
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
                              Inv. Date: {formatDate(template.inv_date)} • {getCostItemCount(template.id)} cost items
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
