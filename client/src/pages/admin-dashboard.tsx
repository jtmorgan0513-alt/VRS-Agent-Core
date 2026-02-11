import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Settings,
  Users,
  GitBranch,
  BarChart3,
  LogOut,
  Plus,
  Pencil,
  UserPlus,
  Save,
  Shield,
} from "lucide-react";

type SafeUser = Omit<User, "password">;

type ActiveView = "users" | "divisions" | "analytics";

const DIVISION_KEYS = ["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac"] as const;

const DIVISION_LABELS: Record<string, string> = {
  cooking: "Cooking",
  dishwasher: "Dishwasher",
  microwave: "Microwave",
  laundry: "Laundry",
  refrigeration: "Refrigeration",
  hvac: "HVAC",
};

const ROLE_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  technician: "default",
  vrs_agent: "secondary",
  admin: "destructive",
};

const ROLE_LABELS: Record<string, string> = {
  technician: "Technician",
  vrs_agent: "VRS Agent",
  admin: "Admin",
};

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [activeView, setActiveView] = useState<ActiveView>("users");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SafeUser | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("technician");
  const [formPhone, setFormPhone] = useState("");
  const [formRacId, setFormRacId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);

  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: SafeUser[] }>({
    queryKey: ["/api/admin/users"],
  });

  const users = usersData?.users || [];
  const vrsAgents = users.filter((u) => u.role === "vrs_agent");

  const { data: specData, isLoading: specLoading } = useQuery<{
    specializations: { id: number; userId: number; division: string }[];
  }>({
    queryKey: ["/api/admin/users", selectedAgentId, "specializations"],
    enabled: !!selectedAgentId,
  });

  useEffect(() => {
    if (specData?.specializations) {
      setSelectedDivisions(specData.specializations.map((s) => s.division));
    }
  }, [specData]);

  const createUserMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      email: string;
      password: string;
      role: string;
      phone?: string;
      racId?: string;
    }) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User Created", description: "New user has been created successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User Updated", description: "User has been updated successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Status Updated", description: "User status has been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const saveDivisionsMutation = useMutation({
    mutationFn: async ({ id, divisions }: { id: number; divisions: string[] }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}/specializations`, { divisions });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Divisions Saved", description: "Division assignments have been updated." });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/users", selectedAgentId, "specializations"],
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openCreateDialog = () => {
    setEditingUser(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("technician");
    setFormPhone("");
    setFormRacId("");
    setDialogOpen(true);
  };

  const openEditDialog = (u: SafeUser) => {
    setEditingUser(u);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormPassword("");
    setFormRole(u.role);
    setFormPhone(u.phone || "");
    setFormRacId(u.racId || "");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingUser(null);
  };

  const handleFormSubmit = () => {
    if (editingUser) {
      const data: Record<string, unknown> = {
        name: formName,
        email: formEmail,
        role: formRole,
        phone: formPhone || null,
        racId: formRole === "technician" ? formRacId || null : null,
      };
      if (formPassword) {
        data.password = formPassword;
      }
      updateUserMutation.mutate({ id: editingUser.id, data });
    } else {
      createUserMutation.mutate({
        name: formName,
        email: formEmail,
        password: formPassword,
        role: formRole,
        phone: formPhone || undefined,
        racId: formRole === "technician" ? formRacId || undefined : undefined,
      });
    }
  };

  const toggleDivision = (division: string) => {
    setSelectedDivisions((prev) =>
      prev.includes(division) ? prev.filter((d) => d !== division) : [...prev, division]
    );
  };

  const toggleAllDivisions = () => {
    if (selectedDivisions.length === DIVISION_KEYS.length) {
      setSelectedDivisions([]);
    } else {
      setSelectedDivisions([...DIVISION_KEYS]);
    }
  };

  const isGeneralist = selectedDivisions.length === DIVISION_KEYS.length;
  const isFormPending = createUserMutation.isPending || updateUserMutation.isPending;

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full" data-testid="admin-dashboard">
        <Sidebar>
          <SidebarHeader className="p-4">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              <span className="font-semibold text-sm" data-testid="text-sidebar-title">Admin Panel</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1" data-testid="text-admin-name">{user?.name}</p>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Management</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setActiveView("users")}
                      data-active={activeView === "users"}
                      data-testid="nav-users"
                    >
                      <Users className="w-4 h-4" />
                      <span>User Management</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setActiveView("divisions")}
                      data-active={activeView === "divisions"}
                      data-testid="nav-divisions"
                    >
                      <GitBranch className="w-4 h-4" />
                      <span>Division Assignments</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => setActiveView("analytics")}
                      data-active={activeView === "analytics"}
                      data-testid="nav-analytics"
                    >
                      <BarChart3 className="w-4 h-4" />
                      <span>Analytics</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
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
                {activeView === "users" && "User Management"}
                {activeView === "divisions" && "Division Assignments"}
                {activeView === "analytics" && "Analytics"}
              </h1>
            </div>
            {activeView === "users" && (
              <Button onClick={openCreateDialog} data-testid="button-create-user">
                <UserPlus className="w-4 h-4 mr-2" />
                Create User
              </Button>
            )}
          </header>

          <ScrollArea className="flex-1">
            {activeView === "users" && (
              <div className="p-4">
                {usersLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="h-14 bg-muted rounded-md animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <Table data-testid="table-users">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>RAC ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                          <TableCell data-testid={`text-user-name-${u.id}`}>{u.name}</TableCell>
                          <TableCell data-testid={`text-user-email-${u.id}`}>{u.email}</TableCell>
                          <TableCell>
                            <Badge
                              variant={ROLE_BADGE_VARIANT[u.role] || "default"}
                              data-testid={`badge-role-${u.id}`}
                            >
                              {ROLE_LABELS[u.role] || u.role}
                            </Badge>
                          </TableCell>
                          <TableCell data-testid={`text-user-phone-${u.id}`}>{u.phone || "-"}</TableCell>
                          <TableCell data-testid={`text-user-racid-${u.id}`}>{u.racId || "-"}</TableCell>
                          <TableCell>
                            <Switch
                              checked={u.isActive}
                              onCheckedChange={(checked) =>
                                toggleStatusMutation.mutate({ id: u.id, isActive: checked })
                              }
                              data-testid={`switch-status-${u.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(u)}
                              data-testid={`button-edit-${u.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )}

            {activeView === "divisions" && (
              <div className="p-4 space-y-4">
                <div className="max-w-md">
                  <Label htmlFor="agent-select" className="mb-2 block text-sm font-medium">
                    Select VRS Agent
                  </Label>
                  <Select
                    value={selectedAgentId}
                    onValueChange={(val) => {
                      setSelectedAgentId(val);
                      setSelectedDivisions([]);
                    }}
                  >
                    <SelectTrigger data-testid="select-agent">
                      <SelectValue placeholder="Choose an agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {vrsAgents.map((agent) => (
                        <SelectItem key={agent.id} value={String(agent.id)} data-testid={`select-agent-${agent.id}`}>
                          {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedAgentId && (
                  <>
                    {specLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="h-10 bg-muted rounded-md animate-pulse" />
                        ))}
                      </div>
                    ) : (
                      <Card>
                        <CardHeader>
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <CardTitle className="text-base">Division Assignments</CardTitle>
                            {isGeneralist && (
                              <Badge variant="secondary" data-testid="badge-generalist">
                                <Shield className="w-3 h-3 mr-1" />
                                Generalist
                              </Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id="select-all"
                              checked={isGeneralist}
                              onCheckedChange={toggleAllDivisions}
                              data-testid="checkbox-select-all"
                            />
                            <Label htmlFor="select-all" className="text-sm font-medium">
                              Select All
                            </Label>
                          </div>

                          <Separator />

                          <div className="grid grid-cols-2 gap-3">
                            {DIVISION_KEYS.map((key) => (
                              <div key={key} className="flex items-center gap-2">
                                <Checkbox
                                  id={`division-${key}`}
                                  checked={selectedDivisions.includes(key)}
                                  onCheckedChange={() => toggleDivision(key)}
                                  data-testid={`checkbox-division-${key}`}
                                />
                                <Label htmlFor={`division-${key}`} className="text-sm">
                                  {DIVISION_LABELS[key]}
                                </Label>
                              </div>
                            ))}
                          </div>

                          <div className="flex justify-end pt-2">
                            <Button
                              onClick={() =>
                                saveDivisionsMutation.mutate({
                                  id: Number(selectedAgentId),
                                  divisions: selectedDivisions,
                                })
                              }
                              disabled={saveDivisionsMutation.isPending}
                              data-testid="button-save-divisions"
                            >
                              {saveDivisionsMutation.isPending ? (
                                <span className="animate-spin mr-2">
                                  <Save className="w-4 h-4" />
                                </span>
                              ) : (
                                <Save className="w-4 h-4 mr-2" />
                              )}
                              Save
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </div>
            )}

            {activeView === "analytics" && (
              <div className="flex items-center justify-center h-full min-h-[400px]" data-testid="text-analytics-placeholder">
                <div className="text-center space-y-2">
                  <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground" />
                  <p className="text-lg font-medium text-muted-foreground">Coming Soon</p>
                  <p className="text-sm text-muted-foreground">Analytics features are under development.</p>
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingUser ? "Edit User" : "Create User"}
            </DialogTitle>
            <DialogDescription>
              {editingUser ? "Update user details below." : "Fill in the details to create a new user."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-name">Name</Label>
              <Input
                id="user-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Full name"
                data-testid="input-user-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-email">Email</Label>
              <Input
                id="user-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="email@example.com"
                data-testid="input-user-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-password">
                Password{editingUser ? " (leave blank to keep current)" : ""}
              </Label>
              <Input
                id="user-password"
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={editingUser ? "Leave blank to keep current" : "Password"}
                data-testid="input-user-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-role">Role</Label>
              <Select value={formRole} onValueChange={setFormRole}>
                <SelectTrigger data-testid="select-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technician">Technician</SelectItem>
                  <SelectItem value="vrs_agent">VRS Agent</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-phone">Phone</Label>
              <Input
                id="user-phone"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="Phone number"
                data-testid="input-user-phone"
              />
            </div>

            {formRole === "technician" && (
              <div className="space-y-2">
                <Label htmlFor="user-racid">RAC ID</Label>
                <Input
                  id="user-racid"
                  value={formRacId}
                  onChange={(e) => setFormRacId(e.target.value)}
                  placeholder="RAC ID"
                  data-testid="input-user-racid"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-dialog">
              Cancel
            </Button>
            <Button
              onClick={handleFormSubmit}
              disabled={isFormPending}
              data-testid="button-submit-user"
            >
              {isFormPending ? (
                <span className="animate-spin mr-2">
                  <Plus className="w-4 h-4" />
                </span>
              ) : editingUser ? (
                <Pencil className="w-4 h-4 mr-2" />
              ) : (
                <UserPlus className="w-4 h-4 mr-2" />
              )}
              {editingUser ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
