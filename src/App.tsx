import { Toaster } from "@/components/ui/toaster";
import { lazy, Suspense, useEffect, useState } from "react";
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
import FDA from "./pages/FDA";
import Compile from "./pages/Compile";
import About from "./pages/About";
import Dashboard from "./pages/Dashboard";
import ScheduleHub from "./pages/ScheduleHub";
import Timesheet from "./pages/Timesheet";
import Issues from "./pages/Issues";
import LiveTracker from "./pages/LiveTracker";
import Tickets from "./pages/Tickets";
import Chat from "./pages/Chat";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

// Handle OAuth callback tokens in URL hash (for Electron + HashRouter compatibility)
function useOAuthHashHandler() {
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleOAuthHash = async () => {
      const hash = window.location.hash;
      
      // Check if hash contains OAuth tokens (access_token in the fragment)
      if (hash && hash.includes('access_token=')) {
        try {
          // Extract the token portion - it might be after #/ or just #
          let tokenHash = hash;
          if (hash.startsWith('#/')) {
            tokenHash = '#' + hash.substring(2);
          }
          
          // Parse the hash as URL params
          const hashParams = new URLSearchParams(tokenHash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          
          if (accessToken && refreshToken) {
            // Set the session using the tokens
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            
            if (!error) {
              // Clear the hash and redirect to home
              window.location.hash = '#/';
              window.location.reload();
              return;
            }
          }
        } catch (error) {
          console.error('OAuth hash handling error:', error);
        }
      }
      
      setIsProcessing(false);
    };

    handleOAuthHash();
  }, []);

  return isProcessing;
}

// Routes that work offline without auth
const OFFLINE_ALLOWED_ROUTES = ['/scan', '/issues', '/auth'];

function ProtectedRoute({ children, allowOffline = false }: { children: React.ReactNode; allowOffline?: boolean }) {
  const { user, isLoading } = useAuth();
  const isOnline = useOnlineStatus();

  // If offline and this route allows offline access, skip auth check
  if (!isOnline && allowOffline) {
    return <>{children}</>;
  }

  if (isLoading) {
    // If offline while loading, just render the page (don't block)
    if (!isOnline && allowOffline) {
      return <>{children}</>;
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    // If offline, redirect to scan instead of auth
    if (!isOnline) {
      return <Navigate to="/scan" replace />;
    }
    return <Navigate to="/auth" replace />;
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
            <ProtectedRoute>
              <Index />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute>
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
          path="/fda"
          element={
            <ProtectedRoute>
              <FDA />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compile"
          element={
            <ProtectedRoute>
              <Compile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/about"
          element={
            <ProtectedRoute>
              <About />
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
          path="/issues"
          element={
            <ProtectedRoute allowOffline>
              <Issues />
            </ProtectedRoute>
          }
        />
        <Route
          path="/live-tracker"
          element={
            <ProtectedRoute>
              <LiveTracker />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tickets"
          element={
            <ProtectedRoute>
              <Tickets />
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
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

const App = () => {
  const isProcessingOAuth = useOAuthHashHandler();

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
