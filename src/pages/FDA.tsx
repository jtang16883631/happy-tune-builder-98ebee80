import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Search, Upload, RefreshCw, Database, FileSpreadsheet, CheckCircle, XCircle } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import * as XLSX from 'xlsx';

interface Drug {
  id: string;
  ndc: string;
  drug_name: string;
  manufacturer: string | null;
  package_description: string | null;
  unit_cost: number | null;
  fda_status: string | null;
  dea_schedule: string | null;
  source: string;
  updated_at: string;
}

interface UploadProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  status: 'idle' | 'parsing' | 'uploading' | 'complete' | 'error';
  errors: string[];
}

const BATCH_SIZE = 500;

const FDA = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    total: 0,
    processed: 0,
    successful: 0,
    failed: 0,
    status: 'idle',
    errors: [],
  });

  // Fetch drugs from database
  const { data: drugs = [], isLoading } = useQuery({
    queryKey: ['drugs', searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('drugs')
        .select('*')
        .order('drug_name')
        .limit(100);
      
      if (searchTerm) {
        query = query.or(`drug_name.ilike.%${searchTerm}%,ndc.ilike.%${searchTerm}%,manufacturer.ilike.%${searchTerm}%`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as Drug[];
    },
  });

  // Get total count and last update
  const { data: dbStats } = useQuery({
    queryKey: ['drugs-stats'],
    queryFn: async () => {
      const { count, error: countError } = await supabase
        .from('drugs')
        .select('*', { count: 'exact', head: true });
      if (countError) throw countError;
      
      // Get most recent update
      const { data: lastUpdated, error: lastError } = await supabase
        .from('drugs')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      return {
        count: count || 0,
        lastUpdated: lastUpdated?.updated_at || null,
      };
    },
  });

  const hasExistingData = (dbStats?.count || 0) > 0;

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

  const normalizeRow = (row: any): { ndc: string; drug_name: string; manufacturer?: string; package_description?: string; unit_cost?: number; fda_status?: string; dea_schedule?: string } | null => {
    // Map your FDA Excel columns
    const ndc = row['NDC'] || row.NDC || row.ndc;
    // Use TRADE name first, fall back to GENERIC, then MERIDIAN DESC
    const drugName = row['TRADE'] || row['GENERIC'] || row['MERIDIAN DESC'] || row.TRADE || row.GENERIC;
    
    if (!ndc || !drugName) return null;
    
    const packageSize = row['PACKAGE SIZE'] || row['FDA SIZE'] || '';
    const sizeText = row['SIZE TXT'] || '';
    const doseForm = row['DOSE FORM'] || '';
    
    return {
      ndc: String(ndc).trim(),
      drug_name: String(drugName).trim(),
      manufacturer: row['MANUFACTURER'] || row.MANUFACTURER || null,
      package_description: [packageSize, sizeText, doseForm].filter(Boolean).join(' ').trim() || null,
      unit_cost: null,
      fda_status: row['RX/OTC INDICATOR'] || null,
      dea_schedule: row['DEA CLASS'] || row['DEA Schedule'] || null,
    };
  };

  const uploadBatch = async (batch: any[]): Promise<{ success: number; failed: number; errors: string[] }> => {
    const normalizedBatch = batch
      .map(normalizeRow)
      .filter((row): row is NonNullable<ReturnType<typeof normalizeRow>> => row !== null);

    if (normalizedBatch.length === 0) {
      return { success: 0, failed: batch.length, errors: ['No valid rows in batch'] };
    }

    const drugsToUpsert = normalizedBatch.map(drug => ({
      ...drug,
      source: 'fda_import',
    }));

    const { error } = await supabase
      .from('drugs')
      .upsert(drugsToUpsert, { onConflict: 'ndc', ignoreDuplicates: false });

    if (error) {
      return { success: 0, failed: normalizedBatch.length, errors: [error.message] };
    }

    return { success: normalizedBatch.length, failed: batch.length - normalizedBatch.length, errors: [] };
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
        status: 'uploading',
      }));

      toast({ title: 'Upload started', description: `Processing ${rows.length.toLocaleString()} rows...` });

      let totalSuccessful = 0;
      let totalFailed = 0;
      const allErrors: string[] = [];

      // Process in batches
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const result = await uploadBatch(batch);
        
        totalSuccessful += result.success;
        totalFailed += result.failed;
        allErrors.push(...result.errors);

        setUploadProgress(prev => ({
          ...prev,
          processed: Math.min(i + BATCH_SIZE, rows.length),
          successful: totalSuccessful,
          failed: totalFailed,
          errors: allErrors.slice(-5), // Keep last 5 errors
        }));

        // Small delay to prevent overwhelming the database
        if (i + BATCH_SIZE < rows.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      setUploadProgress(prev => ({
        ...prev,
        status: 'complete',
      }));

      queryClient.invalidateQueries({ queryKey: ['drugs'] });
      queryClient.invalidateQueries({ queryKey: ['drugs-stats'] });

      toast({
        title: 'Upload complete',
        description: `${totalSuccessful.toLocaleString()} drugs imported, ${totalFailed.toLocaleString()} failed.`,
      });
    } catch (error: any) {
      setUploadProgress(prev => ({
        ...prev,
        status: 'error',
        errors: [error.message],
      }));
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const progressPercent = uploadProgress.total > 0 
    ? Math.round((uploadProgress.processed / uploadProgress.total) * 100) 
    : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">FDA Database</h1>
            <p className="text-muted-foreground">
              {hasExistingData ? (
                <>
                  {dbStats?.count.toLocaleString()} drugs in database
                  {dbStats?.lastUpdated && (
                    <> • Last updated: {new Date(dbStats.lastUpdated).toLocaleDateString()}</>
                  )}
                </>
              ) : (
                'Upload your FDA Excel file to get started'
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
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadProgress.status === 'parsing' || uploadProgress.status === 'uploading'}
              variant={hasExistingData ? 'outline' : 'default'}
            >
              {uploadProgress.status === 'parsing' || uploadProgress.status === 'uploading' ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {hasExistingData ? 'Update FDA Data' : 'Upload FDA Data'}
            </Button>
          </div>
        </div>

        {/* Upload Progress */}
        {uploadProgress.status !== 'idle' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Upload Progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {uploadProgress.status === 'parsing' && 'Parsing file...'}
                    {uploadProgress.status === 'uploading' && `Processing ${uploadProgress.processed.toLocaleString()} of ${uploadProgress.total.toLocaleString()}`}
                    {uploadProgress.status === 'complete' && 'Complete!'}
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
              Showing {drugs.length} of {dbStats?.count.toLocaleString() || 0} drugs
              {searchTerm && ` matching "${searchTerm}"`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : drugs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No drugs found. Upload an FDA Excel file to get started.</p>
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
                      <TableHead>FDA Status</TableHead>
                      <TableHead>Updated</TableHead>
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
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(drug.updated_at).toLocaleDateString()}
                        </TableCell>
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
