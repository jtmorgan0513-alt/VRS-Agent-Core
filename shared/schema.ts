import { sql } from "drizzle-orm";
import { pgTable, serial, text, varchar, integer, timestamp, date, unique, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// USERS TABLE
// ============================================================================
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }),
  password: varchar("password", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: text("role").notNull(), // 'technician', 'vrs_agent', 'admin', 'super_admin'
  phone: varchar("phone", { length: 20 }),
  racId: varchar("rac_id", { length: 50 }),
  isActive: boolean("is_active").notNull().default(true),
  firstLogin: boolean("first_login").notNull().default(true),
  lastSeenVersion: varchar("last_seen_version", { length: 50 }),
  lastRgcCodeEntry: date("last_rgc_code_entry"),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  passwordChangedAt: timestamp("password_changed_at"),
  isSystemAccount: boolean("is_system_account").notNull().default(false),
  passwordResetToken: varchar("password_reset_token", { length: 100 }),
  passwordResetExpires: timestamp("password_reset_expires"),
  agentStatus: text("agent_status").notNull().default("offline"),
  canOrderParts: boolean("can_order_parts").notNull().default(false),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ============================================================================
// VRS AGENT SPECIALIZATIONS TABLE
// ============================================================================
export const vrsAgentSpecializations = pgTable(
  "vrs_agent_specializations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    division: text("division").notNull(), // 'cooking', 'dishwasher', 'microwave', 'laundry', 'refrigeration', 'hvac', 'all_other', 'generalist'
  },
  (table) => ({
    uniqueUserDivision: unique().on(table.userId, table.division),
  })
);

export const insertVrsAgentSpecializationSchema = createInsertSchema(
  vrsAgentSpecializations
).omit({
  id: true,
});

export type InsertVrsAgentSpecialization = z.infer<
  typeof insertVrsAgentSpecializationSchema
>;
export type VrsAgentSpecialization =
  typeof vrsAgentSpecializations.$inferSelect;

