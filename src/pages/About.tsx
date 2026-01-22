import { AppLayout } from '@/components/layout/AppLayout';
import { AboutTab } from '@/components/fda/AboutTab';

export default function About() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">About</h1>
          <p className="text-muted-foreground">
            Application version information and updates
          </p>
        </div>
        <AboutTab />
      </div>
    </AppLayout>
  );
}
