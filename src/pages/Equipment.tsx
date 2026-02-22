import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEquipmentKits, type EquipmentKit } from '@/hooks/useEquipmentKits';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCcw, Trash2, Package, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { KitCheckoutDialog } from '@/components/equipment/KitCheckoutDialog';
import { KitReturnDialog } from '@/components/equipment/KitReturnDialog';

const statusConfig: Record<string, { label: string; className: string }> = {
  out_in_field: { label: 'Out in Field', className: 'bg-blue-600 hover:bg-blue-700 text-white' },
  returned: { label: 'Returned', className: 'bg-green-600 hover:bg-green-700 text-white' },
};

export default function Equipment() {
  const { kits, isLoading, checkoutKit, returnKit, deleteKit } = useEquipmentKits();
  const { isPrivileged } = useAuth();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [returnKit_, setReturnKit] = useState<EquipmentKit | null>(null);

  const profilesQuery = useQuery({
    queryKey: ['profiles-list'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name').order('full_name');
      return data ?? [];
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Equipment Management</h1>
            <p className="text-muted-foreground">Track equipment kits assigned to auditors</p>
          </div>
          {isPrivileged && (
            <Button onClick={() => setCheckoutOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Assign Kit to Auditor
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Total Kits</p>
            <p className="text-2xl font-bold">{kits.length}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Out in Field</p>
            <p className="text-2xl font-bold">{kits.filter((k) => k.status === 'out_in_field').length}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Returned</p>
            <p className="text-2xl font-bold">{kits.filter((k) => k.status === 'returned').length}</p>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Auditor Name</TableHead>
                  <TableHead>Laptop ID</TableHead>
                  <TableHead>Scanner ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Checkout Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
                      No equipment kits assigned yet
                    </TableCell>
                  </TableRow>
                ) : (
                  kits.map((kit) => {
                    const cfg = statusConfig[kit.status] ?? statusConfig.out_in_field;
                    return (
                      <TableRow key={kit.id}>
                        <TableCell className="font-medium">{kit.auditor?.full_name ?? '-'}</TableCell>
                        <TableCell>{kit.laptop_id ?? '-'}</TableCell>
                        <TableCell>{kit.scanner_id ?? '-'}</TableCell>
                        <TableCell>
                          <Badge className={cfg.className}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {kit.checkout_date ? format(new Date(kit.checkout_date), 'MMM d, yyyy') : '-'}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          {kit.status === 'out_in_field' && isPrivileged && (
                            <Button size="sm" variant="outline" onClick={() => setReturnKit(kit)}>
                              <RotateCcw className="mr-1 h-3.5 w-3.5" />
                              Return
                            </Button>
                          )}
                          {isPrivileged && (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteKit.mutate(kit.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <KitCheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        profiles={profilesQuery.data ?? []}
        isPending={checkoutKit.isPending}
        onSubmit={(data) => {
          checkoutKit.mutate(data, { onSuccess: () => setCheckoutOpen(false) });
        }}
      />

      <KitReturnDialog
        kit={returnKit_}
        onOpenChange={() => setReturnKit(null)}
        isPending={returnKit.isPending}
        onSubmit={(data) => {
          returnKit.mutate(data, { onSuccess: () => setReturnKit(null) });
        }}
      />
    </AppLayout>
  );
}
