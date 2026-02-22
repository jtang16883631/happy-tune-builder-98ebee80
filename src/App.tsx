import { Toaster } from "@/components/ui/toaster";
import { useEffect, useState } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import { OfflineRedirect, useOnlineStatus } from "@/components/OfflineRedirect";
import { UpdateBanner } from "@/components/UpdateBanner";
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
import Equipment from "./pages/Equipment";
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
  const isOnline = useOnlineStatus();
  
  useEffect(() => {
    // If offline, don't wait for OAuth processing
    if (!isOnline) {
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
  }, [isOnline]);
  
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

  // While connectivity is being determined (isOnline starts false until first ping),
  // show a spinner so we don't flash the wrong layout.
  // Exception: if browser explicitly says offline AND we have a cached session, skip the wait.
  const connectivityKnown = isOnline || !navigator.onLine || hasCachedSession;
  if (!connectivityKnown) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If offline and this route allows offline access, always render children.
  // The OfflineLayout wrapper in AppLayout handles the locked UI.
  if (!isOnline && allowOffline) {
    return <>{children}</>;
  }

  // If offline on ANY route and we have a cached session, never redirect to auth.
  // The OfflineRedirect component will handle routing to /scan if needed.
  if (!isOnline && hasCachedSession) {
    // Still loading? Show spinner only briefly, then render
    if (isLoading || !rolesLoaded) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }
    // Render children — OfflineRedirect will push non-offline routes to /scan
    return <>{children}</>;
  }

  // While auth is loading online
  if (isLoading || !rolesLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
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
            <ProtectedRoute>
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
            <ProtectedRoute requiredRoles={['owner', 'developer']}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scan"
          element={
            <ProtectedRoute allowOffline>
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
            <ProtectedRoute allowOffline>
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
            <ProtectedRoute>
              <UpdateLog />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suggestion"
          element={
            <ProtectedRoute>
              <Suggestion />
            </ProtectedRoute>
          }
        />
        <Route
          path="/schedule"
          element={
            <ProtectedRoute>
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
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
        <Route
          path="/equipment"
          element={
            <ProtectedRoute redirectAuditors>
              <Equipment />
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
        <UpdateBanner />
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
