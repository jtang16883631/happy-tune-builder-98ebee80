import { Toaster } from "@/components/ui/toaster";
import { useEffect, useState } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { UpdateNotification } from "@/components/UpdateNotification";
import { OfflineRedirect, useOnlineStatus } from "@/components/OfflineRedirect";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import Users from "./pages/Users";
import Scan from "./pages/Scan";
import Automation from "./pages/Automation";
import FDA from "./pages/FDA";
import Compile from "./pages/Compile";
import UpdateLog from "./pages/UpdateLog";
import Suggestion from "./pages/Suggestion";
import Dashboard from "./pages/Dashboard";
import ScheduleHub from "./pages/ScheduleHub";
import Timesheet from "./pages/Timesheet";
import TimesheetSummary from "./pages/TimesheetSummary";
import Issues from "./pages/Issues";
import LiveTracker from "./pages/LiveTracker";
import Tickets from "./pages/Tickets";
import Chat from "./pages/Chat";
import OneDrive from "./pages/OneDrive";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

// ============================================
// CRITICAL: Handle OAuth tokens BEFORE React renders
// This runs synchronously when the module loads
// ============================================
function handleOAuthRedirectSync(): boolean {
  const fullUrl = window.location.href;
  
  // Check if URL contains OAuth tokens
  if (!fullUrl.includes('access_token=')) {
    return false;
  }
  
  console.log('[OAuth] Detected OAuth tokens in URL, processing...');
  
  try {
    // Extract token string starting from access_token
    const accessTokenIndex = fullUrl.indexOf('access_token=');
    const tokenString = fullUrl.substring(accessTokenIndex);
    
    // Parse as URL params
    const params = new URLSearchParams(tokenString);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    
    if (accessToken && refreshToken) {
      console.log('[OAuth] Found valid tokens, setting session...');
      
      // Set session asynchronously but flag that we're handling it
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).then(({ error }) => {
        if (error) {
          console.error('[OAuth] Session error:', error);
        } else {
          console.log('[OAuth] Session set successfully, redirecting...');
        }
        // Clean the URL and reload regardless of success
        window.location.href = window.location.origin + window.location.pathname + '#/';
      });
      
      return true; // Signal that we're handling OAuth
    }
  } catch (error) {
    console.error('[OAuth] Error processing tokens:', error);
  }
  
  return false;
}

// Run immediately when module loads
const isHandlingOAuth = handleOAuthRedirectSync();

// Hook to wait for OAuth processing
function useOAuthHandler() {
  const [isProcessing, setIsProcessing] = useState(isHandlingOAuth);
  
  useEffect(() => {
    // If offline, don't wait for OAuth processing
    if (!navigator.onLine) {
      setIsProcessing(false);
      return;
    }
    
    // If we started handling OAuth, wait a bit then check if we're still here
    // (we should have redirected, but just in case)
    if (isHandlingOAuth) {
      const timer = setTimeout(() => {
        setIsProcessing(false);
      }, 3000); // 3 second timeout
      return () => clearTimeout(timer);
    }
  }, []);
  
  return isProcessing;
}

// Routes that work offline without auth - Master Data (FDA) and Audit Projects (Scan)
const OFFLINE_ALLOWED_ROUTES = ['/scan', '/fda', '/auth'];

function ProtectedRoute({ 
  children, 
  allowOffline = false,
  requiredRoles = [],
  redirectAuditors = false,
}: { 
  children: React.ReactNode; 
  allowOffline?: boolean;
  requiredRoles?: string[];
  redirectAuditors?: boolean;
}) {
  const { user, isLoading, roles, rolesLoaded } = useAuth();
  const isOnline = useOnlineStatus();

  // Check if we have a cached user ID (set during last successful login)
  const hasCachedSession = !!localStorage.getItem('cached_user_id');

  // If offline and this route allows offline access, always let through
  if (!isOnline && allowOffline) {
    return <>{children}</>;
  }

  // While auth is loading: if offline with cached session, don't block (show page immediately)
  if (isLoading || !rolesLoaded) {
    if (!isOnline && hasCachedSession) {
      return <>{children}</>;
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // If offline and we have a cached session, redirect to scan (offline mode)
    if (!isOnline && hasCachedSession) {
      return <Navigate to="/scan" replace />;
    }
    // If online but no session, also try to redirect to /scan if cached (race condition)
    if (!isOnline) {
      return <Navigate to="/scan" replace />;
    }
    return <Navigate to="/auth" replace />;
  }

  // Check if user is auditor-only (has auditor role but no privileged roles)
  const isAuditorOnly = roles.includes('auditor') && 
    !roles.includes('owner') && 
    !roles.includes('developer') && 
    !roles.includes('coordinator') && 
    !roles.includes('office_admin');

  // Redirect auditor-only users away from pages they shouldn't access
  if (redirectAuditors && isAuditorOnly) {
    return <Navigate to="/timesheet" replace />;
  }

  // Check role requirements if specified
  if (requiredRoles.length > 0) {
    const hasRequiredRole = requiredRoles.some(role => roles.includes(role as any));
    if (!hasRequiredRole) {
      if (isAuditorOnly) {
        return <Navigate to="/timesheet" replace />;
      }
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <>
      <OfflineRedirect />
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute redirectAuditors>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/data-template"
          element={
            <ProtectedRoute redirectAuditors>
              <Index />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute redirectAuditors>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scan"
          element={
            <ProtectedRoute allowOffline redirectAuditors>
              <Scan />
            </ProtectedRoute>
          }
        />
        <Route
          path="/automation"
          element={
            <ProtectedRoute redirectAuditors>
              <Automation />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fda"
          element={
            <ProtectedRoute allowOffline redirectAuditors>
              <FDA />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compile"
          element={
            <ProtectedRoute redirectAuditors>
              <Compile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/update-log"
          element={
            <ProtectedRoute redirectAuditors>
              <UpdateLog />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suggestion"
          element={
            <ProtectedRoute redirectAuditors>
              <Suggestion />
            </ProtectedRoute>
          }
        />
        <Route
          path="/schedule"
          element={
            <ProtectedRoute redirectAuditors>
              <ScheduleHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/timesheet"
          element={
            <ProtectedRoute>
              <Timesheet />
            </ProtectedRoute>
          }
        />
        <Route
          path="/timesheet-summary"
          element={
            <ProtectedRoute requiredRoles={['owner']}>
              <TimesheetSummary />
            </ProtectedRoute>
          }
        />
        <Route
          path="/issues"
          element={
            <ProtectedRoute redirectAuditors>
              <Issues />
            </ProtectedRoute>
          }
        />
        <Route
          path="/live-tracker"
          element={
            <ProtectedRoute redirectAuditors>
              <LiveTracker />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tickets"
          element={
            <ProtectedRoute redirectAuditors>
              <Tickets />
            </ProtectedRoute>
          }
        />
        <Route
          path="/onedrive"
          element={
            <ProtectedRoute redirectAuditors>
              <OneDrive />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute redirectAuditors>
              <Chat />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

const App = () => {
  const isProcessingOAuth = useOAuthHandler();

  // Show loading while processing OAuth tokens
  if (isProcessingOAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <UpdateNotification />
        <HashRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
