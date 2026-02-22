import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDevices } from '@/hooks/useDevices';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Plus, RotateCcw, UserPlus, Trash2, Monitor, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

const DEVICE_TYPES = ['Laptop', 'Scanner', 'Tablet', 'Phone', 'Printer', 'Other'];

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  available: { label: 'Available', variant: 'default' },
  assigned: { label: 'Assigned', variant: 'secondary' },
  maintenance: { label: 'Maintenance', variant: 'destructive' },
  lost: { label: 'Lost', variant: 'destructive' },
};

export default function Equipment() {
  const { devices, isLoading, addDevice, assignDevice, returnDevice, deleteDevice } = useDevices();
  const { isPrivileged } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [newDevice, setNewDevice] = useState({ device_id: '', device_type: 'Scanner', notes: '' });

  const profilesQuery = useQuery({
    queryKey: ['profiles-list'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name').order('full_name');
      return data ?? [];
    },
  });

  const handleAdd = () => {
    if (!newDevice.device_id.trim()) return;
    addDevice.mutate(newDevice, {
      onSuccess: () => {
        setAddOpen(false);
        setNewDevice({ device_id: '', device_type: 'Scanner', notes: '' });
      },
    });
  };

  const handleAssign = () => {
    if (!assignOpen || !selectedProfile) return;
    assignDevice.mutate({ deviceId: assignOpen, profileId: selectedProfile }, {
      onSuccess: () => {
        setAssignOpen(null);
        setSelectedProfile('');
      },
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Equipment Management</h1>
            <p className="text-muted-foreground">Track and manage company hardware assets</p>
          </div>
          {isPrivileged && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add New Device
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(['available', 'assigned', 'maintenance', 'lost'] as const).map((s) => {
            const count = devices.filter((d) => d.status === s).length;
            const cfg = statusConfig[s];
            return (
              <div key={s} className="rounded-lg border bg-card p-4">
                <p className="text-sm text-muted-foreground capitalize">{cfg.label}</p>
                <p className="text-2xl font-bold">{count}</p>
              </div>
            );
          })}
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
                  <TableHead>Device ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Checkout Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <Monitor className="h-10 w-10 mx-auto mb-2 opacity-40" />
                      No devices registered yet
                    </TableCell>
                  </TableRow>
                ) : (
                  devices.map((device) => {
                    const cfg = statusConfig[device.status] ?? statusConfig.available;
                    return (
                      <TableRow key={device.id}>
                        <TableCell className="font-medium">{device.device_id}</TableCell>
                        <TableCell>{device.device_type}</TableCell>
                        <TableCell>{device.assigned_profile?.full_name ?? '-'}</TableCell>
                        <TableCell>
                          <Badge
                            variant={cfg.variant}
                            className={
                              device.status === 'available'
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : device.status === 'assigned'
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : ''
                            }
                          >
                            {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {device.checkout_date ? format(new Date(device.checkout_date), 'MMM d, yyyy') : '-'}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          {device.status === 'available' && (
                            <Button size="sm" variant="outline" onClick={() => { setAssignOpen(device.id); setSelectedProfile(''); }}>
                              <UserPlus className="mr-1 h-3.5 w-3.5" />
                              Assign
                            </Button>
                          )}
                          {device.status === 'assigned' && (
                            <Button size="sm" variant="outline" onClick={() => returnDevice.mutate(device.id)}>
                              <RotateCcw className="mr-1 h-3.5 w-3.5" />
                              Return
                            </Button>
                          )}
                          {isPrivileged && (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteDevice.mutate(device.id)}>
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

      {/* Add Device Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Device</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Device ID</Label>
              <Input placeholder="e.g. DEV-001" value={newDevice.device_id} onChange={(e) => setNewDevice((p) => ({ ...p, device_id: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Device Type</Label>
              <Select value={newDevice.device_type} onValueChange={(v) => setNewDevice((p) => ({ ...p, device_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEVICE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input placeholder="Serial number, model..." value={newDevice.notes} onChange={(e) => setNewDevice((p) => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addDevice.isPending || !newDevice.device_id.trim()}>
              {addDevice.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Add Device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Device Dialog */}
      <Dialog open={!!assignOpen} onOpenChange={(o) => { if (!o) setAssignOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Device</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Select User</Label>
              <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                <SelectTrigger><SelectValue placeholder="Choose a team member" /></SelectTrigger>
                <SelectContent>
                  {(profilesQuery.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(null)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={assignDevice.isPending || !selectedProfile}>
              {assignDevice.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
