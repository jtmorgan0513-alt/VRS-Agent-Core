// =============================================================================
// IntakeFormFieldset — agent-side data entry for the Smartsheet
// "VRS Unrep Intake Form 2.0".
// =============================================================================
// Renders the conditional fields for the detected branch (SHW / SPHW / AHS / ...)
// and reports the current values + missing-required state to the parent via
// onChange. The parent owns the values map (so it can pre-fill from notes etc).
//
// Pure presentational — no fetch, no server calls.
// =============================================================================

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ClipboardCheck, AlertTriangle } from "lucide-react";
import {
  detectBranch,
  findMissingRequired,
  INTAKE_BRANCHES,
  type IntakeBranch,
  type IntakeFieldConfig,
} from "@/lib/intake-form-config";

export interface IntakeFormFieldsetProps {
  procId: string | null | undefined;
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

export function IntakeFormFieldset({ procId, values, onChange }: IntakeFormFieldsetProps) {
  const branch: IntakeBranch = detectBranch(procId);
  const cfg = INTAKE_BRANCHES[branch];
  const missing = findMissingRequired(branch, values);

  const set = (key: string, v: string) => {
    onChange({ ...values, [key]: v });
  };

  return (
    <Card data-testid="card-intake-fieldset">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4" />
          Smartsheet Intake Form
          <Badge
            variant={cfg.verified ? "secondary" : "outline"}
            className="ml-auto text-xs"
            data-testid={`badge-intake-branch-${branch.toLowerCase()}`}
          >
            {branch}
            {!cfg.verified && " · INCOMPLETE"}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1" data-testid="text-intake-branch-desc">
          {cfg.description}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!cfg.verified && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200" data-testid="banner-intake-incomplete">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>This branch is not fully mapped.</strong> Fill what you can here and complete the rest in the Smartsheet form when it opens.
            </div>
          </div>
        )}

        {cfg.fields.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="text-intake-no-fields">
            No agent-side fields for this branch — the intake form will open pre-filled with the always-visible fields only.
          </p>
        )}

        {cfg.fields.map((f) => {
          const visible = !f.showWhen || f.showWhen(values);
          if (!visible) return null;
          return (
            <FieldRenderer
              key={f.key}
              field={f}
              value={values[f.key] || ""}
              onChange={(v) => set(f.key, v)}
              isMissing={missing.includes(f.key)}
            />
          );
        })}

        {missing.length > 0 && cfg.verified && (
          <p className="text-xs text-destructive" data-testid="text-intake-missing-count">
            {missing.length} required {missing.length === 1 ? "field" : "fields"} still required.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
  isMissing,
}: {
  field: IntakeFieldConfig;
  value: string;
  onChange: (v: string) => void;
  isMissing: boolean;
}) {
  const labelEl = (
    <Label
      htmlFor={`intake-${field.key}`}
      className="text-xs font-medium flex items-center gap-1.5"
      data-testid={`label-intake-${slug(field.key)}`}
    >
      {field.label}
      {field.required && <span className="text-destructive">*</span>}
      {isMissing && (
        <Badge variant="destructive" className="ml-1 text-[10px] py-0 h-4">required</Badge>
      )}
    </Label>
  );

  const helperEl = field.helper && (
    <p className="text-[11px] text-muted-foreground mt-1">{field.helper}</p>
  );

  const tid = `input-intake-${slug(field.key)}`;

  if (field.type === "radio") {
    return (
      <div>
        {labelEl}
        <RadioGroup
          value={value}
          onValueChange={onChange}
          className="mt-2 space-y-1.5"
          data-testid={tid}
        >
          {field.options?.map((opt) => (
            <div key={opt.value} className="flex items-start gap-2">
              <RadioGroupItem
                value={opt.value}
                id={`intake-${slug(field.key)}-${slug(opt.value)}`}
                data-testid={`radio-intake-${slug(field.key)}-${slug(opt.value)}`}
              />
              <Label
                htmlFor={`intake-${slug(field.key)}-${slug(opt.value)}`}
                className="text-sm font-normal leading-tight cursor-pointer"
              >
                {opt.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
        {helperEl}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        {labelEl}
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="mt-1" id={`intake-${field.key}`} data-testid={tid}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {helperEl}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        {labelEl}
        <Textarea
          id={`intake-${field.key}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="mt-1 resize-none"
          data-testid={tid}
        />
        {helperEl}
      </div>
    );
  }

  // text / number / currency / date / phone
  const inputType =
    field.type === "number" || field.type === "currency"
      ? "number"
      : field.type === "date"
        ? "date"
        : field.type === "phone"
          ? "tel"
          : "text";

  return (
    <div>
      {labelEl}
      <Input
        id={`intake-${field.key}`}
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="mt-1"
        data-testid={tid}
        step={field.type === "currency" ? "0.01" : undefined}
        inputMode={field.type === "currency" || field.type === "number" ? "decimal" : undefined}
      />
      {helperEl}
    </div>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
