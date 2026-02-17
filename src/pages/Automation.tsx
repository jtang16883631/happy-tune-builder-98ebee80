import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Upload, FileSpreadsheet, Search, AlertCircle, Loader2, Trash2, ArrowLeft, Play, Save, 
  Plus, ChevronDown, Settings2, Eye, EyeOff, Calculator, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { useLocalFDA, FDADrug } from '@/hooks/useLocalFDA';
import { useCloudTemplates, CloudTemplate, CloudSection } from '@/hooks/useCloudTemplates';
import { useOfflineTemplates } from '@/hooks/useOfflineTemplates';
import { useOnlineStatus } from '@/components/OfflineRedirect';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getCellValidationColor, getCellValidationClasses } from '@/lib/cellValidation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import * as XLSX from 'xlsx';

// Same row structure as Scan page
interface ScanRow {
  id: string;
  loc: string;
  device: string;
  rec: string;
  time: string;
  ndc: string;
  scannedNdc: string;
  qty: number | null;
  misDivisor: number | null;
  misCountMethod: string;
  itemNumber: string;
  medDesc: string;
  meridianDesc: string;
  trade: string;
  generic: string;
  strength: string;
  packSz: string;
  fdaSize: string;
  sizeTxt: string;
  doseForm: string;
  manufacturer: string;
  genericCode: string;
  deaClass: string;
  ahfs: string;
  source: string;
  packCost: number | null;
  unitCost: number | null;
  extended: number | null;
  blank: string;
  sheetType: string;
  auditCriteria: string;
  originalQty: number | null;
  auditorInitials: string;
  results: string;
  additionalNotes: string;
}

