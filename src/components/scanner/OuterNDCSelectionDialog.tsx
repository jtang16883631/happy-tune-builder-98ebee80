import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useState, useEffect, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface OuterNDCOption {
  outerNDC: string;
  trade: string | null;
  generic: string | null;
  strength: string | null;
  packageSize: string | null;
  manufacturer: string | null;
  doseForm: string | null;
  // Display fields: B column (meridian_desc) + G column (fda_size)
  meridianDesc: string | null;
  fdaSize: string | null;
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
  // Default select first option
  const [selectedNDC, setSelectedNDC] = useState<string | null>(null);

  // Reset selection when dialog opens with new options
  useEffect(() => {
    if (open && options.length > 0) {
      setSelectedNDC(options[0].outerNDC);
    }
  }, [open, options]);

  const handleConfirm = useCallback(() => {
    if (selectedNDC) {
      onSelect(selectedNDC);
      setSelectedNDC(null);
    }
  }, [selectedNDC, onSelect]);

  const handleCancel = useCallback(() => {
    setSelectedNDC(null);
    onCancel();
  }, [onCancel]);

  // Handle keyboard events - Enter = Confirm
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }, [handleConfirm, handleCancel]);

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
      <DialogContent 
        className="sm:max-w-[90vw] lg:max-w-4xl p-0 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="px-4 pt-4 pb-2 border-b bg-muted/30">
          <DialogTitle className="text-lg font-semibold">Select Outer Pack</DialogTitle>
          <div className="flex items-center gap-2 text-sm mt-2">
            <span className="text-muted-foreground">Scanned Inner Pack NDC:</span>
            <Badge variant="outline" className="font-mono bg-accent text-accent-foreground border-primary/30">
              {formatNDC(scannedNDC)}
            </Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[50vh]">
          <RadioGroup
            value={selectedNDC || ''}
            onValueChange={setSelectedNDC}
            className="divide-y"
          >
            {options.map((option, index) => {
              // Display format: outerNDC (11 digits) + B column (meridian_desc) + G column (fda_size)
              const displayDesc = option.meridianDesc || option.trade || option.generic || '';
              const displaySize = option.fdaSize || option.packageSize || '';
              
              return (
                <Label
                  key={option.outerNDC + index}
                  htmlFor={`ndc-${index}`}
                  className={`flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-primary/10 transition-colors ${
                    selectedNDC === option.outerNDC ? 'bg-primary/20' : ''
                  }`}
                >
                  <RadioGroupItem
                    value={option.outerNDC}
                    id={`ndc-${index}`}
                    className="shrink-0"
                  />
                  <span className="font-mono text-sm font-medium text-primary min-w-[130px]">
                    {formatNDC(option.outerNDC)}
                  </span>
                  <span className="text-sm flex-1">
                    {displayDesc} {displaySize}
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
        </ScrollArea>

        <DialogFooter className="px-4 py-3 border-t bg-muted/30">
          <Button variant="outline" size="sm" onClick={handleCancel}>
            Cancel
          </Button>
          <Button 
            size="sm" 
            onClick={handleConfirm}
            disabled={!selectedNDC}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
