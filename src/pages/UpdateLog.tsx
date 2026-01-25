import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Tag } from 'lucide-react';

const VERSION = '1.0.0';

interface UpdateEntry {
  date: string;
  version: string;
  changes: string[];
}

const updateLog: UpdateEntry[] = [
  {
    date: '2026-01-25',
    version: '1.0.0',
    changes: [
      'Initial release of Meridian Portal',
      'Added NDC scanning with IO-based outer pack detection',
      'Implemented Live Tracker workflow management',
      'Added Schedule Hub for job scheduling',
      'Team Chat with real-time messaging',
      'Timesheet tracking functionality',
      'Master Data (FDA) database management',
      'Compile tool for Excel aggregation',
    ],
  },
];

const UpdateLog = () => {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Update Log</h1>
            <p className="text-muted-foreground">
              Version history and changelog
            </p>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2 font-mono">
            <Tag className="h-4 w-4 mr-2" />
            v{VERSION}
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Changelog
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div className="space-y-6">
                {updateLog.map((entry, index) => (
                  <div
                    key={index}
                    className="border-l-2 border-primary pl-4 pb-4"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Badge variant="secondary" className="font-mono">
                        v{entry.version}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {entry.date}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {entry.changes.map((change, changeIndex) => (
                        <li
                          key={changeIndex}
                          className="text-sm text-foreground flex items-start gap-2"
                        >
                          <span className="text-primary mt-1">•</span>
                          {change}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default UpdateLog;
