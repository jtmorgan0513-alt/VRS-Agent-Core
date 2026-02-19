import { useLocation, Link } from "wouter";
import { Home, FileText, Clock, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/tech", label: "Home", icon: Home },
  { path: "/tech/submit", label: "Submit", icon: FileText },
  { path: "/tech/history", label: "History", icon: Clock },
  { path: "/tech/help", label: "Help", icon: HelpCircle },
];

export default function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background" data-testid="nav-bottom">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location === item.path || (item.path !== "/tech" && location.startsWith(item.path));
          return (
            <Link key={item.path} href={item.path}>
              <button
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-4 py-1 text-xs",
                  isActive ? "text-primary font-medium" : "text-muted-foreground"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
