import { useState } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import BottomNav from "@/components/bottom-nav";
import LoginPage from "@/pages/login";
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
  if (!user) return <Redirect to="/login" />;
  if (user.role === "vrs_agent") return <Redirect to="/agent" />;
  if (user.role === "admin") return <Redirect to="/admin" />;

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
  if (!user) return <Redirect to="/login" />;
  if (user.role === "technician") return <Redirect to="/" />;
  if (user.role === "admin") return <Redirect to="/admin" />;

  return <AgentDashboard />;
}

function AdminRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Redirect to="/login" />;
  if (user.role === "technician") return <Redirect to="/" />;
  if (user.role === "vrs_agent") return <Redirect to="/agent" />;

  return <AdminDashboard />;
}

function AuthRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (user) {
    if (user.role === "admin") return <Redirect to="/admin" />;
    if (user.role === "vrs_agent") return <Redirect to="/agent" />;
    return <Redirect to="/" />;
  }
  return <LoginPage />;
}

function HelpRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Redirect to="/login" />;

  if (user.role === "technician") {
    return (
      <>
        <HelpCenterPage />
        <BottomNav />
      </>
    );
  }

  return <HelpCenterPage />;
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
        role={user.role as "technician" | "vrs_agent" | "admin"}
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

function HomeRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Redirect to="/login" />;
  if (user.role === "admin") return <Redirect to="/admin" />;
  if (user.role === "vrs_agent") return <Redirect to="/agent" />;

  return (
    <>
      <TechHomePage />
      <BottomNav />
    </>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={AuthRoute} />
      <Route path="/" component={HomeRedirect} />
      <Route path="/agent" component={AgentRoute} />
      <Route path="/admin" component={AdminRoute} />
      <Route path="/submit">
        {() => <TechRoute component={TechSubmitPage} />}
      </Route>
      <Route path="/history">
        {() => <TechRoute component={TechHistoryPage} />}
      </Route>
      <Route path="/submissions/:id">
        {() => <TechRoute component={SubmissionDetailPage} />}
      </Route>
      <Route path="/help" component={HelpRoute} />
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
