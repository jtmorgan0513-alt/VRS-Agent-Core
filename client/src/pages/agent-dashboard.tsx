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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  UserPlus,
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
  Mic,
  Trash2,
  Globe,
  PanelRightClose,
  PanelRightOpen,
  Loader2,
  RefreshCw,
  MessageSquare,
  ArrowLeft,
  ZoomIn,
  Ban,
  ScrollText,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import HelpTooltip from "@/components/help-tooltip";
import PhotoLightbox from "@/components/photo-lightbox";

type SubmissionWithTech = Submission & {
  technicianName: string;
  technicianPhone: string | null;
  assignedAgentName: string | null;
};

const DIVISION_LABELS: Record<string, string> = {
  refrigeration: "Refrigeration",
  laundry: "Laundry",
  cooking: "Cooking",
  dishwasher: "Dishwasher / Compactor",
  microwave: "Microwave",
  hvac: "HVAC",
  all_other: "All Other",
};

const APPLIANCE_LABELS: Record<string, string> = {
  refrigeration: "Refrigerator",
  laundry: "Laundry",
  cooking: "Cooking",
  dishwasher: "Dishwasher / Compactor",
  microwave: "Microwave",
  hvac: "HVAC",
  all_other: "All Other",
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
  const isAdminViewing = user?.role === "admin" || user?.role === "super_admin";
  const [divisionFilter, setDivisionFilter] = useState<string | null>(null);
  const [requestTypeFilter, setRequestTypeFilter] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [stage2Action, setStage2Action] = useState<"approve" | "decline">("approve");
  const [declineReason, setDeclineReason] = useState("");
  const [declineInstructions, setDeclineInstructions] = useState("");
  const [declineConfirmOpen, setDeclineConfirmOpen] = useState(false);
  const [warrantyFilter, setWarrantyFilter] = useState<string | null>(null);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [invalidConfirmOpen, setInvalidConfirmOpen] = useState(false);
  const [invalidReason, setInvalidReason] = useState("");
  const [invalidInstructions, setInvalidInstructions] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [todaysRgcCode, setTodaysRgcCode] = useState<string | null>(null);
  const [rgcMissing, setRgcMissing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showOriginalDesc, setShowOriginalDesc] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignAgentId, setReassignAgentId] = useState<string>("");
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const openLightbox = (photos: string[], index: number) => {
    setLightboxPhotos(photos);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };
  const [shsaiVisible, setShsaiVisible] = useState(true);
  const [shsaiLoading, setShsaiLoading] = useState(false);
  const [shsaiError, setShsaiError] = useState<string | null>(null);
  const [shsaiSession, setShsaiSession] = useState<{ sessionId: string; trackId: string; threadId: string; deviceInfo: string } | null>(null);
  const [shsaiMessages, setShsaiMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [shsaiFollowup, setShsaiFollowup] = useState("");
  const [shsaiFollowupLoading, setShsaiFollowupLoading] = useState(false);
  const [lastQueriedSubmissionId, setLastQueriedSubmissionId] = useState<number | null>(null);
  const [showStatusPopup, setShowStatusPopup] = useState(false);
  const [statusChecked, setStatusChecked] = useState(false);
  const [localAgentStatus, setLocalAgentStatus] = useState<string>(user?.agentStatus || "offline");

  useEffect(() => {
    if (user?.agentStatus) {
      setLocalAgentStatus(user.agentStatus);
    }
  }, [user?.agentStatus]);

  const agentStatus = localAgentStatus;

  const statusMutation = useMutation({
    mutationFn: async (status: "online" | "offline") => {
      const res = await apiRequest("PATCH", "/api/agent/status", { status });
      return res.json();
    },
    onSuccess: (_data, status) => {
      setLocalAgentStatus(status);
    },
  });

  useEffect(() => {
    if (!statusChecked && user && !isAdminViewing && agentStatus === "offline") {
      setShowStatusPopup(true);
      setStatusChecked(true);
    } else if (!statusChecked && user) {
      setStatusChecked(true);
    }
  }, [user, agentStatus, statusChecked, isAdminViewing]);

  useEffect(() => {
    if (selectedId === null && !isAdminViewing && agentStatus === "working") {
      statusMutation.mutate("online");
    }
  }, [selectedId]);

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
  }, [activeView, divisionFilter, requestTypeFilter, searchQuery]);

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
      if (rgcStatus.missingCode) {
        setRgcMissing(true);
        setTodaysRgcCode(null);
      } else {
        setTodaysRgcCode(rgcStatus.code);
        setRgcMissing(false);
      }
    }
  }, [rgcStatus]);

  useEffect(() => {
    setShowOriginalDesc(false);
  }, [selectedId]);

  const fetchShsaiData = async (serviceOrder: string, submissionId: number) => {
    setShsaiLoading(true);
    setShsaiError(null);
    setShsaiSession(null);
    setShsaiMessages([]);
    setShsaiFollowup("");
    setLastQueriedSubmissionId(submissionId);
    try {
      const res = await apiRequest("POST", "/api/shsai/query", { serviceOrder });
      const json = await res.json();
      if (json.success) {
        setShsaiSession(json.data.session);
        const soNumber = serviceOrder.includes("-") ? serviceOrder.split("-").pop()! : serviceOrder;
        const queryText = `Give me all orders for customer having sample service order number ${soNumber}`;
        setShsaiMessages([
          { role: "user", content: queryText },
          { role: "assistant", content: json.data.content || "" },
        ]);
      } else {
        setShsaiError(json.error || "Failed to query SHSAI");
      }
    } catch {
      setShsaiError("Could not load service order history. Click to retry.");
    } finally {
      setShsaiLoading(false);
    }
  };

  useEffect(() => {
    if (activeView === "stage2" && selectedId && shsaiVisible) {
      const sub = submissions.find((s) => s.id === selectedId);
      if (sub && sub.id !== lastQueriedSubmissionId) {
        fetchShsaiData(sub.serviceOrder, sub.id);
      }
    }
  }, [selectedId, activeView, shsaiVisible]);

  const warrantyCounstUrl = useMemo(() => {
    return "/api/agent/warranty-counts";
  }, []);

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

  const submissionHistoryQuery = useQuery<{
    history: any[];
    reviewerNames: Record<number, string>;
    technicianName: string;
    resubmissionCount: number;
    maxResubmissions: number;
  }>({
    queryKey: ["/api/submissions", selectedId, "history"],
    enabled: !!selectedId,
  });

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

  const invalidMutation = useMutation({
    mutationFn: async ({ submissionId, reason, instructions }: { submissionId: number; reason: string; instructions: string }) => {
      const res = await apiRequest("PATCH", `/api/submissions/${submissionId}/stage1`, {
        action: "invalid",
        invalidReason: reason,
        invalidInstructions: instructions || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Marked Invalid", description: "Submission marked as invalid and technician notified." });
      setSelectedId(null);
      setInvalidReason("");
      setInvalidInstructions("");
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const stage2Mutation = useMutation({
    mutationFn: async (submissionId: number) => {
      const submission = submissions.find(s => s.id === submissionId);
      const body = submission?.warrantyType === "sears_protect"
        ? { action: "approve" }
        : { action: "approve", authCode };
      const res = await apiRequest("PATCH", `/api/submissions/${submissionId}/stage2`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Code Sent", description: "Authorization code sent to technician." });
      setSelectedId(null);
      setAuthCode("");
      setStage2Action("approve");
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/agent/warranty-counts") });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const stage2DeclineMutation = useMutation({
    mutationFn: async (submissionId: number) => {
      const res = await apiRequest("PATCH", `/api/submissions/${submissionId}/stage2`, {
        action: "decline",
        declineReason: declineReason,
        declineInstructions: declineInstructions || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Repair Declined", description: "Technician has been notified of the decline." });
      setSelectedId(null);
      setDeclineReason("");
      setDeclineInstructions("");
      setStage2Action("approve");
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/agent/warranty-counts") });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (submissionId: number) => {
      const res = await apiRequest("DELETE", `/api/submissions/${submissionId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Submission has been deleted." });
      setSelectedId(null);
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/agent/warranty-counts") });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reassignMutation = useMutation({
    mutationFn: async ({ submissionId, agentId }: { submissionId: number; agentId: number }) => {
      const res = await apiRequest("PATCH", `/api/submissions/${submissionId}/reassign`, { agentId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Reassigned", description: "Ticket has been reassigned to another agent." });
      setSelectedId(null);
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const { data: agentsData } = useQuery<{ users: Array<{ id: number; name: string; role: string; racId: string | null }> }>({
    queryKey: ["/api/admin/users"],
    enabled: isAdminViewing && reassignOpen,
  });
  const vrsAgents = agentsData?.users?.filter(u => u.role === "vrs_agent") || [];


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
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    agentStatus === "online" ? "bg-green-500" :
                    agentStatus === "working" ? "bg-yellow-500" :
                    "bg-gray-400"
                  }`}
                  data-testid="indicator-agent-status"
                />
                <span className="text-xs text-muted-foreground" data-testid="text-agent-name">{user?.name}</span>
              </div>
              {!isAdminViewing && (
                <button
                  onClick={() => {
                    if (agentStatus === "offline") {
                      statusMutation.mutate("online");
                    } else if (agentStatus === "online") {
                      statusMutation.mutate("offline");
                    }
                  }}
                  disabled={agentStatus === "working"}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    agentStatus === "online" || agentStatus === "working"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                  data-testid="toggle-agent-status"
                >
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    agentStatus === "online" || agentStatus === "working" ? "bg-green-500" : "bg-gray-400 ring-1 ring-gray-500"
                  }`} />
                  {agentStatus === "online" ? "Online" : agentStatus === "working" ? "Working" : "Offline"}
                </button>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Queue</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => { setActiveView("stage1"); setSelectedId(null); setWarrantyFilter(null); }}
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
                      {statsData && statsData.stage2Count > 0 && activeView !== "stage2" && (
                        <Badge variant="secondary" className="ml-auto text-xs" data-testid="badge-stage2-count">
                          {statsData.stage2Count}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => { setActiveView("completed"); setSelectedId(null); setWarrantyFilter(null); }}
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
            {(user?.role === "admin" || user?.role === "super_admin") && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => navigate("/admin/dashboard")}
                data-testid="nav-back-to-admin"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Admin</span>
              </Button>
            )}
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
          {!isAdminViewing && agentStatus === "offline" && (
            <button
              onClick={() => statusMutation.mutate("online")}
              className="w-full px-4 py-2 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-sm font-medium text-center hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors flex items-center justify-center gap-2"
              data-testid="banner-offline"
            >
              <AlertTriangle className="w-4 h-4" />
              You are offline and not receiving tickets. Click here to go online.
            </button>
          )}
          <header className="flex items-center justify-between gap-2 p-3 border-b sticky top-0 z-50 bg-background">
            <div className="flex items-center gap-2">
              {selectedId ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setSelectedId(null)}
                  data-testid="button-back-to-list"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Queue
                </Button>
              ) : (
                <SidebarTrigger data-testid="button-sidebar-toggle" />
              )}
              <h1 className="text-lg font-semibold" data-testid="text-page-title">
                {activeView === "stage1" && `Stage 1 - Review (${statsData?.queueCount ?? 0} pending)`}
                {activeView === "stage2" && `Stage 2 - My Authorizations (${statsData?.stage2Count ?? 0})`}
                {activeView === "completed" && "Completed Today"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
            </div>
          </header>

          <div className="flex flex-1 min-h-0">
            <div className={`w-[380px] border-r flex flex-col min-h-0 ${selectedId ? "hidden" : ""}`}>
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
                            {sub.assignedAgentName && (
                              <p className="text-xs text-muted-foreground mt-1" data-testid={`text-assigned-${sub.id}`}>
                                Assigned to: {sub.assignedAgentName}
                              </p>
                            )}
                            {sub.requestType === "infestation_non_accessible" && (
                              <Badge
                                variant="secondary"
                                className="mt-1 text-xs bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                data-testid={`badge-request-type-${sub.id}`}
                              >
                                Infestation / Non-Accessible
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
                <div className="flex flex-1 min-h-0">
                <ScrollArea className={shsaiVisible ? "w-[60%] border-r" : "flex-1"}>
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
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" data-testid="badge-stage2-status">
                          Stage 2 - Awaiting Auth
                        </Badge>
                        {!shsaiVisible && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShsaiVisible(true)}
                            data-testid="button-show-shsai"
                          >
                            <PanelRightOpen className="w-4 h-4 mr-1" />
                            Show Service History
                          </Button>
                        )}
                        {isAdminViewing && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReassignOpen(true)}
                            data-testid="button-reassign"
                          >
                            <UserPlus className="w-4 h-4 mr-1" />
                            Reassign
                          </Button>
                        )}
                        {(user?.role === "admin" || user?.role === "super_admin") && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteConfirmOpen(true)}
                            disabled={deleteMutation.isPending}
                            data-testid="button-delete-submission-stage2"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <Card>
                      <CardContent className="pt-6" data-testid="text-stage1-approval-info">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-6 h-6 text-chart-4 flex-shrink-0" />
                          <div>
                            <p className="font-medium text-sm">Stage 1 Approved</p>
                            <p className="text-xs text-muted-foreground">
                              {selectedSubmission.stage1ReviewedAt && (
                                <>Approved {selectedSubmission.assignedAgentName ? `by ${selectedSubmission.assignedAgentName}` : ""} at {new Date(selectedSubmission.stage1ReviewedAt).toLocaleString()}</>
                              )}
                              {" \u2022 Tech notified and cleared to move on"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

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
                            <p className="text-sm font-medium" data-testid="text-s2-tech-name">{selectedSubmission.technicianName}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">RAC ID</p>
                            <p className="text-sm font-medium" data-testid="text-s2-rac">{selectedSubmission.racId}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Phone</p>
                            <p className="text-sm font-medium flex items-center gap-1" data-testid="text-s2-phone">
                              <Phone className="w-3 h-3" />
                              {selectedSubmission.phone}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">District</p>
                            <p className="text-sm font-medium" data-testid="text-s2-district">{selectedSubmission.districtCode || "—"}</p>
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
                            <p className="text-sm font-medium" data-testid="text-s2-appliance">
                              {APPLIANCE_LABELS[selectedSubmission.applianceType] || selectedSubmission.applianceType}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Warranty Provider</p>
                            <p className="text-sm font-medium" data-testid="text-s2-warranty">
                              {getWarrantyLabel(selectedSubmission)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Estimate Amount</p>
                            <p className="text-sm font-medium" data-testid="text-s2-estimate">
                              {selectedSubmission.estimateAmount ? `$${selectedSubmission.estimateAmount}` : "—"}
                            </p>
                          </div>
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
                          <p className="text-sm whitespace-pre-wrap" data-testid="text-s2-description">
                            {selectedSubmission.issueDescription}
                          </p>
                          {selectedSubmission.aiEnhanced && selectedSubmission.originalDescription && (
                            <div className="mt-2">
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:underline"
                                onClick={() => setShowOriginalDesc(!showOriginalDesc)}
                                data-testid="button-toggle-original-s2"
                              >
                                {showOriginalDesc ? "Hide original" : "View original"}
                              </button>
                              {showOriginalDesc && (
                                <div className="mt-1.5 p-2.5 rounded-md bg-muted text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-original-description-s2">
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
                          let parsed: any = null;
                          try { parsed = selectedSubmission.photos ? JSON.parse(selectedSubmission.photos) : null; } catch { parsed = null; }
                          if (!parsed) return <p className="text-sm text-muted-foreground" data-testid="text-no-photos-s2">No photos attached</p>;

                          const isNewFormat = parsed && typeof parsed === "object" && !Array.isArray(parsed);
                          const estimatePhotos: string[] = isNewFormat ? (parsed.estimate || []) : [];
                          const issuePhotos: string[] = isNewFormat ? (parsed.issue || []) : [];
                          const legacyPhotos: string[] = Array.isArray(parsed) ? parsed : [];
                          const allPhotosS2 = [...issuePhotos, ...estimatePhotos, ...legacyPhotos];

                          return (
                            <div className="space-y-4">
                              {issuePhotos.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    Issue Photos ({issuePhotos.length})
                                  </p>
                                  <div className="grid grid-cols-3 gap-2" data-testid="media-issue-photos-s2">
                                    {issuePhotos.map((url: string, i: number) => (
                                      <div key={i} className="relative aspect-square bg-muted rounded-md overflow-hidden cursor-pointer group" onClick={() => openLightbox(allPhotosS2, i)}>
                                        <img src={url} alt={`Issue ${i + 1}`} className="w-full h-full object-cover pointer-events-none" data-testid={`img-issue-photo-s2-${i}`} />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><ZoomIn className="w-6 h-6 text-white" /></div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {estimatePhotos.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    Model, Serial & Estimate Screenshots ({estimatePhotos.length})
                                  </p>
                                  <div className="grid grid-cols-3 gap-2" data-testid="media-estimate-photos-s2">
                                    {estimatePhotos.map((url: string, i: number) => (
                                      <div key={i} className="relative aspect-square bg-muted rounded-md overflow-hidden cursor-pointer group" onClick={() => openLightbox(allPhotosS2, issuePhotos.length + i)}>
                                        <img src={url} alt={`Estimate ${i + 1}`} className="w-full h-full object-cover pointer-events-none" data-testid={`img-estimate-photo-s2-${i}`} />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><ZoomIn className="w-6 h-6 text-white" /></div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {legacyPhotos.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    Photos ({legacyPhotos.length})
                                  </p>
                                  <div className="grid grid-cols-3 gap-2" data-testid="media-photos-s2">
                                    {legacyPhotos.map((url: string, i: number) => (
                                      <div key={i} className="relative aspect-square bg-muted rounded-md overflow-hidden cursor-pointer group" onClick={() => openLightbox(allPhotosS2, issuePhotos.length + estimatePhotos.length + i)}>
                                        <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover pointer-events-none" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><ZoomIn className="w-6 h-6 text-white" /></div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {estimatePhotos.length === 0 && issuePhotos.length === 0 && legacyPhotos.length === 0 && (
                                <p className="text-sm text-muted-foreground" data-testid="text-no-photos-s2">No photos attached</p>
                              )}
                            </div>
                          );
                        })()}
                        <Separator />
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
                        <Separator />
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
                            <Mic className="w-3.5 h-3.5" />
                            Voice Note
                          </p>
                          {selectedSubmission.voiceNoteUrl ? (
                            <audio src={selectedSubmission.voiceNoteUrl} controls className="w-full" data-testid="audio-player-stage2" />
                          ) : (
                            <p className="text-sm text-muted-foreground" data-testid="text-no-voice-note-stage2">No voice note attached</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Separator />

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-xs">STAGE 2</Badge>
                          <span className="text-sm font-semibold">Authorization Decision</span>
                          <HelpTooltip content="Approve the repair and send an authorization code, or decline the repair and notify the technician." />
                        </div>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Send className="w-3 h-3" />
                          Twilio SMS
                        </span>
                      </div>

                      <div className="flex gap-2 mb-4">
                        <Button
                          variant={stage2Action === "approve" ? "default" : "outline"}
                          className={`flex-1 ${stage2Action === "approve" ? "" : "opacity-70"}`}
                          onClick={() => setStage2Action("approve")}
                          data-testid="button-stage2-approve-tab"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Approve Repair
                        </Button>
                        <Button
                          variant={stage2Action === "decline" ? "destructive" : "outline"}
                          className={`flex-1 ${stage2Action === "decline" ? "" : "opacity-70"}`}
                          onClick={() => setStage2Action("decline")}
                          data-testid="button-stage2-decline-tab"
                        >
                          <ShieldX className="w-4 h-4 mr-1" />
                          Decline Repair
                        </Button>
                      </div>

                      {stage2Action === "approve" ? (
                        <>
                          {selectedSubmission.warrantyType === "sears_protect" ? (
                            <div>
                              {rgcMissing ? (
                                <p className="text-sm text-destructive mb-3" data-testid="text-rgc-not-set">
                                  No RGC code has been set for today. Please contact an administrator.
                                </p>
                              ) : (
                                <div className="mb-3 space-y-2">
                                  <Label className="text-xs text-muted-foreground">Today's RGC Code (Auth Code)</Label>
                                  <Input
                                    value={todaysRgcCode || ""}
                                    readOnly
                                    className="font-mono bg-muted"
                                    data-testid="input-rgc-readonly"
                                  />
                                  <p className="text-xs text-muted-foreground">For Sears Protect, the RGC code is the authorization code.</p>
                                </div>
                              )}
                              <Button
                                onClick={() => stage2Mutation.mutate(selectedSubmission.id)}
                                disabled={stage2Mutation.isPending || rgcMissing || !todaysRgcCode}
                                data-testid="button-send-code"
                              >
                                <Send className="w-4 h-4" />
                                {stage2Mutation.isPending ? "Sending..." : "Send Authorization to Tech"}
                              </Button>
                            </div>
                          ) : (
                            <div>
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
                                  disabled={!authCode.trim() || stage2Mutation.isPending}
                                  data-testid="button-send-code"
                                >
                                  <Send className="w-4 h-4" />
                                  {stage2Mutation.isPending ? "Sending..." : "Send Authorization to Tech"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Decline Reason</Label>
                            <Select value={declineReason} onValueChange={setDeclineReason}>
                              <SelectTrigger data-testid="select-decline-reason">
                                <SelectValue placeholder="Select a reason..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Warranty company declined repair">Warranty company declined repair</SelectItem>
                                <SelectItem value="Unit not covered">Unit not covered</SelectItem>
                                <SelectItem value="Pre-existing condition">Pre-existing condition</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">Instructions for Technician</Label>
                            <Textarea
                              placeholder="Enter instructions for the technician... (e.g., B2B client declined repair. Uninstall part and take with you. Close order as 'B2B Client Declined Repair'.)"
                              value={declineInstructions}
                              onChange={(e) => setDeclineInstructions(e.target.value)}
                              rows={4}
                              className="resize-none"
                              data-testid="input-decline-instructions"
                            />
                          </div>
                          <Button
                            variant="destructive"
                            onClick={() => {
                              if (!declineReason) {
                                toast({ title: "Error", description: "Please select a decline reason", variant: "destructive" });
                                return;
                              }
                              setDeclineConfirmOpen(true);
                            }}
                            disabled={stage2DeclineMutation.isPending || !declineReason}
                            data-testid="button-send-decline"
                          >
                            <ShieldX className="w-4 h-4" />
                            {stage2DeclineMutation.isPending ? "Sending..." : "Send Decline Notice to Tech"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
                {shsaiVisible && (
                  <div className="w-[40%] flex flex-col min-h-0" data-testid="panel-shsai">
                    <div className="px-4 py-2 border-b flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold">Service Order History</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => fetchShsaiData(selectedSubmission.serviceOrder, selectedSubmission.id)}
                          disabled={shsaiLoading}
                          data-testid="button-shsai-refresh"
                        >
                          <RefreshCw className={`w-4 h-4 ${shsaiLoading ? "animate-spin" : ""}`} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setShsaiVisible(false)}
                          data-testid="button-hide-shsai"
                        >
                          <PanelRightClose className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="flex-1">
                      <div className="p-4 space-y-3">
                        {shsaiLoading && (
                          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" data-testid="shsai-loading">
                            <Loader2 className="w-6 h-6 animate-spin mb-2" />
                            <p className="text-sm">Loading service order history...</p>
                          </div>
                        )}
                        {shsaiError && !shsaiLoading && (
                          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" data-testid="shsai-error">
                            <AlertTriangle className="w-6 h-6 mb-2 text-destructive" />
                            <p className="text-sm text-center mb-3">{shsaiError}</p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => fetchShsaiData(selectedSubmission.serviceOrder, selectedSubmission.id)}
                              data-testid="button-shsai-retry"
                            >
                              <RefreshCw className="w-3 h-3 mr-1" />
                              Retry
                            </Button>
                          </div>
                        )}
                        {!shsaiLoading && !shsaiError && shsaiMessages.length > 0 && (
                          <div className="space-y-3" data-testid="shsai-messages">
                            {shsaiMessages.map((msg, idx) => (
                              <div
                                key={idx}
                                className={`text-sm ${msg.role === "user" ? "text-muted-foreground italic" : ""}`}
                              >
                                {msg.role === "user" ? (
                                  <div className="flex items-start gap-2">
                                    <User className="w-3 h-3 mt-1 shrink-0" />
                                    <span>{msg.content}</span>
                                  </div>
                                ) : (
                                  <Card>
                                    <CardContent className="p-3" data-testid={`shsai-response-${idx}`}>
                                      <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_strong]:font-semibold">
                                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {!shsaiLoading && !shsaiError && shsaiMessages.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <MessageSquare className="w-6 h-6 mb-2 opacity-30" />
                            <p className="text-sm">No service order data yet</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                    {shsaiSession && !shsaiLoading && !shsaiError && (
                      <div className="px-3 py-2 border-t">
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (!shsaiFollowup.trim() || !shsaiSession) return;
                            const question = shsaiFollowup.trim();
                            setShsaiFollowupLoading(true);
                            setShsaiFollowup("");
                            setShsaiMessages((prev) => [...prev, { role: "user", content: question }]);
                            try {
                              const res = await apiRequest("POST", "/api/shsai/followup", {
                                sessionId: shsaiSession.sessionId,
                                trackId: shsaiSession.trackId,
                                threadId: shsaiSession.threadId,
                                deviceInfo: shsaiSession.deviceInfo,
                                message: question,
                              });
                              const json = await res.json();
                              if (json.success) {
                                setShsaiMessages((prev) => [...prev, { role: "assistant", content: json.data.content || "" }]);
                              } else {
                                setShsaiMessages((prev) => [...prev, { role: "assistant", content: "Error: " + (json.error || "Failed to get response") }]);
                              }
                            } catch {
                              setShsaiMessages((prev) => [...prev, { role: "assistant", content: "Error: Could not send follow-up question" }]);
                            } finally {
                              setShsaiFollowupLoading(false);
                            }
                          }}
                          className="flex gap-2"
                          data-testid="form-shsai-followup"
                        >
                          <Input
                            placeholder="Ask a follow-up question..."
                            value={shsaiFollowup}
                            onChange={(e) => setShsaiFollowup(e.target.value)}
                            disabled={shsaiFollowupLoading}
                            data-testid="input-shsai-followup"
                          />
                          <Button
                            type="submit"
                            size="icon"
                            disabled={!shsaiFollowup.trim() || shsaiFollowupLoading}
                            data-testid="button-shsai-send"
                          >
                            {shsaiFollowupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          </Button>
                        </form>
                      </div>
                    )}
                  </div>
                )}
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
                          className={
                            selectedSubmission.requestType === "infestation_non_accessible"
                              ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                              : ""
                          }
                          variant={selectedSubmission.requestType === "authorization" ? "default" : "secondary"}
                          data-testid="badge-request-type"
                        >
                          {selectedSubmission.requestType === "authorization"
                            ? "Authorization"
                            : "Infestation / Non-Accessible"}
                        </Badge>
                        {getUrgencyLevel(selectedSubmission.createdAt!) !== "normal" && (
                          <Badge variant="destructive" data-testid="badge-urgency">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {getUrgencyLevel(selectedSubmission.createdAt!) === "urgent" ? "Urgent" : "Aging"}
                          </Badge>
                        )}
                        {(user?.role === "admin" || user?.role === "super_admin") && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteConfirmOpen(true)}
                            disabled={deleteMutation.isPending}
                            data-testid="button-delete-submission"
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
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
                          let parsed: any = null;
                          try { parsed = selectedSubmission.photos ? JSON.parse(selectedSubmission.photos) : null; } catch { parsed = null; }
                          if (!parsed) return <p className="text-sm text-muted-foreground" data-testid="text-no-photos">No photos attached</p>;
                          
                          const isNewFormat = parsed && typeof parsed === "object" && !Array.isArray(parsed);
                          const estimatePhotos: string[] = isNewFormat ? (parsed.estimate || []) : [];
                          const issuePhotos: string[] = isNewFormat ? (parsed.issue || []) : [];
                          const legacyPhotos: string[] = Array.isArray(parsed) ? parsed : [];
                          const allPhotosS1 = [...issuePhotos, ...estimatePhotos, ...legacyPhotos];
                          
                          return (
                            <div className="space-y-4">
                              {issuePhotos.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    Issue Photos ({issuePhotos.length})
                                  </p>
                                  <div className="grid grid-cols-3 gap-2" data-testid="media-issue-photos">
                                    {issuePhotos.map((url: string, i: number) => (
                                      <div key={i} className="relative aspect-square bg-muted rounded-md overflow-hidden cursor-pointer group" onClick={() => openLightbox(allPhotosS1, i)}>
                                        <img src={url} alt={`Issue ${i + 1}`} className="w-full h-full object-cover pointer-events-none" data-testid={`img-issue-photo-${i}`} />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><ZoomIn className="w-6 h-6 text-white" /></div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {estimatePhotos.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    Model, Serial & Estimate Screenshots ({estimatePhotos.length})
                                  </p>
                                  <div className="grid grid-cols-3 gap-2" data-testid="media-estimate-photos">
                                    {estimatePhotos.map((url: string, i: number) => (
                                      <div key={i} className="relative aspect-square bg-muted rounded-md overflow-hidden cursor-pointer group" onClick={() => openLightbox(allPhotosS1, issuePhotos.length + i)}>
                                        <img src={url} alt={`Estimate ${i + 1}`} className="w-full h-full object-cover pointer-events-none" data-testid={`img-estimate-photo-${i}`} />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><ZoomIn className="w-6 h-6 text-white" /></div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {legacyPhotos.length > 0 && (
                                <div>
                                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
                                    <ImageIcon className="w-3.5 h-3.5" />
                                    Photos ({legacyPhotos.length})
                                  </p>
                                  <div className="grid grid-cols-3 gap-2" data-testid="media-photos">
                                    {legacyPhotos.map((url: string, i: number) => (
                                      <div key={i} className="relative aspect-square bg-muted rounded-md overflow-hidden cursor-pointer group" onClick={() => openLightbox(allPhotosS1, issuePhotos.length + estimatePhotos.length + i)}>
                                        <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover pointer-events-none" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><ZoomIn className="w-6 h-6 text-white" /></div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {estimatePhotos.length === 0 && issuePhotos.length === 0 && legacyPhotos.length === 0 && (
                                <p className="text-sm text-muted-foreground" data-testid="text-no-photos">No photos attached</p>
                              )}
                            </div>
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
                        <Separator />
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
                            <Mic className="w-3.5 h-3.5" />
                            Voice Note
                          </p>
                          {selectedSubmission.voiceNoteUrl ? (
                            <audio src={selectedSubmission.voiceNoteUrl} controls className="w-full" data-testid="audio-player-stage1" />
                          ) : (
                            <p className="text-sm text-muted-foreground" data-testid="text-no-voice-note">No voice note attached</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {submissionHistoryQuery.data && submissionHistoryQuery.data.history.length > 1 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-1.5">
                            <ScrollText className="w-4 h-4" />
                            Submission History
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">
                            Resubmission {submissionHistoryQuery.data.resubmissionCount} of {submissionHistoryQuery.data.maxResubmissions}
                          </p>
                        </CardHeader>
                        <CardContent className="space-y-0">
                          {submissionHistoryQuery.data.history.map((item: any, idx: number) => {
                            const isOriginal = item.resubmissionOf == null;
                            const resubNumber = isOriginal ? 0 : submissionHistoryQuery.data!.history.filter((h: any, hi: number) => h.resubmissionOf != null && hi <= idx).length;
                            return (
                              <div key={item.id}>
                                {idx > 0 && <Separator className="my-2" />}
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-medium">
                                      {isOriginal ? "Original Submission" : `Resubmission #${resubNumber}`}
                                      {item.id === selectedId && <Badge variant="outline" className="ml-2 text-[10px] py-0">Current</Badge>}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {item.createdAt ? new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ""}
                                    </p>
                                  </div>
                                  {item.appealNotes && (
                                    <p className="text-xs text-blue-600">
                                      Appeal: {item.appealNotes}
                                    </p>
                                  )}
                                  {item.stage1Status === "rejected" && item.stage1RejectionReason && (
                                    <p className="text-xs text-destructive">
                                      Rejected: "{item.stage1RejectionReason}"
                                    </p>
                                  )}
                                  {item.stage1Status === "invalid" && item.invalidReason && (
                                    <p className="text-xs text-muted-foreground">
                                      Invalid: "{item.invalidReason}"
                                    </p>
                                  )}
                                  {item.stage1Status === "approved" && (
                                    <p className="text-xs text-green-600">Approved</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    )}

                    {activeView === "stage1" && selectedSubmission.stage1Status === "pending" && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Review Actions</CardTitle>
                          {selectedSubmission.resubmissionOf && (
                            <p className="text-xs text-blue-600" data-testid="text-resubmission-indicator">
                              This is a resubmission
                            </p>
                          )}
                          {(selectedSubmission as any).appealNotes && (
                            <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                              <p className="text-xs font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1">
                                <ScrollText className="w-3 h-3" /> Appeal Notes
                              </p>
                              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1" data-testid="text-appeal-notes">
                                {(selectedSubmission as any).appealNotes}
                              </p>
                            </div>
                          )}
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
                                disabled={rejectMutation.isPending || approveMutation.isPending || invalidMutation.isPending}
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
                                disabled={approveMutation.isPending || rejectMutation.isPending || invalidMutation.isPending}
                                data-testid="button-approve"
                              >
                                <ShieldCheck className="w-4 h-4 mr-1" />
                                {approveMutation.isPending ? "Approving..." : "Approve & Notify"}
                              </Button>
                              <HelpTooltip content="Confirms you have enough info to proceed. Tech will receive SMS and can leave the job site." />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  if (!invalidReason) {
                                    toast({ title: "Error", description: "Select an invalid reason first", variant: "destructive" });
                                    return;
                                  }
                                  setInvalidConfirmOpen(true);
                                }}
                                disabled={invalidMutation.isPending || approveMutation.isPending || rejectMutation.isPending}
                                data-testid="button-invalid"
                              >
                                <Ban className="w-4 h-4 mr-1" />
                                {invalidMutation.isPending ? "Processing..." : "Invalid"}
                              </Button>
                              <HelpTooltip content="For submissions VRS doesn't handle: wrong warranty type, product not covered, etc." />
                            </div>
                          </div>
                          <Separator />
                          <div className="space-y-3">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Mark as Invalid (if not VRS-eligible)</p>
                            <Select value={invalidReason} onValueChange={setInvalidReason}>
                              <SelectTrigger data-testid="select-invalid-reason">
                                <SelectValue placeholder="Select invalid reason..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Not a VRS-eligible warranty">Not a VRS-eligible warranty</SelectItem>
                                <SelectItem value="Product not covered">Product not covered</SelectItem>
                                <SelectItem value="Use standard authorization process">Use standard authorization process</SelectItem>
                                <SelectItem value="Contact B2B support directly">Contact B2B support directly</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <Textarea
                              placeholder="Instructions for the technician (what they should do instead)..."
                              value={invalidInstructions}
                              onChange={(e) => setInvalidInstructions(e.target.value)}
                              className="resize-none"
                              rows={2}
                              data-testid="input-invalid-instructions"
                            />
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

                    {selectedSubmission.stage1Status === "invalid" && (
                      <Card>
                        <CardContent className="pt-6 space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Ban className="w-5 h-5 text-muted-foreground" />
                            <span className="font-medium" data-testid="text-stage1-invalid">Marked Invalid</span>
                          </div>
                          {(selectedSubmission as any).invalidReason && (
                            <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3" data-testid="text-invalid-reason">
                              {(selectedSubmission as any).invalidReason}
                            </p>
                          )}
                          {(selectedSubmission as any).invalidInstructions && (
                            <p className="text-sm text-muted-foreground" data-testid="text-invalid-instructions">
                              Instructions: {(selectedSubmission as any).invalidInstructions}
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

      <AlertDialog open={invalidConfirmOpen} onOpenChange={setInvalidConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-invalid-confirm-title">Mark as Invalid</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this submission as invalid? The technician will be notified via SMS that this request cannot be processed through VRS.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-invalid">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedSubmission) {
                  invalidMutation.mutate({
                    submissionId: selectedSubmission.id,
                    reason: invalidReason,
                    instructions: invalidInstructions,
                  });
                }
                setInvalidConfirmOpen(false);
              }}
              data-testid="button-confirm-invalid"
            >
              Mark Invalid & Notify
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-delete-confirm-title">Delete Submission</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this submission? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedSubmission) {
                  deleteMutation.mutate(selectedSubmission.id);
                }
                setDeleteConfirmOpen(false);
              }}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={declineConfirmOpen} onOpenChange={setDeclineConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-decline-confirm-title">Decline Repair</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to decline this repair? The technician will be notified via SMS with the reason and instructions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-decline">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedSubmission) {
                  stage2DeclineMutation.mutate(selectedSubmission.id);
                }
                setDeclineConfirmOpen(false);
              }}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-decline"
            >
              Decline & Notify
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PhotoLightbox
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Ticket</DialogTitle>
            <DialogDescription>
              Select a new agent to handle this ticket.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Assign to Agent</Label>
              <Select value={reassignAgentId} onValueChange={setReassignAgentId}>
                <SelectTrigger data-testid="select-reassign-agent">
                  <SelectValue placeholder="Choose an agent" />
                </SelectTrigger>
                <SelectContent>
                  {vrsAgents.map((agent) => (
                    <SelectItem key={agent.id} value={String(agent.id)} data-testid={`option-reassign-agent-${agent.id}`}>
                      {agent.name} {agent.racId ? `(${agent.racId})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReassignOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (selectedId && reassignAgentId) {
                  reassignMutation.mutate({ submissionId: selectedId, agentId: Number(reassignAgentId) });
                  setReassignOpen(false);
                  setReassignAgentId("");
                }
              }}
              disabled={!reassignAgentId || reassignMutation.isPending}
              data-testid="button-confirm-reassign"
            >
              Reassign
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showStatusPopup} onOpenChange={setShowStatusPopup}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-status-popup-title">You're currently offline</AlertDialogTitle>
            <AlertDialogDescription>
              Go online to start receiving tickets?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowStatusPopup(false)} data-testid="button-stay-offline">
              Stay Offline
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                statusMutation.mutate("online");
                setShowStatusPopup(false);
              }}
              data-testid="button-go-online"
            >
              Go Online
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
