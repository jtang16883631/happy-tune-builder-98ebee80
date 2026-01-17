import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ScanBarcode, ArrowLeft, Plus, Trash2, Calendar, FileText, AlertCircle, ChevronDown, Edit2, Check, X, CloudOff, Download, GripVertical, Eye, EyeOff, Settings2, FileUp, Cloud, RefreshCw, Search, Calculator } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useCloudTemplates, CloudTemplate, CloudSection, TemplateStatus } from '@/hooks/useCloudTemplates';
import { useOfflineTemplates, OfflineTemplate } from '@/hooks/useOfflineTemplates';
import { useLocalFDA } from '@/hooks/useLocalFDA';
import { SyncButton } from '@/components/scanner/SyncButton';
import { OfflineSyncDialog } from '@/components/scanner/OfflineSyncDialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

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

const Scan = () => {
  const { isLoading: authLoading, roles, user } = useAuth();
  
  // Track row counter for REC generation
  const [rowCounter, setRowCounter] = useState(0);
  
  // User's short name for REC (e.g., "JiaweiT")
  const [userShortName, setUserShortName] = useState('');
  
  // Column visibility state - hide the new columns by default except REC
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set([
    'device', 'trade', 'generic', 'strength', 'sizeTxt', 'doseForm', 
    'genericCode', 'deaClass', 'ahfs'
  ]));
  
  // Column widths state for resizable columns
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  
  // Fetch user profile for short name
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user?.id) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('first_name, last_name, full_name')
        .eq('id', user.id)
        .maybeSingle();
      
      if (profile) {
        // Generate short name: FirstNameLastInitial (e.g., "JiaweiT")
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
      }
    };
    
    fetchUserProfile();
  }, [user?.id]);
  const navigate = useNavigate();
  
  // Cloud templates (primary when online)
  const { 
    templates: cloudTemplates,
    isLoading: templatesLoading,
    getCostItemByNDC: cloudGetCostItemByNDC,
    getSections: cloudGetSections,
    updateTemplateStatus: cloudUpdateTemplateStatus
  } = useCloudTemplates();
  
  // Offline templates (for offline mode)
  const {
    templates: offlineTemplates,
    isLoading: offlineLoading,
    isOnline,
    isSyncing,
    syncMeta,
    syncProgress,
    pendingChanges,
    syncedTemplateIds,
    syncWithCloud,
    syncSelectedTemplates,
    getCostItemByNDC: offlineGetCostItemByNDC,
    getSections: offlineGetSections,
    updateTemplateStatus: offlineUpdateTemplateStatus,
  } = useOfflineTemplates();
  
  const { lookupNDC: fdaLookup } = useLocalFDA();

  // State for offline sync dialog
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

  // Use cloud templates when online, offline templates when offline
  const templates = isOnline ? cloudTemplates : offlineTemplates as unknown as CloudTemplate[];
  const getCostItemByNDC = isOnline ? cloudGetCostItemByNDC : offlineGetCostItemByNDC as typeof cloudGetCostItemByNDC;
  const getSections = isOnline ? cloudGetSections : offlineGetSections as typeof cloudGetSections;
  const updateTemplateStatus = isOnline ? cloudUpdateTemplateStatus : offlineUpdateTemplateStatus as typeof cloudUpdateTemplateStatus;

  const [selectedTemplate, setSelectedTemplate] = useState<CloudTemplate | null>(null);
  const [sections, setSections] = useState<CloudSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<CloudSection | null>(null);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  
  // Dialog states for section management
  const [addSectionDialogOpen, setAddSectionDialogOpen] = useState(false);
  const [renameSectionDialogOpen, setRenameSectionDialogOpen] = useState(false);
  const [newSectionCode, setNewSectionCode] = useState('');
  const [newSectionDesc, setNewSectionDesc] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionDesc, setEditingSectionDesc] = useState('');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Calculator dialog state
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorRowIndex, setCalculatorRowIndex] = useState<number | null>(null);
  const [calculatorExpression, setCalculatorExpression] = useState('');
  const [calculatorResult, setCalculatorResult] = useState<number | null>(null);
  
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

  const [scanRows, setScanRows] = useState<ScanRow[]>([createEmptyRow()]);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const ndcInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const qtyInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hasRole = roles.length > 0;

  // Validation: Check if a row has all required fields filled
  // QTY, MIS Divisor, MIS Count Method are ALL required
  // Med Desc OR MERIDIAN DESC at least one is required
  const validateRow = useCallback((row: ScanRow): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Only validate if the row has been scanned (has NDC)
    if (!row.ndc && !row.scannedNdc) {
      return { valid: true, errors: [] }; // Empty row, no validation needed
    }
    
    // QTY is required
    if (row.qty === null || row.qty === undefined) {
      errors.push('QTY');
    }
    
    // MIS Divisor is required
    if (row.misDivisor === null || row.misDivisor === undefined) {
      errors.push('MIS Divisor');
    }
    
    // MIS Count Method is required
    if (!row.misCountMethod || row.misCountMethod.trim() === '') {
      errors.push('MIS Count Method');
    }
    
    // Med Desc OR MERIDIAN DESC at least one is required
    const hasMedDesc = row.medDesc && row.medDesc.trim() !== '';
    const hasMeridianDesc = row.meridianDesc && row.meridianDesc.trim() !== '';
    if (!hasMedDesc && !hasMeridianDesc) {
      errors.push('Med Desc 或 MERIDIAN DESC (至少一个)');
    }
    
    return { valid: errors.length === 0, errors };
  }, []);

  // Get validation status for a row (for visual feedback)
  const getRowValidationStatus = useCallback((row: ScanRow): 'valid' | 'invalid' | 'empty' => {
    if (!row.ndc && !row.scannedNdc) {
      return 'empty';
    }
    const { valid } = validateRow(row);
    return valid ? 'valid' : 'invalid';
  }, [validateRow]);

  useEffect(() => {
    if (!authLoading && !hasRole) {
      navigate('/');
    }
  }, [authLoading, hasRole, navigate]);

  // Update LOC field when section changes (for empty rows only)
  useEffect(() => {
    if (!selectedSection) return;
    
    setScanRows(prev => prev.map(row => {
      // Only update LOC if the row is empty (no NDC scanned yet)
      if (!row.ndc && !row.scannedNdc) {
        return { ...row, loc: selectedSection.full_section || '' };
      }
      return row;
    }));
  }, [selectedSection]);

  // Auto-save with debounce - using localStorage for scan records (per template + section)
  useEffect(() => {
    if (!selectedTemplate || !selectedSection) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const recordsToSave = scanRows
        .filter(r => r.ndc || r.scannedNdc)
        .map(r => ({ ...r, id: undefined }));
      
      // Save per template + section combination
      localStorage.setItem(`scan_records_${selectedTemplate.id}_${selectedSection.id}`, JSON.stringify(recordsToSave));
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [scanRows, selectedTemplate, selectedSection]);

  // Load scan records when section changes
  const loadSectionRecords = useCallback((templateId: string, sectionId: string, sectionName: string) => {
    const savedData = localStorage.getItem(`scan_records_${templateId}_${sectionId}`);
    
    if (savedData) {
      try {
        const savedRecords = JSON.parse(savedData) as Omit<ScanRow, 'id'>[];
        const rows: ScanRow[] = savedRecords.map(r => ({
          ...createEmptyRow(sectionName),
          ...r,
          id: crypto.randomUUID(),
        }));
        rows.push(createEmptyRow(sectionName));
        setScanRows(rows);
        setActiveRowIndex(rows.length - 1);
      } catch {
        setScanRows([createEmptyRow(sectionName)]);
        setActiveRowIndex(0);
      }
    } else {
      setScanRows([createEmptyRow(sectionName)]);
      setActiveRowIndex(0);
    }
  }, [createEmptyRow]);

  // Handle section selection - load records for this section
  const handleSelectSection = useCallback((section: CloudSection) => {
    if (!selectedTemplate) return;
    setSelectedSection(section);
    loadSectionRecords(selectedTemplate.id, section.id, section.full_section || '');
  }, [selectedTemplate, loadSectionRecords]);

  // Load sections when template is selected
  const loadSections = useCallback(async (templateId: string) => {
    setSectionsLoading(true);
    try {
      const sectionData = await getSections(templateId);
      setSections(sectionData);
    } catch (err) {
      console.error('Error loading sections:', err);
    } finally {
      setSectionsLoading(false);
    }
  }, [getSections]);

  // Handle template selection - just load sections, don't load records yet
  const handleSelectTemplate = async (template: CloudTemplate) => {
    setSelectedTemplate(template);
    setSelectedSection(null); // Reset section selection
    setScanRows([createEmptyRow()]); // Start with empty row
    setActiveRowIndex(0);
    
    // Load sections for this template
    await loadSections(template.id);
  };

  // Add new section
  const handleAddSection = async () => {
    if (!selectedTemplate || !newSectionCode.trim()) {
      toast.error('请输入Section代码');
      return;
    }

    try {
      const paddedCode = newSectionCode.replace(/\D/g, '').padStart(4, '0') || newSectionCode;
      const fullSection = `${paddedCode}-${newSectionDesc.trim()}`;
      
      const { error } = await supabase
        .from('template_sections')
        .insert({
          template_id: selectedTemplate.id,
          sect: paddedCode,
          description: newSectionDesc.trim(),
          full_section: fullSection,
        });

      if (error) throw error;

      toast.success('Section添加成功');
      setAddSectionDialogOpen(false);
      setNewSectionCode('');
      setNewSectionDesc('');
      await loadSections(selectedTemplate.id);
    } catch (err: any) {
      toast.error('添加失败: ' + err.message);
    }
  };

  // Rename section (update description)
  const handleRenameSection = async () => {
    if (!editingSectionId || !editingSectionDesc.trim()) {
      toast.error('请输入描述');
      return;
    }

    try {
      const section = sections.find(s => s.id === editingSectionId);
      if (!section) return;

      const oldFullSection = section.full_section;
      const newFullSection = `${section.sect}-${editingSectionDesc.trim()}`;
      
      // Note: We need to allow UPDATE on template_sections for managers
      const { error } = await supabase
        .from('template_sections')
        .update({
          description: editingSectionDesc.trim(),
          full_section: newFullSection,
        })
        .eq('id', editingSectionId);

      if (error) throw error;

      // Update LOC in current scan records if they match the old section name
      setScanRows(prev => prev.map(row => {
        if (row.loc === oldFullSection) {
          return { ...row, loc: newFullSection };
        }
        return row;
      }));

      // Also update localStorage records for this section
      if (selectedTemplate) {
        const savedData = localStorage.getItem(`scan_records_${selectedTemplate.id}_${editingSectionId}`);
        if (savedData) {
          try {
            const savedRecords = JSON.parse(savedData);
            const updatedRecords = savedRecords.map((r: any) => ({
              ...r,
              loc: r.loc === oldFullSection ? newFullSection : r.loc
            }));
            localStorage.setItem(`scan_records_${selectedTemplate.id}_${editingSectionId}`, JSON.stringify(updatedRecords));
          } catch (e) {
            console.error('Error updating localStorage records:', e);
          }
        }
      }

      toast.success('Section更新成功');
      setRenameSectionDialogOpen(false);
      setEditingSectionId(null);
      setEditingSectionDesc('');
      
      if (selectedTemplate) {
        await loadSections(selectedTemplate.id);
        // Update selected section if it was renamed
        if (selectedSection?.id === editingSectionId) {
          setSelectedSection(prev => prev ? {
            ...prev,
            description: editingSectionDesc.trim(),
            full_section: newFullSection
          } : null);
        }
      }
    } catch (err: any) {
      toast.error('更新失败: ' + err.message);
    }
  };

  // Open rename dialog for a section
  const openRenameDialog = (section: CloudSection) => {
    setEditingSectionId(section.id);
    setEditingSectionDesc(section.description || '');
    setRenameSectionDialogOpen(true);
  };

  // Generate next REC value
  const generateNextRec = useCallback(() => {
    const nextNum = rowCounter + 1;
    setRowCounter(nextNum);
    return `${userShortName}${String(nextNum).padStart(3, '0')}`;
  }, [rowCounter, userShortName]);

  // Lookup NDC and update row with mapping (by column position, not name):
  // TIME = laptop real time
  // MIS Count Method = FDA Column P (count_method)
  // Item Number = Cost Data Column E (material)
  // Med Desc = Cost Data Column B (material_description)
  // MERIDIAN DESC = FDA Column B (meridian_desc)
  // TRADE = FDA Column C (trade)
  // GENERIC = FDA Column D (generic)
  // STRENGTH = FDA Column E (strength)
  // PACK SZ = FDA Column F (package_size)
  // FDA SIZE = FDA Column G (fda_size)
  // SIZE TXT = FDA Column H (size_txt)
  // DOSE FORM = FDA Column I (dose_form)
  // MANUFACTURER = FDA Column J (manufacturer)
  // GENERIC CODE = FDA Column K (generic_code)
  // DEA CLASS = FDA Column L (dea_class)
  // AHFS = FDA Column M (ahfs)
  // SOURCE = Cost Data Column D (source)
  // Pack Cost = Cost Data Column C (unit_price)
  // MIS Divisor = FDA Column O (meridian_divisor)
  // Unit Cost = Pack Cost / MIS Divisor
  // Extended = Unit Cost * QTY
  // DEVICE = blank
  // REC = auto-generated from user name
  const lookupNDC = useCallback(async (ndc: string, rowIndex: number) => {
    if (!ndc || ndc.length < 10 || !selectedTemplate) return;

    const cleanNdc = ndc.replace(/-/g, '');
    const fdaResult = fdaLookup(cleanNdc);
    const costItem = await getCostItemByNDC(selectedTemplate.id, cleanNdc);
    
    // MIS Count Method from FDA Column P (count_method)
    const misCountMethod = fdaResult?.count_method || '';
    
    // Item Number from Cost Data Column E (material field)
    const itemNumber = costItem?.material || '';
    
    // Med Desc from Cost Data Column B (material_description)
    const medDesc = costItem?.material_description || '';
    
    // MERIDIAN DESC from FDA Column B (meridian_desc)
    const meridianDesc = fdaResult?.meridian_desc || '';
    
    // TRADE from FDA Column C
    const trade = fdaResult?.trade || '';
    
    // GENERIC from FDA Column D
    const generic = fdaResult?.generic || '';
    
    // STRENGTH from FDA Column E
    const strength = fdaResult?.strength || '';
    
    // PACK SZ from FDA Column F (package_size)
    const packSz = fdaResult?.package_size || '';
    
    // FDA SIZE from FDA Column G (fda_size)
    const fdaSize = fdaResult?.fda_size || '';
    
    // SIZE TXT from FDA Column H
    const sizeTxt = fdaResult?.size_txt || '';
    
    // DOSE FORM from FDA Column I
    const doseForm = fdaResult?.dose_form || '';
    
    // MANUFACTURER from FDA Column J
    const manufacturer = fdaResult?.manufacturer || costItem?.manufacturer || '';
    
    // GENERIC CODE from FDA Column K
    const genericCode = fdaResult?.generic_code || '';
    
    // DEA CLASS from FDA Column L
    const deaClass = fdaResult?.dea_class || '';
    
    // AHFS from FDA Column M
    const ahfs = fdaResult?.ahfs || '';
    
    // Pack Cost from Cost Data Column C (unit_price)
    const packCost = costItem?.unit_price !== null && costItem?.unit_price !== undefined 
      ? Number(costItem.unit_price) 
      : null;
    
    // SOURCE from Cost Data Column D (source field)
    const source = costItem?.source || '';
    
    // MIS Divisor from FDA Column O (meridian_divisor)
    const misDivisor = fdaResult?.meridian_divisor ? Number(fdaResult.meridian_divisor) : null;
    
    // Unit Cost = Pack Cost / MIS Divisor
    let unitCost: number | null = null;
    if (packCost !== null && misDivisor !== null && misDivisor !== 0) {
      unitCost = packCost / misDivisor;
    }
    
    // Get current QTY to calculate Extended
    const currentQty = scanRows[rowIndex].qty;
    
    // Extended = Unit Cost * QTY
    let extended: number | null = null;
    if (unitCost !== null && currentQty !== null) {
      extended = unitCost * currentQty;
    }
    
    // Generate REC if not already set
    const currentRec = scanRows[rowIndex].rec;
    const rec = currentRec || generateNextRec();
    
    setScanRows(prev => {
      const updated = [...prev];
      updated[rowIndex] = {
        ...updated[rowIndex],
        ndc: cleanNdc,
        rec,
        device: '', // Device stays blank
        time: new Date().toLocaleTimeString(), // Real time from laptop
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
      return updated;
    });

    // Auto-add new row if this is the last row
    setScanRows(prev => {
      if (rowIndex === prev.length - 1) {
        return [...prev, createEmptyRow(selectedSection?.full_section || '')];
      }
      return prev;
    });
    
    // Don't auto-focus next row's NDC here - we want to focus QTY first
  }, [fdaLookup, getCostItemByNDC, selectedTemplate, scanRows, generateNextRec, selectedSection, createEmptyRow]);

  // Handle field change - recalculate Extended when QTY or Unit Cost changes
  const handleFieldChange = (field: keyof ScanRow, value: string | number | null, rowIndex: number) => {
    setScanRows(prev => {
      const updated = [...prev];
      const row = { ...updated[rowIndex], [field]: value };
      
      // Recalculate Unit Cost when Pack Cost or MIS Divisor changes
      if (field === 'packCost' || field === 'misDivisor') {
        const packCost = field === 'packCost' ? (value as number | null) : row.packCost;
        const misDivisor = field === 'misDivisor' ? (value as number | null) : row.misDivisor;
        
        if (packCost !== null && misDivisor !== null && misDivisor !== 0) {
          row.unitCost = packCost / misDivisor;
        } else {
          row.unitCost = null;
        }
      }
      
      // Recalculate Extended when QTY or Unit Cost changes
      if (field === 'qty' || field === 'packCost' || field === 'misDivisor') {
        const qty = field === 'qty' ? (value as number | null) : row.qty;
        
        if (row.unitCost !== null && qty !== null) {
          row.extended = row.unitCost * qty;
        } else {
          row.extended = null;
        }
      }
      
      updated[rowIndex] = row;
      return updated;
    });
  };

  // Handle NDC input Enter/Tab key - jump to QTY after lookup
  const handleNdcKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      
      // Check if previous row (if exists and has data) passes validation
      if (rowIndex > 0) {
        const prevRow = scanRows[rowIndex - 1];
        const { valid, errors } = validateRow(prevRow);
        if (!valid) {
          toast.error('请先完成上一行的必填项', {
            description: `缺少: ${errors.join(', ')}`,
            duration: 5000,
          });
          return; // Block scanning
        }
      }
      
      const ndc = scanRows[rowIndex].scannedNdc || scanRows[rowIndex].ndc;
      if (ndc && ndc.length >= 10) {
        lookupNDC(ndc, rowIndex);
        // After lookup, focus on QTY field
        setTimeout(() => {
          qtyInputRefs.current[rowIndex]?.focus();
        }, 150);
      }
    }
  };

  // Handle QTY input Enter key - validate current row and jump to next row's NDC
  const handleQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      // Validate current row before moving to next
      const currentRow = scanRows[rowIndex];
      const { valid, errors } = validateRow(currentRow);
      
      if (!valid) {
        toast.error('请先完成当前行的必填项', {
          description: `缺少: ${errors.join(', ')}`,
          duration: 5000,
        });
        return; // Block moving to next row
      }
      
      // Add new row if this is the last row
      if (rowIndex === scanRows.length - 1) {
        setScanRows(prev => [...prev, createEmptyRow(selectedSection?.full_section || '')]);
      }
      
      // Move to next row's NDC field
      setTimeout(() => {
        ndcInputRefs.current[rowIndex + 1]?.focus();
        setActiveRowIndex(rowIndex + 1);
      }, 100);
    }
  };

  // Delete a row
  const handleDeleteRow = (rowIndex: number) => {
    if (scanRows.length === 1) {
      setScanRows([createEmptyRow(selectedSection?.full_section || '')]);
      return;
    }
    setScanRows(prev => prev.filter((_, i) => i !== rowIndex));
  };

  // Add new row - with validation check
  const handleAddRow = () => {
    // Check if the last row with data passes validation
    const lastFilledRowIndex = scanRows.findIndex(r => r.ndc || r.scannedNdc);
    if (lastFilledRowIndex >= 0) {
      const lastFilledRow = scanRows[lastFilledRowIndex];
      const { valid, errors } = validateRow(lastFilledRow);
      if (!valid) {
        toast.error('请先完成当前行的必填项', {
          description: `缺少: ${errors.join(', ')}`,
          duration: 5000,
        });
        return; // Block adding new row
      }
    }
    
    setScanRows(prev => [...prev, createEmptyRow(selectedSection?.full_section || '')]);
    setTimeout(() => {
      const lastIndex = scanRows.length;
      ndcInputRefs.current[lastIndex]?.focus();
      setActiveRowIndex(lastIndex);
    }, 100);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  // Export scan data to Excel - each section as a separate tab
  const handleExportToExcel = useCallback(async () => {
    if (!selectedTemplate || sections.length === 0) {
      toast.error('No sections to export');
      return;
    }

    try {
      const workbook = XLSX.utils.book_new();

      // Column headers matching the scan table
      const headers = [
        'LOC', 'Device', 'REC', 'TIME', 'NDC', 'Scanned NDC', 'QTY', 'MIS Divisor',
        'MIS Count Method', 'Item Number', 'Med Desc', 'MERIDIAN DESC', 'TRADE',
        'GENERIC', 'STRENGTH', 'PACK SZ', 'FDA SIZE', 'SIZE TXT', 'DOSE FORM',
        'MANUFACTURER', 'GENERIC CODE', 'DEA CLASS', 'AHFS', 'SOURCE', 'Pack Cost',
        'Unit Cost', 'Extended', '$-', 'Sheet Type', 'Audit Criteria', 'Original QTY',
        'Auditor Initials', 'Results', 'Additional Notes'
      ];

      // Iterate through all sections
      for (const section of sections) {
        // Load scan records for this section from localStorage
        const savedData = localStorage.getItem(`scan_records_${selectedTemplate.id}_${section.id}`);
        
        let rows: any[][] = [headers];
        
        if (savedData) {
          try {
            const savedRecords = JSON.parse(savedData) as ScanRow[];
            
            // Convert each record to a row array
            savedRecords.forEach(record => {
              rows.push([
                record.loc || '',
                record.device || '',
                record.rec || '',
                record.time || '',
                record.ndc || '',
                record.scannedNdc || '',
                record.qty ?? '',
                record.misDivisor ?? '',
                record.misCountMethod || '',
                record.itemNumber || '',
                record.medDesc || '',
                record.meridianDesc || '',
                record.trade || '',
                record.generic || '',
                record.strength || '',
                record.packSz || '',
                record.fdaSize || '',
                record.sizeTxt || '',
                record.doseForm || '',
                record.manufacturer || '',
                record.genericCode || '',
                record.deaClass || '',
                record.ahfs || '',
                record.source || '',
                record.packCost ?? '',
                record.unitCost ?? '',
                record.extended ?? '',
                record.blank || '',
                record.sheetType || '',
                record.auditCriteria || '',
                record.originalQty ?? '',
                record.auditorInitials || '',
                record.results || '',
                record.additionalNotes || '',
              ]);
            });
          } catch (e) {
            console.error('Error parsing section data:', e);
          }
        }

        // Create worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(rows);

        // Set column widths
        worksheet['!cols'] = headers.map((_, i) => ({ wch: i === 10 || i === 11 ? 30 : 15 }));

        // Sanitize sheet name (Excel has 31 char limit, no special chars)
        let sheetName = section.full_section || section.sect || 'Sheet';
        sheetName = sheetName.replace(/[\\/*?[\]:]/g, '-').substring(0, 31);

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }

      // Generate filename with template name and date
      const dateStr = selectedTemplate.inv_date 
        ? new Date(selectedTemplate.inv_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      const filename = `${selectedTemplate.name}_${dateStr}_scan.xlsx`;

      // Download the file
      XLSX.writeFile(workbook, filename);
      toast.success(`Exported ${sections.length} sections to Excel`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export to Excel');
    }
  }, [selectedTemplate, sections]);

  // State for cloud sync
  const [isSyncingScans, setIsSyncingScans] = useState(false);
  const [isExportingMerged, setIsExportingMerged] = useState(false);

  // Sync local scans to cloud database
  const syncScansToCloud = useCallback(async () => {
    if (!selectedTemplate || !user?.id || !isOnline) {
      toast.error('Must be online to sync scans');
      return;
    }

    setIsSyncingScans(true);
    try {
      let totalSynced = 0;

      for (const section of sections) {
        const savedData = localStorage.getItem(`scan_records_${selectedTemplate.id}_${section.id}`);
        if (!savedData) continue;

        try {
          const savedRecords = JSON.parse(savedData) as ScanRow[];
          const validRecords = savedRecords.filter(r => r.ndc || r.scannedNdc);
          
          if (validRecords.length === 0) continue;

          // Delete existing records for this user/template/section first
          await supabase
            .from('scan_records')
            .delete()
            .eq('template_id', selectedTemplate.id)
            .eq('section_id', section.id)
            .eq('user_id', user.id);

          // Insert new records
          const recordsToInsert = validRecords.map(r => ({
            template_id: selectedTemplate.id,
            section_id: section.id,
            user_id: user.id,
            loc: r.loc,
            device: r.device,
            rec: r.rec,
            time: r.time,
            ndc: r.ndc,
            scanned_ndc: r.scannedNdc,
            qty: r.qty,
            mis_divisor: r.misDivisor,
            mis_count_method: r.misCountMethod,
            item_number: r.itemNumber,
            med_desc: r.medDesc,
            meridian_desc: r.meridianDesc,
            trade: r.trade,
            generic: r.generic,
            strength: r.strength,
            pack_sz: r.packSz,
            fda_size: r.fdaSize,
            size_txt: r.sizeTxt,
            dose_form: r.doseForm,
            manufacturer: r.manufacturer,
            generic_code: r.genericCode,
            dea_class: r.deaClass,
            ahfs: r.ahfs,
            source: r.source,
            pack_cost: r.packCost,
            unit_cost: r.unitCost,
            extended: r.extended,
            blank: r.blank,
            sheet_type: r.sheetType,
            audit_criteria: r.auditCriteria,
            original_qty: r.originalQty,
            auditor_initials: r.auditorInitials,
            results: r.results,
            additional_notes: r.additionalNotes,
          }));

          const { error } = await supabase
            .from('scan_records')
            .insert(recordsToInsert);

          if (error) throw error;
          totalSynced += validRecords.length;
        } catch (e) {
          console.error('Error syncing section:', section.id, e);
        }
      }

      toast.success(`Synced ${totalSynced} scan records to cloud`);
    } catch (error) {
      console.error('Sync error:', error);
      toast.error('Failed to sync scans to cloud');
    } finally {
      setIsSyncingScans(false);
    }
  }, [selectedTemplate, sections, user?.id, isOnline]);

  // Export merged scans from all users to Excel
  const exportMergedToExcel = useCallback(async () => {
    if (!selectedTemplate || !isOnline) {
      toast.error('Must be online to export merged scans');
      return;
    }

    setIsExportingMerged(true);
    try {
      const workbook = XLSX.utils.book_new();

      const headers = [
        'LOC', 'Device', 'REC', 'TIME', 'NDC', 'Scanned NDC', 'QTY', 'MIS Divisor',
        'MIS Count Method', 'Item Number', 'Med Desc', 'MERIDIAN DESC', 'TRADE',
        'GENERIC', 'STRENGTH', 'PACK SZ', 'FDA SIZE', 'SIZE TXT', 'DOSE FORM',
        'MANUFACTURER', 'GENERIC CODE', 'DEA CLASS', 'AHFS', 'SOURCE', 'Pack Cost',
        'Unit Cost', 'Extended', '$-', 'Sheet Type', 'Audit Criteria', 'Original QTY',
        'Auditor Initials', 'Results', 'Additional Notes'
      ];

      for (const section of sections) {
        // Fetch ALL users' scan records for this template/section
        const { data: cloudRecords, error } = await supabase
          .from('scan_records')
          .select('*')
          .eq('template_id', selectedTemplate.id)
          .eq('section_id', section.id)
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error fetching cloud records:', error);
          continue;
        }

        let rows: any[][] = [headers];

        if (cloudRecords && cloudRecords.length > 0) {
          cloudRecords.forEach(record => {
            rows.push([
              record.loc || '',
              record.device || '',
              record.rec || '',
              record.time || '',
              record.ndc || '',
              record.scanned_ndc || '',
              record.qty ?? '',
              record.mis_divisor ?? '',
              record.mis_count_method || '',
              record.item_number || '',
              record.med_desc || '',
              record.meridian_desc || '',
              record.trade || '',
              record.generic || '',
              record.strength || '',
              record.pack_sz || '',
              record.fda_size || '',
              record.size_txt || '',
              record.dose_form || '',
              record.manufacturer || '',
              record.generic_code || '',
              record.dea_class || '',
              record.ahfs || '',
              record.source || '',
              record.pack_cost ?? '',
              record.unit_cost ?? '',
              record.extended ?? '',
              record.blank || '',
              record.sheet_type || '',
              record.audit_criteria || '',
              record.original_qty ?? '',
              record.auditor_initials || '',
              record.results || '',
              record.additional_notes || '',
            ]);
          });
        }

        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        worksheet['!cols'] = headers.map((_, i) => ({ wch: i === 10 || i === 11 ? 30 : 15 }));

        let sheetName = section.full_section || section.sect || 'Sheet';
        sheetName = sheetName.replace(/[\\/*?[\]:]/g, '-').substring(0, 31);

        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }

      const dateStr = selectedTemplate.inv_date 
        ? new Date(selectedTemplate.inv_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      const filename = `${selectedTemplate.name}_${dateStr}_merged_scan.xlsx`;

      XLSX.writeFile(workbook, filename);
      toast.success(`Exported merged scans from all users to Excel`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export merged scans');
    } finally {
      setIsExportingMerged(false);
    }
  }, [selectedTemplate, sections, isOnline]);

  // Calculator functions
  const openCalculator = (rowIndex: number) => {
    setCalculatorRowIndex(rowIndex);
    setCalculatorExpression(scanRows[rowIndex].qty?.toString() || '');
    setCalculatorResult(scanRows[rowIndex].qty);
    setCalculatorOpen(true);
  };

  const handleCalculatorInput = (value: string) => {
    setCalculatorExpression(prev => prev + value);
  };

  const calculateResult = () => {
    try {
      // Safe eval - only allow numbers and basic operators
      const sanitized = calculatorExpression.replace(/[^0-9+\-*/.()]/g, '');
      if (!sanitized) {
        setCalculatorResult(null);
        return;
      }
      // eslint-disable-next-line no-eval
      const result = eval(sanitized);
      setCalculatorResult(typeof result === 'number' ? result : null);
    } catch {
      setCalculatorResult(null);
    }
  };

  const applyCalculatorResult = () => {
    if (calculatorRowIndex !== null && calculatorResult !== null) {
      handleFieldChange('qty', calculatorResult, calculatorRowIndex);
    }
    setCalculatorOpen(false);
    setCalculatorExpression('');
    setCalculatorResult(null);
    setCalculatorRowIndex(null);
  };

  const clearCalculator = () => {
    setCalculatorExpression('');
    setCalculatorResult(null);
  };

  // Filter rows by search query
  const filteredRows = searchQuery.trim() 
    ? scanRows.filter(row => 
        row.ndc?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.scannedNdc?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.medDesc?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.meridianDesc?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.itemNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.rec?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : scanRows;

  const formatCurrency = (value: number | null) => {
    if (value === null) return '';
    return `$${value.toFixed(2)}`;
  };

  if (authLoading || templatesLoading || offlineLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Template Selection View
  if (!selectedTemplate) {
    // Sort templates by inv_date (newest month first, then days ascending 1→31 within month)
    const sortedTemplates = [...templates].sort((a, b) => {
      if (!a.inv_date && !b.inv_date) return 0;
      if (!a.inv_date) return 1;
      if (!b.inv_date) return -1;
      const dateA = new Date(a.inv_date);
      const dateB = new Date(b.inv_date);
      // Compare year-month first (descending - newest month first)
      const yearMonthA = dateA.getFullYear() * 12 + dateA.getMonth();
      const yearMonthB = dateB.getFullYear() * 12 + dateB.getMonth();
      if (yearMonthA !== yearMonthB) return yearMonthB - yearMonthA;
      // Within same month, sort by day ascending (1, 2, 3...)
      return dateA.getDate() - dateB.getDate();
    });

    // Group templates by month
    const groupedByMonth: Record<string, CloudTemplate[]> = {};
    sortedTemplates.forEach((template) => {
      const monthKey = template.inv_date 
        ? new Date(template.inv_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
        : 'No Date';
      if (!groupedByMonth[monthKey]) {
        groupedByMonth[monthKey] = [];
      }
      groupedByMonth[monthKey].push(template);
    });

    const getStatusConfig = (status: TemplateStatus | null) => {
      switch (status) {
        case 'completed':
          return { label: 'Completed', color: 'bg-green-500/10 text-green-600 border-green-500/20' };
        case 'working':
          return { label: 'Working', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' };
        case 'active':
        default:
          return { label: 'Active', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' };
      }
    };

    const handleStatusChange = async (e: React.MouseEvent, templateId: string, newStatus: TemplateStatus) => {
      e.stopPropagation();
      const result = await updateTemplateStatus(templateId, newStatus);
      if (result.success) {
        toast.success(`Status updated to ${newStatus}`);
      } else {
        toast.error('Failed to update status');
      }
    };

    return (
      <AppLayout>
        <div className="space-y-8">
          <div className="text-center py-4 relative">
            {/* Sync buttons in top right */}
            <div className="absolute right-0 top-0 flex items-center gap-2">
              {isOnline && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSyncDialogOpen(true)}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Sync for Offline</span>
                </Button>
              )}
              <SyncButton
                isOnline={isOnline}
                isSyncing={isSyncing}
                pendingChanges={pendingChanges}
                lastSyncedAt={syncMeta.lastSyncedAt}
                onSync={syncWithCloud}
              />
            </div>
            
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
              <ScanBarcode className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Scanner</h1>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              Select a data template to start scanning inventory
            </p>
            
            {/* Offline indicator */}
            {!isOnline && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-600 rounded-full text-sm">
              <CloudOff className="h-4 w-4" />
              <span>Offline Mode - Data saved locally</span>
            </div>
          )}
          </div>

          {/* Offline Sync Dialog */}
          <OfflineSyncDialog
            open={syncDialogOpen}
            onOpenChange={setSyncDialogOpen}
            cloudTemplates={cloudTemplates}
            syncedTemplateIds={syncedTemplateIds}
            onSyncTemplates={syncSelectedTemplates}
            isSyncing={isSyncing}
            syncProgress={syncProgress}
          />

          {sortedTemplates.length === 0 ? (
            <Card className="border-dashed max-w-md mx-auto">
              <CardContent className="py-16 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg">No Data Templates</h3>
                <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                  Please import data templates first from the Data Template page.
                </p>
                <Button 
                  className="mt-4"
                  onClick={() => navigate('/')}
                >
                  Go to Data Templates
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedByMonth).map(([month, monthTemplates]) => (
                <div key={month} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-primary">{month}</span>
                    </div>
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">{monthTemplates.length} template{monthTemplates.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {monthTemplates.map((template) => {
                      const day = template.inv_date ? new Date(template.inv_date).getDate() : null;
                      const weekday = template.inv_date 
                        ? new Date(template.inv_date).toLocaleDateString('en-US', { weekday: 'short' })
                        : null;
                      const statusConfig = getStatusConfig(template.status);
                      
                      return (
                        <Card 
                          key={template.id}
                          className="group cursor-pointer border hover:border-primary hover:shadow-md transition-all duration-200 overflow-hidden"
                          onClick={() => handleSelectTemplate(template)}
                        >
                          <div className="flex">
                            {/* Calendar date badge */}
                            {day && (
                              <div className="flex flex-col items-center justify-center w-16 bg-primary/5 group-hover:bg-primary/10 border-r transition-colors">
                                <span className="text-[10px] uppercase text-muted-foreground font-medium">{weekday}</span>
                                <span className="text-2xl font-bold text-primary">{day}</span>
                              </div>
                            )}
                            {/* Content */}
                            <div className="flex-1 p-3 min-w-0">
                              <div className="flex items-start justify-between gap-1">
                                <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors flex-1">
                                  {template.name}
                                </h3>
                                {/* Status dropdown */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <button className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded border ${statusConfig.color} hover:opacity-80 transition-opacity`}>
                                      {statusConfig.label}
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-32">
                                    <DropdownMenuItem onClick={(e) => handleStatusChange(e, template.id, 'active')}>
                                      <span className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                                      Active
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => handleStatusChange(e, template.id, 'working')}>
                                      <span className="w-2 h-2 rounded-full bg-amber-500 mr-2" />
                                      Working
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => handleStatusChange(e, template.id, 'completed')}>
                                      <span className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                                      Completed
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              {template.facility_name && (
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                  {template.facility_name}
                                </p>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // Column definitions - ALL cells are now editable
  // Default widths in pixels for resizable columns
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

  const columns = [
    { key: 'loc', label: 'LOC', editable: true },
    { key: 'device', label: 'Device', editable: true, hideable: true },
    { key: 'rec', label: 'REC', editable: true },
    { key: 'time', label: 'TIME', editable: true },
    { key: 'ndc', label: 'NDC', editable: true, isNdcInput: true },
    { key: 'scannedNdc', label: 'Scanned NDC', editable: true, isNdcInput: true },
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
    { key: 'blank', label: '$-', editable: true },
    { key: 'sheetType', label: 'Sheet Type', editable: true },
    { key: 'auditCriteria', label: 'Audit Criteria', editable: true },
    { key: 'originalQty', label: 'Original QTY', editable: true, type: 'number' },
    { key: 'auditorInitials', label: 'Auditor Initials', editable: true },
    { key: 'results', label: 'Results', editable: true },
    { key: 'additionalNotes', label: 'Additional Notes', editable: true },
  ];

  // Get column width (custom or default)
  const getColumnWidth = (key: string) => columnWidths[key] || defaultWidths[key] || 100;

  // Filter visible columns
  const visibleColumns = columns.filter(col => !hiddenColumns.has(col.key));

  // Toggle column visibility
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

  // Handle column resize start
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

  // Hideable columns for settings dropdown
  const hideableColumns = columns.filter(col => col.hideable);

  // Scan View (Excel-like with horizontal scroll)
  return (
    <AppLayout fullWidth defaultCollapsed>
      <div className="space-y-4 w-full">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setSelectedTemplate(null)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          
          {/* Section Selector - moved to left */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Section:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="min-w-[200px] justify-between">
                  {sectionsLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : selectedSection ? (
                    <span className="truncate">{selectedSection.full_section}</span>
                  ) : (
                    <span className="text-muted-foreground">Select Section</span>
                  )}
                  <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[280px] max-h-[300px] overflow-y-auto">
                {sections.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    No sections available
                  </div>
                ) : (
                  sections.map((section) => (
                    <DropdownMenuItem
                      key={section.id}
                      className="flex items-center justify-between group"
                      onClick={() => handleSelectSection(section)}
                    >
                      <span className={selectedSection?.id === section.id ? 'font-medium' : ''}>
                        {section.full_section}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRenameDialog(section);
                        }}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setAddSectionDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Section
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{selectedTemplate.name}</h1>
            <p className="text-muted-foreground text-sm">
              {selectedTemplate.facility_name} • {formatDate(selectedTemplate.inv_date)}
            </p>
          </div>
        </div>

        {/* Section required warning */}
        {!selectedSection && (
          <Card className="border-warning bg-warning/10">
            <CardContent className="py-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-warning" />
              <span className="text-sm">请先选择一个Section才能开始扫描</span>
            </CardContent>
          </Card>
        )}

        {/* Scan Input */}
        <Card className="w-full">
          <CardContent className="p-4">
            {/* Toolbar - buttons on left, search on right */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {/* Left side - Action buttons */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleAddRow}
                disabled={!selectedSection}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Row
              </Button>
              
              {/* Sync to Cloud button */}
              {isOnline && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={syncScansToCloud}
                  disabled={isSyncingScans || sections.length === 0}
                >
                  {isSyncingScans ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Cloud className="h-4 w-4 mr-1" />
                  )}
                  Sync
                </Button>
              )}
              
              {/* Export Merged button */}
              {isOnline && (
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={exportMergedToExcel}
                  disabled={isExportingMerged || sections.length === 0}
                >
                  {isExportingMerged ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Export Merged
                </Button>
              )}
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleExportToExcel}
                disabled={sections.length === 0}
              >
                <FileUp className="h-4 w-4 mr-1" />
                Export My Scans
              </Button>
              
              {/* Column visibility settings */}
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
              
              {/* Right side - Search */}
              <div className="flex-1" />
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search NDC, Med Desc, REC..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 w-64 text-sm"
                />
              </div>
            </div>

            {/* Excel-like Table with horizontal scroll */}
            <ScrollArea className="w-full whitespace-nowrap rounded-lg border">
              <div className="min-w-max">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {/* Delete column header on left */}
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
                          {/* Resize handle */}
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
                      // Find real index in scanRows for refs
                      const realIndex = scanRows.findIndex(r => r.id === row.id);
                      const validationStatus = getRowValidationStatus(row);
                      return (
                      <TableRow 
                        key={row.id}
                        className={`${realIndex === activeRowIndex ? 'bg-primary/5' : ''} ${validationStatus === 'invalid' ? 'bg-destructive/10' : ''}`}
                      >
                        {/* Delete button on left */}
                        <TableCell className={`p-1 sticky left-0 z-10 ${validationStatus === 'invalid' ? 'bg-destructive/10' : 'bg-background'}`}>
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
                          const value = row[col.key as keyof ScanRow];
                          
                          if (col.editable) {
                            // For currency fields, display with $ format but edit as number
                            const displayValue = col.type === 'currency' && value !== null && value !== undefined
                              ? `$${Number(value).toFixed(2)}`
                              : (value?.toString() || '');
                            
                            // Determine ref and keydown handler based on field type
                            const getRef = () => {
                              if (col.isNdcInput) return (el: HTMLInputElement | null) => ndcInputRefs.current[realIndex] = el;
                              if (col.key === 'qty') return (el: HTMLInputElement | null) => qtyInputRefs.current[realIndex] = el;
                              return undefined;
                            };
                            
                            const getKeyDownHandler = () => {
                              if (col.isNdcInput) return (e: React.KeyboardEvent<HTMLInputElement>) => handleNdcKeyDown(e, realIndex);
                              if (col.key === 'qty') return (e: React.KeyboardEvent<HTMLInputElement>) => handleQtyKeyDown(e, realIndex);
                              return undefined;
                            };
                            
                            // Special handling for QTY - add calculator button
                            if (col.key === 'qty') {
                              return (
                                <TableCell key={col.key} className="p-1" style={{ width: getColumnWidth(col.key), minWidth: getColumnWidth(col.key) }}>
                                  <div className="flex items-center gap-0.5">
                                    <Input
                                      ref={getRef()}
                                      value={value !== null && value !== undefined ? value.toString() : ''}
                                      onChange={(e) => {
                                        const newValue = e.target.value ? parseFloat(e.target.value) : null;
                                        handleFieldChange('qty', newValue, realIndex);
                                      }}
                                      onKeyDown={getKeyDownHandler()}
                                      onFocus={() => setActiveRowIndex(realIndex)}
                                      type="number"
                                      className="font-mono h-8 text-xs border-0 focus-visible:ring-1 min-w-0 flex-1"
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 shrink-0"
                                      onClick={() => openCalculator(realIndex)}
                                    >
                                      <Calculator className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                  </div>
                                </TableCell>
                              );
                            }
                            
                            return (
                              <TableCell key={col.key} className="p-1" style={{ width: getColumnWidth(col.key), minWidth: getColumnWidth(col.key) }}>
                                <Input
                                  ref={getRef()}
                                  value={col.type === 'currency' ? (value !== null && value !== undefined ? Number(value).toFixed(2) : '') : (value?.toString() || '')}
                                  onChange={(e) => {
                                    const newValue = col.type === 'number' || col.type === 'currency'
                                      ? (e.target.value ? parseFloat(e.target.value) : null)
                                      : e.target.value;
                                    handleFieldChange(col.key as keyof ScanRow, newValue, realIndex);
                                  }}
                                  onKeyDown={getKeyDownHandler()}
                                  onFocus={() => setActiveRowIndex(realIndex)}
                                  type={col.type === 'number' || col.type === 'currency' ? 'number' : 'text'}
                                  step={col.type === 'currency' ? '0.01' : undefined}
                                  placeholder={col.type === 'currency' ? '$0.00' : undefined}
                                  className="font-mono h-8 text-xs border-0 focus-visible:ring-1 min-w-0"
                                />
                              </TableCell>
                            );
                          }
                          
                          return (
                            <TableCell 
                              key={col.key} 
                              className={`text-xs ${row.source === 'not_found' && (col.key === 'medDesc' || col.key === 'source') ? 'text-destructive' : ''}`}
                            >
                              {col.type === 'currency' 
                                ? formatCurrency(value as number | null)
                                : (value?.toString() || <span className="text-muted-foreground">—</span>)
                              }
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );})}
                  </TableBody>
                </Table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {/* Stats */}
            <div className="flex gap-4 mt-4 text-sm text-muted-foreground">
              <span>{scanRows.filter(r => r.ndc || r.scannedNdc).length} items scanned</span>
              {searchQuery && <span>• {filteredRows.length} shown</span>}
              <span>•</span>
              <span>{scanRows.filter(r => r.source === 'fda').length} found in FDA</span>
              <span>•</span>
              <span className="text-destructive">
                {scanRows.filter(r => r.source === 'not_found').length} not found
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Section Dialog */}
      <Dialog open={addSectionDialogOpen} onOpenChange={setAddSectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加新Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Section代码</label>
              <Input
                placeholder="例如: 0001"
                value={newSectionCode}
                onChange={(e) => setNewSectionCode(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">描述</label>
              <Input
                placeholder="例如: Topicals-EENT"
                value={newSectionDesc}
                onChange={(e) => setNewSectionDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSectionDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddSection}>
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Section Dialog */}
      <Dialog open={renameSectionDialogOpen} onOpenChange={setRenameSectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改Section描述</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Section代码</label>
              <Input
                value={sections.find(s => s.id === editingSectionId)?.sect || ''}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">描述</label>
              <Input
                placeholder="例如: Topicals-EENT"
                value={editingSectionDesc}
                onChange={(e) => setEditingSectionDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameSectionDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleRenameSection}>
              <Check className="h-4 w-4 mr-1" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Calculator Dialog */}
      <Dialog open={calculatorOpen} onOpenChange={setCalculatorOpen}>
        <DialogContent className="sm:max-w-[320px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              计算器
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Display */}
            <div className="p-3 bg-muted rounded-lg font-mono text-right">
              <div className="text-sm text-muted-foreground min-h-[20px]">
                {calculatorExpression || '0'}
              </div>
              <div className="text-2xl font-bold">
                {calculatorResult !== null ? calculatorResult : '—'}
              </div>
            </div>
            
            {/* Calculator buttons */}
            <div className="grid grid-cols-4 gap-2">
              {['7', '8', '9', '/'].map(btn => (
                <Button
                  key={btn}
                  variant={btn === '/' ? 'secondary' : 'outline'}
                  className="h-12 text-lg font-mono"
                  onClick={() => handleCalculatorInput(btn)}
                >
                  {btn === '/' ? '÷' : btn}
                </Button>
              ))}
              {['4', '5', '6', '*'].map(btn => (
                <Button
                  key={btn}
                  variant={btn === '*' ? 'secondary' : 'outline'}
                  className="h-12 text-lg font-mono"
                  onClick={() => handleCalculatorInput(btn)}
                >
                  {btn === '*' ? '×' : btn}
                </Button>
              ))}
              {['1', '2', '3', '-'].map(btn => (
                <Button
                  key={btn}
                  variant={btn === '-' ? 'secondary' : 'outline'}
                  className="h-12 text-lg font-mono"
                  onClick={() => handleCalculatorInput(btn)}
                >
                  {btn}
                </Button>
              ))}
              {['0', '.', '=', '+'].map(btn => (
                <Button
                  key={btn}
                  variant={btn === '=' ? 'default' : btn === '+' ? 'secondary' : 'outline'}
                  className="h-12 text-lg font-mono"
                  onClick={() => btn === '=' ? calculateResult() : handleCalculatorInput(btn)}
                >
                  {btn}
                </Button>
              ))}
            </div>
            
            {/* Clear button */}
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={clearCalculator}
            >
              清除 (C)
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCalculatorOpen(false)}>
              取消
            </Button>
            <Button 
              onClick={applyCalculatorResult}
              disabled={calculatorResult === null}
            >
              <Check className="h-4 w-4 mr-1" />
              应用结果
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Scan;
