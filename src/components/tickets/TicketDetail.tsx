import { format } from 'date-fns';
import { ScheduleEvent, TeamMember } from '@/hooks/useScheduleEvents';
import { LiveTrackerJob, STAGE_CONFIG } from '@/hooks/useLiveTracker';
import { cn } from '@/lib/utils';

interface TicketDetailProps {
  event: ScheduleEvent;
  teamMembers: TeamMember[];
  trackerJob?: LiveTrackerJob;
}

export function TicketDetail({ event, teamMembers, trackerJob }: TicketDetailProps) {
  const getTeamMemberNames = (memberIds: string[] | null): string[] => {
    if (!memberIds) return [];
    return memberIds
      .map((id) => teamMembers.find((m) => m.id === id)?.name)
      .filter(Boolean) as string[];
  };

  const assignedTeam = getTeamMemberNames(event.team_members);

  return (
    <div className="bg-white border-2 border-black text-black print:text-black" id="ticket-print">
      {/* Warning Banner */}
      <div className="bg-red-600 text-white text-center py-1 text-xs font-bold">
        ==DO NOT PRINT OUT==DO NOT SHARE==
      </div>

      {/* Header */}
      <div className="border-b-2 border-black">
        <div className="flex items-start justify-between p-4">
          <div className="flex items-center gap-4">
            <div className="text-xs">
              <span className="font-semibold">Current Inv #</span>
              <div className="bg-yellow-300 px-2 py-1 font-mono font-bold text-lg mt-1">
                {event.invoice_number}
              </div>
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">MERIDIAN</div>
            <div className="text-xl font-bold border-2 border-black px-6 py-2">
              Job Ticket
            </div>
            <div className="text-xs text-muted-foreground mt-1">INVENTORY</div>
          </div>

          <div className="text-right text-xs">
            <div className="font-semibold">Promise Inv #</div>
            <div className="font-mono">{trackerJob?.promise_invoice_number || event.invoice_number}</div>
            <div className="text-muted-foreground mt-2">
              {format(new Date(), 'M/d/yyyy')}
            </div>
          </div>
        </div>
      </div>

      {/* Facility & Contact Info */}
      <div className="grid grid-cols-3 border-b-2 border-black text-xs">
        {/* Left Column - Facility */}
        <div className="border-r-2 border-black p-2 space-y-1">
          <TicketRow label="Facility Name" value={event.client_name} highlight />
          <TicketRow label="Address 1" value={event.address} />
          <TicketRow label="Hotel Name" value={event.hotel_info?.split('\n')[0]} />
          <TicketRow label="Hotel Address" value="" />
          <TicketRow label="Hotel Rating (1-10)" value="" />
          <TicketRow label="Hotel Comments" value="" />
        </div>

        {/* Center Column - Main Contact */}
        <div className="border-r-2 border-black p-2 space-y-1">
          <div className="font-semibold text-center mb-2 bg-muted/50 py-1">Contact Information</div>
          <TicketRow label="Main Contact Name" value={event.onsite_contact} />
          <TicketRow label="Contact Title" value="" />
          <TicketRow label="Contact Phone" value={event.phone} />
          <TicketRow label="Hospital Phone" value="" />
          <TicketRow label="On-Site Contact" value={event.corporate_contact} />
          <TicketRow label="Onsite Contact Number" value="" />
        </div>

        {/* Right Column - Email/Send To */}
        <div className="p-2 space-y-1">
          <div className="font-semibold text-center mb-2 bg-muted/50 py-1">Send Reports To</div>
          <TicketRow label="Email" value={event.email_data_to} />
          <TicketRow label="CC:" value="" />
          <TicketRow label="Final Invoice To" value={event.final_invoice_to} />
        </div>
      </div>

      {/* Job Information */}
      <div className="border-b-2 border-black">
        <div className="bg-muted/30 text-xs font-bold px-2 py-1 border-b border-black">
          Job Information
        </div>
        <div className="grid grid-cols-4 text-xs">
          <div className="border-r border-black p-2 space-y-1">
            <TicketRow label="Inv. Date" value={format(new Date(event.job_date), 'M/d/yyyy')} highlight />
            <TicketRow label="Scheduled Start Time" value={event.start_time} highlight />
            <TicketRow label="Actual Start Time" value="" />
            <TicketRow label="Actual End Time" value="" />
            <TicketRow label="Duration" value="" />
          </div>
          <div className="border-r border-black p-2 space-y-1">
            <TicketRow label="Arrival Note" value={event.arrival_note} />
            <TicketRow label="Est. Value" value={event.previous_inventory_value} />
          </div>
          <div className="border-r border-black p-2 space-y-1">
            <TicketRow label="Wholesaler" value="" />
            <TicketRow label="Wholesaler Contact Name" value="" />
            <TicketRow label="Contact #" value="" />
            <TicketRow label="GPO" value="" />
            <TicketRow label="340B?" value="" />
          </div>
          <div className="p-2 space-y-1">
            <TicketRow label="Contract #" value="" />
            <div className="text-[10px] space-y-0.5 mt-2">
              <div>A = ABC GPO purchase history</div>
              <div>B = direct purchases (AH, FFF, tillamook)</div>
              <div>C = previous cost data</div>
              <div>D = ABC GPO catalog</div>
            </div>
          </div>
        </div>
      </div>

      {/* Office Notes */}
      <div className="border-b-2 border-black">
        <div className="grid grid-cols-2 text-xs">
          <div className="border-r border-black p-2">
            <div className="font-semibold mb-1">Office Notes:</div>
            <div className="text-[10px] whitespace-pre-wrap min-h-[40px]">
              {event.special_notes || 'Highlight entire row of data that needs attention (yellow or gray)'}
            </div>
          </div>
          <div className="p-2">
            <div className="bg-red-600 text-white text-center py-0.5 text-[10px] font-bold mb-1">
              ==DO NOT PRINT OUT==DO NOT SHARE==
            </div>
          </div>
        </div>
      </div>

      {/* Field Notes */}
      <div className="border-b-2 border-black">
        <div className="bg-muted/30 text-xs font-bold px-2 py-1 border-b border-black">
          Field Notes
        </div>
        <div className="p-2 text-xs">
          <div className="font-semibold text-blue-600 underline mb-1">
            Don't count narcotics spread through Refrigerator
          </div>
          <div className="text-[10px] whitespace-pre-wrap min-h-[40px]">
            {event.notes || 'double check short dates across from Refrigerator\nSmall Narc Room: remind staff to pull audit count sheets\nInfusion Center Inventory will have colored stickers, put IVF data in its own section***'}
          </div>
        </div>
      </div>

      {/* Section List Header */}
      <div className="border-b border-black">
        <div className="grid grid-cols-[60px_120px_1fr_80px_80px_80px_80px_80px_100px_100px_100px_100px] text-[10px] font-semibold bg-muted/50">
          <div className="border-r border-black p-1 text-center">First SECT#</div>
          <div className="border-r border-black p-1">Section List</div>
          <div className="border-r border-black p-1">Description</div>
          <div className="border-r border-black p-1 text-center">Notes</div>
          <div className="border-r border-black p-1 text-center">Cost Sheet</div>
          <div className="border-r border-black p-1 text-center">Employee ID</div>
          <div className="border-r border-black p-1 text-center">Time In</div>
          <div className="border-r border-black p-1 text-center">Time Out</div>
          <div className="border-r border-black p-1 text-center"># of employees</div>
          <div className="border-r border-black p-1 text-center">Hrs. Worked</div>
          <div className="border-r border-black p-1 text-center">Current Inventory Total</div>
          <div className="p-1 text-center">Variance</div>
        </div>
        
        {/* Sample rows */}
        {[
          { sect: '0001', name: 'Pyxis-EDIT', notes: '', sheet: 'GPO', emp: 'JOE', timeIn: '10:15 AM', timeOut: '10:30 AM', count: '1', hrs: '0.20' },
          { sect: '0002', name: 'Anesthesia Meds', notes: '', sheet: 'GPO', emp: 'JOE', timeIn: '10:50 AM', timeOut: '11:00 AM', count: '1', hrs: '0.15' },
          { sect: '0003', name: 'Supplies', notes: 'DELETE', sheet: 'GPO', emp: '', timeIn: '', timeOut: '', count: '', hrs: '' },
          { sect: '0004', name: 'Antibiotic Injectables', notes: '', sheet: 'GPO', emp: 'JOE', timeIn: '10:15 AM', timeOut: '10:50 AM', count: '1', hrs: '0.15' },
          { sect: '0005', name: 'Refrigerator', notes: 'check short dates', sheet: 'GPO', emp: 'JOE', timeIn: '9:00 AM', timeOut: '9:40 AM', count: '1', hrs: '0.40', highlight: true },
        ].map((row, i) => (
          <div 
            key={i} 
            className={cn(
              "grid grid-cols-[60px_120px_1fr_80px_80px_80px_80px_80px_100px_100px_100px_100px] text-[10px] border-t border-black",
              row.highlight && "bg-yellow-200"
            )}
          >
            <div className="border-r border-black p-1 text-center">{row.sect}</div>
            <div className="border-r border-black p-1 text-blue-600 underline">{row.name}</div>
            <div className="border-r border-black p-1"></div>
            <div className="border-r border-black p-1 text-center text-[9px]">{row.notes}</div>
            <div className="border-r border-black p-1 text-center">{row.sheet}</div>
            <div className="border-r border-black p-1 text-center">{row.emp}</div>
            <div className={cn("border-r border-black p-1 text-center", row.highlight && "bg-green-300")}>{row.timeIn}</div>
            <div className="border-r border-black p-1 text-center">{row.timeOut}</div>
            <div className="border-r border-black p-1 text-center">{row.count}</div>
            <div className="border-r border-black p-1 text-center">{row.hrs}</div>
            <div className="border-r border-black p-1 text-center">$</div>
            <div className="p-1 text-center text-red-600">$</div>
          </div>
        ))}
      </div>

      {/* Employee Section */}
      <div className="border-b-2 border-black p-2 text-xs">
        <div className="flex gap-8">
          <div>
            <span className="font-semibold">Employee ID's</span>
          </div>
          <div>
            <span className="font-semibold">Scheduled employees: </span>
            <span className="font-mono">{assignedTeam.join(', ') || 'Not assigned'}</span>
          </div>
        </div>
      </div>

      {/* Tracker Status */}
      {trackerJob && (
        <div className="p-2 text-xs bg-muted/20">
          <div className="flex items-center gap-4">
            <span className="font-semibold">Tracker Status:</span>
            <span 
              className={cn(
                "px-2 py-0.5 rounded text-white text-[10px] font-bold",
                STAGE_CONFIG[trackerJob.stage].color
              )}
            >
              {STAGE_CONFIG[trackerJob.stage].label}
            </span>
            {trackerJob.template_done && (
              <span>Template: {trackerJob.template_done}</span>
            )}
            {trackerJob.ticket_done && (
              <span>Ticket: {trackerJob.ticket_done}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper component for label-value rows
function TicketRow({ 
  label, 
  value, 
  highlight = false 
}: { 
  label: string; 
  value?: string | null; 
  highlight?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="font-semibold whitespace-nowrap">{label}:</span>
      <span className={cn(
        "flex-1",
        highlight && value && "bg-yellow-300 px-1"
      )}>
        {value || ''}
      </span>
    </div>
  );
}