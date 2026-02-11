import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface HelpTooltipProps {
  content: string;
  className?: string;
}

export default function HelpTooltip({
  content,
  className,
}: HelpTooltipProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("inline-flex items-center justify-center", className)}
          data-testid="help-tooltip-trigger"
        >
          <HelpCircle className="w-4 h-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-xs" data-testid="help-tooltip-content">
        <p className="text-sm">{content}</p>
      </PopoverContent>
    </Popover>
  );
}
