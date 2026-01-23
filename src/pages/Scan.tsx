import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ScanBarcode, ArrowLeft, Plus, Trash2, Calendar, FileText, AlertCircle, ChevronDown, Edit2, Check, X, CloudOff, Download, GripVertical, Eye, EyeOff, Settings2, FileUp, Cloud, RefreshCw, Search, Calculator, DollarSign, ShieldCheck, BarChart3, HardDrive } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useCloudTemplates, CloudTemplate, CloudSection, TemplateStatus } from '@/hooks/useCloudTemplates';
import { useOfflineTemplates, OfflineTemplate } from '@/hooks/useOfflineTemplates';
import { useLocalFDA } from '@/hooks/useLocalFDA';
import { SyncButton } from '@/components/scanner/SyncButton';
import { OfflineSyncDialog } from '@/components/scanner/OfflineSyncDialog';
import { OfflineDataTransferDialog } from '@/components/scanner/OfflineDataTransferDialog';
import { OuterNDCSelectionDialog, OuterNDCOption } from '@/components/scanner/OuterNDCSelectionDialog';
import { CostDataLookupDialog } from '@/components/scanner/CostDataLookupDialog';
import { ScanSummaryTab } from '@/components/scanner/ScanSummaryTab';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  
  // REC is now generated based on row index (1-based), no counter needed
  
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
  
  // Fetch user profile for short name - with offline caching
  useEffect(() => {
    const CACHE_KEY = 'cached_user_short_name';
    
    const fetchUserProfile = async () => {
      // If we're offline, use cached value immediately
      if (!navigator.onLine) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          setUserShortName(cached);
        }
        return;
      }
      
      if (!user?.id) {
        // No user but check for cached name for offline mode
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          setUserShortName(cached);
        }
        return;
      }
      
      try {
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
          // Cache for offline use
          if (shortName) {
            localStorage.setItem(CACHE_KEY, shortName);
          }
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        // Fallback to cached value
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          setUserShortName(cached);
        }
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
  
  const { lookupNDC: fdaLookup, findOuterNDCsByNDC9, getDrugByOuterNDC } = useLocalFDA();

  // State for offline sync dialog
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  
  // State for offline data transfer dialog
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);

  // State for outer NDC selection dialog
  const [outerNDCDialogOpen, setOuterNDCDialogOpen] = useState(false);
  const [outerNDCOptions, setOuterNDCOptions] = useState<OuterNDCOption[]>([]);
  const [pendingNDCLookup, setPendingNDCLookup] = useState<{ scannedNDC: string; rowIndex: number } | null>(null);

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
  const [newSectionCostSheet, setNewSectionCostSheet] = useState<string | null>(null);
  const [availableCostSheets, setAvailableCostSheets] = useState<string[]>([]);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionDesc, setEditingSectionDesc] = useState('');
  const [editingSectionCostSheet, setEditingSectionCostSheet] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Cost data lookup dialog state
  const [costLookupDialogOpen, setCostLookupDialogOpen] = useState(false);
  
  // Audit mode state
  const [auditMode, setAuditMode] = useState(false);
  
  // Active tab state (scan or summary)
  const [activeTab, setActiveTab] = useState<'scan' | 'summary'>('scan');
  
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

  // Collect all section records from localStorage for summary
  const allSectionRecords = useMemo(() => {
    if (!selectedTemplate) return {};
    
    const records: Record<string, ScanRow[]> = {};
    sections.forEach(section => {
      const savedData = localStorage.getItem(`scan_records_${selectedTemplate.id}_${section.id}`);
      if (savedData) {
        try {
          const savedRecords = JSON.parse(savedData) as ScanRow[];
          records[section.id] = savedRecords;
        } catch {
          // Ignore parse errors
        }
      }
    });
    return records;
  }, [selectedTemplate, sections, scanRows]); // Re-calculate when scanRows changes to reflect current edits

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
      errors.push('Med Desc or MERIDIAN DESC (at least one)');
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

  // Load available cost sheets for a template
  // Query template_cost_items with DISTINCT sheet_name to get actual cost tabs (e.g., GPOWAC, 340B)
  // Fallback to template_sections for any additional sheets assigned there.
  const loadAvailableCostSheets = useCallback(async (templateId: string) => {
    try {
      // Get unique sheet names from cost items - use RPC or manual approach
      // Since Supabase doesn't support DISTINCT directly, we'll fetch a limited set and dedupe
      // Query up to 2000 rows (should capture all unique sheet names)
      const { data: costData, error: costError } = await supabase
        .from('template_cost_items')
        .select('sheet_name')
        .eq('template_id', templateId)
        .not('sheet_name', 'is', null)
        .limit(2000);

      if (costError) throw costError;

      // Also get any assigned sheets from sections (in case they differ)
      const { data: sectionData, error: sectionError } = await supabase
        .from('template_sections')
        .select('cost_sheet')
        .eq('template_id', templateId)
        .not('cost_sheet', 'is', null);

      if (sectionError) console.error('Error loading section sheets:', sectionError);

      // Combine and dedupe
      const costSheets = (costData || []).map((d: any) => d.sheet_name).filter(Boolean);
      const sectionSheets = (sectionData || []).map((d: any) => d.cost_sheet).filter(Boolean);
      const uniqueSheets = [...new Set([...costSheets, ...sectionSheets])] as string[];
      
      setAvailableCostSheets(uniqueSheets);
    } catch (err) {
      console.error('Error loading cost sheets:', err);
      setAvailableCostSheets([]);
    }
  }, []);

  // Handle template selection - just load sections, don't load records yet
  const handleSelectTemplate = async (template: CloudTemplate) => {
    setSelectedTemplate(template);
    setSelectedSection(null); // Reset section selection
    setScanRows([createEmptyRow()]); // Start with empty row
    setActiveRowIndex(0);
    
    // Load sections and cost sheets for this template
    await Promise.all([
      loadSections(template.id),
      loadAvailableCostSheets(template.id),
    ]);
  };

  // Add new section
  const handleAddSection = async () => {
    if (!selectedTemplate || !newSectionCode.trim()) {
      toast.error('Please enter a Section code');
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
          cost_sheet: newSectionCostSheet,
        });

      if (error) throw error;

      toast.success('Section added successfully');
      setAddSectionDialogOpen(false);
      setNewSectionCode('');
      setNewSectionDesc('');
      setNewSectionCostSheet(null);
      await loadSections(selectedTemplate.id);
    } catch (err: any) {
      toast.error('Failed to add: ' + err.message);
    }
  };

  // Edit section (update description AND cost_sheet)
  const handleEditSection = async () => {
    if (!editingSectionId || !editingSectionDesc.trim()) {
      toast.error('Please enter a description');
      return;
    }

    try {
      const section = sections.find(s => s.id === editingSectionId);
      if (!section) return;

      const oldFullSection = section.full_section;
      const newFullSection = `${section.sect}-${editingSectionDesc.trim()}`;
      
      const { error } = await supabase
        .from('template_sections')
        .update({
          description: editingSectionDesc.trim(),
          full_section: newFullSection,
          cost_sheet: editingSectionCostSheet,
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

      toast.success('Section updated successfully');
      setRenameSectionDialogOpen(false);
      setEditingSectionId(null);
      setEditingSectionDesc('');
      setEditingSectionCostSheet(null);
      
      if (selectedTemplate) {
        await loadSections(selectedTemplate.id);
        // Update selected section if it was edited
        if (selectedSection?.id === editingSectionId) {
          setSelectedSection(prev => prev ? {
            ...prev,
            description: editingSectionDesc.trim(),
            full_section: newFullSection,
            cost_sheet: editingSectionCostSheet,
          } : null);
        }
      }
    } catch (err: any) {
      toast.error('Failed to update: ' + err.message);
    }
  };

  // Open rename dialog for a section
  // Open edit dialog for a section (description + cost sheet)
  const openEditSectionDialog = (section: CloudSection) => {
    setEditingSectionId(section.id);
    setEditingSectionDesc(section.description || '');
    setEditingSectionCostSheet(section.cost_sheet || null);
    setRenameSectionDialogOpen(true);
  };

  // Generate REC value based on row index (1-based)
  const generateRecForRow = useCallback((rowIndex: number) => {
    const rowNum = rowIndex + 1; // 1-based row number
    return `${userShortName}${String(rowNum).padStart(3, '0')}`;
  }, [userShortName]);

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
  // 
  // finalNdc: The resolved outer NDC to use for lookup (after selection if multiple)
  // scannedNdc: The original scanned NDC (inner NDC)
  const lookupNDC = useCallback(async (finalNdc: string, scannedNdc: string, rowIndex: number) => {
    if (!finalNdc || finalNdc.length < 10 || !selectedTemplate) return;

    const cleanNdc = finalNdc.replace(/-/g, '');
    const originalScanned = scannedNdc.replace(/-/g, '');
    
    const fdaResult = fdaLookup(cleanNdc);
    const costItem = await getCostItemByNDC(selectedTemplate.id, cleanNdc, selectedSection?.cost_sheet ?? null);

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
    
    // Always generate REC based on row position (1-indexed)
    const rec = generateRecForRow(rowIndex);
    
    setScanRows(prev => {
      const updated = [...prev];
      // Only set NDC to the resolved outer NDC (finalNdc), NOT the scanned NDC
      // scannedNdc is stored separately for reference
      // Only populate NDC column if the outer NDC is DIFFERENT from the scanned NDC
      // If they're the same, leave NDC blank to avoid redundant data
      const outerNdcIsDifferent = cleanNdc !== originalScanned.replace(/\D/g, '');
      
      updated[rowIndex] = {
        ...updated[rowIndex],
        ndc: outerNdcIsDifferent ? cleanNdc : '', // Only show if different from scanned
        scannedNdc: originalScanned, // Store the original scanned NDC separately
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
  }, [fdaLookup, getCostItemByNDC, selectedTemplate, scanRows, generateRecForRow, selectedSection, createEmptyRow]);

  // Initiate NDC lookup with outer NDC selection logic
  // 1. Extract NDC9 from scanned NDC
  // 2. Look up by innerpack_outer_left9 (column AG)
  // 3. Get unique outerpack_ndc values (column AE)
  // 4. If 0: show error, if 1: auto-use, if >1: show selection dialog
  const initiateNDCLookup = useCallback(async (scannedNdc: string, rowIndex: number): Promise<boolean> => {
    // Scanner input may contain dashes/spaces or be shorter than 10 chars.
    // Business rule only requires the first 9 digits (NDC9 key).
    const cleanNdc = (scannedNdc ?? '').replace(/\D/g, '');

    // Always set TIME and REC for manual entry support, even if lookup fails
    const setTimeAndRec = () => {
      setScanRows(prev => {
        const updated = [...prev];
        updated[rowIndex] = {
          ...updated[rowIndex],
          scannedNdc: scannedNdc, // Store original scanned value
          time: updated[rowIndex].time || new Date().toLocaleTimeString(),
          rec: generateRecForRow(rowIndex),
        };
        return updated;
      });
    };

    if (!cleanNdc) {
      setTimeAndRec();
      return false;
    }

    if (cleanNdc.length < 9) {
      setTimeAndRec(); // Still record TIME and REC for manual entry
      toast.error('Invalid NDC', {
        description: `Scanned value: ${scannedNdc}`,
        duration: 5000,
      });
      return false;
    }

    console.log('[NDC Lookup] Starting lookup for:', cleanNdc);
    console.log('[NDC Lookup] NDC9 key:', cleanNdc.slice(0, 9));

    // Find outer NDCs using NDC9 key
    const { outerNDCs, drugs } = findOuterNDCsByNDC9(cleanNdc);

    console.log('[NDC Lookup] Found outer NDCs:', outerNDCs);
    console.log('[NDC Lookup] Found drugs count:', drugs.length);

    if (outerNDCs.length === 0) {
      // Still record TIME and REC for manual entry support
      setTimeAndRec();
      // Per business rules: if no outer pack NDCs exist for this NDC9, stop and show an error.
      toast.error('NDC not found in FDA mapping', {
        description: `No outer pack NDC (AE) found for NDC9: ${cleanNdc.slice(0, 9)}`,
        duration: 6000,
      });
      return false;
    }

    if (outerNDCs.length === 1) {
      console.log('[NDC Lookup] Single outer NDC, auto-using:', outerNDCs[0]);
      // Exactly one outer NDC - use it automatically
      await lookupNDC(outerNDCs[0], cleanNdc, rowIndex);
      toast(`Outer NDC auto-selected: ${outerNDCs[0]}`);
      return true;
    }

    console.log('[NDC Lookup] Multiple outer NDCs found, showing dialog');
    toast('Multiple outer NDCs found — please choose one');
    // Multiple outer NDCs - show selection dialog
    const options: OuterNDCOption[] = outerNDCs.map(outerNDC => {
      // Find the drug record that has this outer NDC (normalize digits + pad)
      const match = (d: any) => {
        const digits = String(d?.outerpack_ndc ?? '').replace(/\D/g, '');
        const normalized = digits.length >= 11 ? digits.slice(0, 11) : digits.padStart(11, '0');
        return normalized === outerNDC;
      };
      const drug = drugs.find(match) || getDrugByOuterNDC(outerNDC);
      return {
        outerNDC,
        trade: drug?.trade || null,
        generic: drug?.generic || null,
        strength: drug?.strength || null,
        packageSize: drug?.package_size || null,
        manufacturer: drug?.manufacturer || null,
        doseForm: drug?.dose_form || null,
      };
    });

    setOuterNDCOptions(options);
    setPendingNDCLookup({ scannedNDC: cleanNdc, rowIndex });
    setOuterNDCDialogOpen(true);

    return false; // Indicate that we're waiting for user selection
  }, [findOuterNDCsByNDC9, fdaLookup, getDrugByOuterNDC, lookupNDC, generateRecForRow]);


  // Handle outer NDC selection from dialog
  const handleOuterNDCSelect = useCallback(async (selectedOuterNDC: string) => {
    if (!pendingNDCLookup) return;
    
    const { scannedNDC, rowIndex } = pendingNDCLookup;
    
    setOuterNDCDialogOpen(false);
    setOuterNDCOptions([]);
    setPendingNDCLookup(null);
    
    await lookupNDC(selectedOuterNDC, scannedNDC, rowIndex);
    
    // Focus on QTY field after selection
    requestAnimationFrame(() => {
      qtyInputRefs.current[rowIndex]?.focus();
    });
  }, [pendingNDCLookup, lookupNDC]);

  // Handle outer NDC selection cancel
  const handleOuterNDCCancel = useCallback(() => {
    setOuterNDCDialogOpen(false);
    setOuterNDCOptions([]);
    setPendingNDCLookup(null);
  }, []);

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

  // Handle NDC input Enter/Tab key - initiate outer NDC lookup flow
  const handleNdcKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();

      // Check if previous row (if exists and has data) passes validation
      if (rowIndex > 0) {
        const prevRow = scanRows[rowIndex - 1];
        const { valid, errors } = validateRow(prevRow);
        if (!valid) {
          toast.error('Please complete the required fields in the previous row', {
            description: `Missing: ${errors.join(', ')}`,
            duration: 5000,
          });
          return; // Block scanning
        }
      }

      // ALWAYS set TIME and REC when Enter/Tab is pressed on scannedNdc field
      // This ensures manual entries are tracked even without a successful NDC lookup
      setScanRows(prev => {
        const updated = [...prev];
        updated[rowIndex] = {
          ...updated[rowIndex],
          time: updated[rowIndex].time || new Date().toLocaleTimeString(),
          rec: generateRecForRow(rowIndex),
        };
        return updated;
      });

      const ndc = scanRows[rowIndex].scannedNdc || scanRows[rowIndex].ndc;
      if (ndc) {
        // Initiate the outer NDC lookup flow
        // This may show a selection dialog if multiple outer NDCs are found
        const completed = await initiateNDCLookup(ndc, rowIndex);

        // Only focus QTY if lookup completed immediately (single or no outer NDC)
        // If dialog was shown, focus will be handled in handleOuterNDCSelect
        if (completed) {
          requestAnimationFrame(() => {
            qtyInputRefs.current[rowIndex]?.focus();
          });
        }
      } else {
        // No NDC entered, just move to QTY field
        requestAnimationFrame(() => {
          qtyInputRefs.current[rowIndex]?.focus();
        });
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
        toast.error('Please complete the required fields in the current row', {
          description: `Missing: ${errors.join(', ')}`,
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
        toast.error('Please complete the required fields in the current row', {
          description: `Missing: ${errors.join(', ')}`,
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

  // Export scan data to Excel - each section as a separate tab + Summary sheet
  const handleExportToExcel = useCallback(async () => {
    if (!selectedTemplate || sections.length === 0) {
      toast.error('No sections to export');
      return;
    }

    try {
      const workbook = XLSX.utils.book_new();
      // Remove default Sheet1 if it exists (xlsx may add it automatically)
      if (workbook.SheetNames.includes('Sheet1')) {
        delete workbook.Sheets['Sheet1'];
        workbook.SheetNames = workbook.SheetNames.filter(name => name !== 'Sheet1');
      }

      // Track section totals for summary
      const sectionTotals: { section: string; count: number; value: number }[] = [];

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
        let sectionTotal = 0;
        
        if (savedData) {
          try {
            const savedRecords = JSON.parse(savedData) as ScanRow[];
            
            // Convert each record to a row array
            savedRecords.forEach(record => {
              // Sum up Extended values for this section
              if (record.extended !== null && record.extended !== undefined) {
                sectionTotal += record.extended;
              }
              
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

        // Store section total for summary
        const recordCount = rows.length - 1; // Subtract header row
        sectionTotals.push({
          section: section.full_section || section.sect || 'Unknown',
          count: recordCount,
          value: sectionTotal
        });

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

      // Create Summary sheet
      const dateStr = selectedTemplate.inv_date 
        ? new Date(selectedTemplate.inv_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      
      const grandTotal = sectionTotals.reduce((sum, s) => sum + s.value, 0);
      const totalScans = sectionTotals.reduce((sum, s) => sum + s.count, 0);
      
      // Build summary sheet content
      const summaryRows: any[][] = [
        // Header info
        [selectedTemplate.name],
        [selectedTemplate.facility_name || ''],
        [dateStr],
        [], // Empty row
        // Section table headers
        ['Sections', 'Scans', 'Value'],
      ];
      
      // Add each section row with $ formatting
      sectionTotals.forEach(st => {
        summaryRows.push([st.section, st.count, `$${st.value.toFixed(2)}`]);
      });
      
      // Empty row before total
      summaryRows.push([]);
      // Grand total row with $ formatting
      summaryRows.push(['Total', totalScans, `$${grandTotal.toFixed(2)}`]);
      
      const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryRows);
      
      // Set column widths for summary
      summaryWorksheet['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 15 }];

      // Create Master sheet - combine all sections
      const masterRows: any[][] = [headers];
      
      for (const section of sections) {
        const savedData = localStorage.getItem(`scan_records_${selectedTemplate.id}_${section.id}`);
        if (savedData) {
          try {
            const savedRecords = JSON.parse(savedData) as ScanRow[];
            savedRecords.forEach(record => {
              masterRows.push([
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
            console.error('Error parsing section data for master:', e);
          }
        }
      }
      
      const masterWorksheet = XLSX.utils.aoa_to_sheet(masterRows);
      masterWorksheet['!cols'] = headers.map((_, i) => ({ wch: i === 10 || i === 11 ? 30 : 15 }));
      
      // Clear all sheets and rebuild in correct order: Summary, Master, then sections
      const sectionSheetNames = [...workbook.SheetNames];
      const sectionSheets = { ...workbook.Sheets };
      
      // Clear workbook
      workbook.SheetNames = [];
      workbook.Sheets = {};
      
      // Add Summary first
      XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');
      
      // Add Master second
      XLSX.utils.book_append_sheet(workbook, masterWorksheet, 'Master');
      
      // Add all section sheets
      sectionSheetNames.forEach(name => {
        XLSX.utils.book_append_sheet(workbook, sectionSheets[name], name);
      });

      // Generate filename with template name and date
      const filename = `${selectedTemplate.name}_${dateStr}_scan.xlsx`;

      // Download the file
      XLSX.writeFile(workbook, filename);
      toast.success(`Exported ${sections.length} sections + Summary + Master to Excel`);
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

      // Track section totals for summary
      const sectionTotals: { section: string; count: number; value: number }[] = [];
      
      // Collect all records for Master sheet
      const allMasterRows: any[][] = [];

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
        let sectionTotal = 0;

        if (cloudRecords && cloudRecords.length > 0) {
          cloudRecords.forEach(record => {
            // Sum up Extended values for this section
            if (record.extended !== null && record.extended !== undefined) {
              sectionTotal += Number(record.extended);
            }
            
            const rowData = [
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
            ];
            rows.push(rowData);
            allMasterRows.push(rowData);
          });
        }

        // Store section total for summary
        const recordCount = cloudRecords?.length || 0;
        sectionTotals.push({
          section: section.full_section || section.sect || 'Unknown',
          count: recordCount,
          value: sectionTotal
        });

        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        worksheet['!cols'] = headers.map((_, i) => ({ wch: i === 10 || i === 11 ? 30 : 15 }));

        let sheetName = section.full_section || section.sect || 'Sheet';
        sheetName = sheetName.replace(/[\\/*?[\]:]/g, '-').substring(0, 31);

        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }

      // Create Summary sheet
      const dateStr = selectedTemplate.inv_date 
        ? new Date(selectedTemplate.inv_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      
      const grandTotal = sectionTotals.reduce((sum, s) => sum + s.value, 0);
      const totalScans = sectionTotals.reduce((sum, s) => sum + s.count, 0);
      
      // Build summary sheet content
      const summaryRows: any[][] = [
        // Header info
        [selectedTemplate.name],
        [selectedTemplate.facility_name || ''],
        [dateStr],
        [], // Empty row
        // Section table headers
        ['Sections', 'Scans', 'Value'],
      ];
      
      // Add each section row with $ formatting
      sectionTotals.forEach(st => {
        summaryRows.push([st.section, st.count, `$${st.value.toFixed(2)}`]);
      });
      
      // Empty row before total
      summaryRows.push([]);
      // Grand total row with $ formatting
      summaryRows.push(['Total', totalScans, `$${grandTotal.toFixed(2)}`]);
      
      const summaryWorksheet = XLSX.utils.aoa_to_sheet(summaryRows);
      summaryWorksheet['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 15 }];

      // Create Master sheet - combine all sections
      const masterRows: any[][] = [headers, ...allMasterRows];
      const masterWorksheet = XLSX.utils.aoa_to_sheet(masterRows);
      masterWorksheet['!cols'] = headers.map((_, i) => ({ wch: i === 10 || i === 11 ? 30 : 15 }));
      
      // Clear all sheets and rebuild in correct order: Summary, Master, then sections
      const sectionSheetNames = [...workbook.SheetNames];
      const sectionSheets = { ...workbook.Sheets };
      
      // Clear workbook
      workbook.SheetNames = [];
      workbook.Sheets = {};
      
      // Add Summary first
      XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');
      
      // Add Master second
      XLSX.utils.book_append_sheet(workbook, masterWorksheet, 'Master');
      
      // Add all section sheets
      sectionSheetNames.forEach(name => {
        XLSX.utils.book_append_sheet(workbook, sectionSheets[name], name);
      });

      const filename = `${selectedTemplate.name}_${dateStr}_merged_scan.xlsx`;

      XLSX.writeFile(workbook, filename);
      toast.success(`Exported merged scans with Summary + Master to Excel`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export merged scans');
    } finally {
      setIsExportingMerged(false);
    }
  }, [selectedTemplate, sections, isOnline]);

  // In-cell calculator: evaluate expression like Excel (e.g., "5+3" -> 8)
  const evaluateQtyExpression = useCallback((expression: string): number | null => {
    if (!expression.trim()) return null;
    
    // If it's just a number, return it directly
    const numOnly = parseFloat(expression);
    if (!isNaN(numOnly) && !/[+\-*/]/.test(expression.replace(/^-/, ''))) {
      return numOnly;
    }
    
    try {
      // Safe eval - only allow numbers and basic operators
      const sanitized = expression.replace(/[^0-9+\-*/.()]/g, '');
      if (!sanitized) return null;
      
      // eslint-disable-next-line no-eval
      const result = eval(sanitized);
      return typeof result === 'number' && !isNaN(result) ? result : null;
    } catch {
      return null;
    }
  }, []);

  // State for QTY expression input (showing raw expression while editing)
  const [qtyExpressions, setQtyExpressions] = useState<Record<string, string>>({});
  // Keep a synchronous reference to the latest typed value (barcode scanners can type faster than state updates)
  const qtyExpressionRef = useRef<Record<string, string>>({});
  
  // Handle QTY input change - store raw expression
  const handleQtyInputChange = (value: string, rowIndex: number) => {
    const rowId = scanRows[rowIndex].id;
    qtyExpressionRef.current[rowId] = value;
    setQtyExpressions(prev => ({ ...prev, [rowId]: value }));
  };
  
  // Handle QTY blur - evaluate expression and update value
  const handleQtyBlur = (rowIndex: number) => {
    const rowId = scanRows[rowIndex].id;
    const expression = qtyExpressionRef.current[rowId] ?? qtyExpressions[rowId];
    
    if (expression !== undefined) {
      const result = evaluateQtyExpression(expression);
      if (result !== null) {
        handleFieldChange('qty', result, rowIndex);
      }

      delete qtyExpressionRef.current[rowId];

      // Clear expression after blur
      setQtyExpressions(prev => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
    }
  };
  
  // Handle QTY Enter key - evaluate and move to next row
  const handleQtyExpressionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      // First evaluate the expression (barcode scanners / fast typing can beat state updates)
      const rowId = scanRows[rowIndex].id;
      const refValue = qtyExpressionRef.current[rowId];
      const domValue = e.currentTarget.value;
      const rawExpression = (domValue && domValue.trim() !== '') ? domValue : (refValue ?? '');
      let evaluatedQty = scanRows[rowIndex].qty;

      const result = evaluateQtyExpression(rawExpression);
      if (result !== null) {
        evaluatedQty = result;
        handleFieldChange('qty', result, rowIndex);
      }

      delete qtyExpressionRef.current[rowId];

      // Clear expression after evaluation (so next focus shows computed value)
      setQtyExpressions(prev => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      
      // Validate with the NEW qty value
      const currentRow = { ...scanRows[rowIndex], qty: evaluatedQty };
      const { valid, errors } = validateRow(currentRow);
      
      if (!valid) {
        toast.error('Please complete the required fields in the current row', {
          description: `Missing: ${errors.join(', ')}`,
          duration: 5000,
        });
        return;
      }
      
      if (rowIndex === scanRows.length - 1) {
        setScanRows(prev => [...prev, createEmptyRow(selectedSection?.full_section || '')]);
      }
      
      setTimeout(() => {
        ndcInputRefs.current[rowIndex + 1]?.focus();
        setActiveRowIndex(rowIndex + 1);
      }, 100);
    }
  };

  // Get display value for QTY (expression if editing, calculated value otherwise)
  const getQtyDisplayValue = (row: ScanRow, rowIndex: number): string => {
    const rowId = row.id;
    if (qtyExpressions[rowId] !== undefined) {
      return qtyExpressions[rowId];
    }
    return row.qty !== null && row.qty !== undefined ? row.qty.toString() : '';
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
        <div className="space-y-8" style={{ fontFamily: 'Arial, sans-serif' }}>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTransferDialogOpen(true)}
                className="gap-2"
                title="Export/Import offline data via flash drive"
              >
                <HardDrive className="h-4 w-4" />
                <span className="hidden sm:inline">Transfer</span>
              </Button>
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

          {/* Offline Data Transfer Dialog */}
          <OfflineDataTransferDialog
            open={transferDialogOpen}
            onOpenChange={setTransferDialogOpen}
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
      <div className="space-y-4 w-full" style={{ fontFamily: 'Arial, sans-serif' }}>
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
                          openEditSectionDialog(section);
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

        {/* Section required warning - only show on scan tab */}
        {!selectedSection && activeTab === 'scan' && (
          <Card className="border-warning bg-warning/10">
            <CardContent className="py-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-warning" />
              <span className="text-sm">Please select a Section first to start scanning</span>
            </CardContent>
          </Card>
        )}

        {/* Tabs for Scan and Summary */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'scan' | 'summary')} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="scan" className="gap-2">
              <ScanBarcode className="h-4 w-4" />
              Scan
            </TabsTrigger>
            <TabsTrigger value="summary" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Summary
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="scan" className="mt-0">
            {/* Scan Input */}
            <Card className="w-full">
              <CardContent className="p-4">
                {/* Toolbar - search and buttons on left */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {/* Search on left */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search NDC, Med Desc, REC..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 w-64 text-sm"
                />
              </div>
              
              {/* Cost Data Lookup Button */}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setCostLookupDialogOpen(true)}
                disabled={!selectedTemplate}
              >
                <DollarSign className="h-4 w-4 mr-1" />
                Cost Lookup
              </Button>
              
              {/* Action buttons */}
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
              
              {/* Audit Mode Toggle */}
              <div className="flex items-center gap-2 ml-2 border-l pl-3">
                <Switch
                  id="audit-mode"
                  checked={auditMode}
                  onCheckedChange={setAuditMode}
                />
                <Label htmlFor="audit-mode" className="text-sm font-medium flex items-center gap-1 cursor-pointer">
                  <ShieldCheck className="h-4 w-4" />
                  Audit Mode
                </Label>
              </div>
              
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
            </div>

            {/* Excel-like Table with horizontal scroll */}
            <ScrollArea className="w-full whitespace-nowrap rounded-lg border relative">
              {/* Overlay when no section selected */}
              {!selectedSection && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-20 flex items-center justify-center">
                  <div className="text-center p-6 bg-card rounded-lg border shadow-lg">
                    <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-lg font-medium">Select a Section First</p>
                    <p className="text-sm text-muted-foreground mt-1">Choose a section from the dropdown above to start scanning</p>
                  </div>
                </div>
              )}
              <div className="min-w-max" style={{ fontFamily: 'Arial, sans-serif' }}>
                <Table style={{ fontFamily: 'Arial, sans-serif' }}>
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
                          // Compute audit criteria dynamically when audit mode is on
                          let value = row[col.key as keyof ScanRow];
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
                            
                            // Special handling for QTY - in-cell calculator (type expression like "5+3")
                            if (col.key === 'qty') {
                              const qtyEmpty = row.qty === null || row.qty === undefined;
                              const qtyHasNdc = !!(row.ndc || row.scannedNdc);
                              const qtyNeedsHighlight = qtyEmpty && qtyHasNdc;
                              
                              return (
                                <TableCell key={col.key} className={`p-1 ${qtyNeedsHighlight ? 'bg-yellow-200 dark:bg-yellow-900/50' : ''}`} style={{ width: getColumnWidth(col.key), minWidth: getColumnWidth(col.key) }}>
                                  <div className="relative">
                                    <Input
                                      ref={getRef()}
                                      value={getQtyDisplayValue(row, realIndex)}
                                      onChange={(e) => handleQtyInputChange(e.target.value, realIndex)}
                                      onBlur={() => handleQtyBlur(realIndex)}
                                      onKeyDown={(e) => handleQtyExpressionKeyDown(e, realIndex)}
                                      onFocus={() => {
                                        setActiveRowIndex(realIndex);
                                        // Initialize expression with current value
                                        if (qtyExpressions[row.id] === undefined && row.qty !== null) {
                                          setQtyExpressions(prev => ({ ...prev, [row.id]: row.qty!.toString() }));
                                        }
                                      }}
                                      placeholder="e.g. 5+3"
                                      disabled={!selectedSection}
                                      className="font-mono h-8 text-xs border-0 focus-visible:ring-1 min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                    <Calculator className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                                  </div>
                                </TableCell>
                              );
                            }
                            
                          // Cell validation styling
                            const isEmptyCell = value === null || value === undefined || value === '';
                            const hasNdc = !!(row.ndc || row.scannedNdc);
                            
                            // QTY, MIS Divisor, MIS Count Method - yellow if empty
                            const isRequiredField = ['qty', 'misDivisor', 'misCountMethod'].includes(col.key);
                            const shouldHighlightRequired = isRequiredField && isEmptyCell && hasNdc;
                            
                            // Med Desc / Meridian Desc logic
                            const isMedDescEmpty = !row.medDesc || row.medDesc.trim() === '';
                            const isMeridianDescEmpty = !row.meridianDesc || row.meridianDesc.trim() === '';
                            const bothDescEmpty = isMedDescEmpty && isMeridianDescEmpty;
                            const isDescField = col.key === 'medDesc' || col.key === 'meridianDesc';
                            
                            // Red if both are empty, Yellow if only this one is empty
                            let descCellStyle = '';
                            if (isDescField && hasNdc) {
                              if (bothDescEmpty) {
                                descCellStyle = 'bg-red-200 dark:bg-red-900/50';
                              } else if ((col.key === 'medDesc' && isMedDescEmpty) || (col.key === 'meridianDesc' && isMeridianDescEmpty)) {
                                descCellStyle = 'bg-yellow-200 dark:bg-yellow-900/50';
                              }
                            }
                            
                            // Cost fields styling based on SOURCE
                            const isCostField = ['packCost', 'unitCost', 'extended'].includes(col.key);
                            let costCellStyle = '';
                            if (isCostField && hasNdc) {
                              const sourceVal = row.source || '';
                              if (sourceVal === '') {
                                costCellStyle = 'bg-yellow-200 dark:bg-yellow-900/50';
                              } else if (sourceVal.toUpperCase().startsWith('MIS')) {
                                costCellStyle = 'bg-gray-200 dark:bg-gray-700/50';
                              }
                            }
                            
                            // Highlight audit criteria when it has "need attention"
                            const isAuditAttention = col.key === 'auditCriteria' && typeof value === 'string' && value.includes('need attention');
                            
                            return (
                              <TableCell key={col.key} className={`p-1 ${shouldHighlightRequired ? 'bg-yellow-200 dark:bg-yellow-900/50' : ''} ${descCellStyle} ${costCellStyle} ${isAuditAttention ? 'bg-orange-200 dark:bg-orange-900/50' : ''}`} style={{ width: getColumnWidth(col.key), minWidth: getColumnWidth(col.key) }}>
                                <Input
                                  ref={getRef()}
                                  value={col.type === 'currency' ? (value !== null && value !== undefined ? Number(value).toFixed(2) : '') : (value?.toString() || '')}
                                  onChange={(e) => {
                                    if (col.isNdcInput) {
                                      const raw = e.target.value;
                                      handleFieldChange(col.key as keyof ScanRow, raw, realIndex);
                                      return;
                                    }

                                    const newValue = col.type === 'number' || col.type === 'currency'
                                      ? (e.target.value ? parseFloat(e.target.value) : null)
                                      : e.target.value;
                                    handleFieldChange(col.key as keyof ScanRow, newValue, realIndex);
                                  }}
                                  onKeyDown={getKeyDownHandler()}
                                  onFocus={() => setActiveRowIndex(realIndex)}
                                  type={col.isNdcInput ? 'text' : (col.type === 'number' || col.type === 'currency' ? 'number' : 'text')}
                                  step={col.type === 'currency' ? '0.01' : undefined}
                                  placeholder={col.type === 'currency' ? '$0.00' : undefined}
                                  disabled={!selectedSection}
                                  className="font-mono h-8 text-xs border-0 focus-visible:ring-1 min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                              </TableCell>
                            );
                          }
                          
                          // Cell validation styling (non-editable cells)
                          const isEmptyNonEditable = value === null || value === undefined || value === '';
                          const hasNdcNonEditable = !!(row.ndc || row.scannedNdc);
                          
                          // QTY, MIS Divisor, MIS Count Method - yellow if empty
                          const isRequiredFieldNonEditable = ['qty', 'misDivisor', 'misCountMethod'].includes(col.key);
                          const shouldHighlightRequiredNonEditable = isRequiredFieldNonEditable && isEmptyNonEditable && hasNdcNonEditable;
                          
                          // Med Desc / Meridian Desc logic
                          const isMedDescEmptyNonEditable = !row.medDesc || row.medDesc.trim() === '';
                          const isMeridianDescEmptyNonEditable = !row.meridianDesc || row.meridianDesc.trim() === '';
                          const bothDescEmptyNonEditable = isMedDescEmptyNonEditable && isMeridianDescEmptyNonEditable;
                          const isDescFieldNonEditable = col.key === 'medDesc' || col.key === 'meridianDesc';
                          
                          // Red if both are empty, Yellow if only this one is empty
                          let descCellStyleNonEditable = '';
                          if (isDescFieldNonEditable && hasNdcNonEditable) {
                            if (bothDescEmptyNonEditable) {
                              descCellStyleNonEditable = 'bg-red-200 dark:bg-red-900/50';
                            } else if ((col.key === 'medDesc' && isMedDescEmptyNonEditable) || (col.key === 'meridianDesc' && isMeridianDescEmptyNonEditable)) {
                              descCellStyleNonEditable = 'bg-yellow-200 dark:bg-yellow-900/50';
                            }
                          }
                          
                          // Cost fields styling based on SOURCE (non-editable)
                          const isCostFieldNonEditable = ['packCost', 'unitCost', 'extended'].includes(col.key);
                          let costCellStyleNonEditable = '';
                          if (isCostFieldNonEditable && hasNdcNonEditable) {
                            const sourceValNonEditable = row.source || '';
                            if (sourceValNonEditable === '') {
                              costCellStyleNonEditable = 'bg-yellow-200 dark:bg-yellow-900/50';
                            } else if (sourceValNonEditable.toUpperCase().startsWith('MIS')) {
                              costCellStyleNonEditable = 'bg-gray-200 dark:bg-gray-700/50';
                            }
                          }
                          
                          // Highlight audit criteria when it has "need attention"
                          const isAuditAttentionCell = col.key === 'auditCriteria' && typeof value === 'string' && value.includes('need attention');
                          
                          return (
                            <TableCell 
                              key={col.key} 
                              className={`text-xs ${row.source === 'not_found' && (col.key === 'medDesc' || col.key === 'source') ? 'text-destructive' : ''} ${shouldHighlightRequiredNonEditable ? 'bg-yellow-200 dark:bg-yellow-900/50' : ''} ${descCellStyleNonEditable} ${costCellStyleNonEditable} ${isAuditAttentionCell ? 'bg-orange-200 dark:bg-orange-900/50 font-medium' : ''}`}
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
          </TabsContent>
          
          <TabsContent value="summary" className="mt-0">
            <ScanSummaryTab 
              scanRows={scanRows}
              sections={sections}
              allSectionRecords={allSectionRecords}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Section Dialog */}
      <Dialog open={addSectionDialogOpen} onOpenChange={setAddSectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Section Code</label>
              <Input
                placeholder="e.g., 0001"
                value={newSectionCode}
                onChange={(e) => setNewSectionCode(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="e.g., Topicals-EENT"
                value={newSectionDesc}
                onChange={(e) => setNewSectionDesc(e.target.value)}
              />
            </div>
            {availableCostSheets.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Cost Sheet</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      {newSectionCostSheet || 'Select cost sheet...'}
                      <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-full min-w-[200px]">
                    <DropdownMenuItem onClick={() => setNewSectionCostSheet(null)}>
                      <span className="text-muted-foreground">None</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {availableCostSheets.map((sheet) => (
                      <DropdownMenuItem
                        key={sheet}
                        onClick={() => setNewSectionCostSheet(sheet)}
                      >
                        {sheet}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-xs text-muted-foreground">
                  Choose which cost data tab to use for pricing in this section
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSectionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSection}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Section Dialog */}
      <Dialog open={renameSectionDialogOpen} onOpenChange={setRenameSectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Section Code</label>
              <Input
                value={sections.find(s => s.id === editingSectionId)?.sect || ''}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="e.g., Topicals-EENT"
                value={editingSectionDesc}
                onChange={(e) => setEditingSectionDesc(e.target.value)}
              />
            </div>
            {availableCostSheets.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Cost Sheet</label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      {editingSectionCostSheet || 'Select cost sheet...'}
                      <ChevronDown className="h-4 w-4 ml-2 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-full min-w-[200px]">
                    <DropdownMenuItem onClick={() => setEditingSectionCostSheet(null)}>
                      <span className="text-muted-foreground">None</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {availableCostSheets.map((sheet) => (
                      <DropdownMenuItem
                        key={sheet}
                        onClick={() => setEditingSectionCostSheet(sheet)}
                      >
                        {sheet}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-xs text-muted-foreground">
                  Choose which cost data tab to use for pricing in this section
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameSectionDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSection}>
              <Check className="h-4 w-4 mr-1" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Outer NDC Selection Dialog */}
      <OuterNDCSelectionDialog
        open={outerNDCDialogOpen}
        onOpenChange={setOuterNDCDialogOpen}
        scannedNDC={pendingNDCLookup?.scannedNDC || ''}
        options={outerNDCOptions}
        onSelect={handleOuterNDCSelect}
        onCancel={handleOuterNDCCancel}
      />

      {/* Cost Data Lookup Dialog */}
      <CostDataLookupDialog
        open={costLookupDialogOpen}
        onOpenChange={setCostLookupDialogOpen}
        templateId={selectedTemplate?.id || null}
      />
    </AppLayout>
  );
};

export default Scan;
