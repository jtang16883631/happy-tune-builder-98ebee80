import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, accessToken, path, folderId, fileName, fileContent } = await req.json();
    console.log(`OneDrive API: Processing action '${action}'`);

    if (!accessToken) {
      throw new Error('Access token is required');
    }

    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    if (action === 'get-user') {
      // Get current user info
      const response = await fetch(`${GRAPH_API_BASE}/me`, { headers });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to get user info');
      }

      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'list-files') {
      // List files in a folder (root if no folderId)
      const endpoint = folderId 
        ? `${GRAPH_API_BASE}/me/drive/items/${folderId}/children`
        : `${GRAPH_API_BASE}/me/drive/root/children`;
      
      const response = await fetch(endpoint, { headers });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to list files');
      }

      console.log(`Listed ${data.value?.length || 0} items`);
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'get-file') {
      // Get file metadata
      const response = await fetch(`${GRAPH_API_BASE}/me/drive/items/${path}`, { headers });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to get file');
      }

      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'download-file') {
      // Get file download URL
      const response = await fetch(`${GRAPH_API_BASE}/me/drive/items/${path}/content`, {
        headers,
        redirect: 'manual',
      });

      // Graph API returns a 302 redirect to the actual download URL
      if (response.status === 302) {
        const downloadUrl = response.headers.get('Location');
        return new Response(
          JSON.stringify({ downloadUrl }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If small file, might return content directly
      const content = await response.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(content)));
      
      return new Response(
        JSON.stringify({ content: base64, contentType: response.headers.get('Content-Type') }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'upload-file') {
      // Upload a file (for files up to 4MB)
      const parentPath = folderId ? `/items/${folderId}:` : '/root:';
      const uploadUrl = `${GRAPH_API_BASE}/me/drive${parentPath}/${fileName}:/content`;
      
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream',
        },
        body: Uint8Array.from(atob(fileContent), c => c.charCodeAt(0)),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to upload file');
      }

      console.log(`Uploaded file: ${fileName}`);
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'create-folder') {
      // Create a new folder
      const parentId = folderId || 'root';
      const response = await fetch(`${GRAPH_API_BASE}/me/drive/items/${parentId}/children`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: fileName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename',
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to create folder');
      }

      console.log(`Created folder: ${fileName}`);
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'delete-item') {
      // Delete a file or folder
      const response = await fetch(`${GRAPH_API_BASE}/me/drive/items/${path}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok && response.status !== 204) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to delete item');
      }

      console.log(`Deleted item: ${path}`);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'search') {
      // Search for files
      const response = await fetch(
        `${GRAPH_API_BASE}/me/drive/root/search(q='${encodeURIComponent(path)}')`,
        { headers }
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to search');
      }

      console.log(`Search found ${data.value?.length || 0} results`);
      return new Response(
        JSON.stringify(data),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('OneDrive API Error:', error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
