import { useState } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import BottomNav from "@/components/bottom-nav";
import LandingPage from "@/pages/landing";
import TechLoginPage from "@/pages/tech-login";
import AgentLoginPage from "@/pages/agent-login";
import AdminLoginPage from "@/pages/admin-login";
import TechHomePage from "@/pages/tech-home";
import TechSubmitPage from "@/pages/tech-submit";
import TechHistoryPage from "@/pages/tech-history";
import SubmissionDetailPage from "@/pages/submission-detail";
import AgentDashboard from "@/pages/agent-dashboard";
import AdminDashboard from "@/pages/admin-dashboard";
import NotFound from "@/pages/not-found";
import InstallPrompt from "@/components/install-prompt";
import OnboardingWizard from "@/components/onboarding-wizard";
import WhatsNewModal from "@/components/whats-new-modal";
import HelpCenterPage from "@/pages/help-center";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function TechRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!user) return <Redirect to="/tech/login" />;
  if (user.role === "vrs_agent") return <Redirect to="/agent/dashboard" />;
  if (user.role === "admin" || user.role === "super_admin") return <Redirect to="/admin/dashboard" />;
  return (
    <>
      <Component />
      <BottomNav />
    </>
  );
}

function AgentRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!user) return <Redirect to="/agent/login" />;
  if (user.role === "technician") return <Redirect to="/tech" />;
  if (user.role === "admin" || user.role === "super_admin") return <Redirect to="/admin/dashboard" />;
  return <AgentDashboard />;
}

function AdminRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!user) return <Redirect to="/admin/login" />;
  if (user.role === "technician") return <Redirect to="/tech" />;
  if (user.role === "vrs_agent") return <Redirect to="/agent/dashboard" />;
  return <AdminDashboard />;
}

function LandingRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (user) {
    if (user.role === "admin" || user.role === "super_admin") return <Redirect to="/admin/dashboard" />;
    if (user.role === "vrs_agent") return <Redirect to="/agent/dashboard" />;
    return <Redirect to="/tech" />;
  }
  return <LandingPage />;
}

function OnboardingManager() {
  const { user, refreshUser } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!user) return null;

  const appVersion = import.meta.env.VITE_APP_VERSION || "1.0.0";
  const showOnboarding = !dismissed && user.firstLogin === true;
  const showWhatsNew = !dismissed && !showOnboarding && user.lastSeenVersion !== appVersion;

  const handleWizardComplete = async () => {
    setDismissed(true);
    try {
      await apiRequest("PATCH", "/api/users/me", {
        firstLogin: false,
        lastSeenVersion: appVersion,
      });
    } catch (e) {
      console.error("Failed to dismiss onboarding:", e);
    }
    refreshUser();
  };

  const handleWhatsNewDismiss = async () => {
    setDismissed(true);
    try {
      await apiRequest("PATCH", "/api/users/me", {
        lastSeenVersion: appVersion,
      });
    } catch (e) {
      console.error("Failed to dismiss what's new:", e);
    }
    refreshUser();
  };

  return (
    <div data-testid="onboarding-manager">
      <OnboardingWizard
        role={user.role as "technician" | "vrs_agent" | "admin" | "super_admin"}
        open={showOnboarding}
        onComplete={handleWizardComplete}
      />
      <WhatsNewModal
        open={showWhatsNew}
        onDismiss={handleWhatsNewDismiss}
        version={appVersion}
      />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingRoute} />
      <Route path="/tech/login" component={TechLoginPage} />
      <Route path="/agent/login" component={AgentLoginPage} />
      <Route path="/admin/login" component={AdminLoginPage} />
      <Route path="/tech">
        {() => <TechRoute component={TechHomePage} />}
      </Route>
      <Route path="/tech/submit">
        {() => <TechRoute component={TechSubmitPage} />}
      </Route>
      <Route path="/tech/history">
        {() => <TechRoute component={TechHistoryPage} />}
      </Route>
      <Route path="/tech/submissions/:id">
        {() => <TechRoute component={SubmissionDetailPage} />}
      </Route>
      <Route path="/agent/dashboard" component={AgentRoute} />
      <Route path="/admin/dashboard" component={AdminRoute} />
      <Route path="/tech/help">
        {() => <TechRoute component={HelpCenterPage} />}
      </Route>
      <Route path="/login">{() => <Redirect to="/" />}</Route>
      <Route path="/submit">{() => <Redirect to="/tech/submit" />}</Route>
      <Route path="/history">{() => <Redirect to="/tech/history" />}</Route>
      <Route path="/submissions/:id">
        {(params: { id: string }) => <Redirect to={`/tech/submissions/${params.id}`} />}
      </Route>
      <Route path="/help">{() => <Redirect to="/tech/help" />}</Route>
      <Route path="/agent">{() => <Redirect to="/agent/dashboard" />}</Route>
      <Route path="/admin">{() => <Redirect to="/admin/dashboard" />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
          <OnboardingManager />
          <InstallPrompt />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
