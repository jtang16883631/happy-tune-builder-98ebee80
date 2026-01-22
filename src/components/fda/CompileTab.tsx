import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Trash2, Download, FolderOpen, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';

interface UploadedFile {
  id: string;
  name: string;
  data: any[][];
  headers: string[];
  sheetName: string;
}

interface CompileProgress {
  status: 'idle' | 'loading' | 'compiling' | 'complete' | 'error';
  total: number;
  processed: number;
  errors: string[];
}

export function CompileTab() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [progress, setProgress] = useState<CompileProgress>({
    status: 'idle',
    total: 0,
    processed: 0,
    errors: [],
  });

  // Parse uploaded Excel file
  const parseExcelFile = async (file: File): Promise<UploadedFile[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          
          const results: UploadedFile[] = [];
          
          // Process each sheet (skip Summary sheet)
          workbook.SheetNames.forEach(sheetName => {
            if (sheetName.toLowerCase() === 'summary' || sheetName.toLowerCase() === 'master') {
              return; // Skip summary and master sheets
            }
            
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
            
            if (jsonData.length > 1) { // Has header + at least one data row
              const headers = jsonData[0] as string[];
              results.push({
                id: `${file.name}-${sheetName}-${Date.now()}`,
                name: `${file.name} → ${sheetName}`,
                data: jsonData.slice(1), // Data without header
                headers,
                sheetName,
              });
            }
          });
          
          resolve(results);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setProgress({ status: 'loading', total: files.length, processed: 0, errors: [] });

    const errors: string[] = [];
    const newFiles: UploadedFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const parsed = await parseExcelFile(file);
        newFiles.push(...parsed);
        setProgress(prev => ({ ...prev, processed: i + 1 }));
      } catch (err: any) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }

    setUploadedFiles(prev => [...prev, ...newFiles]);
    setProgress({
      status: errors.length > 0 ? 'error' : 'complete',
      total: files.length,
      processed: files.length,
      errors,
    });

    if (newFiles.length > 0) {
      toast({
        title: 'Files loaded',
        description: `${newFiles.length} sheets ready to compile`,
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Remove a file from the list
  const handleRemoveFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  // Clear all files
  const handleClearAll = () => {
    setUploadedFiles([]);
    setProgress({ status: 'idle', total: 0, processed: 0, errors: [] });
  };

  // Compile and export merged Excel
  const handleCompile = () => {
    if (uploadedFiles.length === 0) {
      toast({ title: 'No files to compile', variant: 'destructive' });
      return;
    }

    setProgress(prev => ({ ...prev, status: 'compiling' }));

    try {
      const workbook = XLSX.utils.book_new();
      
      // Collect all data for master sheet and summary
      const masterData: any[][] = [];
      let masterHeaders: string[] = [];
      const sectionTotals: { section: string; count: number; value: number }[] = [];

      // First, get headers from the first file
      if (uploadedFiles.length > 0 && uploadedFiles[0].headers.length > 0) {
        masterHeaders = uploadedFiles[0].headers;
      }

      // Find the Extended column index (for totals)
      const extendedColIndex = masterHeaders.findIndex(h => 
        h?.toString().toLowerCase().includes('extended') || 
        h?.toString().toLowerCase() === 'extended'
      );

      // Process each uploaded file/sheet
      uploadedFiles.forEach((file, idx) => {
        // Add to master
        file.data.forEach(row => {
          masterData.push(row);
        });

        // Calculate section total
        let sectionTotal = 0;
        if (extendedColIndex >= 0) {
          file.data.forEach(row => {
            const val = parseFloat(row[extendedColIndex]);
            if (!isNaN(val)) {
              sectionTotal += val;
            }
          });
        }

        sectionTotals.push({
          section: file.sheetName,
          count: file.data.length,
          value: sectionTotal,
        });

        // Create individual sheet for this section
        const sheetData = [file.headers, ...file.data];
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        
        // Truncate sheet name to 31 chars (Excel limit)
        const safeSheetName = file.sheetName.slice(0, 31);
        XLSX.utils.book_append_sheet(workbook, ws, safeSheetName);
      });

      // Create Summary sheet (first)
      const grandTotal = sectionTotals.reduce((sum, s) => sum + s.value, 0);
      const totalCount = sectionTotals.reduce((sum, s) => sum + s.count, 0);
      
      const summaryData = [
        ['COMPILED EXPORT SUMMARY'],
        [],
        ['Compiled Date:', new Date().toLocaleDateString()],
        ['Total Sections:', sectionTotals.length],
        ['Total Scans:', totalCount],
        ['Grand Total:', `$${grandTotal.toFixed(2)}`],
        [],
        ['Section', 'Scan Count', 'Total Value'],
        ...sectionTotals.map(s => [s.section, s.count, `$${s.value.toFixed(2)}`]),
      ];
      
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      
      // Create Master sheet (all data combined)
      const masterSheetData = [masterHeaders, ...masterData];
      const masterWs = XLSX.utils.aoa_to_sheet(masterSheetData);

      // Prepend Summary and Master to the workbook
      const existingSheets = [...workbook.SheetNames];
      workbook.SheetNames = ['Summary', 'Master', ...existingSheets];
      workbook.Sheets['Summary'] = summaryWs;
      workbook.Sheets['Master'] = masterWs;

      // Generate and download
      const fileName = `compiled-export-${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);

      setProgress({
        status: 'complete',
        total: uploadedFiles.length,
        processed: uploadedFiles.length,
        errors: [],
      });

      toast({
        title: 'Compile complete!',
        description: `${uploadedFiles.length} sections merged into ${fileName}`,
      });
    } catch (err: any) {
      setProgress(prev => ({ ...prev, status: 'error', errors: [err.message] }));
      toast({ title: 'Compile failed', description: err.message, variant: 'destructive' });
    }
  };

  const progressPercent = progress.total > 0 
    ? Math.round((progress.processed / progress.total) * 100) 
    : 0;

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Import Offline Export Files
          </CardTitle>
          <CardDescription>
            Upload Excel files exported from the Scan page offline mode to merge them into a single workbook.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            id="compile-upload"
          />
          
          <div className="flex gap-2">
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={progress.status === 'loading' || progress.status === 'compiling'}
            >
              {progress.status === 'loading' ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Add Excel Files
            </Button>
            
            {uploadedFiles.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={handleClearAll}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear All
                </Button>
                
                <Button
                  variant="default"
                  onClick={handleCompile}
                  disabled={progress.status === 'compiling'}
                  className="ml-auto"
                >
                  {progress.status === 'compiling' ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Compile & Download
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {progress.status !== 'idle' && progress.status !== 'complete' && (
        <Card>
          <CardContent className="py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  {progress.status === 'loading' && 'Loading files...'}
                  {progress.status === 'compiling' && 'Compiling...'}
                </span>
                <span>{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} />
            </div>
            
            {progress.errors.length > 0 && (
              <div className="mt-2 text-xs text-destructive">
                {progress.errors.map((err, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    {err}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Loaded Sections ({uploadedFiles.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{file.sheetName}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.data.length} rows • {file.name}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveFile(file.id)}
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {uploadedFiles.length === 0 && progress.status === 'idle' && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No files loaded</p>
              <p className="text-sm mt-2">
                Upload Excel files from offline scan exports to compile them into a single workbook.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
