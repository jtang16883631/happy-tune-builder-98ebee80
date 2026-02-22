import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import type { EquipmentKit, KitChecklist } from '@/hooks/useEquipmentKits';

interface KitReturnDialogProps {
  kit: EquipmentKit | null;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onSubmit: (data: { kitId: string; return_checklist: KitChecklist; return_notes: string }) => void;
}

const defaultChecklist: KitChecklist = {
  laptop: false,
  laptop_charger: false,
  barcode_scanner: false,
  scanner_batteries: false,
  scanner_battery_charger: false,
};

export function KitReturnDialog({ kit, onOpenChange, isPending, onSubmit }: KitReturnDialogProps) {
  const [checklist, setChecklist] = useState<KitChecklist>({ ...defaultChecklist });
  const [notes, setNotes] = useState('');

  const toggle = (key: keyof KitChecklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = () => {
    if (!kit) return;
    onSubmit({ kitId: kit.id, return_checklist: checklist, return_notes: notes.trim() });
    setChecklist({ ...defaultChecklist });
    setNotes('');
  };

  const handleClose = () => {
    setChecklist({ ...defaultChecklist });
    setNotes('');
    onOpenChange(false);
  };

  const allChecked = Object.values(checklist).every(Boolean);

  return (
    <Dialog open={!!kit} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Return Kit — {kit?.auditor?.full_name ?? 'Unknown'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>Laptop: <span className="font-medium text-foreground">{kit?.laptop_id ?? '-'}</span></p>
            <p>Scanner: <span className="font-medium text-foreground">{kit?.scanner_id ?? '-'}</span></p>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Check-in Checklist</Label>
            <p className="text-xs text-muted-foreground">Check off each item as returned. Add a note for missing items.</p>

            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <Checkbox checked={checklist.laptop} onCheckedChange={() => toggle('laptop')} id="ret-laptop" />
                <label htmlFor="ret-laptop" className="text-sm font-medium cursor-pointer">Laptop</label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox checked={checklist.laptop_charger} onCheckedChange={() => toggle('laptop_charger')} id="ret-charger" />
                <label htmlFor="ret-charger" className="text-sm font-medium cursor-pointer">Laptop Charger</label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox checked={checklist.barcode_scanner} onCheckedChange={() => toggle('barcode_scanner')} id="ret-scanner" />
                <label htmlFor="ret-scanner" className="text-sm font-medium cursor-pointer">Barcode Scanner</label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox checked={checklist.scanner_batteries} onCheckedChange={() => toggle('scanner_batteries')} id="ret-batteries" />
                <label htmlFor="ret-batteries" className="text-sm font-medium cursor-pointer">Scanner Batteries (Qty: 2)</label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox checked={checklist.scanner_battery_charger} onCheckedChange={() => toggle('scanner_battery_charger')} id="ret-bat-charger" />
                <label htmlFor="ret-bat-charger" className="text-sm font-medium cursor-pointer">Scanner Battery Charger</label>
              </div>
            </div>
          </div>

          {!allChecked && (
            <div className="space-y-2">
              <Label>Notes (for missing items)</Label>
              <Textarea
                placeholder="e.g. Lost laptop charger at hospital"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Complete Return
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
