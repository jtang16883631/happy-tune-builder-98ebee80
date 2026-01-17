import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScheduleEvent {
  id: string;
  job_date: string;
  end_date: string | null;
  event_type: 'work' | 'travel' | 'off' | 'note' | null;
  event_title: string | null;
  invoice_number: string | null;
  start_time: string | null;
  arrival_note: string | null;
  client_name: string;
  client_id: string | null;
  address: string | null;
  phone: string | null;
  previous_inventory_value: string | null;
  onsite_contact: string | null;
  corporate_contact: string | null;
  email_data_to: string | null;
  final_invoice_to: string | null;
  notes: string | null;
  special_notes: string | null;
  team_member_names: string[];
  team_count: number | null;
  is_travel_day: boolean | null;
  travel_info: string | null;
  hotel_info: string | null;
  location_from: string | null;
  location_to: string | null;
  exact_count_required: boolean | null;
  partial_inventory: boolean | null;
  client_onsite: boolean | null;
}

interface ExportRequest {
  startDate: string;
  endDate: string;
  events: ScheduleEvent[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { startDate, endDate, events } = await req.json() as ExportRequest;

    if (!startDate || !events) {
      return new Response(
        JSON.stringify({ error: 'startDate and events are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Exporting schedule from ${startDate} to ${endDate} with ${events.length} events`);

    // Group events by date
    const eventsByDate = groupEventsByDate(events);
    
    // Format the schedule as text (Google Docs format)
    const formattedSchedule = formatScheduleForDocs(startDate, endDate, eventsByDate);

    // Check if Google API credentials are configured
    const googleCredentials = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
    
    if (googleCredentials) {
      try {
        // Parse the service account credentials
        const credentials = JSON.parse(googleCredentials);
        
        // Create a Google Doc with the formatted content
        const docUrl = await createGoogleDoc(credentials, formattedSchedule, startDate, endDate);
        
        console.log('Google Doc created:', docUrl);
        
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Schedule exported to Google Docs!',
            documentUrl: docUrl,
            content: formattedSchedule 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (googleError) {
        console.error('Google Docs API error:', googleError);
        // Fall back to returning formatted content
        return new Response(
          JSON.stringify({ 
            success: true,
            message: 'Google Docs export failed, but content is ready for clipboard.',
            content: formattedSchedule,
            error: String(googleError)
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Return formatted content for clipboard copy
      console.log('No Google credentials configured, returning formatted content');
      
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Schedule formatted. Add GOOGLE_SERVICE_ACCOUNT_KEY secret to enable Google Docs export.',
          content: formattedSchedule 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Export error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to export schedule', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function groupEventsByDate(events: ScheduleEvent[]): Map<string, ScheduleEvent[]> {
  const map = new Map<string, ScheduleEvent[]>();
  
  for (const event of events) {
    const date = event.job_date;
    if (!map.has(date)) {
      map.set(date, []);
    }
    map.get(date)!.push(event);
  }
  
  // Sort dates
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function formatScheduleForDocs(startDate: string, endDate: string, eventsByDate: Map<string, ScheduleEvent[]>): string {
  let output = '';
  
  // Add header
  const startDateObj = new Date(startDate + 'T00:00:00');
  const endDateObj = new Date(endDate + 'T00:00:00');
  
  output += `MERIDIAN SCHEDULE\n`;
  output += `${formatDateLong(startDateObj)} - ${formatDateLong(endDateObj)}\n`;
  output += '='.repeat(60) + '\n\n';

  for (const [dateStr, dayEvents] of eventsByDate) {
    const dateObj = new Date(dateStr + 'T00:00:00');
    
    output += `${formatDateLong(dateObj)}\n`;
    output += '-'.repeat(50) + '\n';

    // Find travel day info
    const travelEvent = dayEvents.find(e => e.event_type === 'travel' || e.is_travel_day);
    if (travelEvent) {
      output += '\n***Travel ONLY***\n';
      if (travelEvent.location_from && travelEvent.location_to) {
        output += `-${travelEvent.location_from} to ${travelEvent.location_to}\n`;
      } else if (travelEvent.travel_info) {
        output += `-${travelEvent.travel_info}\n`;
      }
      if (travelEvent.team_member_names?.length) {
        output += `Team: {${travelEvent.team_member_names.join('}+{')}}\n`;
      }
      if (travelEvent.hotel_info) {
        output += `Hotel Info: ${travelEvent.hotel_info}\n`;
      }
      output += '\n';
    }

    // Off day check
    const offEvent = dayEvents.find(e => e.event_type === 'off');
    if (offEvent) {
      output += '\nALL off per schedule\n';
      if (offEvent.event_title) {
        output += `(${offEvent.event_title})\n`;
      }
      if (offEvent.team_member_names?.length) {
        output += `Team: ${offEvent.team_member_names.join(', ')}\n`;
      }
      output += '\n';
    }

    // Note events
    const noteEvents = dayEvents.filter(e => e.event_type === 'note');
    for (const noteEvent of noteEvents) {
      output += `\n***NOTE: ${noteEvent.event_title || noteEvent.notes || 'Important'}***\n`;
      if (noteEvent.notes && noteEvent.notes !== noteEvent.event_title) {
        output += `${noteEvent.notes}\n`;
      }
      output += '\n';
    }

    // Regular work events
    const workEvents = dayEvents.filter(e => 
      e.event_type === 'work' || (!e.event_type && !e.is_travel_day && e.event_type !== 'off' && e.event_type !== 'note')
    );
    
    for (const event of workEvents) {
      output += '\n';
      
      // Invoice and start time line
      if (event.invoice_number) {
        output += `-Invoice: ${event.invoice_number}`;
        if (event.start_time) {
          output += ` START: ${event.start_time}`;
        }
        if (event.arrival_note) {
          output += ` NOTE: ${event.arrival_note}`;
        }
        output += '\n';
      } else if (event.start_time) {
        output += `START: ${event.start_time}`;
        if (event.arrival_note) {
          output += ` NOTE: ${event.arrival_note}`;
        }
        output += '\n';
      }

      // Team members
      if (event.team_member_names?.length) {
        output += `(${event.team_member_names.length})${event.team_member_names.join('+')}` + '\n';
      }

      // Special flags
      if (event.exact_count_required) {
        output += `***NOTE: Exact Count Required***\n`;
      }
      if (event.partial_inventory) {
        output += `***NOTE: Partial Inventory***\n`;
      }
      if (event.client_onsite) {
        output += `***NOTE: Client On-site***\n`;
      }

      // Notes (highlighted)
      if (event.notes) {
        output += `NOTE: ${event.notes}\n`;
      }
      if (event.special_notes) {
        output += `***NOTE: ${event.special_notes}***\n`;
      }

      // Client info
      if (event.client_id) {
        output += `Client: ${event.client_id} - ${event.client_name}\n`;
      } else {
        output += `Client: ${event.client_name}\n`;
      }

      if (event.address) {
        output += `Address: ${event.address}\n`;
      }

      if (event.previous_inventory_value) {
        output += `Previous Inventory Value: ${event.previous_inventory_value}\n`;
      }

      if (event.phone) {
        output += `MH: Phone: FacPh: ${event.phone}\n`;
      }

      if (event.onsite_contact) {
        output += `Onsite Contact: ${event.onsite_contact}\n`;
      }

      if (event.corporate_contact) {
        output += `Corporate Contact: ${event.corporate_contact}\n`;
      }

      if (event.email_data_to) {
        output += `Email data to: ${event.email_data_to}\n`;
      }

      if (event.final_invoice_to) {
        output += `Final invoice: ${event.final_invoice_to}\n`;
      }
    }

    output += '\n';
  }

  return output;
}

function formatDateLong(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// Google Docs API integration
async function createGoogleDoc(credentials: any, content: string, startDate: string, endDate: string): Promise<string> {
  // Get access token using service account
  const accessToken = await getGoogleAccessToken(credentials);
  
  // Create a new Google Doc
  const createResponse = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: `Meridian Schedule ${startDate} - ${endDate}`,
    }),
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Failed to create Google Doc: ${error}`);
  }

  const doc = await createResponse.json();
  const documentId = doc.documentId;

  // Insert the formatted content
  const updateResponse = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          insertText: {
            location: { index: 1 },
            text: content,
          },
        },
      ],
    }),
  });

  if (!updateResponse.ok) {
    const error = await updateResponse.text();
    throw new Error(`Failed to update Google Doc: ${error}`);
  }

  return `https://docs.google.com/document/d/${documentId}/edit`;
}

async function getGoogleAccessToken(credentials: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  // Create JWT header and payload
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: expiry,
  };

  // Sign the JWT
  const jwt = await signJwt(header, payload, credentials.private_key);

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function signJwt(header: any, payload: any, privateKeyPem: string): Promise<string> {
  const encoder = new TextEncoder();
  
  // Base64url encode header and payload
  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  
  const signatureInput = `${headerB64}.${payloadB64}`;
  
  // Import the private key
  const pemContents = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  // Sign the input
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signatureInput)
  );
  
  // Base64url encode the signature
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return `${signatureInput}.${signatureB64}`;
}
