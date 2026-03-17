import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket, playNotificationDing, disconnectWs, requestNotificationPermission, showBrowserNotification } from "@/lib/websocket";
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
import { Switch } from "@/components/ui/switch";
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
  Wrench,
  AlertTriangle,
  Filter,
  Image as ImageIcon,
  ShieldX,
  Send,
  Layers,
  Square,
  CheckSquare,
  Video,
  LifeBuoy,
  RotateCcw,
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
  XCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
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
  const [activeView, setActiveView] = useState<"queue" | "mytickets" | "completed">("queue");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const isAdminViewing = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => {
    if (isAdminViewing) return;
    const handleBeforeUnload = () => {
      disconnectWs();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isAdminViewing]);

  const [divisionFilter, setDivisionFilter] = useState<string | null>(null);
  const [requestTypeFilter, setRequestTypeFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showOriginalDesc, setShowOriginalDesc] = useState(false);

  const [selectedAction, setSelectedAction] = useState<"approve" | "reject" | "reject_and_close" | "invalid" | "approve_submission" | null>(null);
  const [selectedRejectionReasons, setSelectedRejectionReasons] = useState<string[]>([]);
  const [rejectCloseReason, setRejectCloseReason] = useState("");
  const [rejectCloseCustomReason, setRejectCloseCustomReason] = useState("");
  const [rejectedPhotos, setRejectedPhotos] = useState<{url: string; reason: string}[]>([]);
  const [rejectedVideo, setRejectedVideo] = useState<{rejected: boolean; reason: string}>({rejected: false, reason: ""});
  const [rejectedVoiceNote, setRejectedVoiceNote] = useState<{rejected: boolean; reason: string}>({rejected: false, reason: ""});
  const [technicianMessage, setTechnicianMessage] = useState("");
  const [agentNotes, setAgentNotes] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [selectedInvalidReasons, setSelectedInvalidReasons] = useState<string[]>([]);
  const [invalidMessage, setInvalidMessage] = useState("");
  const [otherRejectionText, setOtherRejectionText] = useState("");
  const [otherInvalidText, setOtherInvalidText] = useState("");
  const [otherPhotoRejectionText, setOtherPhotoRejectionText] = useState("");
  const [otherVideoRejectionText, setOtherVideoRejectionText] = useState("");
  const [otherVoiceRejectionText, setOtherVoiceRejectionText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [todaysRgcCode, setTodaysRgcCode] = useState<string | null>(null);
  const [rgcMissing, setRgcMissing] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignNotes, setReassignNotes] = useState("");
  const [reassignTarget, setReassignTarget] = useState<string>("");
  const [divisionCorrectionTarget, setDivisionCorrectionTarget] = useState<string | null>(null);
  const [divisionCorrectionConfirmOpen, setDivisionCorrectionConfirmOpen] = useState(false);
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

  const isAdminRole = user?.role === "admin" || user?.role === "super_admin";
  const { data: specsData, isSuccess: specsLoaded } = useQuery<{ divisions: string[] }>({
    queryKey: ["/api/agent/specializations"],
    enabled: !isAdminRole,
  });
  const { data: usersData } = useQuery<{ users: any[] }>({
    queryKey: ["/api/admin/users"],
    enabled: isAdminRole,
  });
  const availableAgents = (usersData?.users || []).filter(
    (u: any) => (u.role === "vrs_agent" || u.role === "admin" || u.role === "super_admin") && u.isActive
  );
  const allDivisionKeys = Object.keys(DIVISION_LABELS);
  const agentDivisions = isAdminRole ? allDivisionKeys : (specsData?.divisions || []);

  const isGeneralist = isAdminRole || agentDivisions.length >= allDivisionKeys.length;

  const statusMutation = useMutation({
    mutationFn: async (status: "online" | "offline") => {
      const res = await fetch("/api/agent/status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("vrs_token")}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      return data;
    },
    onSuccess: (_data, status) => {
      setLocalAgentStatus(status);
    },
    onError: (error: Error) => {
      toast({
        title: "Cannot Go Unavailable",
        description: error.message,
        variant: "destructive",
        duration: 6000,
      });
    },
  });

  const { subscribe } = useWebSocket(user?.role);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    const unsub1 = subscribe("new_ticket", (payload: any) => {
      playNotificationDing();
      const title = `New ${payload.applianceLabel} ticket, ${payload.warrantyLabel}`;
      const desc = `SO #${payload.serviceOrder}`;
      toast({ title, description: desc, duration: 8000 });
      showBrowserNotification(title, desc);
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
    });

    const unsub2 = subscribe("ticket_claimed", () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
    });

    const unsub3 = subscribe("ticket_queued", (payload: any) => {
      playNotificationDing();
      const title = `Ticket returned to queue`;
      const desc = `${payload.applianceLabel} - ${payload.warrantyLabel} (SO #${payload.serviceOrder})`;
      toast({ title, description: desc, duration: 8000 });
      showBrowserNotification(title, desc);
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
    });

    const unsub4 = subscribe("pending_tickets", (payload: any) => {
      playNotificationDing();
      const title = `Queued ${payload.applianceLabel} ticket, ${payload.warrantyLabel}`;
      const desc = `SO #${payload.serviceOrder} waiting in queue`;
      toast({ title, description: desc, duration: 8000 });
      showBrowserNotification(title, desc);
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
    });

    const unsub5 = subscribe("resubmission_received", (payload: any) => {
      playNotificationDing();
      const title = `Resubmission assigned to you`;
      const desc = `SO #${payload.serviceOrder} — ${payload.applianceLabel} (${payload.warrantyLabel}). A technician resubmitted a ticket you previously reviewed.`;
      toast({ title, description: desc, duration: 10000 });
      showBrowserNotification(title, desc);
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
    });

    const unsub6 = subscribe("ticket_assigned", (payload: any) => {
      playNotificationDing();
      const title = `Ticket assigned to you`;
      const desc = payload.message || `SO #${payload.serviceOrder} has been assigned to you by an admin.`;
      toast({ title, description: desc, duration: 8000 });
      showBrowserNotification(title, desc);
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
    };
  }, [subscribe, toast]);

  useEffect(() => {
    if (!statusChecked && user && !isAdminViewing && agentStatus === "offline") {
      setShowStatusPopup(true);
      setStatusChecked(true);
    } else if (!statusChecked && user) {
      setStatusChecked(true);
    }
  }, [user, agentStatus, statusChecked, isAdminViewing]);

  const resetActionState = () => {
    setSelectedAction(null);
    setSelectedRejectionReasons([]);
    setRejectedPhotos([]);
    setRejectedVideo({rejected: false, reason: ""});
    setRejectedVoiceNote({rejected: false, reason: ""});
    setTechnicianMessage("");
    setAgentNotes("");
    setAuthCode("");
    setSelectedInvalidReasons([]);
    setInvalidMessage("");
    setOtherRejectionText("");
    setOtherInvalidText("");
    setOtherPhotoRejectionText("");
    setOtherVideoRejectionText("");
    setOtherVoiceRejectionText("");
    setRejectCloseReason("");
    setRejectCloseCustomReason("");
    setConfirmOpen(false);
  };

  useEffect(() => {
    resetActionState();
  }, [selectedId]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (activeView === "queue") {
      params.set("ticketStatus", "queued");
    } else if (activeView === "mytickets") {
      params.set("ticketStatus", "pending");
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
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { data: statsData } = useQuery<{ queueCount: number; pendingCount: number; completedToday: number }>({
    queryKey: ["/api/agent/stats"],
    refetchInterval: 15000,
    staleTime: 10000,
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
    if (activeView === "mytickets" && selectedId && shsaiVisible) {
      const sub = (submissionsData?.submissions || []).find((s) => s.id === selectedId);
      if (sub && sub.id !== lastQueriedSubmissionId) {
        fetchShsaiData(sub.serviceOrder, sub.id);
      }
    }
  }, [selectedId, activeView, shsaiVisible]);

  const submissions = useMemo(() => {
    return submissionsData?.submissions || [];
  }, [submissionsData]);

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

  const REJECTION_SUGGESTIONS = [
    "Photos do not meet submission criteria",
    "Missing required photos",
    "Photo does not show voltage/reading",
    "Photo is blurry or unreadable",
    "Model/serial number not visible",
    "Estimate screenshot missing or incomplete",
    "Issue description does not match photos",
    "Missing appliance information",
    "Incomplete submission",
  ];

  const INVALID_SUGGESTIONS = [
    "Not a VRS-eligible warranty",
    "Product not covered under warranty",
    "Use standard authorization process",
    "Contact B2B support directly",
    "Service order not found or invalid",
    "Duplicate submission",
    "Technician not authorized for this service",
  ];

  const PHOTO_REJECTION_REASONS = [
    "Blurry or out of focus",
    "Does not show required information",
    "Wrong angle — cannot verify issue",
    "Too dark / overexposed",
    "Duplicate photo",
    "Does not match description",
    "Model/serial not readable",
    "Other",
  ];

  const MEDIA_REJECTION_REASONS = [
    "Too much background noise",
    "Cannot hear audio clearly",
    "No image / blank screen",
    "Video is too short",
    "Video does not show the issue",
    "Corrupted or won't play",
    "Other",
  ];

  const claimMutation = useMutation({
    mutationFn: async (submissionId: number) => {
      const res = await apiRequest("PATCH", `/api/submissions/${submissionId}/claim`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Ticket Claimed", description: "You are now working on this ticket." });
      setLocalAgentStatus("working");
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ submissionId, body }: { submissionId: number; body: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/submissions/${submissionId}/process`, body);
      return res.json();
    },
    onSuccess: () => {
      const actionLabel = selectedAction === "approve_submission" ? "Submission Approved" : selectedAction === "approve" ? "Approved" : selectedAction === "reject" ? "Rejected" : selectedAction === "reject_and_close" ? "Rejected & Closed" : "Marked Invalid";
      const actionDesc = selectedAction === "approve_submission" ? "Technician has been notified. Enter the authorization code to complete this ticket." : selectedAction === "reject_and_close" ? "Technician has been notified. This service order is permanently closed." : "Technician has been notified.";
      toast({ title: actionLabel, description: actionDesc });
      if (selectedAction !== "approve_submission") {
        setSelectedId(null);
        setLocalAgentStatus("online");
      }
      resetActionState();
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
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
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reassignMutation = useMutation({
    mutationFn: async ({ submissionId, agentId, notes }: { submissionId: number; agentId?: number; notes?: string }) => {
      const res = await apiRequest("PATCH", `/api/submissions/${submissionId}/reassign`, { agentId, notes });
      return res.json();
    },
    onSuccess: (_data: any, variables: { submissionId: number; agentId?: number }) => {
      toast({
        title: variables.agentId ? "Ticket Reassigned" : "Reassigned to Queue",
        description: variables.agentId
          ? `Assigned to ${availableAgents.find((a: any) => a.id === variables.agentId)?.name || "agent"}.`
          : "Ticket returned to the queue.",
      });
      setSelectedId(null);
      setReassignNotes("");
      setReassignTarget("");
      setReassignOpen(false);
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const divisionCorrectionMutation = useMutation({
    mutationFn: async ({ submissionId, newDivision }: { submissionId: number; newDivision: string }) => {
      const res = await apiRequest("PATCH", `/api/submissions/${submissionId}/correct-division`, { newDivision });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.agentKeepsTicket) {
        toast({ title: "Division Corrected", description: "Appliance type updated. You still own this ticket." });
        queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
        queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
        queryClient.refetchQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      } else {
        toast({ title: "Division Corrected", description: "Ticket re-routed to the correct division queue." });
        setSelectedId(null);
        setLocalAgentStatus("online");
        queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
        queryClient.invalidateQueries({ queryKey: ["/api/agent/stats"] });
        queryClient.refetchQueries({ predicate: (q) => (q.queryKey[0] as string).startsWith("/api/submissions") });
      }
      setDivisionCorrectionTarget(null);
      setDivisionCorrectionConfirmOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleClaimAndOpen = (submissionId: number) => {
    claimMutation.mutate(submissionId);
    setSelectedId(submissionId);
    setActiveView("mytickets");
  };

  const handleProcessSubmit = () => {
    if (!selectedSubmission || !selectedAction) return;
    const body: Record<string, unknown> = {
      action: selectedAction,
      agentNotes: agentNotes || undefined,
    };
    if (selectedAction === "reject") {
      const allRejectReasons = [...selectedRejectionReasons];
      if (allRejectReasons.includes("Other") && otherRejectionText.trim()) {
        allRejectReasons[allRejectReasons.indexOf("Other")] = `Other: ${otherRejectionText.trim()}`;
      } else if (allRejectReasons.includes("Other")) {
        allRejectReasons[allRejectReasons.indexOf("Other")] = "Other";
      }
      if (allRejectReasons.length > 0) {
        body.rejectionReasons = allRejectReasons;
      }
      const mediaRejections: Record<string, unknown> = {};
      if (rejectedPhotos.length > 0) {
        const processedPhotos = rejectedPhotos.map(rp => {
          if (rp.reason === "Other" && otherPhotoRejectionText.trim()) {
            return { ...rp, reason: `Other: ${otherPhotoRejectionText.trim()}` };
          }
          return rp;
        });
        mediaRejections.photos = processedPhotos;
      }
      if (rejectedVideo.rejected) {
        const videoData = rejectedVideo.reason === "Other" && otherVideoRejectionText.trim()
          ? { ...rejectedVideo, reason: `Other: ${otherVideoRejectionText.trim()}` }
          : rejectedVideo;
        mediaRejections.video = videoData;
      }
      if (rejectedVoiceNote.rejected) {
        const voiceData = rejectedVoiceNote.reason === "Other" && otherVoiceRejectionText.trim()
          ? { ...rejectedVoiceNote, reason: `Other: ${otherVoiceRejectionText.trim()}` }
          : rejectedVoiceNote;
        mediaRejections.voiceNote = voiceData;
      }
      if (Object.keys(mediaRejections).length > 0) body.rejectedMedia = mediaRejections;
      if (technicianMessage) body.technicianMessage = technicianMessage;
    }
    if (selectedAction === "reject_and_close") {
      const closeReason = rejectCloseReason === "Other" && rejectCloseCustomReason.trim()
        ? `Other: ${rejectCloseCustomReason.trim()}`
        : rejectCloseReason;
      body.rejectionReasons = [closeReason];
      if (technicianMessage) body.technicianMessage = technicianMessage;
    }
    if (selectedAction === "invalid") {
      const allInvalidReasons = [...selectedInvalidReasons];
      if (allInvalidReasons.includes("Other") && otherInvalidText.trim()) {
        allInvalidReasons[allInvalidReasons.indexOf("Other")] = `Other: ${otherInvalidText.trim()}`;
      } else if (allInvalidReasons.includes("Other")) {
        allInvalidReasons[allInvalidReasons.indexOf("Other")] = "Other";
      }
      body.invalidReason = allInvalidReasons.join("; ");
      body.invalidInstructions = invalidMessage || undefined;
    }
    if (selectedAction === "approve" && authCode) {
      body.authCode = authCode;
    }
    processMutation.mutate({ submissionId: selectedSubmission.id, body });
    setConfirmOpen(false);
  };

  const isTwoStageWarranty = (sub: SubmissionWithTech | null): boolean => {
    if (!sub) return false;
    if (sub.requestType !== "authorization") return false;
    return needsExternalAuth(sub);
  };

  const isSubmissionApprovedStage = (sub: SubmissionWithTech | null): boolean => {
    if (!sub) return false;
    return (sub as any).submissionApproved === true;
  };

  const needsExternalAuth = (sub: SubmissionWithTech | null): boolean => {
    if (!sub) return false;
    const provider = (sub.warrantyProvider || "").toLowerCase();
    return ["american home shield", "ahs", "first american"].some(w => provider.includes(w));
  };

  const isNonPartsRequest = (sub: SubmissionWithTech | null): boolean => {
    if (!sub) return false;
    return sub.requestType !== "authorization";
  };

  const getProviderAuthLabel = (sub: SubmissionWithTech | null): string => {
    if (!sub) return "Authorization Code";
    const provider = (sub.warrantyProvider || "").toLowerCase();
    if (provider.includes("american home shield") || provider.includes("ahs")) return "AHS Authorization Code";
    if (provider.includes("first american")) return "First American Authorization Code";
    return "Authorization Code";
  };


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
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    {agentStatus === "online" ? "Available" : agentStatus === "working" ? "Working" : "Unavailable"}
                  </span>
                  <Switch
                    checked={agentStatus === "online" || agentStatus === "working"}
                    onCheckedChange={(checked) => {
                      if (agentStatus === "working") {
                        toast({
                          title: "Cannot Go Unavailable",
                          description: "You have an open ticket. Complete it or ask an admin to reassign it.",
                          variant: "destructive",
                          duration: 5000,
                        });
                        return;
                      }
                      statusMutation.mutate(checked ? "online" : "offline");
                    }}
                    disabled={statusMutation.isPending || agentStatus === "working"}
                    data-testid="toggle-agent-status"
                    className="scale-75"
                  />
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Tickets</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => { setActiveView("queue"); setSelectedId(null); }}
                      data-active={activeView === "queue"}
                      data-testid="nav-queue"
                    >
                      <ClipboardList className="w-4 h-4" />
                      <span>Queue</span>
                      {statsData && activeView !== "queue" && (
                        <Badge variant="secondary" className="ml-auto text-xs" data-testid="badge-queue-count">
                          {statsData.queueCount}
                        </Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => { setActiveView("mytickets"); setSelectedId(null); }}
                      data-active={activeView === "mytickets"}
                      data-testid="nav-mytickets"
                    >
                      <ClipboardCheck className="w-4 h-4" />
                      <span>My Tickets</span>
                      {statsData && (statsData.pendingCount ?? 0) > 0 && activeView !== "mytickets" && (
                        <Badge variant="secondary" className="ml-auto text-xs" data-testid="badge-pending-count">
                          {statsData.pendingCount}
                        </Badge>
                      )}
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
                  {Object.entries(DIVISION_LABELS)
                    .filter(([key]) => isGeneralist || agentDivisions.includes(key))
                    .map(([key, label]) => (
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

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {!isAdminViewing && agentStatus === "offline" && (
            <button
              onClick={() => statusMutation.mutate("online")}
              className="w-full px-4 py-2 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-sm font-medium text-center hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors flex items-center justify-center gap-2"
              data-testid="banner-offline"
            >
              <AlertTriangle className="w-4 h-4" />
              You are currently unavailable and not receiving tickets. Click here to go available.
            </button>
          )}
          <header className="flex items-center justify-between gap-2 p-3 border-b sticky top-0 z-50 bg-background">
            <div className="flex items-center gap-2">
              {selectedId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden md:inline-flex gap-1.5"
                  onClick={() => setSelectedId(null)}
                  data-testid="button-back-to-queue"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Queue
                </Button>
              )}
              {!selectedId && (
                <SidebarTrigger data-testid="button-sidebar-toggle" />
              )}
              <h1 className="text-lg font-semibold" data-testid="text-page-title">
                {activeView === "queue" && `Queue (${statsData?.queueCount ?? 0})`}
                {activeView === "mytickets" && `My Tickets (${statsData?.pendingCount ?? 0})`}
                {activeView === "completed" && "Completed Today"}
              </h1>
            </div>
            <div className="flex items-center gap-3">
            </div>
          </header>

          <div className="flex flex-1 min-h-0">
            <div className={`w-full md:w-[380px] border-r flex flex-col min-h-0 ${selectedId ? "hidden" : ""}`}>
              <div className="px-3 py-2 border-b flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground" data-testid="text-queue-count">
                  {submissions.length} ticket{submissions.length !== 1 ? "s" : ""}
                </span>
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
                          }`}
                          style={
                            urgency === "urgent"
                              ? { borderLeft: "3px solid #ef4444" }
                              : urgency === "warning"
                              ? { borderLeft: "3px solid #f59e0b" }
                              : undefined
                          }
                          data-testid={`queue-item-${sub.id}`}
                        >
                          <button
                            onClick={() => {
                              if (activeView === "queue") {
                                handleClaimAndOpen(sub.id);
                              } else {
                                setSelectedId(sub.id);
                              }
                            }}
                            className="flex-1 text-left min-w-0"
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
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {sub.requestType === "infestation_non_accessible" && (
                                <Badge
                                  variant="secondary"
                                  className="text-xs bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                  data-testid={`badge-request-type-${sub.id}`}
                                >
                                  Infestation / Non-Accessible
                                </Badge>
                              )}
                              {sub.resubmissionOf && (
                                <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" data-testid={`badge-resubmission-${sub.id}`}>
                                  Resubmission
                                </Badge>
                              )}
                              {sub.aiEnhanced && (
                                <Badge variant="secondary" className="text-xs gap-0.5">
                                  <Sparkles className="w-3 h-3" />
                                  AI
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {getWarrantyLabel(sub)}
                              </Badge>
                            </div>
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
                    <p className="text-sm">
                      {activeView === "queue" ? "Click a ticket to claim and review it" : "Select a ticket to review"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 min-h-0">
                <ScrollArea className={activeView === "mytickets" && shsaiVisible ? "w-full md:w-[60%] border-r" : "flex-1"}>
                  <div className="p-4 md:p-6 max-w-3xl space-y-4 md:space-y-6">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="md:hidden mb-2 -ml-1 gap-1"
                      onClick={() => setSelectedId(null)}
                      data-testid="button-back-to-list"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to list
                    </Button>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <h2 className="text-xl font-semibold" data-testid="text-detail-so">
                          SO# {selectedSubmission.serviceOrder}
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
                          <span className="text-xs">
                            Submitted {new Date(selectedSubmission.createdAt!).toLocaleString()}
                          </span>
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
                        {activeView === "mytickets" && !shsaiVisible && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShsaiVisible(true)}
                            data-testid="button-show-shsai"
                          >
                            <PanelRightOpen className="w-4 h-4 mr-1" />
                            Service History
                          </Button>
                        )}
                        {activeView === "mytickets" && (user?.role === "admin" || user?.role === "super_admin") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReassignOpen(true)}
                            data-testid="button-reassign"
                          >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Reassign
                          </Button>
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
                            <p className="text-xs text-muted-foreground">District</p>
                            <p className="text-sm font-medium" data-testid="text-detail-district">{selectedSubmission.districtCode || "\u2014"}</p>
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
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium" data-testid="text-detail-appliance">
                                {APPLIANCE_LABELS[selectedSubmission.applianceType] || selectedSubmission.applianceType}
                              </p>
                              {activeView === "mytickets" && selectedSubmission.ticketStatus === "pending" && selectedSubmission.assignedTo === user?.id && (
                                <Select
                                  value=""
                                  onValueChange={(val) => {
                                    if (val && val !== selectedSubmission.applianceType) {
                                      setDivisionCorrectionTarget(val);
                                      setDivisionCorrectionConfirmOpen(true);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-6 w-auto px-2 text-xs gap-1" data-testid="button-correct-division">
                                    <Wrench className="w-3 h-3" />
                                    <span>Correct</span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(DIVISION_LABELS).filter(([key]) => key !== selectedSubmission.applianceType).map(([key, label]) => (
                                      <SelectItem key={key} value={key}>{label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Warranty Provider</p>
                            <p className="text-sm font-medium" data-testid="text-detail-warranty">
                              {getWarrantyLabel(selectedSubmission)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Estimate Amount</p>
                            <p className="text-sm font-medium" data-testid="text-detail-estimate">
                              {selectedSubmission.estimateAmount ? `$${selectedSubmission.estimateAmount}` : "\u2014"}
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
                          {selectedAction === "reject" && (
                            <Badge variant="outline" className="ml-auto text-[10px] text-red-600 border-red-300">Click media to reject</Badge>
                          )}
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
                          const allPhotos = [...issuePhotos, ...estimatePhotos, ...legacyPhotos];

                          const isPhotoRejected = (url: string) => rejectedPhotos.some(rp => rp.url === url);
                          const getPhotoRejection = (url: string) => rejectedPhotos.find(rp => rp.url === url);

                          const togglePhotoRejection = (url: string) => {
                            if (isPhotoRejected(url)) {
                              setRejectedPhotos(prev => prev.filter(rp => rp.url !== url));
                            } else {
                              setRejectedPhotos(prev => [...prev, {url, reason: PHOTO_REJECTION_REASONS[0]}]);
                            }
                          };

                          const updatePhotoRejectionReason = (url: string, reason: string) => {
                            setRejectedPhotos(prev => prev.map(rp => rp.url === url ? {...rp, reason} : rp));
                          };

                          const renderPhotoGrid = (photos: string[], label: string, icon: any, offset: number, testIdPrefix: string) => {
                            if (photos.length === 0) return null;
                            return (
                              <div>
                                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
                                  <ImageIcon className="w-3.5 h-3.5" />
                                  {label} ({photos.length})
                                </p>
                                <div className="grid grid-cols-3 gap-2" data-testid={`media-${testIdPrefix}`}>
                                  {photos.map((url: string, i: number) => {
                                    const rejected = isPhotoRejected(url);
                                    const rejection = getPhotoRejection(url);
                                    return (
                                      <div key={i} className="space-y-1">
                                        <div
                                          className={`relative aspect-square bg-muted rounded-md overflow-hidden cursor-pointer group ${rejected ? "ring-2 ring-red-500" : ""}`}
                                          onClick={() => selectedAction === "reject" ? togglePhotoRejection(url) : openLightbox(allPhotos, offset + i)}
                                          data-testid={`${testIdPrefix}-photo-${i}`}
                                        >
                                          <img src={url} alt={`${label} ${i + 1}`} className={`w-full h-full object-cover pointer-events-none ${rejected ? "opacity-40" : ""}`} />
                                          {selectedAction === "reject" && (
                                            <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${rejected ? "bg-red-500/30 opacity-100" : "opacity-0 group-hover:opacity-100 bg-red-500/20"}`}>
                                              {rejected ? (
                                                <XCircle className="w-8 h-8 text-red-600" />
                                              ) : (
                                                <XCircle className="w-8 h-8 text-red-400" />
                                              )}
                                            </div>
                                          )}
                                          {selectedAction !== "reject" && (
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                              <ZoomIn className="w-6 h-6 text-white" />
                                            </div>
                                          )}
                                        </div>
                                        {rejected && (
                                          <>
                                            <Select value={rejection?.reason || ""} onValueChange={(val) => updatePhotoRejectionReason(url, val)}>
                                              <SelectTrigger className="h-7 text-[10px] border-red-300">
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {PHOTO_REJECTION_REASONS.map(r => (
                                                  <SelectItem key={r} value={r}>{r}</SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                            {rejection?.reason === "Other" && (
                                              <input
                                                type="text"
                                                className="w-full text-[10px] border rounded-md px-2 py-1 bg-background border-red-300"
                                                placeholder="Specify reason..."
                                                value={otherPhotoRejectionText}
                                                onChange={(e) => setOtherPhotoRejectionText(e.target.value)}
                                                data-testid="input-other-photo-rejection"
                                              />
                                            )}
                                          </>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          };

                          return (
                            <div className="space-y-4">
                              {renderPhotoGrid(issuePhotos, "Issue Photos", ImageIcon, 0, "issue-photos")}
                              {renderPhotoGrid(estimatePhotos, "Model, Serial & Estimate Screenshots", ImageIcon, issuePhotos.length, "estimate-photos")}
                              {renderPhotoGrid(legacyPhotos, "Photos", ImageIcon, issuePhotos.length + estimatePhotos.length, "photos")}
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
                            <div className="space-y-2">
                              <div className={`rounded-md overflow-hidden bg-muted ${rejectedVideo.rejected ? "ring-2 ring-red-500" : ""}`} data-testid="media-video">
                                <video
                                  src={selectedSubmission.videoUrl}
                                  controls
                                  className={`w-full max-h-[300px] ${rejectedVideo.rejected ? "opacity-40" : ""}`}
                                  data-testid="video-player"
                                />
                              </div>
                              {selectedAction === "reject" && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setRejectedVideo(prev => ({...prev, rejected: !prev.rejected}))}
                                    className="shrink-0"
                                    data-testid="button-reject-video"
                                  >
                                    {rejectedVideo.rejected ? <CheckSquare className="w-5 h-5 text-red-600" /> : <Square className="w-5 h-5 text-muted-foreground" />}
                                  </button>
                                  <span className="text-xs text-red-600 font-medium">Reject Video</span>
                                </div>
                              )}
                              {rejectedVideo.rejected && (
                                <>
                                  <Select value={rejectedVideo.reason || ""} onValueChange={(val) => setRejectedVideo(prev => ({...prev, reason: val}))}>
                                    <SelectTrigger className="h-8 text-xs border-red-300" data-testid="select-video-reject-reason">
                                      <SelectValue placeholder="Select reason..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {MEDIA_REJECTION_REASONS.map(r => (
                                        <SelectItem key={r} value={r}>{r}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {rejectedVideo.reason === "Other" && (
                                    <input
                                      type="text"
                                      className="w-full text-xs border rounded-md px-2 py-1 bg-background border-red-300"
                                      placeholder="Specify reason..."
                                      value={otherVideoRejectionText}
                                      onChange={(e) => setOtherVideoRejectionText(e.target.value)}
                                      data-testid="input-other-video-rejection"
                                    />
                                  )}
                                </>
                              )}
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
                            <div className="space-y-2">
                              <audio src={selectedSubmission.voiceNoteUrl} controls className={`w-full ${rejectedVoiceNote.rejected ? "opacity-40" : ""}`} data-testid="audio-player" />
                              {selectedAction === "reject" && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setRejectedVoiceNote(prev => ({...prev, rejected: !prev.rejected}))}
                                    className="shrink-0"
                                    data-testid="button-reject-voice-note"
                                  >
                                    {rejectedVoiceNote.rejected ? <CheckSquare className="w-5 h-5 text-red-600" /> : <Square className="w-5 h-5 text-muted-foreground" />}
                                  </button>
                                  <span className="text-xs text-red-600 font-medium">Reject Voice Note</span>
                                </div>
                              )}
                              {rejectedVoiceNote.rejected && (
                                <>
                                  <Select value={rejectedVoiceNote.reason || ""} onValueChange={(val) => setRejectedVoiceNote(prev => ({...prev, reason: val}))}>
                                    <SelectTrigger className="h-8 text-xs border-red-300" data-testid="select-voice-reject-reason">
                                      <SelectValue placeholder="Select reason..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {MEDIA_REJECTION_REASONS.map(r => (
                                        <SelectItem key={r} value={r}>{r}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {rejectedVoiceNote.reason === "Other" && (
                                    <input
                                      type="text"
                                      className="w-full text-xs border rounded-md px-2 py-1 bg-background border-red-300"
                                      placeholder="Specify reason..."
                                      value={otherVoiceRejectionText}
                                      onChange={(e) => setOtherVoiceRejectionText(e.target.value)}
                                      data-testid="input-other-voice-rejection"
                                    />
                                  )}
                                </>
                              )}
                            </div>
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
                                  {(item.ticketStatus === "rejected" || item.stage1Status === "rejected") && (item.stage1RejectionReason || item.rejectionReasons) && (
                                    <p className="text-xs text-destructive">
                                      Rejected: "{item.rejectionReasons ? (typeof item.rejectionReasons === 'string' ? JSON.parse(item.rejectionReasons) : item.rejectionReasons).join(', ') : item.stage1RejectionReason}"
                                    </p>
                                  )}
                                  {(item.ticketStatus === "invalid" || item.stage1Status === "invalid") && item.invalidReason && (
                                    <p className="text-xs text-muted-foreground">
                                      Invalid: "{item.invalidReason}"
                                    </p>
                                  )}
                                  {(item.ticketStatus === "completed" || item.stage1Status === "approved") && (
                                    <p className="text-xs text-green-600">Approved</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    )}

                    {activeView === "mytickets" && selectedSubmission.ticketStatus === "pending" && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Layers className="w-4 h-4" />
                            {isTwoStageWarranty(selectedSubmission) && !isSubmissionApprovedStage(selectedSubmission)
                              ? "Stage 1: Submission Review"
                              : isTwoStageWarranty(selectedSubmission) && isSubmissionApprovedStage(selectedSubmission)
                              ? "Stage 2: Authorization"
                              : "Review Actions"}
                          </CardTitle>
                          {isTwoStageWarranty(selectedSubmission) && (
                            <div className="flex items-center gap-2 mt-1">
                              <div className={`h-1.5 flex-1 rounded-full ${isSubmissionApprovedStage(selectedSubmission) ? "bg-green-500" : "bg-blue-500"}`} />
                              <div className={`h-1.5 flex-1 rounded-full ${isSubmissionApprovedStage(selectedSubmission) ? "bg-blue-500" : "bg-muted"}`} />
                            </div>
                          )}
                          {isTwoStageWarranty(selectedSubmission) && isSubmissionApprovedStage(selectedSubmission) && (
                            <div className="mt-2 p-2 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
                              <p className="text-xs font-medium text-green-700 dark:text-green-300 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Submission Approved
                              </p>
                              <p className="text-xs text-green-600 dark:text-green-400 mt-1" data-testid="text-submission-approved">
                                Technician has been notified. Enter the authorization code to complete this ticket.
                              </p>
                            </div>
                          )}
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
                        <CardContent className="space-y-5">
                          {isTwoStageWarranty(selectedSubmission) && isSubmissionApprovedStage(selectedSubmission) ? (
                            <>
                              <div className="space-y-3 border rounded-lg p-4 bg-green-50/50 dark:bg-green-950/10">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Authorization Code</p>
                                {rgcMissing ? (
                                  <p className="text-sm text-destructive" data-testid="text-rgc-not-set">
                                    No RGC code set for today. Contact an administrator.
                                  </p>
                                ) : (
                                  <div className="space-y-3">
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Today's RGC Code</Label>
                                      <Input
                                        value={todaysRgcCode || ""}
                                        readOnly
                                        className="font-mono bg-muted mt-1"
                                        data-testid="input-rgc-readonly"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-muted-foreground">{getProviderAuthLabel(selectedSubmission)}</Label>
                                      <Input
                                        placeholder="Enter auth code from warranty provider..."
                                        value={authCode}
                                        onChange={(e) => setAuthCode(e.target.value)}
                                        className="mt-1"
                                        data-testid="input-auth-code"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
                                  Internal Agent Notes (not sent to technician)
                                </Label>
                                <Textarea
                                  placeholder="Internal notes — saved to ticket history only..."
                                  value={agentNotes}
                                  onChange={(e) => setAgentNotes(e.target.value)}
                                  className="resize-none"
                                  rows={2}
                                  data-testid="input-agent-notes"
                                />
                              </div>

                              <Button
                                className="w-full"
                                size="lg"
                                onClick={() => {
                                  if (!authCode.trim()) {
                                    toast({ title: "Error", description: `Enter the ${getProviderAuthLabel(selectedSubmission)}`, variant: "destructive" });
                                    return;
                                  }
                                  if (rgcMissing) {
                                    toast({ title: "Error", description: "RGC code not set for today", variant: "destructive" });
                                    return;
                                  }
                                  setSelectedAction("approve");
                                  setConfirmOpen(true);
                                }}
                                disabled={processMutation.isPending}
                                data-testid="button-authorize-submit"
                              >
                                <Send className="w-4 h-4 mr-2" />
                                {processMutation.isPending ? "Processing..." : "Authorize & Send"}
                              </Button>
                            </>
                          ) : (
                            <>
                              <div className={`grid ${isTwoStageWarranty(selectedSubmission) ? "grid-cols-3" : "grid-cols-3"} gap-3`}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isTwoStageWarranty(selectedSubmission)) {
                                      setSelectedAction(selectedAction === "approve_submission" ? null : "approve_submission");
                                    } else {
                                      setSelectedAction(selectedAction === "approve" ? null : "approve");
                                    }
                                  }}
                                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all ${
                                    selectedAction === "approve" || selectedAction === "approve_submission"
                                      ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                                      : "border-border hover:border-green-300"
                                  }`}
                                  data-testid="action-approve"
                                >
                                  {selectedAction === "approve" || selectedAction === "approve_submission" ? (
                                    <CheckSquare className="w-8 h-8 text-green-600" />
                                  ) : (
                                    <Square className="w-8 h-8 text-muted-foreground" />
                                  )}
                                  <span className={`text-sm font-medium ${selectedAction === "approve" || selectedAction === "approve_submission" ? "text-green-700 dark:text-green-400" : ""}`}>
                                    {isTwoStageWarranty(selectedSubmission) ? "Approve Submission" : "Approve"}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedAction(selectedAction === "reject" ? null : "reject")}
                                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all ${
                                    selectedAction === "reject"
                                      ? "border-red-500 bg-red-50 dark:bg-red-950/30"
                                      : "border-border hover:border-red-300"
                                  }`}
                                  data-testid="action-reject"
                                >
                                  {selectedAction === "reject" ? (
                                    <CheckSquare className="w-8 h-8 text-red-600" />
                                  ) : (
                                    <Square className="w-8 h-8 text-muted-foreground" />
                                  )}
                                  <span className={`text-sm font-medium ${selectedAction === "reject" ? "text-red-700 dark:text-red-400" : ""}`}>
                                    Reject
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedAction(selectedAction === "invalid" ? null : "invalid")}
                                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all ${
                                    selectedAction === "invalid"
                                      ? "border-gray-500 bg-gray-50 dark:bg-gray-950/30"
                                      : "border-border hover:border-gray-300"
                                  }`}
                                  data-testid="action-invalid"
                                >
                                  {selectedAction === "invalid" ? (
                                    <CheckSquare className="w-8 h-8 text-gray-600" />
                                  ) : (
                                    <Square className="w-8 h-8 text-muted-foreground" />
                                  )}
                                  <span className={`text-sm font-medium ${selectedAction === "invalid" ? "text-gray-700 dark:text-gray-400" : ""}`}>
                                    Invalid
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedAction(selectedAction === "reject_and_close" ? null : "reject_and_close")}
                                  className={`flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all ${
                                    selectedAction === "reject_and_close"
                                      ? "border-orange-600 bg-orange-50 dark:bg-orange-950/30"
                                      : "border-border hover:border-orange-300"
                                  }`}
                                  data-testid="action-reject-and-close"
                                >
                                  {selectedAction === "reject_and_close" ? (
                                    <CheckSquare className="w-8 h-8 text-orange-600" />
                                  ) : (
                                    <Square className="w-8 h-8 text-muted-foreground" />
                                  )}
                                  <span className={`text-sm font-medium ${selectedAction === "reject_and_close" ? "text-orange-700 dark:text-orange-400" : ""}`}>
                                    Reject & Close
                                  </span>
                                </button>
                              </div>

                              {selectedAction === "reject" && (
                                <div className="space-y-4">
                                  <div className="space-y-3 border rounded-lg p-4 bg-red-50/50 dark:bg-red-950/10">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rejection Reasons</p>
                                    <div className="space-y-2">
                                      {REJECTION_SUGGESTIONS.map((reason) => (
                                        <button
                                          key={reason}
                                          type="button"
                                          className="flex items-center gap-2 cursor-pointer w-full text-left"
                                          onClick={() => {
                                            setSelectedRejectionReasons((prev) =>
                                              prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
                                            );
                                            if (reason === "Other" && selectedRejectionReasons.includes("Other")) {
                                              setOtherRejectionText("");
                                            }
                                          }}
                                          data-testid={`checkbox-reason-${reason.replace(/\s+/g, '-').toLowerCase()}`}
                                        >
                                          {selectedRejectionReasons.includes(reason) ? (
                                            <CheckSquare className="w-5 h-5 text-red-600 shrink-0" />
                                          ) : (
                                            <Square className="w-5 h-5 text-muted-foreground shrink-0" />
                                          )}
                                          <span className="text-sm">{reason}</span>
                                        </button>
                                      ))}
                                      <button
                                        type="button"
                                        className="flex items-center gap-2 cursor-pointer w-full text-left"
                                        onClick={() => {
                                          setSelectedRejectionReasons((prev) =>
                                            prev.includes("Other") ? prev.filter((r) => r !== "Other") : [...prev, "Other"]
                                          );
                                          if (selectedRejectionReasons.includes("Other")) {
                                            setOtherRejectionText("");
                                          }
                                        }}
                                        data-testid="checkbox-reason-other"
                                      >
                                        {selectedRejectionReasons.includes("Other") ? (
                                          <CheckSquare className="w-5 h-5 text-red-600 shrink-0" />
                                        ) : (
                                          <Square className="w-5 h-5 text-muted-foreground shrink-0" />
                                        )}
                                        <span className="text-sm">Other</span>
                                      </button>
                                      {selectedRejectionReasons.includes("Other") && (
                                        <input
                                          type="text"
                                          className="w-full ml-7 text-sm border rounded-md px-3 py-1.5 bg-background"
                                          placeholder="Specify other reason..."
                                          value={otherRejectionText}
                                          onChange={(e) => setOtherRejectionText(e.target.value)}
                                          data-testid="input-other-rejection-reason"
                                        />
                                      )}
                                    </div>
                                  </div>

                                  {(rejectedPhotos.length > 0 || rejectedVideo.rejected || rejectedVoiceNote.rejected) && (
                                    <div className="space-y-2 border rounded-lg p-4 bg-red-50/50 dark:bg-red-950/10">
                                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rejected Media Summary</p>
                                      <div className="space-y-1">
                                        {rejectedPhotos.map((rp, i) => (
                                          <div key={i} className="flex items-center gap-2 text-xs text-red-700">
                                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                                            <span>Photo: {rp.reason}</span>
                                          </div>
                                        ))}
                                        {rejectedVideo.rejected && (
                                          <div className="flex items-center gap-2 text-xs text-red-700">
                                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                                            <span>Video: {rejectedVideo.reason || "Rejected"}</span>
                                          </div>
                                        )}
                                        {rejectedVoiceNote.rejected && (
                                          <div className="flex items-center gap-2 text-xs text-red-700">
                                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                                            <span>Voice Note: {rejectedVoiceNote.reason || "Rejected"}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}

                                  <div className="space-y-2 border rounded-lg p-4 bg-orange-50/50 dark:bg-orange-950/10">
                                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                      <Send className="w-3 h-3" />
                                      Message to Technician (sent via SMS)
                                    </Label>
                                    <Textarea
                                      placeholder="Add a custom message for the technician explaining what needs to be corrected..."
                                      value={technicianMessage}
                                      onChange={(e) => setTechnicianMessage(e.target.value)}
                                      className="resize-none"
                                      rows={3}
                                      data-testid="input-technician-message"
                                    />
                                  </div>
                                </div>
                              )}

                              {selectedAction === "reject_and_close" && (
                                <div className="space-y-4">
                                  <div className="space-y-3 border rounded-lg p-4 bg-orange-50/50 dark:bg-orange-950/10">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reject & Close — Not Covered</p>
                                    <p className="text-xs text-muted-foreground">This permanently closes the ticket. The technician will be unable to resubmit or create new tickets for this service order. Use when the repair is not covered under warranty.</p>
                                    <div className="space-y-2">
                                      <Label className="text-xs text-muted-foreground">Reason</Label>
                                      <select
                                        className="w-full text-sm border rounded-md px-3 py-2 bg-background"
                                        value={rejectCloseReason}
                                        onChange={(e) => {
                                          setRejectCloseReason(e.target.value);
                                          if (e.target.value !== "Other") setRejectCloseCustomReason("");
                                        }}
                                        data-testid="select-reject-close-reason"
                                      >
                                        <option value="">Select a reason...</option>
                                        <option value="Customer abuse/neglect">Customer abuse/neglect</option>
                                        <option value="Pre-existing damage not covered">Pre-existing damage not covered</option>
                                        <option value="Cosmetic damage — not a functional failure">Cosmetic damage — not a functional failure</option>
                                        <option value="Unauthorized modification by customer">Unauthorized modification by customer</option>
                                        <option value="Commercial use of residential product">Commercial use of residential product</option>
                                        <option value="Coverage expired or not active">Coverage expired or not active</option>
                                        <option value="Product not listed on warranty contract">Product not listed on warranty contract</option>
                                        <option value="Recall or manufacturer defect — contact manufacturer">Recall or manufacturer defect — contact manufacturer</option>
                                        <option value="Other">Other</option>
                                      </select>
                                      {rejectCloseReason === "Other" && (
                                        <input
                                          type="text"
                                          className="w-full text-sm border rounded-md px-3 py-1.5 bg-background"
                                          placeholder="Specify other reason..."
                                          value={rejectCloseCustomReason}
                                          onChange={(e) => setRejectCloseCustomReason(e.target.value)}
                                          data-testid="input-reject-close-custom-reason"
                                        />
                                      )}
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Message to Technician (optional)</Label>
                                    <textarea
                                      className="w-full text-sm border rounded-md px-3 py-2 bg-background resize-none"
                                      placeholder="e.g., Offer customer cash call estimate for repair..."
                                      value={technicianMessage}
                                      onChange={(e) => setTechnicianMessage(e.target.value)}
                                      rows={3}
                                      data-testid="input-reject-close-message"
                                    />
                                  </div>
                                </div>
                              )}

                              {selectedAction === "invalid" && (
                                <div className="space-y-3">
                                  <div className="space-y-2 border rounded-lg p-4 bg-gray-50/50 dark:bg-gray-950/10">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Invalid Reasons (select all that apply)</p>
                                    <div className="space-y-1.5">
                                      {INVALID_SUGGESTIONS.map((reason) => (
                                        <button
                                          key={reason}
                                          type="button"
                                          className="flex items-center gap-2 cursor-pointer w-full text-left"
                                          onClick={() => {
                                            setSelectedInvalidReasons((prev) =>
                                              prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
                                            );
                                            if (reason === "Other" && selectedInvalidReasons.includes("Other")) {
                                              setOtherInvalidText("");
                                            }
                                          }}
                                          data-testid={`checkbox-invalid-${reason.replace(/\s+/g, '-').toLowerCase()}`}
                                        >
                                          {selectedInvalidReasons.includes(reason) ? (
                                            <CheckSquare className="w-5 h-5 text-gray-700 dark:text-gray-400 shrink-0" />
                                          ) : (
                                            <Square className="w-5 h-5 text-muted-foreground shrink-0" />
                                          )}
                                          <span className="text-sm">{reason}</span>
                                        </button>
                                      ))}
                                      <button
                                        type="button"
                                        className="flex items-center gap-2 cursor-pointer w-full text-left"
                                        onClick={() => {
                                          setSelectedInvalidReasons((prev) =>
                                            prev.includes("Other") ? prev.filter((r) => r !== "Other") : [...prev, "Other"]
                                          );
                                          if (selectedInvalidReasons.includes("Other")) {
                                            setOtherInvalidText("");
                                          }
                                        }}
                                        data-testid="checkbox-invalid-other"
                                      >
                                        {selectedInvalidReasons.includes("Other") ? (
                                          <CheckSquare className="w-5 h-5 text-gray-700 dark:text-gray-400 shrink-0" />
                                        ) : (
                                          <Square className="w-5 h-5 text-muted-foreground shrink-0" />
                                        )}
                                        <span className="text-sm">Other</span>
                                      </button>
                                      {selectedInvalidReasons.includes("Other") && (
                                        <input
                                          type="text"
                                          className="w-full ml-7 text-sm border rounded-md px-3 py-1.5 bg-background"
                                          placeholder="Specify other reason..."
                                          value={otherInvalidText}
                                          onChange={(e) => setOtherInvalidText(e.target.value)}
                                          data-testid="input-other-invalid-reason"
                                        />
                                      )}
                                    </div>
                                  </div>

                                  <div className="space-y-2 border rounded-lg p-4 bg-orange-50/50 dark:bg-orange-950/10">
                                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                      <Send className="w-3 h-3" />
                                      Message to Technician (sent via SMS)
                                    </Label>
                                    <Textarea
                                      placeholder="Add instructions for the technician explaining why this request cannot be processed..."
                                      value={invalidMessage}
                                      onChange={(e) => setInvalidMessage(e.target.value)}
                                      className="resize-none"
                                      rows={3}
                                      data-testid="input-invalid-message"
                                    />
                                  </div>
                                </div>
                              )}

                              {selectedAction === "approve" && !isNonPartsRequest(selectedSubmission) && (
                                <div className="space-y-3 border rounded-lg p-4 bg-green-50/50 dark:bg-green-950/10">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Authorization Code</p>
                                  {rgcMissing ? (
                                    <p className="text-sm text-destructive" data-testid="text-rgc-not-set">
                                      No RGC code set for today. Contact an administrator.
                                    </p>
                                  ) : (
                                    <div className="space-y-3">
                                      <div>
                                        <Label className="text-xs text-muted-foreground">Today's RGC Code</Label>
                                        <Input
                                          value={todaysRgcCode || ""}
                                          readOnly
                                          className="font-mono bg-muted mt-1"
                                          data-testid="input-rgc-readonly"
                                        />
                                      </div>
                                      {needsExternalAuth(selectedSubmission) && (
                                        <div>
                                          <Label className="text-xs text-muted-foreground">{getProviderAuthLabel(selectedSubmission)}</Label>
                                          <Input
                                            placeholder="Enter auth code..."
                                            value={authCode}
                                            onChange={(e) => setAuthCode(e.target.value)}
                                            className="mt-1"
                                            data-testid="input-auth-code"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {selectedAction === "approve_submission" && (
                                <div className="space-y-2 border rounded-lg p-4 bg-green-50/50 dark:bg-green-950/10">
                                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Submission Approval</p>
                                  <p className="text-sm text-muted-foreground">
                                    Approving the submission will notify the technician that their photos and information meet the requirements. You will then need to obtain the authorization code from the warranty provider to complete this ticket.
                                  </p>
                                </div>
                              )}

                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1.5">
                                  Internal Agent Notes (not sent to technician)
                                </Label>
                                <Textarea
                                  placeholder="Internal notes — saved to ticket history only..."
                                  value={agentNotes}
                                  onChange={(e) => setAgentNotes(e.target.value)}
                                  className="resize-none"
                                  rows={2}
                                  data-testid="input-agent-notes"
                                />
                              </div>

                              <Button
                                className="w-full"
                                size="lg"
                                variant={selectedAction === "reject" || selectedAction === "reject_and_close" ? "destructive" : selectedAction === "invalid" ? "outline" : "default"}
                                onClick={() => {
                                  if (!selectedAction) return;
                                  if (selectedAction === "reject" && selectedRejectionReasons.length === 0 && rejectedPhotos.length === 0 && !rejectedVideo.rejected && !rejectedVoiceNote.rejected) {
                                    toast({ title: "Error", description: "Select at least one rejection reason or reject specific media", variant: "destructive" });
                                    return;
                                  }
                                  if (selectedAction === "reject" && rejectedVideo.rejected && !rejectedVideo.reason) {
                                    toast({ title: "Error", description: "Select a reason for rejecting the video", variant: "destructive" });
                                    return;
                                  }
                                  if (selectedAction === "reject" && rejectedVoiceNote.rejected && !rejectedVoiceNote.reason) {
                                    toast({ title: "Error", description: "Select a reason for rejecting the voice note", variant: "destructive" });
                                    return;
                                  }
                                  if (selectedAction === "reject" && selectedRejectionReasons.includes("Other") && !otherRejectionText.trim()) {
                                    toast({ title: "Error", description: "Please specify the 'Other' rejection reason", variant: "destructive" });
                                    return;
                                  }
                                  if (selectedAction === "reject" && rejectedVideo.rejected && rejectedVideo.reason === "Other" && !otherVideoRejectionText.trim()) {
                                    toast({ title: "Error", description: "Please specify the 'Other' reason for video rejection", variant: "destructive" });
                                    return;
                                  }
                                  if (selectedAction === "reject" && rejectedVoiceNote.rejected && rejectedVoiceNote.reason === "Other" && !otherVoiceRejectionText.trim()) {
                                    toast({ title: "Error", description: "Please specify the 'Other' reason for voice note rejection", variant: "destructive" });
                                    return;
                                  }
                                  if (selectedAction === "reject" && rejectedPhotos.some(rp => rp.reason === "Other") && !otherPhotoRejectionText.trim()) {
                                    toast({ title: "Error", description: "Please specify the 'Other' reason for photo rejection", variant: "destructive" });
                                    return;
                                  }
                                  if (selectedAction === "invalid" && selectedInvalidReasons.includes("Other") && !otherInvalidText.trim()) {
                                    toast({ title: "Error", description: "Please specify the 'Other' invalid reason", variant: "destructive" });
                                    return;
                                  }
                                  if (selectedAction === "invalid" && selectedInvalidReasons.length === 0) {
                                    toast({ title: "Error", description: "Select at least one invalid reason", variant: "destructive" });
                                    return;
                                  }
                                  if (selectedAction === "reject_and_close" && !rejectCloseReason) {
                                    toast({ title: "Error", description: "Select a reason for permanently closing this ticket", variant: "destructive" });
                                    return;
                                  }
                                  if (selectedAction === "reject_and_close" && rejectCloseReason === "Other" && !rejectCloseCustomReason.trim()) {
                                    toast({ title: "Error", description: "Please specify the 'Other' reason for closing", variant: "destructive" });
                                    return;
                                  }
                                  if (selectedAction === "approve" && !isNonPartsRequest(selectedSubmission) && needsExternalAuth(selectedSubmission) && !authCode.trim()) {
                                    toast({ title: "Error", description: `Enter the ${getProviderAuthLabel(selectedSubmission)}`, variant: "destructive" });
                                    return;
                                  }
                                  if (selectedAction === "approve" && !isNonPartsRequest(selectedSubmission) && rgcMissing) {
                                    toast({ title: "Error", description: "RGC code not set for today", variant: "destructive" });
                                    return;
                                  }
                                  setConfirmOpen(true);
                                }}
                                disabled={!selectedAction || processMutation.isPending}
                                data-testid="button-process-submit"
                              >
                                <Send className="w-4 h-4 mr-2" />
                                {processMutation.isPending ? "Processing..." : selectedAction === "approve_submission" ? "Approve Submission & Notify" : selectedAction === "reject_and_close" ? "Reject & Close Permanently" : "Process & Send"}
                              </Button>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {activeView === "completed" && (
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-2 text-sm">
                            {selectedSubmission.ticketStatus === "completed" && (
                              <>
                                <CheckCircle2 className="w-5 h-5 text-chart-4" />
                                <span className="font-medium" data-testid="text-ticket-completed">Completed</span>
                              </>
                            )}
                            {selectedSubmission.ticketStatus === "rejected" && (
                              <>
                                <ShieldX className="w-5 h-5 text-destructive" />
                                <span className="font-medium" data-testid="text-ticket-rejected">Rejected</span>
                              </>
                            )}
                            {selectedSubmission.ticketStatus === "invalid" && (
                              <>
                                <Ban className="w-5 h-5 text-muted-foreground" />
                                <span className="font-medium" data-testid="text-ticket-invalid">Invalid</span>
                              </>
                            )}
                            {selectedSubmission.reviewedAt && (
                              <span className="text-muted-foreground">
                                on {new Date(selectedSubmission.reviewedAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                          {selectedSubmission.agentNotes && (
                            <p className="text-sm text-muted-foreground mt-2 bg-muted/50 rounded-md p-3" data-testid="text-agent-notes-display">
                              Notes: {selectedSubmission.agentNotes}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </ScrollArea>
                {activeView === "mytickets" && shsaiVisible && selectedSubmission && (
                  <div className="hidden md:flex w-[40%] flex-col min-h-0" data-testid="panel-shsai">
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
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-confirm-title">
              {selectedAction === "approve_submission" ? "Approve Submission" : selectedAction === "approve" ? "Approve Ticket" : selectedAction === "reject" ? "Reject Ticket" : selectedAction === "reject_and_close" ? "Reject & Close Permanently" : "Mark as Invalid"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedAction === "approve_submission" && (
                <>The technician will be notified via SMS that their submission has been approved and VRS is working on obtaining authorization. The ticket will remain pending for you to enter the authorization code.</>
              )}
              {selectedAction === "approve" && (
                <>The technician will be notified via SMS with the authorization code. This action completes the ticket.</>
              )}
              {selectedAction === "reject" && (
                <>The ticket will be returned to the queue and the technician will be notified via SMS with the rejection reasons.</>
              )}
              {selectedAction === "reject_and_close" && (
                <>This will permanently close the ticket. The technician will be notified that the repair is not covered and will be unable to resubmit or create new tickets for this service order. This action cannot be undone.</>
              )}
              {selectedAction === "invalid" && (
                <>The technician will be notified via SMS that this request cannot be processed through VRS.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedAction === "reject" && selectedRejectionReasons.length > 0 && (
            <div className="px-6 pb-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Rejection Reasons:</p>
              <ul className="text-sm space-y-0.5">
                {selectedRejectionReasons.map((r) => (
                  <li key={r} className="text-destructive">&bull; {r}</li>
                ))}
              </ul>
            </div>
          )}
          {selectedAction === "invalid" && selectedInvalidReasons.length > 0 && (
            <div className="px-6 pb-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Invalid Reasons:</p>
              <ul className="text-sm space-y-0.5">
                {selectedInvalidReasons.map((r) => (
                  <li key={r} className="text-gray-700 dark:text-gray-400">&bull; {r}</li>
                ))}
              </ul>
            </div>
          )}
          {selectedAction === "reject_and_close" && rejectCloseReason && (
            <div className="px-6 pb-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Closure Reason:</p>
              <p className="text-sm text-orange-700 dark:text-orange-400">&bull; {rejectCloseReason === "Other" && rejectCloseCustomReason.trim() ? `Other: ${rejectCloseCustomReason.trim()}` : rejectCloseReason}</p>
            </div>
          )}
          {((selectedAction === "reject" || selectedAction === "reject_and_close") && technicianMessage || selectedAction === "invalid" && invalidMessage) && (
            <div className="px-6 pb-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Message to Technician:</p>
              <p className="text-sm">{selectedAction === "reject" || selectedAction === "reject_and_close" ? technicianMessage : invalidMessage}</p>
            </div>
          )}
          {agentNotes && (
            <div className="px-6 pb-2">
              <p className="text-xs font-medium text-muted-foreground mb-1">Internal Agent Notes:</p>
              <p className="text-sm">{agentNotes}</p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-confirm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleProcessSubmit}
              className={selectedAction === "reject" || selectedAction === "reject_and_close" ? "bg-destructive text-destructive-foreground" : ""}
              data-testid="button-confirm-process"
            >
              {selectedAction === "approve_submission" ? "Approve Submission & Notify" : selectedAction === "approve" ? "Approve & Notify" : selectedAction === "reject" ? "Reject & Notify" : selectedAction === "reject_and_close" ? "Reject, Close & Notify" : "Mark Invalid & Notify"}
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

      <PhotoLightbox
        photos={lightboxPhotos}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
      <Dialog open={reassignOpen} onOpenChange={(open) => { if (!open) { setReassignOpen(false); setReassignNotes(""); setReassignTarget(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Ticket</DialogTitle>
            <DialogDescription>
              {isAdminRole
                ? "Reassign this ticket to the queue or directly to an agent."
                : "Return this ticket to the queue so another agent can pick it up."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isAdminRole && (
              <div className="space-y-2">
                <Label>Assign to</Label>
                <Select value={reassignTarget} onValueChange={setReassignTarget}>
                  <SelectTrigger data-testid="select-reassign-target">
                    <SelectValue placeholder="Select an option..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="queue" data-testid="option-return-queue">
                      Return to Queue (unassign)
                    </SelectItem>
                    {availableAgents.map((agent: any) => (
                      <SelectItem
                        key={agent.id}
                        value={String(agent.id)}
                        data-testid={`option-agent-${agent.id}`}
                      >
                        {agent.name} ({agent.role === "vrs_agent" ? "Agent" : agent.role === "admin" ? "Admin" : "Super Admin"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Reassignment Notes (optional)</Label>
              <Textarea
                placeholder="Reason for reassignment"
                value={reassignNotes}
                onChange={(e) => setReassignNotes(e.target.value)}
                className="resize-none"
                rows={3}
                data-testid="input-reassign-notes"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setReassignOpen(false); setReassignNotes(""); setReassignTarget(""); }} data-testid="button-cancel-reassign">Cancel</Button>
            <Button
              onClick={() => {
                if (selectedId) {
                  if (isAdminRole && reassignTarget) {
                    const agentId = reassignTarget === "queue" ? undefined : parseInt(reassignTarget);
                    reassignMutation.mutate({ submissionId: selectedId, agentId, notes: reassignNotes || undefined });
                  } else {
                    reassignMutation.mutate({ submissionId: selectedId, notes: reassignNotes || undefined });
                  }
                }
              }}
              disabled={reassignMutation.isPending || (isAdminRole && !reassignTarget)}
              data-testid="button-confirm-reassign"
            >
              {reassignMutation.isPending ? "Reassigning..." : (
                isAdminRole
                  ? (reassignTarget === "queue" ? "Reassign to Queue" : reassignTarget ? "Reassign to Agent" : "Reassign")
                  : "Reassign to Queue"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={divisionCorrectionConfirmOpen} onOpenChange={setDivisionCorrectionConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Correct Division?</AlertDialogTitle>
            <AlertDialogDescription>
              Change appliance type from{" "}
              <strong>{DIVISION_LABELS[selectedSubmission?.applianceType || ""] || selectedSubmission?.applianceType}</strong>{" "}
              to <strong>{DIVISION_LABELS[divisionCorrectionTarget || ""] || divisionCorrectionTarget}</strong>.
              {" "}If you don't handle this division, the ticket will be released back to the queue for another agent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setDivisionCorrectionTarget(null); setDivisionCorrectionConfirmOpen(false); }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedId && divisionCorrectionTarget) {
                  divisionCorrectionMutation.mutate({ submissionId: selectedId, newDivision: divisionCorrectionTarget });
                }
              }}
              disabled={divisionCorrectionMutation.isPending}
              data-testid="button-confirm-division-correction"
            >
              {divisionCorrectionMutation.isPending ? "Correcting..." : "Confirm Correction"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showStatusPopup} onOpenChange={setShowStatusPopup}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-status-popup-title">You're currently unavailable</AlertDialogTitle>
            <AlertDialogDescription>
              Set yourself as available to start receiving tickets?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowStatusPopup(false)} data-testid="button-stay-offline">
              Stay Unavailable
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                statusMutation.mutate("online");
                setShowStatusPopup(false);
              }}
              data-testid="button-go-online"
            >
              Go Available
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