// ============================================================================
// SUBMISSIONS TABLE
// ============================================================================
export const submissions = pgTable("submissions", {
  id: serial("id").primaryKey(),
  technicianId: integer("technician_id")
    .notNull()
    .references(() => users.id),
  racId: varchar("rac_id", { length: 50 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  serviceOrder: varchar("service_order", { length: 13 }).notNull(),
  districtCode: varchar("district_code", { length: 4 }),
  applianceType: text("appliance_type").notNull(), // 'cooking', 'dishwasher', 'microwave', 'laundry', 'refrigeration', 'hvac', 'all_other'
  requestType: text("request_type").notNull(), // 'authorization', 'infestation_non_accessible', 'parts_nla'
  warrantyType: text("warranty_type").notNull().default("sears_protect"), // 'sears_protect', 'b2b'
  warrantyProvider: varchar("warranty_provider", { length: 100 }),
  issueDescription: text("issue_description").notNull(),
  originalDescription: text("original_description"),
  aiEnhanced: boolean("ai_enhanced").notNull().default(false),
  estimateAmount: text("estimate_amount"), // stored as text, parsed as decimal in application
  partNumbers: text("part_numbers"), // JSON string array, e.g. '["WPW10321304","W10321304"]'
  photos: text("photos"), // JSON string of photo URLs array
  videoUrl: varchar("video_url", { length: 500 }),
  voiceNoteUrl: varchar("voice_note_url", { length: 500 }),
  technicianLdapId: varchar("technician_ldap_id", { length: 50 }),
  phoneOverride: varchar("phone_override", { length: 20 }),
  ticketStatus: text("ticket_status").notNull().default("queued"), // 'queued', 'pending', 'approved', 'rejected', 'invalid', 'completed'
  stage1Status: text("stage1_status").notNull().default("pending"),
  stage1ReviewedBy: integer("stage1_reviewed_by").references(() => users.id),
  stage1ReviewedAt: timestamp("stage1_reviewed_at"),
  stage1RejectionReason: text("stage1_rejection_reason"),
  invalidReason: varchar("invalid_reason", { length: 255 }),
  invalidInstructions: text("invalid_instructions"),
  stage2Status: text("stage2_status").notNull().default("pending"),
  stage2ReviewedBy: integer("stage2_reviewed_by").references(() => users.id),
  stage2ReviewedAt: timestamp("stage2_reviewed_at"),
  stage2Outcome: text("stage2_outcome"),
  declineReason: varchar("decline_reason", { length: 255 }),
  declineInstructions: text("decline_instructions"),
  submissionApproved: boolean("submission_approved").notNull().default(false),
  submissionApprovedAt: timestamp("submission_approved_at"),
  authCode: varchar("auth_code", { length: 50 }),
  rgcCode: varchar("rgc_code", { length: 50 }),
  assignedTo: integer("assigned_to").references(() => users.id),
  claimedAt: timestamp("claimed_at"),
  nlaResolution: text("nla_resolution"),
  nlaFoundPartNumber: varchar("nla_found_part_number", { length: 100 }),
  nlaEscalatedBy: integer("nla_escalated_by").references(() => users.id),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  agentNotes: text("agent_notes"),
  technicianMessage: text("technician_message"),
  rejectionReasons: text("rejection_reasons"),
  rejectedMedia: text("rejected_media"),
  reassignmentNotes: text("reassignment_notes"),
  appealNotes: text("appeal_notes"),
  resubmissionOf: integer("resubmission_of"),
  procId: varchar("proc_id", { length: 50 }),
  clientNm: varchar("client_nm", { length: 150 }),
  statusChangedAt: timestamp("status_changed_at").default(sql`now()`),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const insertSubmissionSchema = createInsertSchema(submissions).omit({
  id: true,
  statusChangedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissions.$inferSelect;

// ============================================================================
// SMS NOTIFICATIONS TABLE
// ============================================================================
export const smsNotifications = pgTable("sms_notifications", {
  id: serial("id").primaryKey(),
  submissionId: integer("submission_id")
    .notNull()
    .references(() => submissions.id),
  recipientPhone: varchar("recipient_phone", { length: 20 }).notNull(),
  messageType: text("message_type").notNull(), // 'stage1_approved', 'stage1_rejected', 'auth_code_sent'
  messageBody: text("message_body").notNull(),
  twilioSid: varchar("twilio_sid", { length: 100 }),
  sentAt: timestamp("sent_at").default(sql`now()`),
});

export const insertSmsNotificationSchema = createInsertSchema(
  smsNotifications
).omit({
  id: true,
  sentAt: true,
});

export type InsertSmsNotification = z.infer<typeof insertSmsNotificationSchema>;
export type SmsNotification = typeof smsNotifications.$inferSelect;

// ============================================================================
// DAILY RGC CODES TABLE
// ============================================================================
export const dailyRgcCodes = pgTable(
  "daily_rgc_codes",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 50 }).notNull(),
    validDate: date("valid_date").notNull().unique(),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at").default(sql`now()`),
  }
);

export const insertDailyRgcCodeSchema = createInsertSchema(dailyRgcCodes).omit({
  id: true,
  createdAt: true,
});

export type InsertDailyRgcCode = z.infer<typeof insertDailyRgcCodeSchema>;
export type DailyRgcCode = typeof dailyRgcCodes.$inferSelect;

// ============================================================================
// TECHNICIANS TABLE (Synced from Snowflake)
// ============================================================================
export const technicians = pgTable("technicians", {
  id: serial("id").primaryKey(),
  ldapId: varchar("ldap_id", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  district: varchar("district", { length: 10 }),
  state: varchar("state", { length: 2 }),
  managerName: varchar("manager_name", { length: 255 }),
  techUnNo: varchar("tech_un_no", { length: 50 }),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const insertTechnicianSchema = createInsertSchema(technicians).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTechnician = z.infer<typeof insertTechnicianSchema>;
export type Technician = typeof technicians.$inferSelect;

// ============================================================================
// FEEDBACK TABLE
// ============================================================================
export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  technicianId: integer("technician_id").references(() => users.id),
  technicianName: varchar("technician_name", { length: 255 }).notNull(),
  technicianRacId: varchar("technician_rac_id", { length: 50 }).notNull(),
  feedbackType: text("feedback_type").notNull(),
  priority: text("priority").notNull().default("medium"),
  description: text("description").notNull(),
  attachmentUrl: varchar("attachment_url", { length: 500 }),
  status: text("status").notNull().default("new"),
  adminNotes: text("admin_notes"),
  resolvedBy: integer("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const insertFeedbackSchema = createInsertSchema(feedback).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedback.$inferSelect;

// ============================================================================
// SYSTEM SETTINGS TABLE
// ============================================================================
export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export type SystemSetting = typeof systemSettings.$inferSelect;

// ============================================================================
// TECHNICIAN USER VIEW (for admin Field Technicians tab)
// ============================================================================
export interface TechnicianUserView {
  id: number;
  name: string;
  racId: string | null;
  phone: string | null;
  district: string | null;
  techUnNo: string | null;
  managerName: string | null;
  totalTickets: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
}
