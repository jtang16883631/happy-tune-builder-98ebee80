import { useAuth } from '@/contexts/AuthContext';
import { useOnlineStatus } from '@/components/OfflineRedirect';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ScanBarcode, ArrowLeft, Plus, Trash2, Calendar, FileText, AlertCircle, ChevronDown, Edit2, Check, X, CloudOff, Download, GripVertical, Eye, EyeOff, Settings2, FileUp, Cloud, RefreshCw, Search, Calculator, DollarSign, ShieldCheck, BarChart3, HardDrive, Smartphone } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import * as XLSX from 'xlsx-js-style';
import { getCellValidationColor, getCellValidationClasses, applyValidationStylesToWorksheet, applyExcelHeaderAndDataStyles } from '@/lib/cellValidation';
import { applyExcelFormulas, applySummaryFormulas, COLUMN_INDICES, getColLetter } from '@/lib/excelFormulas';
import { buildValidationData, createValidationWorksheet, addSummaryHyperlinks } from '@/lib/excelValidationTab';
import { createStyledSummarySheet } from '@/lib/excelSummarySheet';
import { injectImageIntoXlsx, fetchLogoImageData, hideGridlinesInXlsx } from '@/lib/excelImageInject';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useCloudTemplates, CloudTemplate, CloudSection, TemplateStatus } from '@/hooks/useCloudTemplates';
import { useOfflineTemplates, OfflineTemplate } from '@/hooks/useOfflineTemplates';
import { useLocalFDA, FDADrug } from '@/hooks/useLocalFDA';
import { SyncButton } from '@/components/scanner/SyncButton';
import { DeviceSyncDialog } from '@/components/scanner/DeviceSyncDialog';
import { ManageDeviceDialog } from '@/components/scanner/ManageDeviceDialog';
import { OuterNDCSelectionDialog, OuterNDCOption } from '@/components/scanner/OuterNDCSelectionDialog';
import { CostDataLookupDialog } from '@/components/scanner/CostDataLookupDialog';
import { ScanSummaryTab } from '@/components/scanner/ScanSummaryTab';
import { FlashDriveTransferDialog } from '@/components/scanner/FlashDriveTransferDialog';
import { SectionPasswordDialog } from '@/components/scanner/SectionPasswordDialog';
import { QuickClockPanel } from '@/components/timesheet/QuickClockPanel';
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
import { saveScanRecords, loadScanRecords, deleteScanRecords, loadManyScanRecords } from '@/lib/scanRecordsDB';
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
  expirationDate: string;
  lotNumber: string;
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
  // Single source of truth for connectivity (uses backend ping, not just navigator.onLine)
  const isOnline = useOnlineStatus();
  
   // REC is now generated based on row index (1-based), no counter needed
  
  // User's short name for REC (e.g., "JiaweiT")
  // Synchronous init from localStorage so cold-start first render already has the name
  const [userShortName, setUserShortName] = useState(() => {
    return localStorage.getItem('cached_user_short_name') || '';
  });
  
  // Prompt user for name if cache is empty (cold start without prior online session)
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [namePromptValue, setNamePromptValue] = useState('');
  
  // Column visibility state - hide the new columns by default except REC
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set([
    'device', 'trade', 'generic', 'strength', 'sizeTxt', 'doseForm', 
    'genericCode', 'deaClass', 'ahfs', 'expirationDate', 'lotNumber'
  ]));
  
  // Custom columns added by user
  const [customColumns, setCustomColumns] = useState<{ key: string; label: string }[]>([]);
  const [showAddColumnDialog, setShowAddColumnDialog] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');

  // Column widths state for resizable columns
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  
  // Fetch user profile for short name - with offline caching
  useEffect(() => {
    const CACHE_KEY = 'cached_user_short_name';
    
    const fetchUserProfile = async () => {
      // If we already have a name from synchronous init, skip cache read
      if (!userShortName) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          setUserShortName(cached);
        }
      }

      // If we're offline or have no user, the cached/init value is sufficient
      if (!navigator.onLine || !user?.id) {
        console.log(`[Scan] REC cold-start: userShortName="${userShortName}", offline=${!navigator.onLine}`);
        return;
      }
      
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('first_name, last_name, full_name')
          .eq('id', user.id)
          .maybeSingle();
        
        if (error || !profile) return; // keep cached value

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
        if (shortName) {
          localStorage.setItem(CACHE_KEY, shortName);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
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
    isReady: offlineDbReady,
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
    addSection: offlineAddSection,
    updateSection: offlineUpdateSection,
    deleteSection: offlineDeleteSection,
    deleteLocalTemplate,
    getTemplateCostItemCount,
  } = useOfflineTemplates(isOnline);
  
  const { lookupNDC: fdaLookup, checkIsInnerPack, findOuterCandidates, getDrugByOuterNDC } = useLocalFDA();

  // State for download to device dialog
  const [deviceSyncDialogOpen, setDeviceSyncDialogOpen] = useState(false);
  // State for manage device dialog
  const [manageDeviceDialogOpen, setManageDeviceDialogOpen] = useState(false);
  // State for flash drive transfer dialog
  const [flashDriveDialogOpen, setFlashDriveDialogOpen] = useState(false);

  // State for outer NDC selection dialog
  const [outerNDCDialogOpen, setOuterNDCDialogOpen] = useState(false);
  const [outerNDCOptions, setOuterNDCOptions] = useState<OuterNDCOption[]>([]);
  const [pendingNDCLookup, setPendingNDCLookup] = useState<{ scannedNDC: string; rowIndex: number; scannedDrug?: FDADrug | null } | null>(null);
  
  // State for last scan info display (passive, no dialog) - global across all templates
  const [lastScanInfo, setLastScanInfo] = useState<{
    templateId: string;
    templateName: string;
    sectionId: string;
    sectionName: string;
  } | null>(null);
  
  // State for current template's last scan (specific to selected template)
  const [currentTemplateLastScan, setCurrentTemplateLastScan] = useState<{
    sectionId: string;
    sectionName: string;
  } | null>(null);

  // Use cloud templates when online, offline templates when offline.
  // IMPORTANT: When online but cloud templates are still loading/empty (e.g. auth in progress),
  // fall back to offline templates to prevent flash of empty state on cold start.
  const templates = useMemo(() => {
    if (!isOnline) return offlineTemplates as unknown as CloudTemplate[];
    if (cloudTemplates.length > 0) return cloudTemplates;
    // Online but cloud empty — use offline templates as fallback while loading
    if ((offlineTemplates as unknown as CloudTemplate[]).length > 0) {
      return offlineTemplates as unknown as CloudTemplate[];
    }
    return cloudTemplates;
  }, [isOnline, cloudTemplates, offlineTemplates]);
  const templateSource = isOnline && cloudTemplates.length > 0 ? 'cloud' : (offlineTemplates as unknown as CloudTemplate[]).length > 0 ? 'offline' : 'cloud';
  console.log(`[Scan] isOnline=${isOnline}, offlineLoading=${offlineLoading}, offlineDbReady=${offlineDbReady}, templates.length=${templates.length}, source=${templateSource}`);
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

  // Password-gated section management
  const [sectionPasswordOpen, setSectionPasswordOpen] = useState(false);
  const [pendingSectionAction, setPendingSectionAction] = useState<(() => void) | null>(null);
  const [sectionActionLabel, setSectionActionLabel] = useState('');
  const [deleteSectionDialogOpen, setDeleteSectionDialogOpen] = useState(false);
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null);
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
    expirationDate: '',
    lotNumber: '',
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
  const [activeColKey, setActiveColKey] = useState<string | null>(null);
  
  // Multi-cell selection state (Excel-like range selection)
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: string } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ row: number; col: string } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  
  const ndcInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const qtyInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Refs for all cell inputs keyed by "rowIndex-colKey"
  const cellInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Collect all section records from IndexedDB for summary
  const [allSectionRecords, setAllSectionRecords] = useState<Record<string, ScanRow[]>>({});
  
  // Reload allSectionRecords whenever scanRows or sections change
  useEffect(() => {
    if (!selectedTemplate || sections.length === 0) {
      setAllSectionRecords({});
      return;
    }
    
    let cancelled = false;
    const load = async () => {
      const sectionIds = sections.map(s => s.id);
      const records = await loadManyScanRecords<ScanRow>(selectedTemplate.id, sectionIds);
      
      // Also include the current in-memory scanRows for the active section
      if (selectedSection) {
        const activeRows = scanRows.filter(r => r.ndc || r.scannedNdc);
        if (activeRows.length > 0) {
          records[selectedSection.id] = activeRows;
        }
      }
      
      if (!cancelled) setAllSectionRecords(records);
    };
    load();
    return () => { cancelled = true; };
  }, [selectedTemplate, sections, scanRows, selectedSection]);

  // Calculate current section total (Scan tab header value next to "Extended")
  const sectionExtendedTotal = useMemo(() => {
    return scanRows.reduce((sum, row) => {
      // Only include real scanned rows
      if (!row.ndc && !row.scannedNdc) return sum;
      if (typeof row.extended !== 'number' || Number.isNaN(row.extended)) return sum;
      return sum + row.extended;
    }, 0);
  }, [scanRows]);

  const hasRole = roles.length > 0 || !isOnline;

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

  // Check for last scan location on initial load (passive display only)
  useEffect(() => {
    // Wait for BOTH cloud and offline loading to complete before checking
    const isStillLoading = (isOnline && (templatesLoading || authLoading)) || offlineLoading;
    if (isStillLoading || selectedTemplate) return;
    // Also wait until templates are actually populated (prevents premature empty check)
    if (templates.length === 0) return;
    
    const savedLocation = localStorage.getItem('last_scan_location');
    if (savedLocation) {
      try {
        const parsed = JSON.parse(savedLocation);
        // Verify the template still exists
        const templateExists = templates.some(t => t.id === parsed.templateId);
        if (templateExists && parsed.templateId && parsed.sectionName) {
          setLastScanInfo(parsed);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, [templatesLoading, authLoading, offlineLoading, isOnline, selectedTemplate, templates]);

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

  // Auto-save with debounce - using IndexedDB for scan records (per template + section)
  useEffect(() => {
    if (!selectedTemplate || !selectedSection) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const recordsToSave = scanRows
        .filter(r => r.ndc || r.scannedNdc)
        .map(r => ({ ...r, id: undefined }));
      
      // Save per template + section combination to IndexedDB
      saveScanRecords(selectedTemplate.id, selectedSection.id, recordsToSave).catch(err => {
        console.error('Failed to save scan records to IndexedDB:', err);
      });
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [scanRows, selectedTemplate, selectedSection]);

  // Load scan records when section changes (async from IndexedDB)
  const loadSectionRecords = useCallback(async (templateId: string, sectionId: string, sectionName: string) => {
    try {
      const savedRecords = await loadScanRecords<Omit<ScanRow, 'id'>>(templateId, sectionId);
      
      if (savedRecords && savedRecords.length > 0) {
        const rows: ScanRow[] = savedRecords.map(r => ({
          ...createEmptyRow(sectionName),
          ...r,
          id: crypto.randomUUID(),
        }));
        rows.push(createEmptyRow(sectionName));
        setScanRows(rows);
        setActiveRowIndex(rows.length - 1);
      } else {
        setScanRows([createEmptyRow(sectionName)]);
        setActiveRowIndex(0);
      }
    } catch (err) {
      console.error('Failed to load scan records from IndexedDB:', err);
      setScanRows([createEmptyRow(sectionName)]);
      setActiveRowIndex(0);
    }
  }, [createEmptyRow]);

  // Handle section selection - load records for this section + save last scan location
  const handleSelectSection = useCallback((section: CloudSection) => {
    if (!selectedTemplate) return;
    setSelectedSection(section);
    loadSectionRecords(selectedTemplate.id, section.id, section.full_section || '');
    
    // Save last scan location to localStorage (global for template selection page)
    localStorage.setItem('last_scan_location', JSON.stringify({
      templateId: selectedTemplate.id,
      templateName: selectedTemplate.name,
      sectionId: section.id,
      sectionName: section.full_section || section.sect,
    }));
    
    // Also save per-template last scan location
    localStorage.setItem(`last_scan_section_${selectedTemplate.id}`, JSON.stringify({
      sectionId: section.id,
      sectionName: section.full_section || section.sect,
    }));
    
    // Update current template's last scan state
    setCurrentTemplateLastScan({
      sectionId: section.id,
      sectionName: section.full_section || section.sect,
    });
  }, [selectedTemplate, loadSectionRecords]);

  // Load current template's last scan when template changes
  useEffect(() => {
    if (!selectedTemplate) {
      setCurrentTemplateLastScan(null);
      return;
    }
    
    const savedSection = localStorage.getItem(`last_scan_section_${selectedTemplate.id}`);
    if (savedSection) {
      try {
        const parsed = JSON.parse(savedSection);
        setCurrentTemplateLastScan(parsed);
      } catch {
        setCurrentTemplateLastScan(null);
      }
    } else {
      setCurrentTemplateLastScan(null);
    }
  }, [selectedTemplate]);

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
      if (isOnline) {
        // Online: query Supabase
        const { data: costData, error: costError } = await supabase
          .from('template_cost_items')
          .select('sheet_name')
          .eq('template_id', templateId)
          .not('sheet_name', 'is', null)
          .limit(2000);

        if (costError) throw costError;

        const { data: sectionData, error: sectionError } = await supabase
          .from('template_sections')
          .select('cost_sheet')
          .eq('template_id', templateId)
          .not('cost_sheet', 'is', null);

        if (sectionError) console.error('Error loading section sheets:', sectionError);

        const costSheets = (costData || []).map((d: any) => d.sheet_name).filter(Boolean);
        const sectionSheets = (sectionData || []).map((d: any) => d.cost_sheet).filter(Boolean);
        const uniqueSheets = [...new Set([...costSheets, ...sectionSheets])] as string[];
        setAvailableCostSheets(uniqueSheets);
      } else {
        // Offline: get unique sheet names from local sections
        const sectionData = await offlineGetSections(templateId);
        const sectionSheets = sectionData.map(s => s.cost_sheet).filter(Boolean) as string[];
        const uniqueSheets = [...new Set(sectionSheets)];
        setAvailableCostSheets(uniqueSheets);
      }
    } catch (err) {
      console.error('Error loading cost sheets:', err);
      setAvailableCostSheets([]);
    }
  }, [isOnline, offlineGetSections]);

  // Handle resume last scan
  const handleResumeLastScan = useCallback(async () => {
    if (!lastScanInfo) return;
    
    // Find the template
    const template = templates.find(t => t.id === lastScanInfo.templateId);
    if (!template) {
      toast.error('Template no longer exists');
      setLastScanInfo(null);
      return;
    }
    
    // Select the template
    setSelectedTemplate(template);
    
    // Load sections and cost sheets
    setSectionsLoading(true);
    try {
      const [sectionData] = await Promise.all([
        getSections(template.id),
        loadAvailableCostSheets(template.id),
      ]);
      setSections(sectionData);
      
      // Find and select the section
      const section = sectionData.find(s => s.id === lastScanInfo.sectionId);
      if (section) {
        setSelectedSection(section);
        loadSectionRecords(template.id, section.id, section.full_section || '');
        toast.success(`Resumed: ${template.name} → ${section.full_section || section.sect}`);
        // Re-save location since we're resuming (update timestamp implicitly)
        localStorage.setItem('last_scan_location', JSON.stringify({
          templateId: template.id,
          templateName: template.name,
          sectionId: section.id,
          sectionName: section.full_section || section.sect,
        }));
      } else {
        toast.info(`Section no longer exists, but template "${template.name}" is selected`);
      }
    } catch (err) {
      console.error('Error resuming last scan:', err);
      toast.error('Failed to resume last scan');
    } finally {
      setSectionsLoading(false);
    }
    
    setLastScanInfo(null);
  }, [lastScanInfo, templates, getSections, loadAvailableCostSheets, loadSectionRecords]);

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
      
      if (isOnline) {
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
      } else {
        const result = await offlineAddSection(
          selectedTemplate.id,
          paddedCode,
          newSectionDesc.trim(),
          fullSection,
          newSectionCostSheet
        );
        if (!result.success) throw new Error(result.error);
      }

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
      
      if (isOnline) {
        const { error } = await supabase
          .from('template_sections')
          .update({
            description: editingSectionDesc.trim(),
            full_section: newFullSection,
            cost_sheet: editingSectionCostSheet,
          })
          .eq('id', editingSectionId);
        if (error) throw error;
      } else {
        const result = await offlineUpdateSection(editingSectionId, {
          description: editingSectionDesc.trim(),
          full_section: newFullSection,
          cost_sheet: editingSectionCostSheet,
        });
        if (!result.success) throw new Error(result.error);
      }

      // Update LOC in current scan records if they match the old section name
      setScanRows(prev => prev.map(row => {
        if (row.loc === oldFullSection) {
          return { ...row, loc: newFullSection };
        }
        return row;
      }));

      // Also update IndexedDB records for this section
      if (selectedTemplate) {
        try {
          const savedRecords = await loadScanRecords(selectedTemplate.id, editingSectionId);
          if (savedRecords) {
            const updatedRecords = savedRecords.map((r: any) => ({
              ...r,
              loc: r.loc === oldFullSection ? newFullSection : r.loc
            }));
            await saveScanRecords(selectedTemplate.id, editingSectionId, updatedRecords);
          }
        } catch (e) {
          console.error('Error updating IndexedDB records:', e);
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

  // Password gate helper
  const requirePassword = (label: string, action: () => void) => {
    setSectionActionLabel(label);
    setPendingSectionAction(() => action);
    setSectionPasswordOpen(true);
  };

  // Delete section handler
  const handleDeleteSection = async () => {
    if (!deletingSectionId || !selectedTemplate) return;
    try {
      if (isOnline) {
        // Delete scan records for this section first
        await supabase
          .from('scan_records')
          .delete()
          .eq('section_id', deletingSectionId);

        const { error } = await supabase
          .from('template_sections')
          .delete()
          .eq('id', deletingSectionId);

        if (error) throw error;
      } else {
        const result = await offlineDeleteSection(deletingSectionId);
        if (!result.success) throw new Error(result.error);
      }

      // Also clear IndexedDB scan records for this section
      await deleteScanRecords(selectedTemplate.id, deletingSectionId);

      toast.success('Section deleted successfully');
      setDeleteSectionDialogOpen(false);
      setDeletingSectionId(null);

      // Clear selection if deleted section was selected
      if (selectedSection?.id === deletingSectionId) {
        setSelectedSection(null);
      }

      await loadSections(selectedTemplate.id);
    } catch (err: any) {
      toast.error('Failed to delete: ' + err.message);
    }
  };

  // Generate REC value based on row index (1-based)
  const generateRecForRow = useCallback((rowIndex: number) => {
    const rowNum = rowIndex + 1; // 1-based row number
    const name = userShortName || localStorage.getItem('cached_user_short_name') || '';
    return `${name}${String(rowNum).padStart(3, '0')}`;
  }, [userShortName]);

  // Keep REC prefixes synced after cold-start name entry, including late async row updates.
  useEffect(() => {
    if (!userShortName) return;

    setScanRows(prev => {
      const next = prev.map((row, i) => {
        if (!row.rec) return row;
        const expected = `${userShortName}${String(i + 1).padStart(3, '0')}`;
        return row.rec === expected ? row : { ...row, rec: expected };
      });

      const changed = next.some((row, i) => row !== prev[i]);
      return changed ? next : prev;
    });
  }, [userShortName, scanRows]);

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
  const lookupNDC = useCallback(async (finalNdc: string, scannedNdc: string, rowIndex: number, scannedDrugData?: FDADrug | null) => {
    if (!finalNdc || finalNdc.length < 10 || !selectedTemplate) return;

    const cleanNdc = finalNdc.replace(/-/g, '').replace(/\D/g, '');
    const originalScanned = scannedNdc.replace(/-/g, '').replace(/\D/g, '');
    
    console.log('[lookupNDC] finalNdc (outer):', cleanNdc, '| scannedNdc (original):', originalScanned);
    
    // First try to look up the outer NDC in FDA
    let fdaResult = fdaLookup(cleanNdc);
    
    // If outer NDC not found in FDA but we have scanned drug data (from inner pack lookup),
    // use that data instead - the outer NDC might not exist as its own row
    if (!fdaResult && scannedDrugData) {
      console.log('[lookupNDC] Outer NDC not found in FDA, using scanned drug data for metadata');
      fdaResult = scannedDrugData;
    }
    
    console.log('[lookupNDC] fdaResult found:', !!fdaResult, '| cleanNdc !== originalScanned:', cleanNdc !== originalScanned);
    
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
      // Populate NDC column with the resolved outer NDC when it differs from scanned
      const outerNdcIsDifferent = cleanNdc !== originalScanned;
      
      console.log('[lookupNDC] Setting NDC column:', {
        cleanNdc,
        originalScanned,
        outerNdcIsDifferent,
        willSetNdcTo: outerNdcIsDifferent ? cleanNdc : ''
      });
      
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

  // Fallback lookup when FDA doesn't have the NDC - try cost data directly
  const lookupCostDataOnly = useCallback(async (scannedNdc: string, rowIndex: number): Promise<boolean> => {
    if (!scannedNdc || !selectedTemplate) return false;
    
    const cleanNdc = scannedNdc.replace(/\D/g, '');
    
    // Try to get cost item using the scanned NDC directly
    const costItem = await getCostItemByNDC(selectedTemplate.id, cleanNdc, selectedSection?.cost_sheet ?? null);
    
    if (!costItem) {
      return false;
    }
    
    console.log('[Cost Lookup] Found cost item for NDC:', cleanNdc, costItem);
    
    // Extract data from cost item
    const itemNumber = costItem?.material || '';
    const medDesc = costItem?.material_description || '';
    const manufacturer = costItem?.manufacturer || '';
    const generic = costItem?.generic || '';
    const strength = costItem?.strength || '';
    const packSz = costItem?.size || '';
    const doseForm = costItem?.dose || '';
    const source = costItem?.source || '';
    const packCost = costItem?.unit_price !== null && costItem?.unit_price !== undefined 
      ? Number(costItem.unit_price) 
      : null;
    
    const rec = generateRecForRow(rowIndex);
    
    setScanRows(prev => {
      const updated = [...prev];
      updated[rowIndex] = {
        ...updated[rowIndex],
        ndc: '', // No outer NDC mapping found
        scannedNdc: scannedNdc.replace(/\D/g, ''),
        rec,
        device: '',
        time: new Date().toLocaleTimeString(),
        itemNumber,
        medDesc,
        meridianDesc: '', // No FDA data
        trade: '',
        generic,
        strength,
        packSz,
        fdaSize: '',
        sizeTxt: '',
        doseForm,
        packCost,
        source,
        misDivisor: null,
        unitCost: null,
        extended: null,
        manufacturer,
        genericCode: '',
        deaClass: '',
        ahfs: '',
        misCountMethod: '',
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
    
    return true;
  }, [getCostItemByNDC, selectedTemplate, selectedSection, generateRecForRow, createEmptyRow]);

  // Initiate NDC lookup with IO-based outer NDC selection logic:
  // Step A: Check IO column (X) - if IO = "O", use scanned NDC directly; if IO = "I", go to Step B
  // Step B: If IO == "I", compute outerKey = left9 + "O" and search FDA column AD (ndc9_outer)
  // Step C: Based on AD search count - 0: no popup, keep scanned; 1: auto-use the matched AE (outerpack_ndc); >1: popup to select AE
  const initiateNDCLookup = useCallback(async (scannedNdc: string, rowIndex: number): Promise<boolean> => {
    // Prompt for name if missing (cold start without prior online session)
    if (!userShortName && !localStorage.getItem('cached_user_short_name')) {
      setShowNamePrompt(true);
    }
    const cleanNdc = (scannedNdc ?? '').replace(/\D/g, '');

    // Helper to set TIME, REC, and scannedNdc
    const setTimeAndRec = () => {
      setScanRows(prev => {
        const updated = [...prev];
        updated[rowIndex] = {
          ...updated[rowIndex],
          scannedNdc: cleanNdc || scannedNdc,
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
      setTimeAndRec();
      toast.error('Invalid NDC', {
        description: `Scanned value: ${scannedNdc}`,
        duration: 5000,
      });
      return false;
    }

    console.log('[NDC Lookup] Starting IO-based lookup for:', cleanNdc);

    // Step A: Look up scanned NDC in FDA to check IO column (column X)
    const { isInner, drug: scannedDrug } = checkIsInnerPack(cleanNdc);
    const ioValue = scannedDrug?.io?.toString().toUpperCase().trim() || '';
    console.log('[NDC Lookup] IO value:', ioValue, '| isInner:', isInner, '| drug found:', !!scannedDrug);

    // Step A: If IO = "O" (Outer pack), use scanned NDC directly - no dialog
    if (ioValue === 'O') {
      console.log('[NDC Lookup] IO = "O", using scanned NDC directly');
      await lookupNDC(cleanNdc, cleanNdc, rowIndex);
      return true;
    }

    // If IO is not "I", also use scanned NDC directly (treat as outer or unknown)
    if (!isInner) {
      console.log('[NDC Lookup] IO is not "I", using scanned NDC directly');
      
      if (scannedDrug) {
        await lookupNDC(cleanNdc, cleanNdc, rowIndex);
        return true;
      } else {
        const costFound = await lookupCostDataOnly(scannedNdc, rowIndex);
        if (costFound) {
          toast.success('NDC found in cost data', {
            description: `No FDA entry, but found in cost data: ${cleanNdc}`,
            duration: 4000,
          });
          return true;
        }
        setTimeAndRec();
        toast.error('NDC not found', {
          description: `Not in FDA or cost data: ${cleanNdc}`,
          duration: 6000,
        });
        return false;
      }
    }

    // Step B: IO == "I" (Inner Pack) - ALWAYS compute left9+"O" and search AD (ndc9_outer)
    console.log('[NDC Lookup] IO = "I" (Inner Pack), searching AD (ndc9_outer) by left9+O');

    const { candidates, outerNDCs } = findOuterCandidates(cleanNdc);
    console.log('[NDC Lookup] AD search found', outerNDCs.length, 'outer NDC candidates');

    // Case 1: 0 candidates -> no popup, keep scanned NDC and continue with existing fallback behavior
    if (outerNDCs.length === 0) {
      console.log('[NDC Lookup] No outer candidates found from AD search; using scanned NDC');
      if (scannedDrug) {
        await lookupNDC(cleanNdc, cleanNdc, rowIndex);
        toast.warning('No outer pack mapping', {
          description: `Using scanned: ${cleanNdc}`,
          duration: 5000,
        });
        return true;
      }

      setTimeAndRec();
      const costFound = await lookupCostDataOnly(scannedNdc, rowIndex);
      if (costFound) {
        toast.warning('No outer pack mapping', {
          description: `Using scanned: ${cleanNdc}`,
          duration: 5000,
        });
        return true;
      }

      toast.error('NDC not found', {
        description: `Inner pack with no outer mapping: ${cleanNdc}`,
        duration: 6000,
      });
      return false;
    }

    // Case 2: 1 candidate -> no popup, auto-convert to that AE (outerpack_ndc)
    if (outerNDCs.length === 1) {
      const finalOuterNDC = outerNDCs[0];
      console.log('[NDC Lookup] Single outer candidate; auto-selecting:', finalOuterNDC);
      await lookupNDC(finalOuterNDC, cleanNdc, rowIndex, scannedDrug);
      toast.success(`Outer NDC: ${finalOuterNDC}`);
      return true;
    }

    // Case 3: >1 candidates -> MUST popup with all AE options
    console.log('[NDC Lookup] Multiple outer candidates; showing picker dialog for', outerNDCs.length, 'options');

    const options: OuterNDCOption[] = outerNDCs.map((outerNDC) => {
      const matchByAE = (d: FDADrug) => {
        const digits = String(d?.outerpack_ndc ?? '').replace(/\D/g, '');
        const normalized = digits.length >= 11 ? digits.slice(0, 11) : digits.padStart(11, '0');
        return normalized === outerNDC;
      };
      const drug = candidates.find(matchByAE) || getDrugByOuterNDC(outerNDC);
      
      return {
        outerNDC,
        trade: drug?.trade || null,
        generic: drug?.generic || null,
        strength: drug?.strength || null,
        packageSize: drug?.package_size || null,
        manufacturer: drug?.manufacturer || null,
        doseForm: drug?.dose_form || null,
        meridianDesc: drug?.meridian_desc || null,
        fdaSize: drug?.fda_size || null,
      };
    });

    setOuterNDCOptions(options);
    setPendingNDCLookup({ scannedNDC: cleanNdc, rowIndex, scannedDrug });
    setOuterNDCDialogOpen(true);

    return false; // Waiting for user selection
  }, [checkIsInnerPack, findOuterCandidates, getDrugByOuterNDC, lookupNDC, generateRecForRow, lookupCostDataOnly]);


  // Handle outer NDC selection from dialog
  const handleOuterNDCSelect = useCallback(async (selectedOuterNDC: string) => {
    if (!pendingNDCLookup) return;
    
    const { scannedNDC, rowIndex, scannedDrug } = pendingNDCLookup;
    
    setOuterNDCDialogOpen(false);
    setOuterNDCOptions([]);
    setPendingNDCLookup(null);
    
    // Pass scannedDrug so lookupNDC can use it for metadata if outer NDC doesn't exist in FDA
    await lookupNDC(selectedOuterNDC, scannedNDC, rowIndex, scannedDrug);
    
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
  // When scannedNdc is changed, clear all previous lookup data so stale info doesn't persist
  const handleFieldChange = (field: keyof ScanRow, value: string | number | null, rowIndex: number) => {
    setScanRows(prev => {
      const updated = [...prev];
      let row = { ...updated[rowIndex], [field]: value };
      
      // If scannedNdc is being changed, clear all NDC-derived metadata
      if (field === 'scannedNdc') {
        row = {
          ...row,
          ndc: '',
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
          misDivisor: null,
        };
      }
      
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
      
      // Move to next row's Priced NDC/UPC field
      setTimeout(() => {
        cellInputRefs.current.get(`${rowIndex + 1}-scannedNdc`)?.focus();
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

      // First pass: calculate grand total for all sections (from IndexedDB)
      let calculatedGrandTotal = 0;
      const allRecordsForExport = await loadManyScanRecords<ScanRow>(selectedTemplate.id, sections.map(s => s.id));
      for (const section of sections) {
        const savedRecords = allRecordsForExport[section.id];
        if (savedRecords) {
          savedRecords.forEach(record => {
            if (record.extended !== null && record.extended !== undefined) {
              calculatedGrandTotal += record.extended;
            }
          });
        }
      }

      // Column headers matching the scan page UI order
      const headers = [
        'LOC', 'Device', 'REC', 'TIME', 'Priced NDC/UPC', 'Original NDC', 'QTY', 'MIS Divisor',
        'MIS Count Method', 'Item Number', 'Med Desc', 'MERIDIAN DESC', 'TRADE',
        'GENERIC', 'STRENGTH', 'PACK SZ', 'FDA SIZE', 'SIZE TXT', 'DOSE FORM',
        'MANUFACTURER', 'GENERIC CODE', 'DEA CLASS', 'AHFS', 'SOURCE', 'Pack Cost',
        'Unit Cost', 'Extended', '', 'Sheet Type', 'Audit Criteria', 'Original QTY',
        'Auditor Initials', 'Results', 'Additional Notes', 'Expiration Date', 'Lot #'
      ];

      // Iterate through all sections
      for (const section of sections) {
        // Load scan records for this section from IndexedDB (already fetched above)
        const savedRecords = allRecordsForExport[section.id] as ScanRow[] | undefined;
        
        let rows: any[][] = [headers];
        let sectionTotal = 0;
        
        if (savedRecords && savedRecords.length > 0) {
            
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
                record.scannedNdc || '',
                record.ndc || '',
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
                '', // Unit Cost - will be formula
                '', // Extended - will be formula
                '', // SUM column placeholder
                record.sheetType || '',
                record.auditCriteria || '',
                record.originalQty ?? '',
                record.auditorInitials || '',
                record.results || '',
                record.additionalNotes || '',
                record.expirationDate || '',
                record.lotNumber || '',
              ]);
            });
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

        // Apply validation styling to cells
        applyValidationStylesToWorksheet(worksheet, rows, 1);
        applyExcelHeaderAndDataStyles(worksheet, rows);
        
        // Apply formulas for Unit Cost, Extended, and SUM
        const dataRowCount = rows.length - 1; // Exclude header
        applyExcelFormulas(worksheet, dataRowCount, 1);

        // Set column widths and hide columns B, M, N, O, R, S, U, V, W
        const hiddenCols = new Set([1, 12, 13, 14, 17, 18, 20, 21, 22]); // 0-indexed
        worksheet['!cols'] = headers.map((_, i) => ({ wch: i === 10 || i === 11 ? 30 : 15, hidden: hiddenCols.has(i) }));

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
      
      // Get section sheet names for formula references
      const sectionSheetNames = sections.map(section => {
        let sheetName = section.full_section || section.sect || 'Sheet';
        return sheetName.replace(/[\\/*?[\]:]/g, '-').substring(0, 31);
      });
      
      const summaryWorksheet = createStyledSummarySheet({
        facilityName: selectedTemplate.facility_name || '',
        templateName: selectedTemplate.name,
        dateStr,
        sectionSheetNames,
        address: selectedTemplate.address || '',
      });

      // For "Export My Scans" - only include Summary and section sheets (no Master, no Validation)
      // Clear all sheets and rebuild in correct order: Summary first, then sections
      const existingSectionSheetNames = [...workbook.SheetNames];
      const sectionSheets = { ...workbook.Sheets };
      
      // Clear workbook
      workbook.SheetNames = [];
      workbook.Sheets = {};
      
      // Add Summary first
      XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');
      
      // Add all section sheets (NO Master, NO Validation for individual export)
      existingSectionSheetNames.forEach(name => {
        XLSX.utils.book_append_sheet(workbook, sectionSheets[name], name);
      });

      // Generate filename with template name and date
      const scannerSuffix = userShortName ? `_${userShortName}` : '';
      const filename = `${selectedTemplate.name}_${dateStr}${scannerSuffix}_scan.xlsx`;

      // Inject logo into Summary sheet (index 0)
      const logoData = await fetchLogoImageData();
      let xlsxBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      // Hide gridlines on all sheets
      xlsxBuffer = await hideGridlinesInXlsx(xlsxBuffer);
      if (logoData) {
        const blob = await injectImageIntoXlsx(xlsxBuffer, logoData, 0);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success(`Exported ${sections.length} sections + Summary to Excel`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export to Excel');
    }
  }, [selectedTemplate, sections]);

  // State for cloud sync
  const [isSyncingScans, setIsSyncingScans] = useState(false);
  const [isExportingMerged, setIsExportingMerged] = useState(false);
  
  // Track previous online state to detect offline→online transitions
  const prevIsOnlineRef = useRef<boolean>(isOnline);

  // Auto-sync scans when coming back online (offline→online transition)
  useEffect(() => {
    const wasOffline = !prevIsOnlineRef.current;
    const isNowOnline = isOnline;
    prevIsOnlineRef.current = isOnline;

    // Only fire when transitioning from offline to online AND we have a selected template
    if (wasOffline && isNowOnline && selectedTemplate && user?.id && sections.length > 0) {
      // Small delay to let the connection stabilize
      const timer = setTimeout(async () => {
        const allData = await loadManyScanRecords<ScanRow>(selectedTemplate.id, sections.map(s => s.id));
        const hasAnyScanData = Object.values(allData).some(records =>
          records.some(r => r.ndc || r.scannedNdc)
        );

        if (hasAnyScanData) {
          toast.info('Back online — syncing your offline scans...', { duration: 3000 });
          await syncScansToCloudInternal(selectedTemplate, sections, user.id);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, selectedTemplate, sections, user?.id]);

  // Internal sync function (does not depend on state that changes during sync)
  const syncScansToCloudInternal = useCallback(async (
    template: CloudTemplate,
    sectionList: CloudSection[],
    userId: string
  ) => {
    setIsSyncingScans(true);
    try {
      let totalSynced = 0;

      for (const section of sectionList) {
        const savedRecords = await loadScanRecords<ScanRow>(template.id, section.id);
        if (!savedRecords) continue;

        try {
          const validRecords = savedRecords.filter(r => r.ndc || r.scannedNdc);
          if (validRecords.length === 0) continue;

          await supabase
            .from('scan_records')
            .delete()
            .eq('template_id', template.id)
            .eq('section_id', section.id)
            .eq('user_id', userId);

          const recordsToInsert = validRecords.map(r => ({
            template_id: template.id,
            section_id: section.id,
            user_id: userId,
            loc: r.loc, device: r.device, rec: r.rec, time: r.time,
            ndc: r.ndc, scanned_ndc: r.scannedNdc, qty: r.qty,
            mis_divisor: r.misDivisor, mis_count_method: r.misCountMethod,
            item_number: r.itemNumber, med_desc: r.medDesc, meridian_desc: r.meridianDesc,
            trade: r.trade, generic: r.generic, strength: r.strength,
            pack_sz: r.packSz, fda_size: r.fdaSize, size_txt: r.sizeTxt,
            dose_form: r.doseForm, manufacturer: r.manufacturer, generic_code: r.genericCode,
            dea_class: r.deaClass, ahfs: r.ahfs, source: r.source,
            pack_cost: r.packCost, unit_cost: r.unitCost, extended: r.extended,
            blank: r.blank, sheet_type: r.sheetType, audit_criteria: r.auditCriteria,
            original_qty: r.originalQty, auditor_initials: r.auditorInitials,
            results: r.results, additional_notes: r.additionalNotes,
          }));

          const { error } = await supabase.from('scan_records').insert(recordsToInsert);
          if (!error) totalSynced += validRecords.length;
        } catch (e) {
          console.error('Error syncing section:', section.id, e);
        }
      }

      if (totalSynced > 0) {
        toast.success(`Auto-synced ${totalSynced} offline scan records to cloud`);
      }
    } catch (error) {
      console.error('Auto-sync error:', error);
    } finally {
      setIsSyncingScans(false);
    }
  }, []);

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
        const savedRecords = await loadScanRecords<ScanRow>(selectedTemplate.id, section.id);
        if (!savedRecords) continue;

        try {
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

      // Track section totals for summary
      const sectionTotals: { section: string; count: number; value: number }[] = [];

      // Column headers matching the scan page UI order
      const headers = [
        'LOC', 'Device', 'REC', 'TIME', 'Priced NDC/UPC', 'Original NDC', 'QTY', 'MIS Divisor',
        'MIS Count Method', 'Item Number', 'Med Desc', 'MERIDIAN DESC', 'TRADE',
        'GENERIC', 'STRENGTH', 'PACK SZ', 'FDA SIZE', 'SIZE TXT', 'DOSE FORM',
        'MANUFACTURER', 'GENERIC CODE', 'DEA CLASS', 'AHFS', 'SOURCE', 'Pack Cost',
        'Unit Cost', 'Extended', '', 'Sheet Type', 'Audit Criteria', 'Original QTY',
        'Auditor Initials', 'Results', 'Additional Notes', 'Expiration Date', 'Lot #'
      ];
      
      // Collect all records for Master sheet
      const allMasterRows: any[][] = [];
      // Collect records by section for validation tab
      const allSectionRecordsForValidation: Record<string, any[]> = {};

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
            // Sum up Extended values for this section (for reference, actual will be formula)
            if (record.extended !== null && record.extended !== undefined) {
              sectionTotal += Number(record.extended);
            }
            
            const rowData = [
              record.loc || '',
              record.device || '',
              record.rec || '',
              record.time || '',
              record.scanned_ndc || '',
              record.ndc || '',
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
              '', // Unit Cost - will be formula
              '', // Extended - will be formula
              '', // SUM column placeholder
              record.sheet_type || '',
              record.audit_criteria || '',
              record.original_qty ?? '',
              record.auditor_initials || '',
              record.results || '',
              record.additional_notes || '',
              '', // Expiration Date (not in cloud schema yet)
              '', // Lot # (not in cloud schema yet)
            ];
            rows.push(rowData);
            allMasterRows.push(rowData);
          });
          // Store records for validation tab (convert to local format)
          allSectionRecordsForValidation[section.id] = cloudRecords.map(r => ({
            rec: r.rec,
            time: r.time,
            extended: r.extended,
          }));
        }

        // Store section total for summary
        const recordCount = cloudRecords?.length || 0;
        sectionTotals.push({
          section: section.full_section || section.sect || 'Unknown',
          count: recordCount,
          value: sectionTotal
        });

        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        // Apply validation styling to cells
        applyValidationStylesToWorksheet(worksheet, rows, 1);
        applyExcelHeaderAndDataStyles(worksheet, rows);
        // Apply formulas for Unit Cost, Extended, and SUM
        const dataRowCount = rows.length - 1;
        applyExcelFormulas(worksheet, dataRowCount, 1);
        // Hide columns B, M, N, O, R, S, U, V, W on section sheets
        const hiddenColsMerge = new Set([1, 12, 13, 14, 17, 18, 20, 21, 22]);
        worksheet['!cols'] = headers.map((_, i) => ({ wch: i === 10 || i === 11 ? 30 : 15, hidden: hiddenColsMerge.has(i) }));

        let sheetName = section.full_section || section.sect || 'Sheet';
        sheetName = sheetName.replace(/[\\/*?[\]:]/g, '-').substring(0, 31);

        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }

      // Create Summary sheet
      const dateStr = selectedTemplate.inv_date 
        ? new Date(selectedTemplate.inv_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];
      
      // Get section sheet names for formula references
      const sectionSheetNames = sections.map(section => {
        let sheetName = section.full_section || section.sect || 'Sheet';
        return sheetName.replace(/[\\/*?[\]:]/g, '-').substring(0, 31);
      });
      
      const summaryWorksheet = createStyledSummarySheet({
        facilityName: selectedTemplate.facility_name || '',
        templateName: selectedTemplate.name,
        dateStr,
        sectionSheetNames,
        address: selectedTemplate.address || '',
      });

      // Create Master sheet - combine all sections
      const masterRows: any[][] = [headers, ...allMasterRows];
      const masterWorksheet = XLSX.utils.aoa_to_sheet(masterRows);
      // Apply validation styling to master sheet
      applyValidationStylesToWorksheet(masterWorksheet, masterRows, 1);
      applyExcelHeaderAndDataStyles(masterWorksheet, masterRows);
      // Apply formulas to master sheet
      const masterDataRowCount = masterRows.length - 1;
      applyExcelFormulas(masterWorksheet, masterDataRowCount, 1);
      masterWorksheet['!cols'] = headers.map((_, i) => ({ wch: i === 10 || i === 11 ? 30 : 15 }));
      
      // Build Validation tab data
      const validationData = buildValidationData(sections, allSectionRecordsForValidation, sectionSheetNames);
      const validationWorksheet = createValidationWorksheet(
        validationData.balanceChecks,
        validationData.employeeAnalytics,
        validationData.sectionAnalytics,
        validationData.totalSheets,
        validationData.inBalance,
        11, // Summary sheet section data starts at row 11 in new layout
        sectionSheetNames // Pass sheet names for Master formula references
      );
      
      // Clear all sheets and rebuild in correct order: Summary, Master, Validation, then sections
      const existingSectionSheetNames = [...workbook.SheetNames];
      const sectionSheets = { ...workbook.Sheets };
      
      // Clear workbook
      workbook.SheetNames = [];
      workbook.Sheets = {};
      
      // Add Summary first
      XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Summary');
      
      // Add Master second
      XLSX.utils.book_append_sheet(workbook, masterWorksheet, 'Master');
      
      // Add Validation third
      XLSX.utils.book_append_sheet(workbook, validationWorksheet, 'Validation');
      
      // Add all section sheets
      existingSectionSheetNames.forEach(name => {
        XLSX.utils.book_append_sheet(workbook, sectionSheets[name], name);
      });

      const mergedScannerSuffix = userShortName ? `_${userShortName}` : '';
      const filename = `${selectedTemplate.name}_${dateStr}${mergedScannerSuffix}_merged_scan.xlsx`;

      // Inject logo into Summary sheet (index 0)
      const logoData = await fetchLogoImageData();
      let xlsxBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      // Hide gridlines on all sheets
      xlsxBuffer = await hideGridlinesInXlsx(xlsxBuffer);
      if (logoData) {
        const blob = await injectImageIntoXlsx(xlsxBuffer, logoData, 0);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([xlsxBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
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
  // Persistent storage for QTY formulas (shown on focus, like Excel formula bar)
  const [qtyFormulas, setQtyFormulas] = useState<Record<string, string>>({});
  
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
        // Store formula if it contains operators (not just a plain number)
        const sanitized = expression.trim();
        if (/[+\-*/]/.test(sanitized.replace(/^-/, '')) && sanitized !== result.toString()) {
          setQtyFormulas(prev => ({ ...prev, [rowId]: sanitized }));
        } else {
          // Plain number, remove any stored formula
          setQtyFormulas(prev => {
            const next = { ...prev };
            delete next[rowId];
            return next;
          });
        }
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

      // Store formula if it contains operators
      const sanitized2 = rawExpression.trim();
      if (/[+\-*/]/.test(sanitized2.replace(/^-/, '')) && evaluatedQty !== null && sanitized2 !== evaluatedQty.toString()) {
        setQtyFormulas(prev => ({ ...prev, [rowId]: sanitized2 }));
      }

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
        cellInputRefs.current.get(`${rowIndex + 1}-scannedNdc`)?.focus();
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

  // Static column config for navigation and paste (defined early to avoid circular dependency)
  const columnConfig: Record<string, { editable: boolean; type?: string }> = {
    loc: { editable: true },
    device: { editable: true },
    rec: { editable: true },
    time: { editable: true },
    ndc: { editable: true },
    scannedNdc: { editable: true },
    qty: { editable: true, type: 'number' },
    misDivisor: { editable: true, type: 'number' },
    misCountMethod: { editable: true },
    itemNumber: { editable: true },
    medDesc: { editable: true },
    meridianDesc: { editable: true },
    trade: { editable: true },
    generic: { editable: true },
    strength: { editable: true },
    packSz: { editable: true },
    fdaSize: { editable: true },
    sizeTxt: { editable: true },
    doseForm: { editable: true },
    manufacturer: { editable: true },
    genericCode: { editable: true },
    deaClass: { editable: true },
    ahfs: { editable: true },
    source: { editable: true },
    packCost: { editable: true, type: 'currency' },
    unitCost: { editable: true, type: 'currency' },
    extended: { editable: false, type: 'currency' },
    blank: { editable: true },
    sheetType: { editable: true },
    auditCriteria: { editable: true },
    originalQty: { editable: true, type: 'number' },
    auditorInitials: { editable: true },
    results: { editable: true },
    additionalNotes: { editable: true },
  };
  const allColumnKeys = Object.keys(columnConfig);

  // Helper to get visible column keys
  const getVisibleColKeys = useCallback(() => {
    return allColumnKeys.filter(key => !hiddenColumns.has(key));
  }, [hiddenColumns]);

  // Helper to check if a cell is within the selection range
  const isCellSelected = useCallback((rowIndex: number, colKey: string): boolean => {
    if (!selectionStart || !selectionEnd) return false;
    
    const minRow = Math.min(selectionStart.row, selectionEnd.row);
    const maxRow = Math.max(selectionStart.row, selectionEnd.row);
    
    const colKeys = getVisibleColKeys();
    const startColIdx = colKeys.indexOf(selectionStart.col);
    const endColIdx = colKeys.indexOf(selectionEnd.col);
    const currentColIdx = colKeys.indexOf(colKey);
    
    if (startColIdx === -1 || endColIdx === -1 || currentColIdx === -1) return false;
    
    const minCol = Math.min(startColIdx, endColIdx);
    const maxCol = Math.max(startColIdx, endColIdx);
    
    return rowIndex >= minRow && rowIndex <= maxRow && currentColIdx >= minCol && currentColIdx <= maxCol;
  }, [selectionStart, selectionEnd, getVisibleColKeys]);

  // Get selected cells data for copy
  const getSelectedCellsData = useCallback((): string => {
    if (!selectionStart || !selectionEnd) return '';
    
    const minRow = Math.min(selectionStart.row, selectionEnd.row);
    const maxRow = Math.max(selectionStart.row, selectionEnd.row);
    
    const colKeys = getVisibleColKeys();
    const startColIdx = colKeys.indexOf(selectionStart.col);
    const endColIdx = colKeys.indexOf(selectionEnd.col);
    
    if (startColIdx === -1 || endColIdx === -1) return '';
    
    const minCol = Math.min(startColIdx, endColIdx);
    const maxCol = Math.max(startColIdx, endColIdx);
    
    const rows: string[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const row = scanRows[r];
      if (!row) continue;
      
      const cells: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const key = colKeys[c] as keyof ScanRow;
        const val = row[key];
        cells.push(val?.toString() || '');
      }
      rows.push(cells.join('\t'));
    }
    return rows.join('\n');
  }, [selectionStart, selectionEnd, getVisibleColKeys, scanRows]);

  // Handle paste into selected cells or current cell
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    // Only handle if focus is within the table
    const activeElement = document.activeElement;
    if (!activeElement || !(activeElement instanceof HTMLInputElement)) return;
    
    // Don't intercept paste in dialogs (e.g. Cost Data Lookup search bar)
    if (activeElement.closest('[role="dialog"]')) return;
    
    // Try to extract row/col from the focused element's data attribute or ref key
    const focusedKey = Array.from(cellInputRefs.current.entries()).find(([_, el]) => el === activeElement)?.[0];
    let focusedRow = activeRowIndex;
    let focusedCol = activeColKey;
    
    if (focusedKey) {
      const [rowStr, ...colParts] = focusedKey.split('-');
      const parsedRow = parseInt(rowStr, 10);
      const parsedCol = colParts.join('-');
      if (!isNaN(parsedRow) && parsedCol) {
        focusedRow = parsedRow;
        focusedCol = parsedCol;
      }
    }
    
    // IMPORTANT: Our copy handler sets `text/plain`, not `text`
    const clipboardData =
      e.clipboardData?.getData('text/plain') ||
      e.clipboardData?.getData('text') ||
      '';
    if (!clipboardData.trim()) return;

    // Normalize newlines and keep empty cells within a row (split by tab)
    const pasteRows = clipboardData
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => line.split('\t').map(v => v.replace(/\r/g, '')));
    
    // If we have a selection, paste starting from selection start
    // Otherwise paste starting from active/focused cell
    const startRow = selectionStart?.row ?? focusedRow;
    const startColKey = selectionStart?.col ?? focusedCol;
    
    if (startColKey === null) {
      console.log('Paste failed: no column key');
      return;
    }
    
    const colKeys = getVisibleColKeys();

    // Paste should flow across editable columns only; if start is non-editable,
    // shift start to the next editable column to the right.
    const editableColKeys = colKeys.filter(k => columnConfig[k]?.editable);
    const visibleStartIdx = colKeys.indexOf(startColKey);
    if (visibleStartIdx === -1) {
      console.log('Paste failed: column not found in visible columns', startColKey);
      return;
    }

    let startEditableKey: string | null = null;
    for (let i = visibleStartIdx; i < colKeys.length; i++) {
      const k = colKeys[i];
      if (columnConfig[k]?.editable) {
        startEditableKey = k;
        break;
      }
    }
    if (!startEditableKey) {
      console.log('Paste failed: no editable columns available from start', startColKey);
      return;
    }

    const startEditableIdx = editableColKeys.indexOf(startEditableKey);
    if (startEditableIdx === -1) return;
    
    e.preventDefault();
    
    setScanRows(prev => {
      const updated = [...prev];
      
      pasteRows.forEach((pasteRow, pasteRowIdx) => {
        const targetRowIdx = startRow + pasteRowIdx;
        
        // Add new rows if needed
        while (targetRowIdx >= updated.length) {
          updated.push(createEmptyRow(selectedSection?.full_section || ''));
        }
        
        pasteRow.forEach((value, pasteColIdx) => {
          const colKeyStr = editableColKeys[startEditableIdx + pasteColIdx];
          if (!colKeyStr) return;

          const colKey = colKeyStr as keyof ScanRow;
          const colConf = columnConfig[colKey];
          if (!colConf?.editable) return;
          
          // Parse value based on column type
          let parsedValue: any = value;
          if (colConf.type === 'number' || colConf.type === 'currency') {
            const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
            parsedValue = isNaN(num) ? null : num;
          }
          
          updated[targetRowIdx] = { ...updated[targetRowIdx], [colKey]: parsedValue };
        });
      });
      
      return updated;
    });
    
    toast.success(`Pasted ${pasteRows.length} row(s)`);
  }, [selectionStart, activeRowIndex, activeColKey, getVisibleColKeys, createEmptyRow, selectedSection]);

  const getNextEditableColKey = (colKeys: string[], fromIdx: number, direction: -1 | 1) => {
    let idx = fromIdx + direction;
    while (idx >= 0 && idx < colKeys.length) {
      const key = colKeys[idx];
      if (columnConfig[key]?.editable) return key;
      idx += direction;
    }
    return null;
  };

  // Handle copy from selected cells
  const handleCopy = useCallback((e: ClipboardEvent) => {
    // Only handle if we have a selection
    if (!selectionStart || !selectionEnd) return;
    
    const data = getSelectedCellsData();
    if (!data) return;
    
    e.preventDefault();
    e.clipboardData?.setData('text/plain', data);
    toast.success('Copied to clipboard');
  }, [selectionStart, selectionEnd, getSelectedCellsData]);

  // Set up copy/paste listeners
  useEffect(() => {
    const handleCopyEvent = (e: ClipboardEvent) => handleCopy(e);
    const handlePasteEvent = (e: ClipboardEvent) => handlePaste(e);
    
    document.addEventListener('copy', handleCopyEvent);
    document.addEventListener('paste', handlePasteEvent);
    
    return () => {
      document.removeEventListener('copy', handleCopyEvent);
      document.removeEventListener('paste', handlePasteEvent);
    };
  }, [handleCopy, handlePaste]);

  // Arrow key navigation handler for cells
  const handleCellKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colKey: string) => {
    const colKeys = getVisibleColKeys();
    const currentColIdx = colKeys.indexOf(colKey);
    
    // Handle Shift+Arrow for selection
    const isShift = e.shiftKey;
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newRowIndex = Math.max(0, rowIndex - 1);
      if (isShift) {
        // Extend selection
        if (!selectionStart) {
          setSelectionStart({ row: rowIndex, col: colKey });
        }
        setSelectionEnd({ row: newRowIndex, col: colKey });
      } else {
        // Clear selection and move
        setSelectionStart(null);
        setSelectionEnd(null);
        setActiveRowIndex(newRowIndex);
        setTimeout(() => {
          const ref = cellInputRefs.current.get(`${newRowIndex}-${colKey}`);
          ref?.focus();
        }, 0);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newRowIndex = Math.min(scanRows.length - 1, rowIndex + 1);
      if (isShift) {
        if (!selectionStart) {
          setSelectionStart({ row: rowIndex, col: colKey });
        }
        setSelectionEnd({ row: newRowIndex, col: colKey });
      } else {
        setSelectionStart(null);
        setSelectionEnd(null);
        setActiveRowIndex(newRowIndex);
        setTimeout(() => {
          const ref = cellInputRefs.current.get(`${newRowIndex}-${colKey}`);
          ref?.focus();
        }, 0);
      }
    } else if (e.key === 'ArrowLeft') {
      // Excel-like: ArrowLeft always moves to previous *editable* cell
      e.preventDefault();
      const newColKey = getNextEditableColKey(colKeys, currentColIdx, -1) ?? colKey;
      if (isShift) {
        if (!selectionStart) {
          setSelectionStart({ row: rowIndex, col: colKey });
        }
        setSelectionEnd({ row: rowIndex, col: newColKey });
      } else {
        setSelectionStart(null);
        setSelectionEnd(null);
        setActiveColKey(newColKey);
        setTimeout(() => {
          const ref = cellInputRefs.current.get(`${rowIndex}-${newColKey}`);
          ref?.focus();
        }, 0);
      }
    } else if (e.key === 'ArrowRight') {
      // Excel-like: ArrowRight always moves to next *editable* cell
      e.preventDefault();
      const newColKey = getNextEditableColKey(colKeys, currentColIdx, 1) ?? colKey;
      if (isShift) {
        if (!selectionStart) {
          setSelectionStart({ row: rowIndex, col: colKey });
        }
        setSelectionEnd({ row: rowIndex, col: newColKey });
      } else {
        setSelectionStart(null);
        setSelectionEnd(null);
        setActiveColKey(newColKey);
        setTimeout(() => {
          const ref = cellInputRefs.current.get(`${rowIndex}-${newColKey}`);
          ref?.focus();
        }, 0);
      }
    } else if (e.key === 'Tab') {
      // Tab moves right, Shift+Tab moves left
      e.preventDefault();
      const direction = e.shiftKey ? -1 : 1;
      let newRowIndex = rowIndex;
      let newColKey = getNextEditableColKey(colKeys, currentColIdx, direction as -1 | 1);
      
      if (!newColKey) {
        // Wrap to next/prev row
        newRowIndex = direction === 1
          ? Math.min(scanRows.length - 1, rowIndex + 1)
          : Math.max(0, rowIndex - 1);
        const wrapStartIdx = direction === 1 ? -1 : colKeys.length;
        newColKey = getNextEditableColKey(colKeys, wrapStartIdx, direction as -1 | 1) ?? colKey;
      }

      setSelectionStart(null);
      setSelectionEnd(null);
      setActiveRowIndex(newRowIndex);
      setActiveColKey(newColKey);
      setTimeout(() => {
        const ref = cellInputRefs.current.get(`${newRowIndex}-${newColKey}`);
        ref?.focus();
      }, 0);
    } else if (e.key === 'Escape') {
      // Clear selection on Escape
      setSelectionStart(null);
      setSelectionEnd(null);
    }
  }, [getVisibleColKeys, scanRows.length, selectionStart]);

  // Mouse down handler for starting selection
  const handleCellMouseDown = useCallback((e: React.MouseEvent, rowIndex: number, colKey: string) => {
    if (e.shiftKey && selectionStart) {
      // Shift-click extends selection
      setSelectionEnd({ row: rowIndex, col: colKey });
    } else {
      // Start new selection
      setSelectionStart({ row: rowIndex, col: colKey });
      setSelectionEnd({ row: rowIndex, col: colKey });
      setIsSelecting(true);
    }
    setActiveRowIndex(rowIndex);
    setActiveColKey(colKey);
  }, [selectionStart]);

  // Mouse enter handler for extending selection during drag
  const handleCellMouseEnter = useCallback((rowIndex: number, colKey: string) => {
    if (isSelecting) {
      setSelectionEnd({ row: rowIndex, col: colKey });
    }
  }, [isSelecting]);

  // Mouse up handler to stop selection
  useEffect(() => {
    const handleMouseUp = () => {
      setIsSelecting(false);
    };
    
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

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

  // Section total label for the column header (right-hand cell after "Extended")
  const sectionTotalLabel = useMemo(() => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(sectionExtendedTotal);
  }, [sectionExtendedTotal]);

  const columns = useMemo(() => [
    { key: 'loc', label: 'LOC', editable: true },
    { key: 'device', label: 'Device', editable: true, hideable: true },
    { key: 'rec', label: 'REC', editable: true },
    { key: 'time', label: 'TIME', editable: true },
    { key: 'scannedNdc', label: 'Priced NDC/UPC', editable: true, isNdcInput: true },
    { key: 'ndc', label: 'Original NDC', editable: true, isNdcInput: true },
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
    { key: 'expirationDate', label: 'Expiration Date', editable: true, hideable: true },
    { key: 'lotNumber', label: 'Lot #', editable: true, hideable: true },
    ...customColumns.map(col => ({ key: col.key, label: col.label, editable: true, hideable: true as true, isCustom: true, type: undefined as string | undefined, isNdcInput: undefined as boolean | undefined })),
  ], [sectionTotalLabel, customColumns]);

  // Get column width (custom or default)
  const getColumnWidth = (key: string) => columnWidths[key] || defaultWidths[key] || 100;

  // Filter visible columns
  const visibleColumns = useMemo(() => columns.filter(col => !hiddenColumns.has(col.key)), [columns, hiddenColumns]);

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

  // Hideable columns for settings dropdown
  const hideableColumns = useMemo(() => columns.filter(col => col.hideable), [columns]);

  if ((isOnline && authLoading) || (isOnline && templatesLoading && (offlineTemplates as unknown as CloudTemplate[]).length === 0) || offlineLoading) {
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

    const cachedUserId = user?.id || localStorage.getItem('cached_user_id');
    const cachedUserRole: string | null = (() => {
      try {
        const raw = cachedUserId ? localStorage.getItem(`cached_roles:${cachedUserId}`) : null;
        const r: string[] = raw ? JSON.parse(raw) : [];
        return r[0] ?? null;
      } catch { return null; }
    })();

    return (
      <AppLayout>
        <div className="space-y-8" style={{ fontFamily: 'Arial, sans-serif' }}>
          {/* Quick Clock Panel - always available */}
          {cachedUserId && (
            <QuickClockPanel userId={cachedUserId} userRole={cachedUserRole} />
          )}
          <div className="text-center py-4 relative">
            {/* Sync buttons in top right */}
            <div className="absolute right-0 top-0 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setManageDeviceDialogOpen(true)}
                className="gap-2"
              >
                <Smartphone className="h-4 w-4" />
                <span className="hidden sm:inline">Manage Device</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFlashDriveDialogOpen(true)}
                className="gap-2"
              >
                <HardDrive className="h-4 w-4" />
                <span className="hidden sm:inline">Flash Drive</span>
              </Button>
              {isOnline && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeviceSyncDialogOpen(true)}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download to Device</span>
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
          
            {/* Last Scan Location Reminder */}
            {lastScanInfo && (
              <div className="mt-4 inline-flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                <ScanBarcode className="h-5 w-5 text-primary" />
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Last scan:</span>
                  <span className="font-semibold">{lastScanInfo.templateName}</span>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="secondary">{lastScanInfo.sectionName}</Badge>
                </div>
                <Button 
                  size="sm" 
                  variant="default" 
                  className="ml-2"
                  onClick={handleResumeLastScan}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Resume
                </Button>
              </div>
            )}
            
          </div>

          {/* Device Sync Dialog */}
          <DeviceSyncDialog
            open={deviceSyncDialogOpen}
            onOpenChange={setDeviceSyncDialogOpen}
            cloudTemplates={cloudTemplates}
            syncedTemplateIds={syncedTemplateIds}
            onSyncTemplates={syncSelectedTemplates}
            isSyncing={isSyncing}
            syncProgress={syncProgress}
          />

          {/* Manage Device Dialog */}
          <ManageDeviceDialog
            open={manageDeviceDialogOpen}
            onOpenChange={setManageDeviceDialogOpen}
            localTemplates={offlineTemplates}
            getTemplateCostItemCount={getTemplateCostItemCount}
            onDelete={deleteLocalTemplate}
            onRefresh={() => {}}
          />

          {/* Flash Drive Transfer Dialog */}
          <FlashDriveTransferDialog
            open={flashDriveDialogOpen}
            onOpenChange={setFlashDriveDialogOpen}
            isOnline={isOnline}
          />

          {/* Loading state for offline DB */}
          {offlineLoading && !isOnline && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading local database...</p>
            </div>
          )}

          {!offlineLoading && sortedTemplates.length === 0 ? (
            <Card className="border-dashed max-w-md mx-auto">
              <CardContent className="py-16 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg">No Data Templates</h3>
                <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                  {!isOnline 
                    ? 'No templates found locally. Please connect to the internet and use "Download to Device" first, or import via Flash Drive.'
                    : 'Please import data templates first from the Data Template page.'
                  }
                </p>
                {isOnline && (
                  <Button 
                    className="mt-4"
                    onClick={() => navigate('/')}
                  >
                    Go to Data Templates
                  </Button>
                )}
                {!isOnline && (
                  <Button 
                    className="mt-4" variant="outline"
                    onClick={() => setFlashDriveDialogOpen(true)}
                  >
                    <HardDrive className="h-4 w-4 mr-2" />
                    Import via Flash Drive
                  </Button>
                )}
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

  // Scan View (Excel-like with horizontal scroll)
  return (
    <AppLayout fullWidth hideNavigation>
      <div className="flex flex-col h-full overflow-hidden p-3 gap-2 w-full" style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* Header with back button */}
        <div className="flex items-center gap-3 shrink-0">
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
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            requirePassword('edit this section', () => openEditSectionDialog(section));
                          }}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            requirePassword('delete this section', () => {
                              setDeletingSectionId(section.id);
                              setDeleteSectionDialogOpen(true);
                            });
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => requirePassword('add a new section', () => setAddSectionDialogOpen(true))}>
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
          <Card className="border-warning bg-warning/10 shrink-0">
            <CardContent className="py-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-warning" />
              <span className="text-sm">Please select a Section first to start scanning</span>
            </CardContent>
          </Card>
        )}

        {/* Tabs for Scan and Summary */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'scan' | 'summary')} className="flex-1 flex flex-col min-h-0">
          <TabsList className="shrink-0">
            <TabsTrigger value="scan" className="gap-2">
              <ScanBarcode className="h-4 w-4" />
              Scan
            </TabsTrigger>
            <TabsTrigger value="summary" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Summary
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="scan" className="flex-1 flex flex-col min-h-0 mt-2">
            {/* Scan Input */}
            <Card className="w-full flex-1 flex flex-col min-h-0">
              <CardContent className="p-3 flex-1 flex flex-col min-h-0">
                {/* Toolbar - search and buttons on left */}
            <div className="flex items-center gap-2 mb-2 flex-wrap shrink-0">
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowAddColumnDialog(true)}
                    className="flex items-center gap-2 text-primary"
                  >
                    <Plus className="h-4 w-4" />
                    Add Custom Column
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

             {/* Excel-style Formula Bar */}
            {selectedSection && (
              <div className="flex items-center border rounded-md mb-1 bg-card overflow-hidden shrink-0">
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
                    if (activeRowIndex < 0 || !activeColKey || activeRowIndex >= scanRows.length) return '';
                    const row = scanRows[activeRowIndex];
                    // For qty, show formula if available
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
                    if (activeRowIndex < 0 || !activeColKey || activeRowIndex >= scanRows.length) return;
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

            {/* Excel-like Table with horizontal scroll */}
            <ScrollArea className="flex-1 min-h-0 whitespace-nowrap rounded-lg border relative">
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
                        className={realIndex === activeRowIndex ? 'bg-primary/5' : ''}
                      >
                        {/* Delete button on left */}
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
                            
                            // Check if cell is in selection range
                            const isSelected = isCellSelected(realIndex, col.key);
                            
                            // Determine ref and keydown handler based on field type
                            const getRef = (el: HTMLInputElement | null) => {
                              // Store ref for navigation
                              if (el) {
                                cellInputRefs.current.set(`${realIndex}-${col.key}`, el);
                              }
                              // Also store special refs for NDC and QTY
                              if (col.isNdcInput && el) ndcInputRefs.current[realIndex] = el;
                              if (col.key === 'qty' && el) qtyInputRefs.current[realIndex] = el;
                            };
                            
                            // Combined keydown handler
                            const getKeyDownHandler = (e: React.KeyboardEvent<HTMLInputElement>) => {
                              // Special handlers first
                              if (col.isNdcInput) {
                                handleNdcKeyDown(e, realIndex);
                                // If Enter was pressed for NDC lookup, don't do navigation
                                if (e.key === 'Enter') return;
                              }
                              if (col.key === 'qty') {
                                handleQtyKeyDown(e, realIndex);
                                // If Enter was pressed for QTY calculation, don't do navigation
                                if (e.key === 'Enter') return;
                              }
                              // Then arrow key navigation
                              handleCellKeyDown(e, realIndex, col.key);
                            };
                            
                            // Special handling for QTY - in-cell calculator (type expression like "5+3")
                            if (col.key === 'qty') {
                              const qtyValidationColor = getCellValidationColor('qty', row);
                              const qtyBgStyle = qtyValidationColor 
                                ? getCellValidationClasses(qtyValidationColor)
                                : 'bg-transparent';
                              const qtyIsSelected = isSelected ? 'ring-2 ring-primary ring-inset' : '';
                              
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
                                      ref={getRef}
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
                                        // On focus, show stored formula if exists, otherwise show current value
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
                                      disabled={!selectedSection}
                                      className={`font-mono h-8 text-xs border-0 focus-visible:ring-1 min-w-0 disabled:opacity-50 disabled:cursor-not-allowed rounded-none pr-6 ${qtyBgStyle} ${qtyIsSelected}`}
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
                            
                          // Cell validation styling using utility function
                            const cellValidationColor = getCellValidationColor(col.key, row);
                            const inputBgStyle = cellValidationColor 
                              ? getCellValidationClasses(cellValidationColor) 
                              : 'bg-transparent';
                            const selectionStyle = isSelected ? 'ring-2 ring-primary ring-inset' : '';
                            
                            return (
                              <TableCell 
                                key={col.key} 
                                className="p-0" 
                                style={{ width: getColumnWidth(col.key), minWidth: getColumnWidth(col.key) }}
                                onMouseDown={(e) => handleCellMouseDown(e, realIndex, col.key)}
                                onMouseEnter={() => handleCellMouseEnter(realIndex, col.key)}
                              >
                                <Input
                                  ref={getRef}
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
                                  onKeyDown={getKeyDownHandler}
                                  onFocus={() => {
                                    setActiveRowIndex(realIndex);
                                    setActiveColKey(col.key);
                                  }}
                                  type={col.isNdcInput ? 'text' : (col.type === 'number' || col.type === 'currency' ? 'number' : 'text')}
                                  step={col.type === 'currency' ? '0.01' : undefined}
                                  placeholder={col.type === 'currency' ? '$0.00' : undefined}
                                  disabled={!selectedSection}
                                  className={`font-mono h-8 text-xs border-0 focus-visible:ring-1 min-w-0 disabled:opacity-50 disabled:cursor-not-allowed rounded-none ${inputBgStyle} ${selectionStyle}`}
                                />
                              </TableCell>
                            );
                          }
                          
                          // Cell validation styling (non-editable cells) using utility function
                          const nonEditableCellColor = getCellValidationColor(col.key, row);
                          const nonEditableCellStyle = nonEditableCellColor 
                            ? getCellValidationClasses(nonEditableCellColor) 
                            : '';
                          const nonEditableSelected = isCellSelected(realIndex, col.key) ? 'ring-2 ring-primary ring-inset' : '';
                          
                          return (
                            <TableCell 
                              key={col.key} 
                              className={`text-xs ${row.source === 'not_found' && (col.key === 'medDesc' || col.key === 'source') ? 'text-destructive' : ''} ${nonEditableCellStyle} ${nonEditableSelected}`}
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
                    );})}
                  </TableBody>
                </Table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>

            {/* Stats */}
            <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground flex-wrap">
              <span>{scanRows.filter(r => r.ndc || r.scannedNdc).length} scans</span>
              {searchQuery && <span>• {filteredRows.length} shown</span>}
              <span>•</span>
              <span className="text-yellow-600 dark:text-yellow-400">
                {scanRows.filter(r => (r.ndc || r.scannedNdc) && !r.source).length} no pricing
              </span>
              <span>•</span>
              <span className="text-destructive">
                {scanRows.filter(r => r.source === 'not_found').length} not found in FDA
              </span>
              <span>•</span>
              <span className="text-muted-foreground">
                {scanRows.filter(r => r.source && r.source.toUpperCase().startsWith('MIS')).length} MIS
              </span>
              
              {/* Current Template's Last Scan Section Reminder */}
              {currentTemplateLastScan && selectedSection?.id !== currentTemplateLastScan.sectionId && (
                <div className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-md text-xs">
                  <ScanBarcode className="h-3.5 w-3.5 text-primary" />
                  <span className="text-muted-foreground">Last scan:</span>
                  <Badge variant="secondary" className="text-xs h-5">{currentTemplateLastScan.sectionName}</Badge>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      const section = sections.find(s => s.id === currentTemplateLastScan.sectionId);
                      if (section) {
                        handleSelectSection(section);
                      }
                    }}
                  >
                    Go to
                  </Button>
                </div>
              )}
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

      {/* Section Password Dialog */}
      <SectionPasswordDialog
        open={sectionPasswordOpen}
        onOpenChange={setSectionPasswordOpen}
        actionLabel={sectionActionLabel}
        onSuccess={() => {
          if (pendingSectionAction) {
            pendingSectionAction();
            setPendingSectionAction(null);
          }
        }}
      />

      {/* Delete Section Confirmation */}
      <Dialog open={deleteSectionDialogOpen} onOpenChange={setDeleteSectionDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Section</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete this section and all its scan records. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSectionDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteSection}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Custom Column Dialog */}
      <Dialog open={showAddColumnDialog} onOpenChange={setShowAddColumnDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Custom Column</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="custom-col-name" className="text-sm font-medium mb-2 block">
              Column Name
            </Label>
            <Input
              id="custom-col-name"
              placeholder="e.g. Bin Location"
              value={newColumnName}
              onChange={e => setNewColumnName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const trimmed = newColumnName.trim();
                  if (!trimmed) return;
                  const key = `custom_${trimmed.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
                  setCustomColumns(prev => [...prev, { key, label: trimmed }]);
                  setNewColumnName('');
                  setShowAddColumnDialog(false);
                  toast.success(`Column "${trimmed}" added`);
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddColumnDialog(false); setNewColumnName(''); }}>
              Cancel
            </Button>
            <Button onClick={() => {
              const trimmed = newColumnName.trim();
              if (!trimmed) return;
              const key = `custom_${trimmed.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
              setCustomColumns(prev => [...prev, { key, label: trimmed }]);
              setNewColumnName('');
              setShowAddColumnDialog(false);
              toast.success(`Column "${trimmed}" added`);
            }}>
              Add Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Name Prompt Dialog - shown on cold start when cached name is missing */}
      <Dialog open={showNamePrompt} onOpenChange={setShowNamePrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Your Name</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your name is used for REC identification (e.g., "JiaweiT-001"). 
            This will be saved for future offline sessions.
          </p>
          <Input
            placeholder="e.g., JiaweiT"
            value={namePromptValue}
            onChange={(e) => setNamePromptValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && namePromptValue.trim()) {
                const name = namePromptValue.trim();
                setUserShortName(name);
                localStorage.setItem('cached_user_short_name', name);
                setShowNamePrompt(false);
                setNamePromptValue('');
                toast.success(`Name set to "${name}"`);
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNamePrompt(false)}>
              Skip
            </Button>
            <Button onClick={() => {
              const name = namePromptValue.trim();
              if (!name) return;
              setUserShortName(name);
              localStorage.setItem('cached_user_short_name', name);
              setShowNamePrompt(false);
              setNamePromptValue('');
              toast.success(`Name set to "${name}"`);
            }}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
};

export default Scan;
