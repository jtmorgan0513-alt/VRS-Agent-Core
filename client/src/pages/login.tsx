import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import searsLogo from "@assets/sears-home-services-logo-brands_1770949137899.png";

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<"technician" | "agent">("technician");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ldapId, setLdapId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [techInfo, setTechInfo] = useState<any>(null);
  const [phoneChanged, setPhoneChanged] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const { login, techLogin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  async function handleAgentSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      setLocation("/");
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

  async function handleTechSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result = await techLogin(ldapId.toLowerCase().trim());
      setTechInfo(result.technician);
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "ID not found or inactive",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleTechContinue() {
    if (phoneChanged && newPhone.trim()) {
      localStorage.setItem("vrs_phone_override", newPhone.trim());
    } else {
      localStorage.removeItem("vrs_phone_override");
    }
    setLocation("/");
  }

  function maskPhone(phone: string | null): string {
    if (!phone || phone.length < 4) return "***-****";
    return "***-***-" + phone.slice(-4);
  }

  if (techInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <img src={searsLogo} alt="Sears Home Services" className="h-10 mx-auto mb-3" data-testid="img-logo" />
            <h1 className="text-2xl font-bold" data-testid="text-welcome-title">
              Welcome, {techInfo.name || techInfo.ldapId}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Field Technician</p>
          </div>
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">LDAP ID</span>
                  <span className="text-sm font-medium" data-testid="text-tech-ldap">{techInfo.ldapId}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">District</span>
                  <span className="text-sm font-medium" data-testid="text-tech-district">{techInfo.district || "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted-foreground">Phone on File</span>
                  <span className="text-sm font-medium" data-testid="text-tech-phone">{maskPhone(techInfo.phone)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="phone-changed"
                  checked={phoneChanged}
                  onCheckedChange={(checked) => setPhoneChanged(!!checked)}
                  data-testid="checkbox-phone-changed"
                />
                <Label htmlFor="phone-changed" className="text-sm">My phone number has changed</Label>
              </div>
              {phoneChanged && (
                <div className="space-y-2">
                  <Label htmlFor="new-phone">New Phone Number</Label>
                  <Input
                    id="new-phone"
                    type="tel"
                    placeholder="(555) 555-0147"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    data-testid="input-new-phone"
                  />
                </div>
              )}
              <Button
                className="w-full"
                onClick={handleTechContinue}
                data-testid="button-tech-continue"
              >
                Continue to Dashboard
              </Button>
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
          <h1 className="text-2xl font-bold" data-testid="text-login-title">VRS Digital Authorization</h1>
          <p className="text-sm text-muted-foreground mt-1">Sears Home Services</p>
        </div>

        <div className="flex mb-4 rounded-md border overflow-hidden">
          <button
            type="button"
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "technician"
                ? "bg-primary text-primary-foreground"
                : "hover-elevate"
            }`}
            onClick={() => setActiveTab("technician")}
            data-testid="tab-technician-login"
          >
            Field Technician
          </button>
          <button
            type="button"
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === "agent"
                ? "bg-primary text-primary-foreground"
                : "hover-elevate"
            }`}
            onClick={() => setActiveTab("agent")}
            data-testid="tab-agent-login"
          >
            VRS Agent / Admin
          </button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {activeTab === "technician" ? "Technician Sign In" : "Agent / Admin Sign In"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activeTab === "technician" ? (
              <form onSubmit={handleTechSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ldap-id">LDAP ID</Label>
                  <Input
                    id="ldap-id"
                    type="text"
                    placeholder="e.g., jmorga1"
                    value={ldapId}
                    onChange={(e) => setLdapId(e.target.value)}
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    data-testid="input-ldap-id"
                  />
                  <p className="text-xs text-muted-foreground">Enter your LDAP ID to sign in. No password required.</p>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading || !ldapId.trim()} data-testid="button-tech-login">
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Looking up...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleAgentSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="input-email"
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
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
