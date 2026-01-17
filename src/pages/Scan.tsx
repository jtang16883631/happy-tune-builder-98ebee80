import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ScanBarcode, ArrowLeft, Plus, Trash2, Calendar, FileText, AlertCircle, ChevronDown, Edit2, Check, X, CloudOff, Download } from 'lucide-react';
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
  packSz: string;
  fdaSize: string;
  manufacturer: string;
  source: string; // SOURCE from Cost Data Column E
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
  const { isLoading: authLoading, roles } = useAuth();
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
  
  const createEmptyRow = useCallback((sectionName?: string): ScanRow => ({
    id: crypto.randomUUID(),
    loc: sectionName || '',
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
    packSz: '',
    fdaSize: '',
    manufacturer: '',
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

  // Lookup NDC and update row with mapping (by column position, not name):
  // TIME = laptop real time
  // MIS Count Method = FDA Column P (count_method)
  // Item Number = Cost Data Column E (material)
  // Med Desc = Cost Data Column B (material_description)
  // MERIDIAN DESC = FDA Column B (meridian_desc)
  // PACK SZ = FDA Column F (package_size)
  // FDA SIZE = FDA Column G (fda_size)
  // SOURCE = Cost Data Column D (source)
  // Pack Cost = Cost Data Column C (unit_price)
  // MIS Divisor = FDA Column O (meridian_divisor)
  // Unit Cost = Pack Cost / MIS Divisor
  // Extended = Unit Cost * QTY
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
    
    // PACK SZ from FDA Column F (package_size)
    const packSz = fdaResult?.package_size || '';
    
    // FDA SIZE from FDA Column G (fda_size)
    const fdaSize = fdaResult?.fda_size || '';
    
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
    
    // Manufacturer from FDA or Cost Data
    const manufacturer = fdaResult?.manufacturer || costItem?.manufacturer || '';
    
    setScanRows(prev => {
      const updated = [...prev];
      updated[rowIndex] = {
        ...updated[rowIndex],
        ndc: cleanNdc,
        time: new Date().toLocaleTimeString(), // Real time from laptop
        misCountMethod,
        itemNumber,
        medDesc,
        meridianDesc,
        packSz,
        fdaSize,
        packCost,
        source,
        misDivisor,
        unitCost,
        extended,
        manufacturer,
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
  }, [fdaLookup, getCostItemByNDC, selectedTemplate, scanRows]);

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
  const columns = [
    { key: 'loc', label: 'LOC', width: 'w-20', editable: true },
    { key: 'rec', label: 'REC', width: 'w-20', editable: true },
    { key: 'time', label: 'TIME', width: 'w-24', editable: true },
    { key: 'ndc', label: 'NDC', width: 'w-32', editable: true, isNdcInput: true },
    { key: 'scannedNdc', label: 'Scanned NDC', width: 'w-36', editable: true, isNdcInput: true },
    { key: 'qty', label: 'QTY', width: 'w-20', editable: true, type: 'number' },
    { key: 'misDivisor', label: 'MIS Divisor', width: 'w-24', editable: true, type: 'number' },
    { key: 'misCountMethod', label: 'MIS Count Method', width: 'w-32', editable: true },
    { key: 'itemNumber', label: 'Item Number', width: 'w-28', editable: true },
    { key: 'medDesc', label: 'Med Desc', width: 'w-48', editable: true },
    { key: 'meridianDesc', label: 'MERIDIAN DESC', width: 'w-48', editable: true },
    { key: 'packSz', label: 'PACK SZ', width: 'w-24', editable: true },
    { key: 'fdaSize', label: 'FDA SIZE', width: 'w-24', editable: true },
    { key: 'manufacturer', label: 'MANUFACTURER', width: 'w-36', editable: true },
    { key: 'source', label: 'SOURCE', width: 'w-24', editable: true },
    { key: 'packCost', label: 'Pack Cost', width: 'w-28', editable: true, type: 'currency' },
    { key: 'unitCost', label: 'Unit Cost', width: 'w-28', editable: true, type: 'currency' },
    { key: 'extended', label: 'Extended', width: 'w-28', editable: true, type: 'currency' },
    { key: 'blank', label: '$-', width: 'w-20', editable: true },
    { key: 'sheetType', label: 'Sheet Type', width: 'w-28', editable: true },
    { key: 'auditCriteria', label: 'Audit Criteria', width: 'w-32', editable: true },
    { key: 'originalQty', label: 'Original QTY', width: 'w-28', editable: true, type: 'number' },
    { key: 'auditorInitials', label: 'Auditor Initials', width: 'w-32', editable: true },
    { key: 'results', label: 'Results', width: 'w-28', editable: true },
    { key: 'additionalNotes', label: 'Additional Notes', width: 'w-48', editable: true },
  ];

  // Scan View (Excel-like with horizontal scroll)
  return (
    <AppLayout fullWidth>
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
            <div className="flex items-center gap-4 mb-4">
              <ScanBarcode className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {selectedSection 
                  ? `Scanning in: ${selectedSection.full_section}` 
                  : 'Scan a barcode or enter NDC in "Scanned NDC" column, then press Enter'}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                className="ml-auto"
                onClick={handleAddRow}
                disabled={!selectedSection}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Row
              </Button>
            </div>

            {/* Excel-like Table with horizontal scroll */}
            <ScrollArea className="w-full whitespace-nowrap rounded-lg border">
              <div className="min-w-max">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {columns.map((col) => (
                        <TableHead key={col.key} className={`${col.width} text-xs font-medium`}>
                          {col.label}
                        </TableHead>
                      ))}
                      <TableHead className="w-12 sticky right-0 bg-muted/50 z-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scanRows.map((row, index) => {
                      const validationStatus = getRowValidationStatus(row);
                      return (
                      <TableRow 
                        key={row.id}
                        className={`${index === activeRowIndex ? 'bg-primary/5' : ''} ${validationStatus === 'invalid' ? 'bg-destructive/10' : ''}`}
                      >
                        {columns.map((col) => {
                          const value = row[col.key as keyof ScanRow];
                          
                          if (col.editable) {
                            // For currency fields, display with $ format but edit as number
                            const displayValue = col.type === 'currency' && value !== null && value !== undefined
                              ? `$${Number(value).toFixed(2)}`
                              : (value?.toString() || '');
                            
                            // Determine ref and keydown handler based on field type
                            const getRef = () => {
                              if (col.isNdcInput) return (el: HTMLInputElement | null) => ndcInputRefs.current[index] = el;
                              if (col.key === 'qty') return (el: HTMLInputElement | null) => qtyInputRefs.current[index] = el;
                              return undefined;
                            };
                            
                            const getKeyDownHandler = () => {
                              if (col.isNdcInput) return (e: React.KeyboardEvent<HTMLInputElement>) => handleNdcKeyDown(e, index);
                              if (col.key === 'qty') return (e: React.KeyboardEvent<HTMLInputElement>) => handleQtyKeyDown(e, index);
                              return undefined;
                            };
                            
                            return (
                              <TableCell key={col.key} className="p-1">
                                <Input
                                  ref={getRef()}
                                  value={col.type === 'currency' ? (value !== null && value !== undefined ? Number(value).toFixed(2) : '') : (value?.toString() || '')}
                                  onChange={(e) => {
                                    const newValue = col.type === 'number' || col.type === 'currency'
                                      ? (e.target.value ? parseFloat(e.target.value) : null)
                                      : e.target.value;
                                    handleFieldChange(col.key as keyof ScanRow, newValue, index);
                                  }}
                                  onKeyDown={getKeyDownHandler()}
                                  onFocus={() => setActiveRowIndex(index)}
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
                        <TableCell className={`p-1 sticky right-0 z-10 ${validationStatus === 'invalid' ? 'bg-destructive/10' : 'bg-background'}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteRow(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
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
    </AppLayout>
  );
};

export default Scan;
