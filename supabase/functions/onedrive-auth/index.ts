import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AZURE_CLIENT_ID = Deno.env.get('AZURE_CLIENT_ID')!;
const AZURE_CLIENT_SECRET = Deno.env.get('AZURE_CLIENT_SECRET')!;
// Use 'consumers' for personal Microsoft accounts (outlook.com, hotmail.com, live.com)
const AZURE_TENANT = 'consumers';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, code, redirectUri, refreshToken } = await req.json();
    console.log(`OneDrive Auth: Processing action '${action}'`);

    if (action === 'get-auth-url') {
      // Generate the OAuth authorization URL
      const scope = encodeURIComponent('Files.Read Files.ReadWrite User.Read offline_access');
      const authUrl = `https://login.microsoftonline.com/${AZURE_TENANT}/oauth2/v2.0/authorize?` +
        `client_id=${AZURE_CLIENT_ID}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${scope}` +
        `&response_mode=query`;

      console.log('Generated auth URL for OneDrive');
      return new Response(
        JSON.stringify({ authUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'exchange-code') {
      // Exchange authorization code for tokens
      console.log('Exchanging code for tokens...');
      
      const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT}/oauth2/v2.0/token`;
      const body = new URLSearchParams({
        client_id: AZURE_CLIENT_ID,
        client_secret: AZURE_CLIENT_SECRET,
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'Files.Read Files.ReadWrite User.Read offline_access',
      });

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const tokenData = await response.json();

      if (!response.ok) {
        console.error('Token exchange failed:', tokenData);
        throw new Error(tokenData.error_description || 'Failed to exchange code');
      }

      console.log('Token exchange successful');
      return new Response(
        JSON.stringify({
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresIn: tokenData.expires_in,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'refresh-token') {
      // Refresh the access token
      console.log('Refreshing access token...');
      
      const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT}/oauth2/v2.0/token`;
      const body = new URLSearchParams({
        client_id: AZURE_CLIENT_ID,
        client_secret: AZURE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'Files.Read Files.ReadWrite User.Read offline_access',
      });

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const tokenData = await response.json();

      if (!response.ok) {
        console.error('Token refresh failed:', tokenData);
        throw new Error(tokenData.error_description || 'Failed to refresh token');
      }

      console.log('Token refresh successful');
      return new Response(
        JSON.stringify({
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || refreshToken,
          expiresIn: tokenData.expires_in,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('OneDrive Auth Error:', error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
