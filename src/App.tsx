import { Toaster } from "@/components/ui/toaster";
import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { UpdateNotification } from "@/components/UpdateNotification";
import { OfflineRedirect, useOnlineStatus } from "@/components/OfflineRedirect";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import Users from "./pages/Users";
import Scan from "./pages/Scan";
import FDA from "./pages/FDA";
import Dashboard from "./pages/Dashboard";
import ScheduleHub from "./pages/ScheduleHub";
import Timesheet from "./pages/Timesheet";
import Issues from "./pages/Issues";
import LiveTracker from "./pages/LiveTracker";
import Chat from "./pages/Chat";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

// Routes that work offline without auth
const OFFLINE_ALLOWED_ROUTES = ['/scan', '/issues'];

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <UpdateNotification />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
