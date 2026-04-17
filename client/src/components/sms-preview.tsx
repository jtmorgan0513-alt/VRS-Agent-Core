import { Smartphone } from "lucide-react";
import { smsSegmentInfo } from "@/lib/smsPreview";

type Props = {
  text: string;
  testId?: string;
};

export function SmsPreview({ text, testId = "sms-preview" }: Props) {
  const { chars, segments } = smsSegmentInfo(text);
  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
          <Smartphone className="w-3 h-3" />
          Preview — what the technician will receive
        </p>
        <span className="text-[10px] text-muted-foreground font-mono" data-testid={`${testId}-meta`}>
          {chars} chars · {segments} SMS
        </span>
      </div>
      <pre
        className="text-xs whitespace-pre-wrap font-sans text-foreground bg-background rounded border px-3 py-2 leading-relaxed"
        data-testid={testId}
      >
        {text}
      </pre>
    </div>
  );
}
