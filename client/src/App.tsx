import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
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
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <>
      <Component />
      <BottomNav />
    </>
  );
}

function AuthRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (user) return <Redirect to="/" />;
  return <LoginPage />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={AuthRoute} />
      <Route path="/">
        {() => <ProtectedRoute component={TechHomePage} />}
      </Route>
      <Route path="/submit">
        {() => <ProtectedRoute component={TechSubmitPage} />}
      </Route>
      <Route path="/history">
        {() => <ProtectedRoute component={TechHistoryPage} />}
      </Route>
      <Route path="/submissions/:id">
        {() => <ProtectedRoute component={SubmissionDetailPage} />}
      </Route>
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
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
