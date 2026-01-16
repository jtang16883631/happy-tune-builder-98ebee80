import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Search, Upload, RefreshCw, Database, FileSpreadsheet, CheckCircle, XCircle, HardDrive, Trash2 } from 'lucide-react';
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
    searchDrugs,
    getDrugs,
    getCount,
    clearDatabase,
  } = useLocalFDA();

  const [searchTerm, setSearchTerm] = useState('');
  const [drugs, setDrugs] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    status: 'idle',
    errors: [],
  });

  // Load drugs when ready or search changes
  useEffect(() => {
    if (!isReady) {
      setDrugs([]);
      setTotalCount(0);
      return;
    }

    if (searchTerm.trim()) {
      const results = searchDrugs(searchTerm, 100);
      setDrugs(results);
    } else {
      const results = getDrugs(0, 100);
      setDrugs(results);
    }
    setTotalCount(getCount());
  }, [isReady, searchTerm, searchDrugs, getDrugs, getCount]);

  const parseExcelFile = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          resolve(jsonData);
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

      toast({ title: 'Importing to local database...', description: `Processing ${rows.length.toLocaleString()} rows...` });

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

      // Refresh the list
      if (searchTerm.trim()) {
        setDrugs(searchDrugs(searchTerm, 100));
      } else {
        setDrugs(getDrugs(0, 100));
      }
      setTotalCount(getCount());

      toast({
        title: 'Import complete!',
        description: `${result.success.toLocaleString()} drugs saved locally. Data will persist on this device.`,
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
    setDrugs([]);
    setTotalCount(0);
    toast({ title: 'Database cleared', description: 'All local FDA data has been removed.' });
  };

  const progressPercent = uploadProgress.total > 0 
    ? Math.round((uploadProgress.processed / uploadProgress.total) * 100) 
    : 0;

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
                  {totalCount.toLocaleString()} drugs stored locally
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
                    {uploadProgress.status === 'complete' && 'Complete! Data saved to this device.'}
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

        {/* Search */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Search FDA Database</CardTitle>
            <CardDescription>
              {isReady ? 'Search locally - instant results' : 'Upload FDA data to enable search'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by NDC, drug name, or manufacturer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  disabled={!isReady}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Drugs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Drug List</CardTitle>
            <CardDescription>
              {isReady 
                ? `Showing ${drugs.length} of ${totalCount.toLocaleString()} drugs${searchTerm ? ` matching "${searchTerm}"` : ''}`
                : 'No data loaded'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!isReady ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Upload your FDA Excel file to get started.</p>
                <p className="text-sm mt-2">Data will be stored locally on this device for instant access.</p>
              </div>
            ) : drugs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No drugs found{searchTerm ? ` matching "${searchTerm}"` : ''}.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NDC</TableHead>
                      <TableHead>Drug Name</TableHead>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead>RX/OTC</TableHead>
                      <TableHead>DEA Class</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drugs.map((drug) => (
                      <TableRow key={drug.id}>
                        <TableCell className="font-mono text-sm">{drug.ndc}</TableCell>
                        <TableCell className="font-medium">{drug.drug_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{drug.manufacturer || '-'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {drug.package_description || '-'}
                        </TableCell>
                        <TableCell className="text-sm">{drug.fda_status || '-'}</TableCell>
                        <TableCell className="text-sm">{drug.dea_schedule || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default FDA;
