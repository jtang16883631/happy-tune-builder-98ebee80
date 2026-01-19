import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Upload, RefreshCw, FileSpreadsheet, CheckCircle, XCircle, HardDrive, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useLocalFDA } from '@/hooks/useLocalFDA';
import * as XLSX from 'xlsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface UploadProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  status: 'idle' | 'parsing' | 'importing' | 'complete' | 'error';
  errors: string[];
}

const FDA = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const {
    isLoading: dbLoading,
    isReady,
    meta,
    importData,
    getCount,
    clearDatabase,
  } = useLocalFDA();

  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    status: 'idle',
    errors: [],
  });

  const parseExcelFile = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

          // Parse twice:
          // 1) default header-based objects (what we had before)
          // 2) column-letter-based objects (A, B, C... / AE / AG...) so column *order* works even if header text differs
          const byHeader = XLSX.utils.sheet_to_json(firstSheet, { defval: '' }) as any[];
          const byCol = XLSX.utils.sheet_to_json(firstSheet, { header: 'A', defval: '' }) as any[];

          // byCol includes the header row as the first entry; align it with byHeader (which excludes the header row)
          const byColData = byCol.slice(1);

          const merged = byHeader.map((row, idx) => ({
            ...row,
            ...(byColData[idx] ?? {}),
          }));

          resolve(merged);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadProgress({
      total: 0,
      processed: 0,
      successful: 0,
      failed: 0,
      status: 'parsing',
      errors: [],
    });

    try {
      toast({ title: 'Parsing file...', description: 'This may take a moment for large files.' });
      
      const rows = await parseExcelFile(file);
      
      setUploadProgress(prev => ({
        ...prev,
        total: rows.length,
        status: 'importing',
      }));

      toast({ title: 'Importing to local database...', description: `Processing ${rows.length.toLocaleString()} rows with all columns...` });

      const result = await importData(rows, file.name, (processed, total) => {
        setUploadProgress(prev => ({
          ...prev,
          processed,
          successful: processed,
        }));
      });

      setUploadProgress(prev => ({
        ...prev,
        processed: rows.length,
        successful: result.success,
        failed: result.failed,
        status: 'complete',
      }));

      toast({
        title: 'Import complete!',
        description: `${result.success.toLocaleString()} drugs saved locally with all columns.`,
      });
    } catch (error: any) {
      setUploadProgress(prev => ({
        ...prev,
        status: 'error',
        errors: [error.message],
      }));
      toast({ title: 'Import failed', description: error.message, variant: 'destructive' });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearDatabase = async () => {
    await clearDatabase();
    toast({ title: 'Database cleared', description: 'All local FDA data has been removed.' });
  };

  const progressPercent = uploadProgress.total > 0 
    ? Math.round((uploadProgress.processed / uploadProgress.total) * 100) 
    : 0;

  const totalCount = isReady ? getCount() : 0;

  if (dbLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Loading local FDA database...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">FDA Database</h1>
            <p className="text-muted-foreground">
              {isReady && meta ? (
                <span className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  {totalCount.toLocaleString()} drugs stored locally (all columns)
                  {meta.lastUpdated && (
                    <> • Updated: {new Date(meta.lastUpdated).toLocaleDateString()}</>
                  )}
                </span>
              ) : (
                'Upload your FDA Excel file to get started (stored on this device)'
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
              id="fda-upload"
            />
            
            {isReady && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear FDA Database?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all {totalCount.toLocaleString()} drugs from local storage. You'll need to upload the FDA file again.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearDatabase}>Clear</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadProgress.status === 'parsing' || uploadProgress.status === 'importing'}
              variant={isReady ? 'outline' : 'default'}
            >
              {uploadProgress.status === 'parsing' || uploadProgress.status === 'importing' ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {isReady ? 'Update FDA Data' : 'Upload FDA Data'}
            </Button>
          </div>
        </div>

        {/* Status Card */}
        {isReady && uploadProgress.status === 'idle' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                FDA Database Ready
              </CardTitle>
              <CardDescription>
                {meta?.fileName && `Source: ${meta.fileName}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Drugs</p>
                  <p className="text-2xl font-bold">{totalCount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Updated</p>
                  <p className="font-medium">{meta?.lastUpdated ? new Date(meta.lastUpdated).toLocaleString() : '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Storage</p>
                  <p className="font-medium">Local (this device)</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Columns</p>
                  <p className="font-medium">All 32 columns</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upload Progress */}
        {uploadProgress.status !== 'idle' && (
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
                    {uploadProgress.status === 'parsing' && 'Parsing Excel file...'}
                    {uploadProgress.status === 'importing' && `Importing ${uploadProgress.processed.toLocaleString()} of ${uploadProgress.total.toLocaleString()}`}
                    {uploadProgress.status === 'complete' && 'Complete! All columns saved to this device.'}
                    {uploadProgress.status === 'error' && 'Error occurred'}
                  </span>
                  <span>{progressPercent}%</span>
                </div>
                <Progress value={progressPercent} />
              </div>
              
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  {uploadProgress.successful.toLocaleString()} successful
                </div>
                {uploadProgress.failed > 0 && (
                  <div className="flex items-center gap-1 text-red-600">
                    <XCircle className="h-4 w-4" />
                    {uploadProgress.failed.toLocaleString()} failed
                  </div>
                )}
              </div>

              {uploadProgress.errors.length > 0 && (
                <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  {uploadProgress.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!isReady && uploadProgress.status === 'idle' && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <HardDrive className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No FDA data loaded</p>
                <p className="text-sm mt-2">Upload your FDA Excel file to store it locally.</p>
                <p className="text-sm">All 32 columns will be imported for instant lookups.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default FDA;
