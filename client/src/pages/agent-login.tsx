import { useState, useEffect } from "react";
import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, X, ArrowLeft, Wrench } from "lucide-react";
import searsLogo from "@assets/sears-home-services-logo-brands_1770949137899.png";

const DIVISION_OPTIONS: { key: string; label: string }[] = [
  { key: "refrigeration", label: "Refrigeration" },
  { key: "laundry", label: "Laundry" },
  { key: "cooking", label: "Cooking" },
  { key: "dishwasher", label: "Dishwasher / Compactor" },
  { key: "microwave", label: "Microwave" },
  { key: "hvac", label: "HVAC" },
  { key: "all_other", label: "All Other" },
];

export default function AgentLoginPage() {
  const [agentLdapId, setAgentLdapId] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [changePasswordUser, setChangePasswordUser] = useState<any>(null);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [forgotStep, setForgotStep] = useState<0 | 1 | 2 | 3>(0);
  const [forgotLdapId, setForgotLdapId] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPw, setForgotNewPw] = useState("");
  const [forgotConfirmPw, setForgotConfirmPw] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [selectDivisionsStep, setSelectDivisionsStep] = useState(false);
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [divisionsSaving, setDivisionsSaving] = useState(false);
  const { user, isLoading: authLoading, login, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [redirectChecked, setRedirectChecked] = useState(false);

  useEffect(() => {
    if (user && user.mustChangePassword && !mustChangePassword) {
      setMustChangePassword(true);
      setChangePasswordUser(user);
    }
  }, [user, mustChangePassword]);

  useEffect(() => {
    if (!user || authLoading || redirectChecked || selectDivisionsStep) return;
    if (user.mustChangePassword) { setRedirectChecked(true); return; }
    if (user.role === "technician") {
      setLocation("/tech");
      return;
    }
    if (user.role === "admin" || user.role === "super_admin") {
      setLocation("/agent/dashboard");
      return;
    }
    if (user.role === "vrs_agent") {
      const token = localStorage.getItem("vrs_token");
      fetch("/api/agent/specializations", { headers: { Authorization: `Bearer ${token}` } })
        .then(res => {
          if (!res.ok) {
            setLocation("/agent/dashboard");
            return null;
          }
          return res.json();
        })
        .then(data => {
          if (data === null) return;
          if (!data.divisions || data.divisions.length === 0) {
            setSelectDivisionsStep(true);
          } else {
            setLocation("/agent/dashboard");
          }
        })
        .catch(() => setLocation("/agent/dashboard"))
        .finally(() => setRedirectChecked(true));
    }
  }, [user, authLoading, redirectChecked, selectDivisionsStep, setLocation]);

  if (authLoading || (user && !user.mustChangePassword && !selectDivisionsStep && !redirectChecked)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  async function checkDivisionsAndProceed() {
    try {
      const token = localStorage.getItem("vrs_token");
      const res = await fetch("/api/agent/specializations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.divisions || data.divisions.length === 0) {
          setSelectDivisionsStep(true);
          return;
        }
      }
    } catch {}
    setLocation("/agent/dashboard");
  }

  async function handleAgentSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const u = await login(agentLdapId.trim(), password);
      if (u.mustChangePassword) {
        setMustChangePassword(true);
        setChangePasswordUser(u);
      } else if (u.role === "vrs_agent") {
        await checkDivisionsAndProceed();
      } else {
        setLocation("/agent/dashboard");
      }
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const pwRequirements = [
    { label: "Min 8 characters", met: newPw.length >= 8 },
    { label: "1 uppercase letter", met: /[A-Z]/.test(newPw) },
    { label: "1 lowercase letter", met: /[a-z]/.test(newPw) },
    { label: "1 number", met: /\d/.test(newPw) },
    { label: "1 special character (!@#$%^&*)", met: /[!@#$%^&*]/.test(newPw) },
  ];

  const allRequirementsMet = pwRequirements.every((r) => r.met);
  const passwordsMatch = newPw === confirmPw && confirmPw.length > 0;

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      toast({ title: "Error", description: "Please enter your current password", variant: "destructive" });
      return;
    }
    if (!allRequirementsMet || !passwordsMatch) return;
    setChangePwLoading(true);
    try {
      const token = localStorage.getItem("vrs_token");
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword: password, newPassword: newPw }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to change password");
      }
      toast({ title: "Password Changed", description: "Your password has been updated successfully." });
      await refreshUser();
      setMustChangePassword(false);
      setSelectDivisionsStep(true);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setChangePwLoading(false);
    }
  }

  const forgotPwRequirements = [
    { label: "Min 8 characters", met: forgotNewPw.length >= 8 },
    { label: "1 uppercase letter", met: /[A-Z]/.test(forgotNewPw) },
    { label: "1 lowercase letter", met: /[a-z]/.test(forgotNewPw) },
    { label: "1 number", met: /\d/.test(forgotNewPw) },
    { label: "1 special character (!@#$%^&*)", met: /[!@#$%^&*]/.test(forgotNewPw) },
  ];
  const forgotAllReqMet = forgotPwRequirements.every((r) => r.met);
  const forgotPwMatch = forgotNewPw === forgotConfirmPw && forgotConfirmPw.length > 0;

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/forgot-password", { identifier: forgotLdapId.trim() });
      const data = await res.json();
      toast({ title: "Code Sent", description: data.message });
      setForgotStep(2);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forgotAllReqMet || !forgotPwMatch) return;
    setForgotLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/reset-password", { identifier: forgotLdapId.trim(), code: forgotCode.trim(), newPassword: forgotNewPw });
      const data = await res.json();
      toast({ title: "Success", description: data.message });
      setForgotStep(3);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  }

  function resetForgotState() {
    setForgotStep(0);
    setForgotLdapId("");
    setForgotCode("");
    setForgotNewPw("");
    setForgotConfirmPw("");
  }

  if (forgotStep > 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <img src={searsLogo} alt="Sears Home Services" className="h-10 mx-auto mb-3" data-testid="img-forgot-logo" />
            <h1 className="text-2xl font-bold" data-testid="text-forgot-title">
              {forgotStep === 3 ? "Password Reset" : "Forgot Password"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">VRS Agent Portal</p>
          </div>

          <Card>
            <CardContent className="p-4">
              {forgotStep === 1 && (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-ldap-id">LDAP ID</Label>
                    <Input
                      id="forgot-ldap-id"
                      type="text"
                      placeholder="Enter your LDAP ID"
                      value={forgotLdapId}
                      onChange={(e) => setForgotLdapId(e.target.value)}
                      required
                      autoCapitalize="none"
                      autoCorrect="off"
                      data-testid="input-forgot-ldap-id"
                    />
                    <p className="text-xs text-muted-foreground">A reset code will be sent to your registered phone number.</p>
                  </div>
                  <Button type="submit" className="w-full" disabled={forgotLoading || !forgotLdapId.trim()} data-testid="button-forgot-submit">
                    {forgotLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : "Send Reset Code"}
                  </Button>
                </form>
              )}

              {forgotStep === 2 && (
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-code">6-Digit Code</Label>
                    <Input
                      id="forgot-code"
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={forgotCode}
                      onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      maxLength={6}
                      data-testid="input-forgot-code"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="forgot-new-pw">New Password</Label>
                    <Input
                      id="forgot-new-pw"
                      type="password"
                      placeholder="Enter new password"
                      value={forgotNewPw}
                      onChange={(e) => setForgotNewPw(e.target.value)}
                      required
                      data-testid="input-forgot-new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="forgot-confirm-pw">Confirm Password</Label>
                    <Input
                      id="forgot-confirm-pw"
                      type="password"
                      placeholder="Confirm new password"
                      value={forgotConfirmPw}
                      onChange={(e) => setForgotConfirmPw(e.target.value)}
                      required
                      data-testid="input-forgot-confirm-password"
                    />
                    {forgotConfirmPw.length > 0 && !forgotPwMatch && (
                      <p className="text-xs text-red-600 dark:text-red-400" data-testid="text-forgot-pw-mismatch">Passwords do not match</p>
                    )}
                  </div>
                  <div className="space-y-1.5" data-testid="forgot-pw-requirements">
                    <p className="text-xs font-medium text-muted-foreground">Password Requirements:</p>
                    {forgotPwRequirements.map((req) => (
                      <div key={req.label} className="flex items-center gap-2">
                        {req.met ? (
                          <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <span className={`text-xs ${req.met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button type="submit" className="w-full" disabled={forgotLoading || !forgotAllReqMet || !forgotPwMatch || forgotCode.length !== 6} data-testid="button-forgot-reset">
                    {forgotLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Resetting...</> : "Reset Password"}
                  </Button>
                </form>
              )}

              {forgotStep === 3 && (
                <div className="text-center space-y-4">
                  <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-green-100 dark:bg-green-900/30">
                    <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
                  </div>
                  <p className="text-sm" data-testid="text-forgot-success">Your password has been reset successfully. You can now sign in with your new password.</p>
                  <Button className="w-full" onClick={resetForgotState} data-testid="button-forgot-back-to-login">
                    Back to Sign In
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {forgotStep !== 3 && (
            <div className="text-center mt-4">
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                onClick={resetForgotState}
                data-testid="link-forgot-back"
              >
                <ArrowLeft className="w-3 h-3" />
                Back to Login
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (selectDivisionsStep) {
    const allSelected = selectedDivisions.length === DIVISION_OPTIONS.length;
    const toggleAll = () => {
      if (allSelected) {
        setSelectedDivisions([]);
      } else {
        setSelectedDivisions(DIVISION_OPTIONS.map((d) => d.key));
      }
    };
    const toggleDivision = (key: string) => {
      setSelectedDivisions((prev) =>
        prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]
      );
    };
    const handleSaveDivisions = async () => {
      if (selectedDivisions.length === 0) {
        toast({ title: "Required", description: "Please select at least one division.", variant: "destructive" });
        return;
      }
      setDivisionsSaving(true);
      try {
        const token = localStorage.getItem("vrs_token");
        const res = await fetch("/api/agent/specializations", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ divisions: selectedDivisions }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to save divisions");
        }
        toast({ title: "Divisions Saved", description: "Your division assignments have been saved." });
        setLocation("/agent/dashboard");
      } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } finally {
        setDivisionsSaving(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <img src={searsLogo} alt="Sears Home Services" className="h-10 mx-auto mb-3" data-testid="img-logo-divisions" />
            <h1 className="text-2xl font-bold" data-testid="text-divisions-title">
              Select Your Divisions
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Choose the appliance divisions you handle. You'll only receive tickets for these divisions.
            </p>
          </div>
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center space-x-2 pb-2 border-b">
                <Checkbox
                  id="all-divisions"
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  data-testid="checkbox-all-divisions"
                />
                <label htmlFor="all-divisions" className="text-sm font-medium cursor-pointer">
                  Generalist (All Divisions)
                </label>
              </div>
              <div className="space-y-3">
                {DIVISION_OPTIONS.map((div) => (
                  <div key={div.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`div-${div.key}`}
                      checked={selectedDivisions.includes(div.key)}
                      onCheckedChange={() => toggleDivision(div.key)}
                      data-testid={`checkbox-div-${div.key}`}
                    />
                    <label htmlFor={`div-${div.key}`} className="text-sm cursor-pointer flex items-center gap-2">
                      <Wrench className="w-3.5 h-3.5 text-muted-foreground" />
                      {div.label}
                    </label>
                  </div>
                ))}
              </div>
              <Button
                className="w-full"
                onClick={handleSaveDivisions}
                disabled={divisionsSaving || selectedDivisions.length === 0}
                data-testid="button-save-divisions"
              >
                {divisionsSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  `Continue (${selectedDivisions.length} selected)`
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (mustChangePassword && changePasswordUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <img src={searsLogo} alt="Sears Home Services" className="h-10 mx-auto mb-3" data-testid="img-logo-change-pw" />
            <h1 className="text-2xl font-bold" data-testid="text-change-pw-title">
              Change Password
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Welcome, {changePasswordUser.name}
            </p>
          </div>
          <Card>
            <CardContent className="p-4">
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    placeholder="Enter your current password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="input-current-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Enter new password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    required
                    data-testid="input-new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    required
                    data-testid="input-confirm-password"
                  />
                  {confirmPw.length > 0 && !passwordsMatch && (
                    <p className="text-xs text-red-600 dark:text-red-400" data-testid="text-pw-mismatch">Passwords do not match</p>
                  )}
                </div>
                <div className="space-y-1.5" data-testid="pw-requirements">
                  <p className="text-xs font-medium text-muted-foreground">Password Requirements:</p>
                  {pwRequirements.map((req) => (
                    <div key={req.label} className="flex items-center gap-2">
                      {req.met ? (
                        <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                      <span className={`text-xs ${req.met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={changePwLoading || !allRequirementsMet || !passwordsMatch}
                  data-testid="button-change-password"
                >
                  {changePwLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Changing...
                    </>
                  ) : (
                    "Change Password"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img src={searsLogo} alt="Sears Home Services" className="h-10 mx-auto mb-3" data-testid="img-logo" />
          <h1 className="text-2xl font-bold" data-testid="text-login-title">VRS Agent Portal</h1>
          <p className="text-sm text-muted-foreground mt-1">Sears Home Services</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agent Sign In</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAgentSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agent-ldap-id">LDAP ID</Label>
                <Input
                  id="agent-ldap-id"
                  type="text"
                  placeholder="e.g., MSARAF"
                  value={agentLdapId}
                  onChange={(e) => setAgentLdapId(e.target.value)}
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  data-testid="input-agent-ldap-id"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="input-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login">
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setForgotStep(1)}
                  data-testid="link-forgot-password"
                >
                  Forgot Password?
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="text-center mt-4">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setLocation("/admin/login")}
            data-testid="link-admin-login"
          >
            Admin? Login here
          </button>
        </div>
      </div>
    </div>
  );
}