const Automation = () => {
  const { user } = useAuth();
  const { lookupNDC: fdaLookup, findOuterNDCsByNDC9, getDrugByOuterNDC, isReady: fdaReady } = useLocalFDA();
  const isOnline = useOnlineStatus();
  
  // Use cloud or offline templates based on connectivity
  const cloudTemplates = useCloudTemplates();
  const offlineTemplates = useOfflineTemplates();
  const { templates, getCostItemByNDC, getSections } = isOnline ? cloudTemplates : offlineTemplates as any;
  
  // User short name for REC
  const [userShortName, setUserShortName] = useState('');
  
  // Fetch user profile for short name
  useEffect(() => {
    const CACHE_KEY = 'cached_user_short_name';
    
    const fetchUserProfile = async () => {
      if (!navigator.onLine) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) setUserShortName(cached);
        return;
      }
      
      if (!user?.id) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) setUserShortName(cached);
        return;
      }
      
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, last_name, full_name')
          .eq('id', user.id)
          .maybeSingle();
        
        if (profile) {
          let shortName = '';
          if (profile.first_name && profile.last_name) {
            shortName = `${profile.first_name}${profile.last_name.charAt(0)}`;
          } else if (profile.full_name) {
            const parts = profile.full_name.trim().split(' ');
            if (parts.length >= 2) {
              shortName = `${parts[0]}${parts[parts.length - 1].charAt(0)}`;
            } else {
              shortName = parts[0];
            }
          }
          setUserShortName(shortName);
          if (shortName) localStorage.setItem(CACHE_KEY, shortName);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) setUserShortName(cached);
      }
    };
    
    fetchUserProfile();
  }, [user?.id]);
  
  // State
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<CloudTemplate | null>(null);
  const [selectedSection, setSelectedSection] = useState<CloudSection | null>(null);
  const [sections, setSections] = useState<CloudSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [activeColKey, setActiveColKey] = useState<string | null>(null);
  const [step, setStep] = useState<'select' | 'import' | 'edit'>('select');
  const [searchQuery, setSearchQuery] = useState('');
  const [auditMode, setAuditMode] = useState(false);
  
  // Column visibility state
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set([
    'device', 'trade', 'generic', 'strength', 'sizeTxt', 'doseForm', 
    'genericCode', 'deaClass', 'ahfs'
  ]));
  
  // Column widths
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  
  // QTY expressions for calculator
  const [qtyExpressions, setQtyExpressions] = useState<Record<string, string>>({});
  // Persistent storage for QTY formulas (shown on focus, like Excel formula bar)
  const [qtyFormulas, setQtyFormulas] = useState<Record<string, string>>({});
  
  // Cell refs for navigation
  const cellInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  
  // Multi-cell selection state
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: string } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ row: number; col: string } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Create empty row
  const createEmptyRow = useCallback((sectionName?: string): ScanRow => ({
    id: crypto.randomUUID(),
    loc: sectionName || '',
    device: '',
    rec: '',
    time: '',
    ndc: '',
    scannedNdc: '',
    qty: null,
    misDivisor: null,
    misCountMethod: '',
    itemNumber: '',
    medDesc: '',
    meridianDesc: '',
    trade: '',
    generic: '',
    strength: '',
    packSz: '',
    fdaSize: '',
    sizeTxt: '',
    doseForm: '',
    manufacturer: '',
    genericCode: '',
    deaClass: '',
    ahfs: '',
    source: '',
    packCost: null,
    unitCost: null,
    extended: null,
    blank: '',
    sheetType: '',
    auditCriteria: '',
    originalQty: null,
    auditorInitials: '',
    results: '',
    additionalNotes: '',
  }), []);

  // Generate REC value based on row index
  const generateRecForRow = useCallback((rowIndex: number) => {
    const rowNum = rowIndex + 1;
    return `${userShortName}${String(rowNum).padStart(3, '0')}`;
  }, [userShortName]);

  // Load sections when template is selected
  const loadSections = useCallback(async (templateId: string) => {
    setSectionsLoading(true);
    try {
      if (!isOnline) {
        const offlineSections = localStorage.getItem(`template_sections_${templateId}`);
        if (offlineSections) {
          setSections(JSON.parse(offlineSections));
        }
        return;
      }
      
      const data = await getSections(templateId);
      setSections(data || []);
    } catch (err) {
      console.error('Error loading sections:', err);
      setSections([]);
    } finally {
      setSectionsLoading(false);
    }
  }, [isOnline, getSections]);

  // Handle template selection
  const handleTemplateSelect = useCallback(async (templateId: string) => {
    const template = templates.find((t: CloudTemplate) => t.id === templateId);
    if (!template) return;
    
    setSelectedTemplate(template);
    setSelectedSection(null);
    await loadSections(templateId);
  }, [templates, loadSections]);

  // Handle section selection
  const handleSectionChange = useCallback((sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (section) {
      setSelectedSection(section);
    }
  }, [sections]);

  // Handle file upload
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!selectedTemplate || !selectedSection) {
      toast.error('Please select a template and section first');
      return;
    }

    setFileName(file.name);
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      // Find NDC and QTY columns
      const headerRow = jsonData[0] as string[];
      const ndcColIndex = headerRow.findIndex(h => 
        h?.toString().toLowerCase().includes('ndc') ||
        h?.toString().toLowerCase() === 'ndc'
      );
      const qtyColIndex = headerRow.findIndex(h => 
        h?.toString().toLowerCase().includes('qty') ||
        h?.toString().toLowerCase().includes('quantity') ||
        h?.toString().toLowerCase() === 'qty'
      );

      if (ndcColIndex === -1) {
        toast.error('Could not find NDC column in the Excel file');
        return;
      }

      if (qtyColIndex === -1) {
        toast.error('Could not find QTY/Quantity column in the Excel file');
        return;
      }

      // Parse rows into ScanRow format
      const sectionName = selectedSection.full_section || selectedSection.sect;
      const parsedRows: ScanRow[] = [];
      
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        const ndc = row[ndcColIndex]?.toString().trim().replace(/-/g, '');
        const qty = parseFloat(row[qtyColIndex]?.toString() || '0') || null;
        
        if (ndc && ndc.length > 0) {
          const newRow = createEmptyRow(sectionName);
          newRow.scannedNdc = ndc;
          newRow.qty = qty;
          newRow.rec = generateRecForRow(parsedRows.length);
          newRow.time = new Date().toLocaleTimeString();
          parsedRows.push(newRow);
        }
      }

      if (parsedRows.length === 0) {
        toast.error('No valid NDC entries found in the file');
        return;
      }

      setRows(parsedRows);
      setStep('import');
      toast.success(`Loaded ${parsedRows.length} NDCs from file`);
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      toast.error('Failed to parse Excel file');
    }
    
    event.target.value = '';
  }, [selectedTemplate, selectedSection, createEmptyRow, generateRecForRow]);

  // Process all NDCs through FDA + Cost lookup
  const handleProcessAll = useCallback(async () => {
    if (!fdaReady) {
      toast.error('FDA database not ready. Please import data in Master Data first.');
      return;
    }

    if (!selectedTemplate) {
      toast.error('No template selected');
      return;
    }

    setIsProcessing(true);
    setProcessProgress(0);

    const updatedRows = [...rows];
    
    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      const scannedNdc = row.scannedNdc.replace(/-/g, '');
      
      if (!scannedNdc || scannedNdc.length < 10) {
        setProcessProgress(Math.round(((i + 1) / updatedRows.length) * 100));
        continue;
      }
      
      try {
        // Try to find outer NDC using NDC9 lookup
        const ndc9 = scannedNdc.substring(0, 9);
        const { outerNDCs, drugs } = findOuterNDCsByNDC9(ndc9);
        
        let finalNdc = scannedNdc;
        let fdaResult: FDADrug | null = null;
        
        if (outerNDCs.length === 1) {
          finalNdc = outerNDCs[0];
          fdaResult = getDrugByOuterNDC(finalNdc);
        } else if (outerNDCs.length > 1) {
          fdaResult = getDrugByOuterNDC(outerNDCs[0]);
          finalNdc = outerNDCs[0];
        } else {
          fdaResult = fdaLookup(scannedNdc);
        }
        
        // Get cost item
        const costItem = await getCostItemByNDC(
          selectedTemplate.id, 
          finalNdc, 
          selectedSection?.cost_sheet ?? null
        );
        
        // Populate row with lookup data
        const misCountMethod = fdaResult?.count_method || '';
        const itemNumber = costItem?.material || '';
        const medDesc = costItem?.material_description || '';
        const meridianDesc = fdaResult?.meridian_desc || '';
        const trade = fdaResult?.trade || '';
        const generic = fdaResult?.generic || '';
        const strength = fdaResult?.strength || '';
        const packSz = fdaResult?.package_size || '';
        const fdaSize = fdaResult?.fda_size || '';
        const sizeTxt = fdaResult?.size_txt || '';
        const doseForm = fdaResult?.dose_form || '';
        const manufacturer = fdaResult?.manufacturer || costItem?.manufacturer || '';
        const genericCode = fdaResult?.generic_code || '';
        const deaClass = fdaResult?.dea_class || '';
        const ahfs = fdaResult?.ahfs || '';
        const packCost = costItem?.unit_price !== null && costItem?.unit_price !== undefined 
          ? Number(costItem.unit_price) 
          : null;
        const source = costItem?.source || (fdaResult ? 'FDA' : '');
        const misDivisor = fdaResult?.meridian_divisor ? Number(fdaResult.meridian_divisor) : null;
        
        // Calculate Unit Cost and Extended
        let unitCost: number | null = null;
        if (packCost !== null && misDivisor !== null && misDivisor !== 0) {
          unitCost = packCost / misDivisor;
        }
        
        let extended: number | null = null;
        if (unitCost !== null && row.qty !== null) {
          extended = unitCost * row.qty;
        }
        
        const outerNdcIsDifferent = finalNdc !== scannedNdc;
        
        updatedRows[i] = {
          ...row,
          ndc: outerNdcIsDifferent ? finalNdc : '',
          misCountMethod,
          itemNumber,
          medDesc,
          meridianDesc,
          trade,
          generic,
          strength,
          packSz,
          fdaSize,
          sizeTxt,
          doseForm,
          packCost,
          source,
          misDivisor,
          unitCost,
          extended,
          manufacturer,
          genericCode,
          deaClass,
          ahfs,
        };
      } catch (error) {
        console.error(`Error processing NDC ${scannedNdc}:`, error);
      }
      
      setProcessProgress(Math.round(((i + 1) / updatedRows.length) * 100));
      
      // Update rows progressively
      if (i % 5 === 0 || i === updatedRows.length - 1) {
        setRows([...updatedRows]);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    setRows(updatedRows);
    setIsProcessing(false);
    setStep('edit');
    
    const found = updatedRows.filter(r => r.source).length;
    const notFound = updatedRows.filter(r => !r.source).length;
    toast.success(`Processing complete: ${found} found, ${notFound} not found`);
  }, [rows, fdaLookup, findOuterNDCsByNDC9, getDrugByOuterNDC, getCostItemByNDC, selectedTemplate, selectedSection, fdaReady]);

  // Handle field change with auto-recalculation
  const handleFieldChange = useCallback((key: keyof ScanRow, value: any, rowIndex: number) => {
    setRows(prev => {
      const updated = [...prev];
      updated[rowIndex] = { ...updated[rowIndex], [key]: value };
      
      // Recalculate Unit Cost and Extended when relevant fields change
      if (key === 'packCost' || key === 'misDivisor' || key === 'qty') {
        const row = updated[rowIndex];
        let unitCost: number | null = null;
        if (row.packCost !== null && row.misDivisor !== null && row.misDivisor !== 0) {
          unitCost = row.packCost / row.misDivisor;
        }
        updated[rowIndex].unitCost = unitCost;
        
        let extended: number | null = null;
        if (unitCost !== null && row.qty !== null) {
          extended = unitCost * row.qty;
        }
        updated[rowIndex].extended = extended;
      }
      
      return updated;
    });
  }, []);

  // QTY expression evaluation
  const evaluateQtyExpression = (expression: string): number | null => {
    if (!expression.trim()) return null;
    try {
      // Only allow numbers, +, -, *, /, (, ), spaces
      if (!/^[\d\s+\-*/().]+$/.test(expression)) return null;
      const result = Function('"use strict"; return (' + expression + ')')();
      if (typeof result === 'number' && !Number.isNaN(result) && Number.isFinite(result)) {
        return Math.round(result * 100) / 100;
      }
      return null;
    } catch {
      return null;
    }
  };

  const getQtyDisplayValue = (row: ScanRow, rowIndex: number) => {
    const expression = qtyExpressions[row.id];
    if (expression !== undefined) return expression;
    return row.qty !== null ? row.qty.toString() : '';
  };

  const handleQtyInputChange = (value: string, rowIndex: number) => {
    const row = rows[rowIndex];
    setQtyExpressions(prev => ({ ...prev, [row.id]: value }));
  };

  const handleQtyBlur = (rowIndex: number) => {
    const row = rows[rowIndex];
    const expression = qtyExpressions[row.id];
    if (expression !== undefined) {
      const result = evaluateQtyExpression(expression);
      if (result !== null) {
        handleFieldChange('qty', result, rowIndex);
        // Store formula if it contains operators
        const sanitized = expression.trim();
        if (/[+\-*/]/.test(sanitized.replace(/^-/, '')) && sanitized !== result.toString()) {
          setQtyFormulas(prev => ({ ...prev, [row.id]: sanitized }));
        } else {
          setQtyFormulas(prev => {
            const next = { ...prev };
            delete next[row.id];
            return next;
          });
        }
      }
      setQtyExpressions(prev => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    }
  };

  const handleQtyExpressionKeyDown = (e: React.KeyboardEvent, rowIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQtyBlur(rowIndex);
    }
  };

  // Add row
  const handleAddRow = useCallback(() => {
    const sectionName = selectedSection?.full_section || '';
    const newRow = createEmptyRow(sectionName);
    newRow.rec = generateRecForRow(rows.length);
    newRow.time = new Date().toLocaleTimeString();
    setRows(prev => [...prev, newRow]);
    setActiveRowIndex(rows.length);
  }, [selectedSection, createEmptyRow, generateRecForRow, rows.length]);

  // Delete row
  const handleDeleteRow = useCallback((rowIndex: number) => {
    if (rows.length <= 1) {
      toast.error('Cannot delete the last row');
      return;
    }
    setRows(prev => prev.filter((_, idx) => idx !== rowIndex));
    if (activeRowIndex >= rowIndex && activeRowIndex > 0) {
      setActiveRowIndex(prev => prev - 1);
    }
  }, [rows.length, activeRowIndex]);

  // Save to localStorage
  const handleSave = useCallback(() => {
    if (!selectedTemplate || !selectedSection) {
      toast.error('No template or section selected');
      return;
    }
    
    const key = `scan_records_${selectedTemplate.id}_${selectedSection.id}`;
    
    // Get existing records
    const existingData = localStorage.getItem(key);
    let existingRecords: ScanRow[] = [];
    if (existingData) {
      try {
        existingRecords = JSON.parse(existingData);
      } catch (e) {
        console.error('Error parsing existing records:', e);
      }
    }
    
    // Merge: add new rows to existing
    const allRecords = [...existingRecords, ...rows];
    localStorage.setItem(key, JSON.stringify(allRecords));
    
    toast.success(`Saved ${rows.length} records to ${selectedSection.full_section || selectedSection.sect}`);
  }, [selectedTemplate, selectedSection, rows]);

  // Filter rows by search
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(row =>
      row.ndc?.toLowerCase().includes(q) ||
      row.scannedNdc?.toLowerCase().includes(q) ||
      row.medDesc?.toLowerCase().includes(q) ||
      row.meridianDesc?.toLowerCase().includes(q) ||
      row.rec?.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  // Calculate section total
  const sectionExtendedTotal = useMemo(() => {
    return rows.reduce((sum, row) => {
      if (!row.ndc && !row.scannedNdc) return sum;
      if (typeof row.extended !== 'number' || Number.isNaN(row.extended)) return sum;
      return sum + row.extended;
    }, 0);
  }, [rows]);

  const sectionTotalLabel = useMemo(() => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(sectionExtendedTotal);
  }, [sectionExtendedTotal]);

  // Column definitions - same as Scan page
  const defaultWidths: Record<string, number> = {
    loc: 80, device: 96, rec: 100, time: 96, ndc: 128, scannedNdc: 144,
    qty: 80, misDivisor: 96, misCountMethod: 128, itemNumber: 112,
    medDesc: 192, meridianDesc: 192, trade: 128, generic: 144, strength: 112,
    packSz: 96, fdaSize: 96, sizeTxt: 96, doseForm: 112, manufacturer: 144,
    genericCode: 128, deaClass: 112, ahfs: 112, source: 96,
    packCost: 112, unitCost: 112, extended: 112, blank: 80,
    sheetType: 112, auditCriteria: 128, originalQty: 112, auditorInitials: 128,
    results: 112, additionalNotes: 192
  };

  const columns = useMemo(() => [
    { key: 'loc', label: 'LOC', editable: true },
    { key: 'device', label: 'Device', editable: true, hideable: true },
    { key: 'rec', label: 'REC', editable: true },
    { key: 'time', label: 'TIME', editable: true },
    { key: 'ndc', label: 'NDC', editable: true },
    { key: 'scannedNdc', label: 'Scanned NDC', editable: true },
    { key: 'qty', label: 'QTY', editable: true, type: 'number' },
    { key: 'misDivisor', label: 'MIS Divisor', editable: true, type: 'number' },
    { key: 'misCountMethod', label: 'MIS Count Method', editable: true },
    { key: 'itemNumber', label: 'Item Number', editable: true },
    { key: 'medDesc', label: 'Med Desc', editable: true },
    { key: 'meridianDesc', label: 'MERIDIAN DESC', editable: true },
    { key: 'trade', label: 'TRADE', editable: true, hideable: true },
    { key: 'generic', label: 'GENERIC', editable: true, hideable: true },
    { key: 'strength', label: 'STRENGTH', editable: true, hideable: true },
    { key: 'packSz', label: 'PACK SZ', editable: true },
    { key: 'fdaSize', label: 'FDA SIZE', editable: true },
    { key: 'sizeTxt', label: 'SIZE TXT', editable: true, hideable: true },
    { key: 'doseForm', label: 'DOSE FORM', editable: true, hideable: true },
    { key: 'manufacturer', label: 'MANUFACTURER', editable: true },
    { key: 'genericCode', label: 'GENERIC CODE', editable: true, hideable: true },
    { key: 'deaClass', label: 'DEA CLASS', editable: true, hideable: true },
    { key: 'ahfs', label: 'AHFS', editable: true, hideable: true },
    { key: 'source', label: 'SOURCE', editable: true },
    { key: 'packCost', label: 'Pack Cost', editable: true, type: 'currency' },
    { key: 'unitCost', label: 'Unit Cost', editable: true, type: 'currency' },
    { key: 'extended', label: 'Extended', editable: true, type: 'currency' },
    { key: 'blank', label: sectionTotalLabel, editable: true },
    { key: 'sheetType', label: 'Sheet Type', editable: true },
    { key: 'auditCriteria', label: 'Audit Criteria', editable: true },
    { key: 'originalQty', label: 'Original QTY', editable: true, type: 'number' },
    { key: 'auditorInitials', label: 'Auditor Initials', editable: true },
    { key: 'results', label: 'Results', editable: true },
    { key: 'additionalNotes', label: 'Additional Notes', editable: true },
  ], [sectionTotalLabel]);

  const getColumnWidth = (key: string) => columnWidths[key] || defaultWidths[key] || 100;
  const visibleColumns = useMemo(() => columns.filter(col => !hiddenColumns.has(col.key)), [columns, hiddenColumns]);
  const hideableColumns = useMemo(() => columns.filter(col => col.hideable), [columns]);

  const toggleColumnVisibility = (key: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Handle column resize
  const handleResizeStart = (e: React.MouseEvent, key: string) => {
    e.preventDefault();
    const startWidth = getColumnWidth(key);
    resizingRef.current = { key, startX: e.clientX, startWidth };
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const diff = moveEvent.clientX - resizingRef.current.startX;
      const newWidth = Math.max(50, resizingRef.current.startWidth + diff);
      setColumnWidths(prev => ({ ...prev, [resizingRef.current!.key]: newWidth }));
    };
    
    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Cell selection helpers
  const isCellSelected = useCallback((rowIndex: number, colKey: string): boolean => {
    if (!selectionStart || !selectionEnd) return false;
    const colKeys = visibleColumns.map(c => c.key);
    const colIdx = colKeys.indexOf(colKey);
    const startColIdx = colKeys.indexOf(selectionStart.col);
    const endColIdx = colKeys.indexOf(selectionEnd.col);
    const minRow = Math.min(selectionStart.row, selectionEnd.row);
    const maxRow = Math.max(selectionStart.row, selectionEnd.row);
    const minCol = Math.min(startColIdx, endColIdx);
    const maxCol = Math.max(startColIdx, endColIdx);
    return rowIndex >= minRow && rowIndex <= maxRow && colIdx >= minCol && colIdx <= maxCol;
  }, [selectionStart, selectionEnd, visibleColumns]);

  const handleCellMouseDown = useCallback((e: React.MouseEvent, rowIndex: number, colKey: string) => {
    if (e.shiftKey && selectionStart) {
      setSelectionEnd({ row: rowIndex, col: colKey });
    } else {
      setSelectionStart({ row: rowIndex, col: colKey });
      setSelectionEnd({ row: rowIndex, col: colKey });
      setIsSelecting(true);
    }
    setActiveRowIndex(rowIndex);
    setActiveColKey(colKey);
  }, [selectionStart]);

  const handleCellMouseEnter = useCallback((rowIndex: number, colKey: string) => {
    if (isSelecting) {
      setSelectionEnd({ row: rowIndex, col: colKey });
    }
  }, [isSelecting]);

  useEffect(() => {
    const handleMouseUp = () => setIsSelecting(false);
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const formatCurrency = (value: number | null) => {
    if (value === null) return '';
    return `$${value.toFixed(2)}`;
  };

  // Keyboard navigation
  const getVisibleColKeys = useCallback(() => visibleColumns.map(c => c.key), [visibleColumns]);
  
  const getNextEditableColKey = (colKeys: string[], currentIdx: number, direction: 1 | -1): string | null => {
    let idx = currentIdx + direction;
    while (idx >= 0 && idx < colKeys.length) {
      const col = columns.find(c => c.key === colKeys[idx]);
      if (col?.editable) return colKeys[idx];
      idx += direction;
    }
    return null;
  };

  const handleCellKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number, colKey: string) => {
    const colKeys = getVisibleColKeys();
    const currentColIdx = colKeys.indexOf(colKey);
    const isShift = e.shiftKey;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newRowIndex = Math.max(0, rowIndex - 1);
      if (!isShift) {
        setSelectionStart(null);
        setSelectionEnd(null);
        setActiveRowIndex(newRowIndex);
        setTimeout(() => {
          cellInputRefs.current.get(`${newRowIndex}-${colKey}`)?.focus();
        }, 0);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newRowIndex = Math.min(rows.length - 1, rowIndex + 1);
      if (!isShift) {
        setSelectionStart(null);
        setSelectionEnd(null);
        setActiveRowIndex(newRowIndex);
        setTimeout(() => {
          cellInputRefs.current.get(`${newRowIndex}-${colKey}`)?.focus();
        }, 0);
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const newColKey = getNextEditableColKey(colKeys, currentColIdx, -1) ?? colKey;
      if (!isShift) {
        setSelectionStart(null);
        setSelectionEnd(null);
        setActiveColKey(newColKey);
        setTimeout(() => {
          cellInputRefs.current.get(`${rowIndex}-${newColKey}`)?.focus();
        }, 0);
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const newColKey = getNextEditableColKey(colKeys, currentColIdx, 1) ?? colKey;
      if (!isShift) {
        setSelectionStart(null);
        setSelectionEnd(null);
        setActiveColKey(newColKey);
        setTimeout(() => {
          cellInputRefs.current.get(`${rowIndex}-${newColKey}`)?.focus();
        }, 0);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const direction = e.shiftKey ? -1 : 1;
      let newRowIndex = rowIndex;
      let newColKey = getNextEditableColKey(colKeys, currentColIdx, direction as -1 | 1);
      
      if (!newColKey) {
        newRowIndex = direction === 1
          ? Math.min(rows.length - 1, rowIndex + 1)
          : Math.max(0, rowIndex - 1);
        const wrapStartIdx = direction === 1 ? -1 : colKeys.length;
        newColKey = getNextEditableColKey(colKeys, wrapStartIdx, direction as -1 | 1) ?? colKey;
      }

      setSelectionStart(null);
      setSelectionEnd(null);
      setActiveRowIndex(newRowIndex);
      setActiveColKey(newColKey);
      setTimeout(() => {
        cellInputRefs.current.get(`${newRowIndex}-${newColKey}`)?.focus();
      }, 0);
    }
  }, [getVisibleColKeys, rows.length, columns]);

  // Template selection view
  if (step === 'select') {
    return (
      <AppLayout>
        <div className="space-y-6" style={{ fontFamily: 'Arial, sans-serif' }}>
          <div>
            <h1 className="text-2xl font-bold">Automation - Bulk Import</h1>
            <p className="text-muted-foreground">Import NDC and QTY lists from Excel files</p>
          </div>

          {/* Template Selection */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Select Template</Label>
                  <Select onValueChange={handleTemplateSelect} value={selectedTemplate?.id || ''}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((t: CloudTemplate) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} {t.facility_name && `- ${t.facility_name}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Select Section</Label>
                  <Select 
                    onValueChange={handleSectionChange} 
                    value={selectedSection?.id || ''}
                    disabled={!selectedTemplate || sectionsLoading}
                  >
                    <SelectTrigger>
                      {sectionsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <SelectValue placeholder="Choose a section..." />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.full_section || s.sect}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* File Upload */}
              <div className="pt-4 border-t">
                <Label className="block mb-2">Upload Excel File</Label>
                <div className="flex items-center gap-4">
                  <label className="flex-1">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={!selectedTemplate || !selectedSection}
                    />
                    <div className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                      selectedTemplate && selectedSection 
                        ? 'hover:border-primary hover:bg-primary/5' 
                        : 'opacity-50 cursor-not-allowed'
                    }`}>
                      <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                      <p className="font-medium">Click to upload Excel file</p>
                      <p className="text-sm text-muted-foreground">File must contain NDC and QTY columns</p>
                    </div>
                  </label>
                </div>
              </div>

              {!selectedTemplate && (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  <span>Please select a template and section before uploading</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Import preview / processing view
  if (step === 'import') {
    return (
      <AppLayout>
        <div className="space-y-4" style={{ fontFamily: 'Arial, sans-serif' }}>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => { setStep('select'); setRows([]); setFileName(null); }}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Process Import</h1>
              <p className="text-muted-foreground">
                {fileName} • {rows.length} items • {selectedTemplate?.name} → {selectedSection?.full_section}
              </p>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              {isProcessing ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Processing NDCs... {processProgress}%</span>
                  </div>
                  <Progress value={processProgress} />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{rows.length} NDCs ready to process</p>
                      <p className="text-sm text-muted-foreground">Click Process to lookup FDA and cost data</p>
                    </div>
                    <Button onClick={handleProcessAll} disabled={!fdaReady}>
                      <Play className="h-4 w-4 mr-2" />
                      Process All
                    </Button>
                  </div>
                  {!fdaReady && (
                    <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg">
                      <AlertCircle className="h-4 w-4" />
                      <span>FDA database not ready. Please import data in Master Data first.</span>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  // Edit view - same as Scan page
  return (
    <AppLayout fullWidth defaultCollapsed>
      <div className="space-y-4 w-full" style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => { setStep('select'); setRows([]); setFileName(null); }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {selectedTemplate?.name} - Automation Import
            </h1>
            <p className="text-muted-foreground text-sm">
              {selectedSection?.full_section} • {rows.length} items from {fileName}
            </p>
          </div>
        </div>

        {/* Table Card */}
        <Card className="w-full">
          <CardContent className="p-4">
            {/* Toolbar */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search NDC, Med Desc, REC..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 w-64 text-sm"
                />
              </div>

              <Button variant="outline" size="sm" onClick={handleAddRow}>
                <Plus className="h-4 w-4 mr-1" />
                Add Row
              </Button>

              <Button variant="default" size="sm" onClick={handleSave}>
                <Save className="h-4 w-4 mr-1" />
                Save to Template
              </Button>

              {/* Audit Mode Toggle */}
              <div className="flex items-center gap-2 ml-2 border-l pl-3">
                <Switch id="audit-mode" checked={auditMode} onCheckedChange={setAuditMode} />
                <Label htmlFor="audit-mode" className="text-sm font-medium flex items-center gap-1 cursor-pointer">
                  <ShieldCheck className="h-4 w-4" />
                  Audit Mode
                </Label>
              </div>

              {/* Column visibility */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Settings2 className="h-4 w-4" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    Toggle Hidden Columns
                  </div>
                  <DropdownMenuSeparator />
                  {hideableColumns.map(col => (
                    <DropdownMenuItem
                      key={col.key}
                      onClick={() => toggleColumnVisibility(col.key)}
                      className="flex items-center justify-between"
                    >
                      <span>{col.label}</span>
                      {hiddenColumns.has(col.key) ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Excel-style Formula Bar */}
            {selectedSection && (
              <div className="flex items-center border rounded-md mb-2 bg-card overflow-hidden">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 border-r min-w-[100px] shrink-0">
                  <span className="text-xs font-mono font-semibold text-muted-foreground">
                    {activeColKey && activeRowIndex >= 0
                      ? `${(columns.find(c => c.key === activeColKey)?.label || activeColKey).toUpperCase()}${activeRowIndex + 1}`
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-1 border-r">
                  <span className="text-xs font-mono text-muted-foreground italic px-1">fx</span>
                </div>
                <input
                  className="flex-1 px-3 py-1.5 text-sm font-mono bg-transparent outline-none min-w-0"
                  value={(() => {
                    if (activeRowIndex < 0 || !activeColKey || activeRowIndex >= rows.length) return '';
                    const row = rows[activeRowIndex];
                    if (activeColKey === 'qty') {
                      const expr = qtyExpressions[row.id];
                      if (expr !== undefined) return expr;
                      const formula = qtyFormulas[row.id];
                      if (formula) return formula;
                      return row.qty !== null && row.qty !== undefined ? row.qty.toString() : '';
                    }
                    const val = (row as any)[activeColKey];
                    return val !== null && val !== undefined ? val.toString() : '';
                  })()}
                  onChange={(e) => {
                    if (activeRowIndex < 0 || !activeColKey || activeRowIndex >= rows.length) return;
                    if (activeColKey === 'qty') {
                      handleQtyInputChange(e.target.value, activeRowIndex);
                    } else {
                      const col = columns.find(c => c.key === activeColKey);
                      if (col?.editable) {
                        const val = col.type === 'number' || col.type === 'currency'
                          ? (e.target.value === '' ? null : Number(e.target.value))
                          : e.target.value;
                        handleFieldChange(activeColKey as keyof ScanRow, val, activeRowIndex);
                      }
                    }
                  }}
                  onBlur={() => {
                    if (activeColKey === 'qty' && activeRowIndex >= 0) {
                      handleQtyBlur(activeRowIndex);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (activeColKey === 'qty' && activeRowIndex >= 0) {
                        handleQtyBlur(activeRowIndex);
                      }
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder="Select a cell to view its content"
                  readOnly={!activeColKey || !columns.find(c => c.key === activeColKey)?.editable}
                />
              </div>
            )}

            {/* Table */}
            <ScrollArea className="w-full whitespace-nowrap rounded-lg border">
              <div className="min-w-max" style={{ fontFamily: 'Arial, sans-serif' }}>
                <Table style={{ fontFamily: 'Arial, sans-serif' }}>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10 sticky left-0 bg-muted/50 z-10"></TableHead>
                      {visibleColumns.map((col) => (
                        <TableHead 
                          key={col.key} 
                          className="text-xs font-medium relative group select-none"
                          style={{ width: getColumnWidth(col.key), minWidth: getColumnWidth(col.key) }}
                        >
                          <div className="flex items-center justify-between pr-2">
                            <span className="truncate">{col.label}</span>
                          </div>
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-primary/20"
                            onMouseDown={(e) => handleResizeStart(e, col.key)}
                          />
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => {
                      const realIndex = rows.findIndex(r => r.id === row.id);
                      return (
                        <TableRow key={row.id} className={realIndex === activeRowIndex ? 'bg-primary/5' : ''}>
                          <TableCell className="p-1 sticky left-0 z-10 bg-background">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteRow(realIndex)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                          {visibleColumns.map((col) => {
                            let value = row[col.key as keyof ScanRow];
                            
                            // Compute audit criteria dynamically
                            if (col.key === 'auditCriteria' && auditMode && (row.ndc || row.scannedNdc)) {
                              const needsAttention: string[] = [];
                              if (row.qty !== null && row.qty > 2000) {
                                needsAttention.push('QTY > 2000');
                              }
                              if (row.extended !== null && row.extended > 3000) {
                                needsAttention.push('Extended > $3000');
                              }
                              if (needsAttention.length > 0) {
                                value = 'need attention: ' + needsAttention.join(', ');
                              }
                            }

                            const isSelected = isCellSelected(realIndex, col.key);
                            const cellValidationColor = getCellValidationColor(col.key, row);
                            const inputBgStyle = cellValidationColor ? getCellValidationClasses(cellValidationColor) : 'bg-transparent';
                            const selectionStyle = isSelected ? 'ring-2 ring-primary ring-inset' : '';

                            // QTY field with calculator
                            if (col.key === 'qty') {
                              return (
                                <TableCell 
                                  key={col.key} 
                                  className="p-0" 
                                  style={{ width: getColumnWidth(col.key), minWidth: getColumnWidth(col.key) }}
                                  onMouseDown={(e) => handleCellMouseDown(e, realIndex, col.key)}
                                  onMouseEnter={() => handleCellMouseEnter(realIndex, col.key)}
                                >
                                  <div className="relative group">
                                    <Input
                                      ref={(el) => { if (el) cellInputRefs.current.set(`${realIndex}-${col.key}`, el); }}
                                      value={getQtyDisplayValue(row, realIndex)}
                                      onChange={(e) => handleQtyInputChange(e.target.value, realIndex)}
                                      onBlur={() => handleQtyBlur(realIndex)}
                                      onKeyDown={(e) => {
                                        handleQtyExpressionKeyDown(e, realIndex);
                                        if (e.key !== 'Enter') handleCellKeyDown(e, realIndex, col.key);
                                      }}
                                      onFocus={() => {
                                        setActiveRowIndex(realIndex);
                                        setActiveColKey(col.key);
                                        if (qtyExpressions[row.id] === undefined) {
                                          const storedFormula = qtyFormulas[row.id];
                                          if (storedFormula) {
                                            setQtyExpressions(prev => ({ ...prev, [row.id]: storedFormula }));
                                          } else if (row.qty !== null) {
                                            setQtyExpressions(prev => ({ ...prev, [row.id]: row.qty!.toString() }));
                                          }
                                        }
                                      }}
                                      placeholder="e.g. 5+3"
                                      className={`font-mono h-8 text-xs border-0 focus-visible:ring-1 min-w-0 rounded-none pr-6 ${inputBgStyle} ${selectionStyle}`}
                                    />
                                    <Calculator className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                                    {qtyFormulas[row.id] && !qtyExpressions[row.id] && (
                                      <div className="absolute left-0 -top-6 z-50 bg-popover text-popover-foreground border rounded px-1.5 py-0.5 text-[10px] font-mono shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                        ={qtyFormulas[row.id]} → {row.qty}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              );
                            }

                            if (col.editable) {
                              return (
                                <TableCell 
                                  key={col.key} 
                                  className="p-0" 
                                  style={{ width: getColumnWidth(col.key), minWidth: getColumnWidth(col.key) }}
                                  onMouseDown={(e) => handleCellMouseDown(e, realIndex, col.key)}
                                  onMouseEnter={() => handleCellMouseEnter(realIndex, col.key)}
                                >
                                  <Input
                                    ref={(el) => { if (el) cellInputRefs.current.set(`${realIndex}-${col.key}`, el); }}
                                    value={col.type === 'currency' ? (value !== null && value !== undefined ? Number(value).toFixed(2) : '') : (value?.toString() || '')}
                                    onChange={(e) => {
                                      const newValue = col.type === 'number' || col.type === 'currency'
                                        ? (e.target.value ? parseFloat(e.target.value) : null)
                                        : e.target.value;
                                      handleFieldChange(col.key as keyof ScanRow, newValue, realIndex);
                                    }}
                                    onKeyDown={(e) => handleCellKeyDown(e, realIndex, col.key)}
                                    onFocus={() => {
                                      setActiveRowIndex(realIndex);
                                      setActiveColKey(col.key);
                                    }}
                                    type={col.type === 'number' || col.type === 'currency' ? 'number' : 'text'}
                                    step={col.type === 'currency' ? '0.01' : undefined}
                                    placeholder={col.type === 'currency' ? '$0.00' : undefined}
                                    className={`font-mono h-8 text-xs border-0 focus-visible:ring-1 min-w-0 rounded-none ${inputBgStyle} ${selectionStyle}`}
                                  />
                                </TableCell>
                              );
                            }

                            return (
                              <TableCell 
                                key={col.key} 
                                className={`text-xs ${inputBgStyle} ${selectionStyle}`}
                                onMouseDown={(e) => handleCellMouseDown(e, realIndex, col.key)}
                                onMouseEnter={() => handleCellMouseEnter(realIndex, col.key)}
                              >
                                {col.type === 'currency' 
                                  ? formatCurrency(value as number | null)
                                  : (value?.toString() || <span className="text-muted-foreground">—</span>)
                                }
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {/* Stats */}
            <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground flex-wrap">
              <span>{rows.filter(r => r.ndc || r.scannedNdc).length} items</span>
              {searchQuery && <span>• {filteredRows.length} shown</span>}
              <span>•</span>
              <span>{rows.filter(r => r.source).length} found</span>
              <span>•</span>
              <span className="text-destructive">{rows.filter(r => !r.source && (r.ndc || r.scannedNdc)).length} not found</span>
              <span>•</span>
              <span className="font-medium">Total: {formatCurrency(sectionExtendedTotal)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Automation;
