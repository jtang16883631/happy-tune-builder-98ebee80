import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { KitChecklist } from '@/hooks/useEquipmentKits';

interface Profile {
  id: string;
  full_name: string | null;
}

interface KitCheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: Profile[];
  isPending: boolean;
  onSubmit: (data: { auditor_id: string; laptop_id: string; scanner_id: string; checklist: KitChecklist }) => void;
}

const defaultChecklist: KitChecklist = {
  laptop: false,
  laptop_charger: false,
  barcode_scanner: false,
  scanner_batteries: false,
  scanner_battery_charger: false,
};

export function KitCheckoutDialog({ open, onOpenChange, profiles, isPending, onSubmit }: KitCheckoutDialogProps) {
  const [auditorId, setAuditorId] = useState('');
  const [laptopId, setLaptopId] = useState('');
  const [scannerId, setScannerId] = useState('');
  const [checklist, setChecklist] = useState<KitChecklist>({ ...defaultChecklist });

  const allChecked = Object.values(checklist).every(Boolean);
  const canSubmit = auditorId && laptopId.trim() && scannerId.trim() && allChecked;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ auditor_id: auditorId, laptop_id: laptopId.trim(), scanner_id: scannerId.trim(), checklist });
    resetForm();
  };

  const resetForm = () => {
    setAuditorId('');
    setLaptopId('');
    setScannerId('');
    setChecklist({ ...defaultChecklist });
  };

  const toggle = (key: keyof KitChecklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Kit to Auditor</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Select Auditor</Label>
            <Select value={auditorId} onValueChange={setAuditorId}>
              <SelectTrigger><SelectValue placeholder="Choose an auditor" /></SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Standard Kit Checklist</Label>
            <p className="text-xs text-muted-foreground">All items must be checked before submitting.</p>

            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              {/* Laptop */}
              <div className="flex items-start gap-3">
                <Checkbox checked={checklist.laptop} onCheckedChange={() => toggle('laptop')} id="laptop" />
                <div className="flex-1 space-y-1">
                  <label htmlFor="laptop" className="text-sm font-medium cursor-pointer">Laptop</label>
                  <Input placeholder="Laptop SN / ID" value={laptopId} onChange={(e) => setLaptopId(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>

              {/* Laptop Charger */}
              <div className="flex items-center gap-3">
                <Checkbox checked={checklist.laptop_charger} onCheckedChange={() => toggle('laptop_charger')} id="charger" />
                <label htmlFor="charger" className="text-sm font-medium cursor-pointer">Laptop Charger</label>
              </div>

              {/* Scanner */}
              <div className="flex items-start gap-3">
                <Checkbox checked={checklist.barcode_scanner} onCheckedChange={() => toggle('barcode_scanner')} id="scanner" />
                <div className="flex-1 space-y-1">
                  <label htmlFor="scanner" className="text-sm font-medium cursor-pointer">Barcode Scanner</label>
                  <Input placeholder="Scanner SN / ID" value={scannerId} onChange={(e) => setScannerId(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>

              {/* Batteries */}
              <div className="flex items-center gap-3">
                <Checkbox checked={checklist.scanner_batteries} onCheckedChange={() => toggle('scanner_batteries')} id="batteries" />
                <label htmlFor="batteries" className="text-sm font-medium cursor-pointer">Scanner Batteries <span className="text-muted-foreground">(Qty: 2)</span></label>
              </div>

              {/* Battery Charger */}
              <div className="flex items-center gap-3">
                <Checkbox checked={checklist.scanner_battery_charger} onCheckedChange={() => toggle('scanner_battery_charger')} id="bat-charger" />
                <label htmlFor="bat-charger" className="text-sm font-medium cursor-pointer">Scanner Battery Charger</label>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !canSubmit}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Submit Checkout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
