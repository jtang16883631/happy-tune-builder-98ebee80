import { AppLayout } from '@/components/layout/AppLayout';
import { CompileTab } from '@/components/fda/CompileTab';

export default function Compile() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Compile Offline Data</h1>
          <p className="text-muted-foreground">
            Merge multiple offline-exported Excel files into a single consolidated file
          </p>
        </div>
        <CompileTab />
      </div>
    </AppLayout>
  );
}
