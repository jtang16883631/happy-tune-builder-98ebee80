import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Package, Pill, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface OuterNDCOption {
  outerNDC: string;
  trade: string | null;
  generic: string | null;
  strength: string | null;
  packageSize: string | null;
  manufacturer: string | null;
  doseForm: string | null;
}

interface OuterNDCSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scannedNDC: string;
  options: OuterNDCOption[];
  onSelect: (outerNDC: string) => void;
  onCancel: () => void;
}

export function OuterNDCSelectionDialog({
  open,
  onOpenChange,
  scannedNDC,
  options,
  onSelect,
  onCancel,
}: OuterNDCSelectionDialogProps) {
  const [selectedNDC, setSelectedNDC] = useState<string | null>(null);

  const handleConfirm = () => {
    if (selectedNDC) {
      onSelect(selectedNDC);
      setSelectedNDC(null);
    }
  };

  const handleCancel = () => {
    setSelectedNDC(null);
    onCancel();
  };

  // Format NDC with dashes: 5-4-2 format
  const formatNDC = (ndc: string): string => {
    if (!ndc) return '';
    const clean = ndc.replace(/-/g, '');
    if (clean.length === 11) {
      return `${clean.slice(0, 5)}-${clean.slice(5, 9)}-${clean.slice(9)}`;
    }
    return ndc;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 border-b bg-muted/30">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Scanned Inner NDC:</span>
            <Badge variant="outline" className="font-mono bg-accent text-accent-foreground border-primary/30">
              {formatNDC(scannedNDC)}
            </Badge>
            <span className="text-muted-foreground ml-2">→ Select Outer NDC:</span>
          </div>
        </DialogHeader>

        <div className="p-0">
          <RadioGroup
            value={selectedNDC || ''}
            onValueChange={(value) => {
              setSelectedNDC(value);
              // Auto-confirm on selection for faster workflow
              onSelect(value);
              setSelectedNDC(null);
            }}
            className="divide-y"
          >
            {options.map((option, index) => {
              const drugName = option.trade || option.generic || 'Unknown Drug';
              const details = [option.strength, option.packageSize, option.doseForm, option.manufacturer]
                .filter(Boolean)
                .join(' ');
              
              return (
                <Label
                  key={option.outerNDC + index}
                  htmlFor={`ndc-${index}`}
                  className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-primary/10 transition-colors ${
                    selectedNDC === option.outerNDC ? 'bg-primary/20' : ''
                  }`}
                >
                  <RadioGroupItem
                    value={option.outerNDC}
                    id={`ndc-${index}`}
                    className="shrink-0"
                  />
                  <span className="font-mono text-sm font-medium text-primary min-w-[120px]">
                    {formatNDC(option.outerNDC)}
                  </span>
                  <span className="text-sm truncate">
                    {drugName} {details}
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t bg-muted/30">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
