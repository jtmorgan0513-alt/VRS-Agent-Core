import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Submission } from "@shared/schema";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ClipboardCheck,
  ClipboardList,
  CheckCircle2,
  LogOut,
  Clock,
  User,
  Phone,
  FileText,
  DollarSign,
  Wrench,
  AlertTriangle,
  Filter,
  ToggleLeft,
  ToggleRight,
  Image as ImageIcon,
  ShieldCheck,
  ShieldX,
} from "lucide-react";

type SubmissionWithTech = Submission & {
  technicianName: string;
  technicianPhone: string | null;
};

const DIVISION_LABELS: Record<string, string> = {
  refrigeration: "Refrigeration",
  laundry: "Laundry",
  cooking: "Cooking",
  dishwasher: "Dishwasher",
  microwave: "Microwave",
  hvac: "HVAC",
};

const APPLIANCE_LABELS: Record<string, string> = {
  refrigeration: "Refrigerator",
  laundry: "Laundry",
  cooking: "Cooking",
  dishwasher: "Dishwasher",
  microwave: "Microwave",
  hvac: "HVAC",
};

function getTimeElapsed(createdAt: string | Date): string {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ${diffHours % 24}h`;
}

function getUrgencyLevel(createdAt: string | Date): "normal" | "warning" | "urgent" {
  const created = new Date(createdAt);
  const now = new Date();
  const diffHours = (now.getTime() - created.getTime()) / 3600000;
  if (diffHours >= 4) return "urgent";
  if (diffHours >= 2) return "warning";
  return "normal";
}

export default function AgentDashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<"stage1" | "stage2" | "completed">("stage1");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [myAssignments, setMyAssignments] = useState(true);
  const [divisionFilter, setDivisionFilter] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (activeView === "stage1") {
      params.set("stage1Status", "pending");
    } else if (activeView === "stage2") {
      params.set("stage1Status", "approved");
      params.set("stage2Status", "pending");
    } else if (activeView === "completed") {
      params.set("completedToday", "true");
    }
    if (!myAssignments) {
      params.set("allQueue", "true");
    }
    if (divisionFilter) {
      params.set("applianceType", divisionFilter);
    }
    return params.toString();
  }, [activeView, myAssignments, divisionFilter]);

  const submissionsUrl = queryParams ? `/api/submissions?${queryParams}` : "/api/submissions";

  const { data: submissionsData, isLoading } = useQuery<{ submissions: SubmissionWithTech[] }>({
    queryKey: [submissionsUrl],
  });

  const { data: statsData } = useQuery<{ queueCount: number; completedToday: number }>({
    queryKey: ["/api/agent/stats"],
  });

  const submissions = submissionsData?.submissions || [];
  const selectedSubmission = submissions.find((s) => s.id === selectedId) || null;

  const approveMutation = useMutation({
    mutationFn: async (submissionId: number) => {
      const res = await apiRequest("PATCH", `/api/submissions/${submissionId}/stage1`, {
        action: "approve",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Approved", description: "Submission approved and technician will be notified." });
      setSelectedId(null);
      setRejectionReason("");
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ submissionId, reason }: { submissionId: number; reason: string }) => {
      const res = await apiRequest("PATCH", `/api/submissions/${submissionId}/stage1`, {
        action: "reject",
        rejectionReason: reason,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rejected", description: "Submission rejected and technician will be notified." });
      setSelectedId(null);
      setRejectionReason("");
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full" data-testid="agent-dashboard">
        <Sidebar>
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <span className="font-semibold text-sm" data-testid="text-sidebar-title">VRS Agent</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-agent-name">{user?.name}</p>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Queue</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => { setActiveView("stage1"); setSelectedId(null); }}
                      data-active={activeView === "stage1"}
                      data-testid="nav-stage1"
                    >
                      <ClipboardList className="w-4 h-4" />
                      <span>Stage 1 Queue</span>
                      {statsData && activeView !== "stage1" && (
                        <Badge variant="secondary" className="ml-auto text-xs" data-testid="badge-stage1-count">
                          {statsData.queueCount}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => { setActiveView("stage2"); setSelectedId(null); }}
                      data-active={activeView === "stage2"}
                      data-testid="nav-stage2"
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      <span>Stage 2 Queue</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => { setActiveView("completed"); setSelectedId(null); }}
                      data-active={activeView === "completed"}
                      data-testid="nav-completed"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Completed Today</span>
                      {statsData && (
                        <Badge variant="outline" className="ml-auto text-xs" data-testid="badge-completed-count">
                          {statsData.completedToday}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <Separator className="my-2" />

            <SidebarGroup>
              <SidebarGroupLabel>Division Filters</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setDivisionFilter(null)}
                      data-active={divisionFilter === null}
                      data-testid="filter-all"
                    >
                      <Filter className="w-4 h-4" />
                      <span>All Divisions</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {Object.entries(DIVISION_LABELS).map(([key, label]) => (
                    <SidebarMenuItem key={key}>
                      <SidebarMenuButton
                        onClick={() => setDivisionFilter(key)}
                        data-active={divisionFilter === key}
                        data-testid={`filter-${key}`}
                      >
                        <Wrench className="w-4 h-4" />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-4">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </Button>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between gap-2 p-3 border-b sticky top-0 z-50 bg-background">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <h1 className="text-lg font-semibold" data-testid="text-page-title">
                {activeView === "stage1" && "Stage 1 - Submission Review"}
                {activeView === "stage2" && "Stage 2 - Auth Code Issuance"}
                {activeView === "completed" && "Completed Today"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMyAssignments(!myAssignments)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover-elevate rounded-md px-3 py-1.5"
                data-testid="toggle-assignments"
              >
                {myAssignments ? (
                  <ToggleRight className="w-5 h-5 text-primary" />
                ) : (
                  <ToggleLeft className="w-5 h-5" />
                )}
                <span>{myAssignments ? "My Assignments" : "All Queue"}</span>
              </button>
            </div>
          </header>

          <div className="flex flex-1 min-h-0">
            <div className="w-[380px] border-r flex flex-col min-h-0">
              <div className="px-3 py-2 border-b flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground" data-testid="text-queue-count">
                  {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
                </span>
              </div>
              <ScrollArea className="flex-1">
                {isLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-20 bg-muted rounded-md animate-pulse" />
                    ))}
                  </div>
                ) : submissions.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground" data-testid="text-empty-queue">
                    No submissions in queue
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {submissions.map((sub) => {
                      const urgency = getUrgencyLevel(sub.createdAt!);
                      const isSelected = selectedId === sub.id;
                      return (
                        <button
                          key={sub.id}
                          onClick={() => setSelectedId(sub.id)}
                          className={`w-full text-left rounded-md p-3 transition-colors ${
                            isSelected
                              ? "bg-accent"
                              : "hover-elevate"
                          } ${
                            urgency === "urgent"
                              ? "border-l-2 border-l-destructive"
                              : urgency === "warning"
                              ? "border-l-2 border-l-chart-3"
                              : ""
                          }`}
                          data-testid={`queue-item-${sub.id}`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium text-sm" data-testid={`text-so-${sub.id}`}>
                              SO# {sub.serviceOrder}
                            </span>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3" />
                              <span data-testid={`text-elapsed-${sub.id}`}>{getTimeElapsed(sub.createdAt!)}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-muted-foreground" data-testid={`text-tech-${sub.id}`}>
                              {sub.technicianName}
                            </span>
                            <Badge variant="outline" className="text-xs" data-testid={`badge-type-${sub.id}`}>
                              {APPLIANCE_LABELS[sub.applianceType] || sub.applianceType}
                            </Badge>
                          </div>
                          {sub.requestType === "non_repairable_review" && (
                            <Badge variant="secondary" className="mt-1 text-xs" data-testid={`badge-nr-${sub.id}`}>
                              Non-Repairable
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>

            <div className="flex-1 min-w-0 flex flex-col">
              {!selectedSubmission ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground" data-testid="text-no-selection">
                  <div className="text-center">
                    <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Select a submission to review</p>
                  </div>
                </div>
              ) : (
                <ScrollArea className="flex-1">
                  <div className="p-6 max-w-3xl space-y-6">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <h2 className="text-xl font-semibold" data-testid="text-detail-so">
                          SO# {selectedSubmission.serviceOrder}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Submitted {new Date(selectedSubmission.createdAt!).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={selectedSubmission.requestType === "authorization" ? "default" : "secondary"}
                          data-testid="badge-request-type"
                        >
                          {selectedSubmission.requestType === "authorization" ? "Authorization" : "Non-Repairable Review"}
                        </Badge>
                        {getUrgencyLevel(selectedSubmission.createdAt!) !== "normal" && (
                          <Badge variant="destructive" data-testid="badge-urgency">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {getUrgencyLevel(selectedSubmission.createdAt!) === "urgent" ? "Urgent" : "Aging"}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <User className="w-4 h-4" />
                          Technician Info
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Name</p>
                            <p className="text-sm font-medium" data-testid="text-detail-tech-name">{selectedSubmission.technicianName}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">RAC ID</p>
                            <p className="text-sm font-medium" data-testid="text-detail-rac">{selectedSubmission.racId}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Phone</p>
                            <p className="text-sm font-medium flex items-center gap-1" data-testid="text-detail-phone">
                              <Phone className="w-3 h-3" />
                              {selectedSubmission.phone}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Warranty</p>
                            <p className="text-sm font-medium" data-testid="text-detail-warranty">
                              {selectedSubmission.warrantyType === "sears_protect" ? "Sears Protect" : "B2B"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Submission Details
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Appliance Type</p>
                            <p className="text-sm font-medium" data-testid="text-detail-appliance">
                              {APPLIANCE_LABELS[selectedSubmission.applianceType] || selectedSubmission.applianceType}
                            </p>
                          </div>
                          {selectedSubmission.estimateAmount && (
                            <div>
                              <p className="text-xs text-muted-foreground">Estimate Amount</p>
                              <p className="text-sm font-medium flex items-center gap-1" data-testid="text-detail-estimate">
                                <DollarSign className="w-3 h-3" />
                                {selectedSubmission.estimateAmount}
                              </p>
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Issue Description</p>
                          <p className="text-sm bg-muted/50 rounded-md p-3" data-testid="text-detail-issue">
                            {selectedSubmission.issueDescription}
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <ImageIcon className="w-4 h-4" />
                          Photos & Media
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {selectedSubmission.photos ? (
                          <div className="grid grid-cols-3 gap-2" data-testid="media-photos">
                            {JSON.parse(selectedSubmission.photos).map((url: string, i: number) => (
                              <div key={i} className="aspect-square bg-muted rounded-md overflow-hidden">
                                <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground" data-testid="text-no-photos">No photos attached</p>
                        )}
                      </CardContent>
                    </Card>

                    {activeView === "stage1" && selectedSubmission.stage1Status === "pending" && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Review Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                              Rejection Reason (required if rejecting)
                            </label>
                            <Textarea
                              placeholder="Enter reason for rejection..."
                              value={rejectionReason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                              className="resize-none"
                              rows={3}
                              data-testid="input-rejection-reason"
                            />
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <Button
                              variant="destructive"
                              onClick={() => {
                                if (!rejectionReason.trim()) {
                                  toast({ title: "Error", description: "Rejection reason is required", variant: "destructive" });
                                  return;
                                }
                                rejectMutation.mutate({ submissionId: selectedSubmission.id, reason: rejectionReason });
                              }}
                              disabled={rejectMutation.isPending || approveMutation.isPending}
                              data-testid="button-reject"
                            >
                              <ShieldX className="w-4 h-4 mr-1" />
                              {rejectMutation.isPending ? "Rejecting..." : "Reject & Notify"}
                            </Button>
                            <Button
                              onClick={() => approveMutation.mutate(selectedSubmission.id)}
                              disabled={approveMutation.isPending || rejectMutation.isPending}
                              data-testid="button-approve"
                            >
                              <ShieldCheck className="w-4 h-4 mr-1" />
                              {approveMutation.isPending ? "Approving..." : "Approve & Notify"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {selectedSubmission.stage1Status === "approved" && (
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="w-5 h-5 text-chart-4" />
                            <span className="font-medium" data-testid="text-stage1-approved">Stage 1 Approved</span>
                            {selectedSubmission.stage1ReviewedAt && (
                              <span className="text-muted-foreground">
                                on {new Date(selectedSubmission.stage1ReviewedAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {selectedSubmission.stage1Status === "rejected" && (
                      <Card>
                        <CardContent className="pt-6 space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <ShieldX className="w-5 h-5 text-destructive" />
                            <span className="font-medium" data-testid="text-stage1-rejected">Stage 1 Rejected</span>
                          </div>
                          {selectedSubmission.stage1RejectionReason && (
                            <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3" data-testid="text-rejection-reason">
                              {selectedSubmission.stage1RejectionReason}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
