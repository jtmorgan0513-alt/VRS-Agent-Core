import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Clock, CheckCircle, XCircle, LogOut, RotateCcw, MessageSquare } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/lib/websocket";
import type { Submission } from "@shared/schema";
import searsLogo from "@assets/sears-home-services-logo-brands_1770949137899.png";

export default function TechHomePage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [onlineAgents, setOnlineAgents] = useState<number>(0);
  const [queuedTickets, setQueuedTickets] = useState<number>(0);

  const { subscribe } = useWebSocket(user?.role);

  const { data: availabilityData } = useQuery<{ onlineAgents: number; queuedTickets: number }>({
    queryKey: ["/api/vrs-availability"],
    refetchInterval: 30000,
    staleTime: 15000,
  });

  useEffect(() => {
    if (availabilityData) {
      setOnlineAgents(availabilityData.onlineAgents);
      setQueuedTickets(availabilityData.queuedTickets);
    }
  }, [availabilityData]);

  useEffect(() => {
    const unsub = subscribe("vrs_availability", (payload: any) => {
      if (payload.onlineAgents !== undefined) setOnlineAgents(payload.onlineAgents);
      if (payload.queuedTickets !== undefined) setQueuedTickets(payload.queuedTickets);
    });
    return unsub;
  }, [subscribe]);

  const { data, isLoading } = useQuery<{ submissions: Submission[] }>({
    queryKey: ["/api/submissions"],
  });

  const submissions = data?.submissions || [];
  const pendingCount = submissions.filter((s) => (s.ticketStatus || s.stage1Status) === "pending" || (s.ticketStatus || s.stage1Status) === "queued").length;
  const approvedCount = submissions.filter((s) => (s.ticketStatus || s.stage1Status) === "completed" || (s.ticketStatus || s.stage1Status) === "approved").length;
  const rejectedCount = submissions.filter((s) => (s.ticketStatus || s.stage1Status) === "rejected" || (s.ticketStatus || s.stage1Status) === "rejected_closed").length;
  const recentSubmissions = submissions.slice(0, 3);

  return (
    <div className="min-h-screen pb-20">
      <div className="bg-primary text-primary-foreground p-4 pb-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-3">
              <img src={searsLogo} alt="Sears Home Services" className="h-8" data-testid="img-logo" />
              <div>
                <h1 className="text-lg font-bold" data-testid="text-welcome">
                  Welcome, {user?.name?.split(" ")[0]}
                </h1>
                <p className="text-sm opacity-80">{user?.racId || "Technician"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="text-primary-foreground no-default-hover-elevate no-default-active-elevate"
                onClick={async () => {
                  await apiRequest("PATCH", "/api/users/me", { firstLogin: true });
                  toast({ title: "Tutorial will show on next login" });
                }}
                data-testid="button-restart-tutorial"
              >
                <RotateCcw className="w-5 h-5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-primary-foreground no-default-hover-elevate no-default-active-elevate"
                onClick={logout}
                data-testid="button-logout"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={() => navigate("/tech/feedback")}
        data-testid="button-feedback"
        className="fixed z-40 flex items-center gap-1.5 bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-full shadow-md hover:shadow-lg hover:bg-primary transition-all duration-200 active:scale-95 text-xs font-medium opacity-85 hover:opacity-100"
        style={{ top: '50%', right: '0.5rem', transform: 'translateY(-50%)' }}
      >
        <span className="text-sm">💬</span>
        Feedback
      </button>

      <div className="max-w-lg mx-auto px-4 -mt-1 mb-2">
        <div className={`flex items-center justify-center gap-3 py-2 px-3 rounded-lg text-sm font-medium ${
          onlineAgents > 0
            ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
            : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800'
        }`} data-testid="banner-vrs-availability">
          <span className={`inline-block w-2 h-2 rounded-full ${
            onlineAgents > 0 ? 'bg-green-500 animate-pulse' : 'bg-amber-500'
          }`} />
          <span data-testid="text-online-agents">
            {onlineAgents > 0
              ? `${onlineAgents} VRS Agent${onlineAgents !== 1 ? 's' : ''} Online`
              : 'No VRS Agents Online'}
          </span>
          <span className="text-muted-foreground">&middot;</span>
          <span data-testid="text-queued-tickets">{queuedTickets} Ticket{queuedTickets !== 1 ? 's' : ''} in Queue</span>
        </div>
        {onlineAgents === 0 && (
          <p className="text-xs text-center text-amber-600 dark:text-amber-400 mt-1" data-testid="text-call-in-notice">
            Please call in for authorization
          </p>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-3 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <Clock className="w-5 h-5 mx-auto mb-1 text-yellow-600 dark:text-yellow-400" />
              <p className="text-2xl font-bold" data-testid="text-pending-count">{isLoading ? "-" : pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <CheckCircle className="w-5 h-5 mx-auto mb-1 text-green-600 dark:text-green-400" />
              <p className="text-2xl font-bold" data-testid="text-approved-count">{isLoading ? "-" : approvedCount}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <XCircle className="w-5 h-5 mx-auto mb-1 text-red-600 dark:text-red-400" />
              <p className="text-2xl font-bold" data-testid="text-rejected-count">{isLoading ? "-" : rejectedCount}</p>
              <p className="text-xs text-muted-foreground">Rejected</p>
            </CardContent>
          </Card>
        </div>

        <Button className="w-full min-h-[44px]" size="lg" data-testid="button-new-submission" onClick={() => navigate("/tech/submit")}>
          <FileText className="w-4 h-4 mr-2" />
          New Submission
        </Button>

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="font-semibold text-sm">Recent Submissions</h2>
            <Link href="/tech/history">
              <span className="text-xs text-primary cursor-pointer" data-testid="link-view-all">View All</span>
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : recentSubmissions.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-center text-sm text-muted-foreground">
                No submissions yet. Tap "New Submission" to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentSubmissions.map((sub) => (
                <Link key={sub.id} href={`/tech/submissions/${sub.id}`}>
                  <Card className="hover-elevate cursor-pointer">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium" data-testid={`text-so-${sub.id}`}>
                            SO #{sub.serviceOrder}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {sub.applianceType.replace("_", " ")} - {sub.requestType.replace("_", " ")}
                          </p>
                        </div>
                        <StatusBadge status={sub.ticketStatus || sub.stage1Status} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "queued":
    case "pending":
      return <Badge variant="secondary" data-testid="badge-pending">Pending</Badge>;
    case "completed":
    case "approved":
      return <Badge className="bg-green-600 text-white border-green-600" data-testid="badge-approved">Approved</Badge>;
    case "rejected":
      return <Badge variant="destructive" data-testid="badge-rejected">Rejected</Badge>;
    case "rejected_closed":
      return <Badge variant="destructive" data-testid="badge-rejected-closed">Closed — Not Covered</Badge>;
    case "invalid":
      return <Badge variant="outline" data-testid="badge-invalid">Invalid</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}
