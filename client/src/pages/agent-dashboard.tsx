import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Submission } from "@shared/schema";
import searsLogo from "@assets/sears-home-services-logo-brands_1770949137899.png";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  Send,
  Layers,
  PhoneCall,
  Square,
  CheckSquare,
  Video,
  LifeBuoy,
  RotateCcw,
  Key,
  Sparkles,
} from "lucide-react";
import HelpTooltip from "@/components/help-tooltip";

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

function getWarrantyLabel(sub: SubmissionWithTech): string {
  if (sub.warrantyProvider) return sub.warrantyProvider;
  return sub.warrantyType === "sears_protect" ? "Sears Protect / Sears PA / Sears Home Warranty (Cinch)" : sub.warrantyType;
}

export default function AgentDashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [activeView, setActiveView] = useState<"stage1" | "stage2" | "completed">("stage1");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [myAssignments, setMyAssignments] = useState(true);
  const [divisionFilter, setDivisionFilter] = useState<string | null>(null);
  const [requestTypeFilter, setRequestTypeFilter] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [authCode, setAuthCode] = useState("");
  const [warrantyFilter, setWarrantyFilter] = useState<string | null>(null);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [rgcModalOpen, setRgcModalOpen] = useState(false);
  const [rgcInput, setRgcInput] = useState("");
  const [rgcVerified, setRgcVerified] = useState(false);
  const [todaysRgcCode, setTodaysRgcCode] = useState<string | null>(null);
  const [rgcMissing, setRgcMissing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showOriginalDesc, setShowOriginalDesc] = useState(false);

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
    if (requestTypeFilter) {
      params.set("requestType", requestTypeFilter);
    }
    if (searchQuery.trim()) {
      params.set("search", searchQuery.trim());
    }
    return params.toString();
  }, [activeView, myAssignments, divisionFilter, requestTypeFilter, searchQuery]);

  const submissionsUrl = queryParams ? `/api/submissions?${queryParams}` : "/api/submissions";

  const { data: submissionsData, isLoading } = useQuery<{ submissions: SubmissionWithTech[] }>({
    queryKey: [submissionsUrl],
  });

  const { data: statsData } = useQuery<{ queueCount: number; completedToday: number; stage2Count: number }>({
    queryKey: ["/api/agent/stats"],
  });

  const { data: rgcStatus } = useQuery<{
    needsEntry: boolean;
    missingCode: boolean;
    code: string | null;
  }>({
    queryKey: ["/api/agent/rgc-status"],
  });

  useEffect(() => {
    if (rgcStatus) {
      if (rgcStatus.needsEntry) {
        setRgcModalOpen(true);
        setRgcVerified(false);
        setTodaysRgcCode(null);
        setRgcMissing(false);
      } else if (rgcStatus.missingCode) {
        setRgcMissing(true);
        setRgcVerified(false);
        setTodaysRgcCode(null);
      } else {
        setRgcVerified(true);
        setTodaysRgcCode(rgcStatus.code);
        setRgcMissing(false);
      }
    }
  }, [rgcStatus]);

  useEffect(() => {
    setShowOriginalDesc(false);
  }, [selectedId]);

  const warrantyCounstUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (!myAssignments) params.set("allQueue", "true");
    const qs = params.toString();
    return qs ? `/api/agent/warranty-counts?${qs}` : "/api/agent/warranty-counts";
  }, [myAssignments]);

  const { data: warrantyCountsData } = useQuery<{ counts: { warrantyProvider: string; count: number }[] }>({
    queryKey: [warrantyCounstUrl],
    enabled: activeView === "stage2",
  });

  const warrantyCounts = warrantyCountsData?.counts || [];

  const submissions = useMemo(() => {
    const subs = submissionsData?.submissions || [];
    if (activeView === "stage2" && warrantyFilter) {
      return subs.filter((s) => getWarrantyLabel(s) === warrantyFilter);
    }
    return subs;
  }, [submissionsData, activeView, warrantyFilter]);

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

  const stage2Mutation = useMutation({
    mutationFn: async (submissionId: number) => {
      const res = await apiRequest("PATCH", `/api/submissions/${submissionId}/stage2`, {
        authCode,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Code Sent", description: "Authorization code sent to technician." });
      setSelectedId(null);
      setAuthCode("");
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/agent/warranty-counts") });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const verifyRgcMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/agent/verify-rgc", { code });
      return res.json();
    },
    onSuccess: (data: { success: boolean; code: string }) => {
      setRgcModalOpen(false);
      setRgcVerified(true);
      setTodaysRgcCode(data.code);
      setRgcMissing(false);
      setRgcInput("");
      toast({ title: "RGC Code Verified", description: `Today's code: ${data.code}` });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/rgc-status"] });
    },
    onError: (err: Error) => {
      toast({ title: "Verification Failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleCheckbox = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedWarrantyProvider = selectedSubmission ? getWarrantyLabel(selectedSubmission) : null;
  const batchSameProvider = useMemo(() => {
    if (!selectedWarrantyProvider || activeView !== "stage2") return [];
    return submissions.filter(
      (s) => selectedIds.has(s.id) && getWarrantyLabel(s) === selectedWarrantyProvider && s.id !== selectedId
    );
  }, [selectedIds, selectedWarrantyProvider, submissions, selectedId, activeView]);

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
              <img src={searsLogo} alt="Sears Home Services" className="h-7" data-testid="img-logo" />
              <span className="font-semibold text-sm" data-testid="text-sidebar-title">VRS Agent</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-agent-name">{user?.name}</p>
            {rgcVerified && todaysRgcCode && (
              <div className="mt-2 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-mono font-semibold" data-testid="text-todays-rgc">{todaysRgcCode}</span>
              </div>
            )}
            {rgcMissing && (
              <p className="text-xs text-destructive mt-2" data-testid="text-rgc-missing">Daily code not set</p>
            )}
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Queue</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => { setActiveView("stage1"); setSelectedId(null); setSelectedIds(new Set()); setWarrantyFilter(null); }}
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
                      onClick={() => { setActiveView("stage2"); setSelectedId(null); setSelectedIds(new Set()); }}
                      data-active={activeView === "stage2"}
                      data-testid="nav-stage2"
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      <span>Stage 2 Queue</span>
                      {statsData && statsData.stage2Count > 0 && activeView !== "stage2" && (
                        <Badge variant="secondary" className="ml-auto text-xs" data-testid="badge-stage2-count">
                          {statsData.stage2Count}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => { setActiveView("completed"); setSelectedId(null); setSelectedIds(new Set()); setWarrantyFilter(null); }}
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

            <SidebarGroup>
              <SidebarGroupLabel>Request Type</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setRequestTypeFilter(null)}
                      data-active={requestTypeFilter === null}
                      data-testid="filter-request-all"
                    >
                      <Filter className="w-4 h-4" />
                      <span>All Types</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {[
                    { value: "authorization", label: "Authorization" },
                    { value: "non_repairable_review", label: "Non-Repairable" },
                    { value: "infestation_non_accessible", label: "Infestation / Non-Accessible" },
                  ].map((rt) => (
                    <SidebarMenuItem key={rt.value}>
                      <SidebarMenuButton
                        onClick={() => setRequestTypeFilter(rt.value)}
                        data-active={requestTypeFilter === rt.value}
                        data-testid={`filter-request-${rt.value}`}
                      >
                        <ClipboardList className="w-4 h-4" />
                        <span>{rt.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {activeView === "stage2" && warrantyCounts.length > 0 && (
              <>
                <Separator className="my-2" />
                <SidebarGroup>
                  <SidebarGroupLabel>Warranty Providers</SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          onClick={() => setWarrantyFilter(null)}
                          data-active={warrantyFilter === null}
                          data-testid="filter-warranty-all"
                        >
                          <Filter className="w-4 h-4" />
                          <span>All Providers</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      {warrantyCounts.map((wc) => (
                        <SidebarMenuItem key={wc.warrantyProvider}>
                          <SidebarMenuButton
                            onClick={() => setWarrantyFilter(wc.warrantyProvider)}
                            data-active={warrantyFilter === wc.warrantyProvider}
                            data-testid={`filter-warranty-${wc.warrantyProvider}`}
                          >
                            <ShieldCheck className="w-4 h-4" />
                            <span>{wc.warrantyProvider}</span>
                            <Badge variant="outline" className="ml-auto text-xs">
                              {wc.count}
                            </Badge>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}
          </SidebarContent>

          <SidebarFooter className="p-4 space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => {
                setRgcInput("");
                setRgcModalOpen(true);
              }}
              data-testid="button-update-rgc"
            >
              <Key className="w-4 h-4" />
              <span>Update Code</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => navigate("/help")}
              data-testid="nav-help"
            >
              <LifeBuoy className="w-4 h-4" />
              <span>Help Center</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={async () => {
                await apiRequest("PATCH", "/api/users/me", { firstLogin: true });
                toast({ title: "Tutorial will show on next login" });
              }}
              data-testid="button-restart-tutorial"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restart Tutorial</span>
            </Button>
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

          {activeView === "stage2" && (
            <div className="px-4 py-3 bg-primary/10 border-b" data-testid="text-batch-banner">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-md bg-primary/20">
                    <Layers className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Batch Processing Mode</p>
                    <p className="text-xs text-muted-foreground">Select multiple orders from the same warranty provider to process together</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {warrantyCounts.map((wc) => (
                    <span key={wc.warrantyProvider} className="text-sm font-medium" data-testid={`text-warranty-count-${wc.warrantyProvider}`}>
                      {wc.count} {wc.warrantyProvider} Ready
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-1 min-h-0">
            <div className="w-[380px] border-r flex flex-col min-h-0">
              <div className="px-3 py-2 border-b flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground" data-testid="text-queue-count">
                  {activeView === "stage2" ? "Awaiting Auth Codes" : submissions.length + " submission" + (submissions.length !== 1 ? "s" : "")}
                  {activeView === "stage2" && (
                    <Badge variant="outline" className="ml-2 text-xs">{submissions.length}</Badge>
                  )}
                </span>
                {activeView === "stage2" && warrantyCounts.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {warrantyCounts.map((wc) => (
                      <Badge key={wc.warrantyProvider} variant="outline" className="text-xs gap-1">
                        <PhoneCall className="w-3 h-3" />
                        Call {wc.warrantyProvider} ({wc.count})
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-3 pb-2">
                <Input
                  placeholder="Search by service order..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-sm"
                  data-testid="input-search-submissions"
                />
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
                      const isChecked = selectedIds.has(sub.id);
                      return (
                        <div
                          key={sub.id}
                          className={`flex items-start gap-2 rounded-md p-3 transition-colors ${
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
                        >
                          {activeView === "stage2" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleCheckbox(sub.id); }}
                              className="mt-0.5 flex-shrink-0"
                              data-testid={`checkbox-item-${sub.id}`}
                            >
                              {isChecked ? (
                                <CheckSquare className="w-5 h-5 text-primary" />
                              ) : (
                                <Square className="w-5 h-5 text-muted-foreground" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedId(sub.id)}
                            className="flex-1 text-left min-w-0"
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
                              {activeView === "stage2" ? (
                                <Badge variant="outline" className="text-xs" data-testid={`text-warranty-provider`}>
                                  {getWarrantyLabel(sub)}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs" data-testid={`badge-type-${sub.id}`}>
                                  {APPLIANCE_LABELS[sub.applianceType] || sub.applianceType}
                                </Badge>
                              )}
                            </div>
                            {activeView === "stage2" && sub.stage1ReviewedAt && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Stage 1 approved {getTimeElapsed(sub.stage1ReviewedAt)} ago
                              </p>
                            )}
                            {sub.requestType !== "authorization" && (
                              <Badge
                                variant="secondary"
                                className={`mt-1 text-xs ${
                                  sub.requestType === "non_repairable_review"
                                    ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                                    : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                }`}
                                data-testid={`badge-request-type-${sub.id}`}
                              >
                                {sub.requestType === "non_repairable_review" ? "Non-Repairable" : "Infestation / Non-Accessible"}
                              </Badge>
                            )}
                            {sub.aiEnhanced && (
                              <Badge variant="secondary" className="text-xs gap-0.5">
                                <Sparkles className="w-3 h-3" />
                                AI
                              </Badge>
                            )}
                          </button>
                        </div>
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
              ) : activeView === "stage2" ? (
                <ScrollArea className="flex-1">
                  <div className="p-6 max-w-3xl space-y-6">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <h2 className="text-xl font-semibold" data-testid="text-detail-so">
                          Service Order #{selectedSubmission.serviceOrder}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {selectedSubmission.technicianName}
                          </span>
                          <span>{selectedSubmission.racId}</span>
                          {selectedSubmission.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {selectedSubmission.phone}
                            </span>
                          )}
                        </p>
                      </div>
                      <Badge variant="secondary" data-testid="badge-stage2-status">
                        Stage 2 - Awaiting Auth
                      </Badge>
                    </div>

                    <Card>
                      <CardContent className="pt-6" data-testid="text-stage1-approval-info">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-6 h-6 text-chart-4 flex-shrink-0" />
                          <div>
                            <p className="font-medium text-sm">Stage 1 Approved</p>
                            <p className="text-xs text-muted-foreground">
                              {selectedSubmission.stage1ReviewedAt && (
                                <>Approved {selectedSubmission.stage1ReviewedBy ? `by Agent` : ""} at {new Date(selectedSubmission.stage1ReviewedAt).toLocaleString()}</>
                              )}
                              {" \u2022 Tech notified and cleared to move on"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Order Details</p>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Appliance Type</p>
                          <p className="text-sm font-medium" data-testid="text-detail-appliance">
                            {APPLIANCE_LABELS[selectedSubmission.applianceType] || selectedSubmission.applianceType}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Warranty Provider</p>
                          <p className="text-sm font-medium" data-testid="text-warranty-provider">
                            {getWarrantyLabel(selectedSubmission)}
                          </p>
                        </div>
                        {selectedSubmission.estimateAmount && (
                          <div>
                            <p className="text-xs text-muted-foreground">Estimate Amount</p>
                            <p className="text-sm font-medium" data-testid="text-detail-estimate">
                              ${selectedSubmission.estimateAmount}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5" />
                        Video
                      </p>
                      {selectedSubmission.videoUrl ? (
                        <div className="rounded-md overflow-hidden bg-muted" data-testid="media-video-stage2">
                          <video
                            src={selectedSubmission.videoUrl}
                            controls
                            className="w-full max-h-[300px]"
                            data-testid="video-player-stage2"
                          />
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground" data-testid="text-no-video-stage2">No video attached</p>
                      )}
                    </div>

                    {batchSameProvider.length > 0 && (
                      <div data-testid="card-batch-mode">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">Batch Mode Active</p>
                        <div className="rounded-md bg-primary/10 p-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-md bg-primary/20">
                              <Layers className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">Processing {selectedWarrantyProvider} Orders Together</p>
                              <p className="text-xs text-muted-foreground">Call warranty provider once, get auth codes for all selected orders</p>
                            </div>
                          </div>
                          <span className="text-2xl font-bold text-primary">{batchSameProvider.length + 1}</span>
                        </div>
                      </div>
                    )}

                    <Separator />

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-xs">STAGE 2</Badge>
                          <span className="text-sm font-semibold">Enter Authorization Code</span>
                          <HelpTooltip content="Enter the authorization code from the warranty provider. The technician will receive this code via SMS." />
                        </div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Send className="w-3 h-3" />
                          Twilio SMS
                        </span>
                      </div>

                      {selectedSubmission.warrantyType === "sears_protect" && (
                        <div className="mb-4 space-y-2">
                          <Label className="text-xs text-muted-foreground">RGC Code</Label>
                          {rgcMissing ? (
                            <p className="text-sm text-destructive" data-testid="text-rgc-not-set">
                              No RGC code has been set for today. Please contact an administrator.
                            </p>
                          ) : (
                            <Input
                              value={todaysRgcCode || ""}
                              readOnly
                              className="font-mono bg-muted"
                              data-testid="input-rgc-readonly"
                            />
                          )}
                        </div>
                      )}

                      <p className="text-xs text-muted-foreground mb-3">Authorization Code from {getWarrantyLabel(selectedSubmission)}</p>
                      <div className="flex items-center gap-3">
                        <Input
                          placeholder="WRN-000000"
                          value={authCode}
                          onChange={(e) => setAuthCode(e.target.value)}
                          data-testid="input-auth-code"
                          className="flex-1"
                        />
                        <Button
                          onClick={() => stage2Mutation.mutate(selectedSubmission.id)}
                          disabled={!authCode.trim() || stage2Mutation.isPending || (selectedSubmission.warrantyType === "sears_protect" && (rgcMissing || !todaysRgcCode))}
                          data-testid="button-send-code"
                        >
                          <Send className="w-4 h-4" />
                          {stage2Mutation.isPending ? "Sending..." : "Send Code to Tech"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
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
                          className={
                            selectedSubmission.requestType === "authorization"
                              ? ""
                              : selectedSubmission.requestType === "non_repairable_review"
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                              : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          }
                          variant={selectedSubmission.requestType === "authorization" ? "default" : "secondary"}
                          data-testid="badge-request-type"
                        >
                          {selectedSubmission.requestType === "authorization"
                            ? "Authorization"
                            : selectedSubmission.requestType === "non_repairable_review"
                            ? "Non-Repairable Review"
                            : "Infestation / Non-Accessible"}
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
                              {selectedSubmission.warrantyType === "sears_protect" ? "Sears Protect / Sears PA / Sears Home Warranty (Cinch)" : selectedSubmission.warrantyType}
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
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-xs text-muted-foreground">Description</p>
                            {selectedSubmission.aiEnhanced && (
                              <Badge variant="secondary" className="text-xs gap-0.5">
                                <Sparkles className="w-3 h-3" />
                                AI-Enhanced
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm whitespace-pre-wrap" data-testid="text-detail-description">
                            {selectedSubmission.issueDescription}
                          </p>
                          {selectedSubmission.aiEnhanced && selectedSubmission.originalDescription && (
                            <div className="mt-2">
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:underline"
                                onClick={() => setShowOriginalDesc(!showOriginalDesc)}
                                data-testid="button-toggle-original"
                              >
                                {showOriginalDesc ? "Hide original" : "View original"}
                              </button>
                              {showOriginalDesc && (
                                <div className="mt-1.5 p-2.5 rounded-md bg-muted text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-original-description">
                                  {selectedSubmission.originalDescription}
                                </div>
                              )}
                            </div>
                          )}
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
                      <CardContent className="space-y-4">
                        {(() => {
                          let parsedPhotos: string[] = [];
                          try { parsedPhotos = selectedSubmission.photos ? JSON.parse(selectedSubmission.photos) : []; } catch { parsedPhotos = []; }
                          return parsedPhotos.length > 0 ? (
                            <div className="grid grid-cols-3 gap-2" data-testid="media-photos">
                              {parsedPhotos.map((url: string, i: number) => (
                                <div key={i} className="aspect-square bg-muted rounded-md overflow-hidden">
                                  <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground" data-testid="text-no-photos">No photos attached</p>
                          );
                        })()}
                        <Separator />
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
                            <Video className="w-3.5 h-3.5" />
                            Video
                          </p>
                          {selectedSubmission.videoUrl ? (
                            <div className="rounded-md overflow-hidden bg-muted" data-testid="media-video">
                              <video
                                src={selectedSubmission.videoUrl}
                                controls
                                className="w-full max-h-[300px]"
                                data-testid="video-player"
                              />
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground" data-testid="text-no-video">No video attached</p>
                          )}
                        </div>
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
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="destructive"
                                onClick={() => {
                                  if (!rejectionReason.trim()) {
                                    toast({ title: "Error", description: "Rejection reason is required", variant: "destructive" });
                                    return;
                                  }
                                  setRejectConfirmOpen(true);
                                }}
                                disabled={rejectMutation.isPending || approveMutation.isPending}
                                data-testid="button-reject"
                              >
                                <ShieldX className="w-4 h-4 mr-1" />
                                {rejectMutation.isPending ? "Rejecting..." : "Reject & Notify"}
                              </Button>
                              <HelpTooltip content="Returns the submission to the technician with your rejection reason. They will receive SMS notification." />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                onClick={() => approveMutation.mutate(selectedSubmission.id)}
                                disabled={approveMutation.isPending || rejectMutation.isPending}
                                data-testid="button-approve"
                              >
                                <ShieldCheck className="w-4 h-4 mr-1" />
                                {approveMutation.isPending ? "Approving..." : "Approve & Notify"}
                              </Button>
                              <HelpTooltip content="Confirms you have enough info to proceed. Tech will receive SMS and can leave the job site." />
                            </div>
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

      <AlertDialog open={rejectConfirmOpen} onOpenChange={setRejectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-reject-confirm-title">Reject Submission</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reject this submission? The technician will be notified via SMS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reject">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedSubmission) {
                  rejectMutation.mutate({ submissionId: selectedSubmission.id, reason: rejectionReason });
                }
                setRejectConfirmOpen(false);
              }}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-reject"
            >
              Reject & Notify
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={rgcModalOpen} onOpenChange={(open) => { if (!open) setRgcModalOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle data-testid="text-rgc-modal-title">Enter Today's RGC Code</DialogTitle>
            <DialogDescription>
              Enter the daily RGC code to access your dashboard. Contact your admin if you don't have the code.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-semibold text-muted-foreground">RGC</span>
              <Input
                placeholder="12345"
                value={rgcInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 5);
                  setRgcInput(val);
                }}
                maxLength={5}
                className="font-mono"
                data-testid="input-rgc-verify"
              />
            </div>
            <Button
              onClick={() => verifyRgcMutation.mutate(rgcInput)}
              disabled={rgcInput.length !== 5 || verifyRgcMutation.isPending}
              className="w-full"
              data-testid="button-verify-rgc"
            >
              {verifyRgcMutation.isPending ? "Verifying..." : "Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
