import { useState, useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window { google: any; }
}

const SCOPES = [
  // Full Drive access is required so the picker can list *every* photo already
  // in the shared folder (drive.file only exposes files this app created) and so
  // selected photos can be renamed into an item's naming convention on import.
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
].join(' ');

export function useGoogleOAuth() {
  const [token, setToken] = useState<string | null>(null);
  const clientRef = useRef<any>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  const initClient = useCallback(() => {
    if (!clientId || !window.google?.accounts?.oauth2) return;
    clientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (resp: { access_token?: string; error?: string }) => {
        if (resp.access_token) setToken(resp.access_token);
        else console.error('Google OAuth error:', resp.error);
      },
    });
  }, [clientId]);

  useEffect(() => {
    if (window.google?.accounts?.oauth2) {
      initClient();
    } else {
      const script = document.getElementById('google-gsi');
      script?.addEventListener('load', initClient);
      return () => script?.removeEventListener('load', initClient);
    }
  }, [initClient]);

  const requestAccess = useCallback(() => {
    if (!clientRef.current) {
      alert('Google OAuth not ready. Make sure VITE_GOOGLE_CLIENT_ID is set in .env.local and the page is fully loaded.');
      return;
    }
    clientRef.current.requestAccessToken();
  }, []);

  const revokeAccess = useCallback(() => {
    if (token) window.google?.accounts?.oauth2?.revoke(token, () => {});
    setToken(null);
  }, [token]);

  return { token, requestAccess, revokeAccess, hasClientId: !!clientId };
}
