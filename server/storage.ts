import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, or, desc, asc, gte, lte, sql, isNull, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  users,
  InsertUser,
  User,
  vrsAgentSpecializations,
  InsertVrsAgentSpecialization,
  VrsAgentSpecialization,
  submissions,
  InsertSubmission,
  Submission,
  smsNotifications,
  InsertSmsNotification,
  SmsNotification,
  dailyRgcCodes,
  InsertDailyRgcCode,
  DailyRgcCode,
  technicians,
  InsertTechnician,
  Technician,
  feedback,
  InsertFeedback,
  Feedback,
  submissionNotes,
  InsertSubmissionNote,
  SubmissionNote,
  TechnicianUserView,
  systemSettings,
  SystemSetting,
} from "@shared/schema";

// Initialize database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create Drizzle instance
export const db = drizzle(pool);

// Export pool for cleanup
export { pool };

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByRacId(racId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;

  // Specialization methods
  getSpecializations(userId: number): Promise<VrsAgentSpecialization[]>;
  setSpecializations(userId: number, divisions: string[]): Promise<void>;
  getAgentsByDivision(division: string): Promise<User[]>;

  // Submission methods
  createSubmission(submission: InsertSubmission): Promise<Submission>;
  getSubmission(id: number): Promise<Submission | undefined>;
  getSubmissions(filters?: {
    technicianId?: number;
    ticketStatus?: string;
    stage1Status?: string;
    stage2Status?: string;
    applianceType?: string;
    assignedTo?: number;
    divisionFilter?: string[];
  }): Promise<Submission[]>;
  getSubmissionsWithTechnician(filters?: {
    technicianId?: number;
    ticketStatus?: string;
    stage1Status?: string;
    stage2Status?: string;
    applianceType?: string;
    assignedTo?: number;
    requestType?: string;
    excludeRequestType?: string;
    divisionFilter?: string[];
  }, completedToday?: boolean): Promise<(Submission & { technicianName: string; technicianPhone: string | null; assignedAgentName: string | null })[]>;
  updateSubmission(
    id: number,
    data: Partial<InsertSubmission>
  ): Promise<Submission | undefined>;
  deleteSubmission(id: number): Promise<boolean>;
  getAllSubmissions(startDate?: Date | null, endDate?: Date | null, techLdap?: string | null): Promise<Submission[]>;
  getAgentQueueCount(agentId?: number): Promise<number>;
  getDivisionQueueCount(divisions: string[]): Promise<number>;
  getCompletedTodayCount(agentId?: number): Promise<number>;
  getQueuedCount(divisions: string[]): Promise<number>;
  getQueuedCountAll(): Promise<number>;
  getOnlineAgentCount(): Promise<number>;
  getPendingCount(agentId: number): Promise<number>;

  getNlaQueuedCount(divisions?: string[]): Promise<number>;
  getNlaPendingCount(agentId: number): Promise<number>;
  getNlaCompletedTodayCount(agentId?: number, divisions?: string[]): Promise<number>;
  getNlaAnalytics(): Promise<{ today: number; week: number; month: number; allTime: number }>;

  getStage2QueueCount(agentId?: number): Promise<number>;
  getWarrantyProviderCounts(assignedTo?: number): Promise<{ warrantyProvider: string; count: number }[]>;

  getResubmissionChain(rootId: number): Promise<Submission[]>;
  getSubmissionHistory(serviceOrder: string): Promise<Submission[]>;
  hasRejectedClosedForServiceOrder(serviceOrder: string): Promise<boolean>;
  hasActiveSubmissionForServiceOrder(serviceOrder: string, technicianId: number): Promise<{ exists: boolean; status?: string }>;

  // SMS methods
  createSmsNotification(
    notification: InsertSmsNotification
  ): Promise<SmsNotification>;
  getSmsNotifications(submissionId: number): Promise<SmsNotification[]>;

  // RGC methods
  createDailyRgcCode(code: InsertDailyRgcCode): Promise<DailyRgcCode>;
  getDailyRgcCode(date: string): Promise<DailyRgcCode | undefined>;
  upsertDailyRgcCode(data: { code: string; validDate: string; createdBy: number | null }): Promise<DailyRgcCode>;

  // Technician methods
  getOrCreateTechUser(ldapId: string, name: string, phone: string): Promise<User>;

  getTechnicianByLdapId(ldapId: string): Promise<Technician | undefined>;
  getTechnicians(activeOnly?: boolean): Promise<Technician[]>;
  upsertTechnician(data: InsertTechnician): Promise<Technician>;
  deactivateTechniciansNotIn(ldapIds: string[]): Promise<number>;
  getTechnicianSyncInfo(): Promise<{ activeCount: number; lastSyncedAt: Date | null }>;

  getAgentsWithStatus(): Promise<{ id: number; name: string; racId: string | null; agentStatus: string; divisions: string[]; updatedAt: Date | null }[]>;

  createFeedback(data: InsertFeedback): Promise<Feedback>;
  getFeedbackList(): Promise<(Feedback & { resolvedByName: string | null })[]>;
  getFeedback(id: number): Promise<Feedback | undefined>;
  updateFeedback(id: number, data: Partial<InsertFeedback>): Promise<Feedback | undefined>;

  createSubmissionNote(data: InsertSubmissionNote): Promise<SubmissionNote>;
  getSubmissionNotes(submissionId: number): Promise<(SubmissionNote & { authorName: string })[]>;

  getAnalytics(): Promise<{
    submissionsToday: number;
    submissionsThisWeek: number;
    submissionsThisMonth: number;
    totalSubmissions: number;
    approvedCount: number;
    rejectedCount: number;
    pendingCount: number;
    avgTimeToStage1Ms: number | null;
    avgTimeToAuthCodeMs: number | null;
  }>;

  getResubmissionStats(): Promise<{
    totalResubmissions: number;
    resubmissionRate: number;
    topTechnicians: { technicianId: number; techName: string; techLdap: string; totalTickets: number; resubmissions: number; rate: number }[];
  }>;

  getDistrictRollup(): Promise<{
    district: string;
    totalTickets: number;
    approved: number;
    rejected: number;
    pending: number;
    completed: number;
    avgTimeToStage1Ms: number | null;
  }[]>;

  getTechnicianUsers(): Promise<TechnicianUserView[]>;

  getSystemSetting(key: string): Promise<string | undefined>;
  setSystemSetting(key: string, value: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    return result[0];
  }

  async getUserByRacId(racId: string): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(sql`lower(${users.racId}) = ${racId.toLowerCase()}`);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(
      sql`CASE WHEN name LIKE 'Test %' THEN 0 ELSE 1 END`,
      sql`CASE role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 WHEN 'vrs_agent' THEN 2 WHEN 'technician' THEN 3 ELSE 4 END`,
      users.name
    );
  }

  async updateUser(
    id: number,
    data: Partial<InsertUser>
  ): Promise<User | undefined> {
    const result = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async deleteUser(id: number): Promise<boolean> {
    const user = await this.getUser(id);
    if (!user) return false;
    if (user.isSystemAccount) {
      throw new Error("Cannot delete system accounts");
    }

    const techSubmissions = await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.technicianId, id));
    if (techSubmissions.length > 0) {
      console.warn(`[deleteUser] WARNING: Cascading delete of ${techSubmissions.length} submissions for user ${id} (${user.racId})`);
      const subIds = techSubmissions.map(s => s.id);
      await db.delete(smsNotifications).where(inArray(smsNotifications.submissionId, subIds));
      await db.delete(submissions).where(inArray(submissions.id, subIds));
    }

    await db.delete(vrsAgentSpecializations).where(eq(vrsAgentSpecializations.userId, id));
    await db.update(dailyRgcCodes).set({ createdBy: null } as any).where(eq(dailyRgcCodes.createdBy, id));
    await db.update(submissions).set({ assignedTo: null } as any).where(eq(submissions.assignedTo, id));
    await db.update(submissions).set({ stage1ReviewedBy: null } as any).where(eq(submissions.stage1ReviewedBy, id));
    await db.update(submissions).set({ stage2ReviewedBy: null } as any).where(eq(submissions.stage2ReviewedBy, id));
    await db.update(feedback).set({ resolvedBy: null } as any).where(eq(feedback.resolvedBy, id));
    await db.delete(feedback).where(eq(feedback.technicianId, id));
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    console.log(`[deleteUser] Deleted user ${id} (${user.racId}, role=${user.role})`);
    return result.length > 0;
  }

  // Specialization methods
  async getSpecializations(
    userId: number
  ): Promise<VrsAgentSpecialization[]> {
    return await db
      .select()
      .from(vrsAgentSpecializations)
      .where(eq(vrsAgentSpecializations.userId, userId));
  }

  async setSpecializations(
    userId: number,
    divisions: string[]
  ): Promise<void> {
    // Delete existing specializations for the user
    await db
      .delete(vrsAgentSpecializations)
      .where(eq(vrsAgentSpecializations.userId, userId));

    // Insert new specializations
    if (divisions.length > 0) {
      const specs = divisions.map((division) => ({
        userId,
        division,
      }));
      await db.insert(vrsAgentSpecializations).values(specs);
    }
  }

  async getAgentsByDivision(division: string): Promise<User[]> {
    const result = await db
      .select({ user: users })
      .from(users)
      .leftJoin(
        vrsAgentSpecializations,
        eq(users.id, vrsAgentSpecializations.userId)
      )
      .where(
        or(
          eq(vrsAgentSpecializations.division, division),
          eq(vrsAgentSpecializations.division, "generalist")
        )
      )
      .groupBy(users.id);

    return result.map((r) => r.user);
  }

  // Submission methods
  async createSubmission(submission: InsertSubmission): Promise<Submission> {
    const result = await db
      .insert(submissions)
      .values(submission)
      .returning();
    return result[0];
  }

  async getSubmission(id: number): Promise<Submission | undefined> {
    const result = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, id));
    return result[0];
  }

  async getSubmissions(filters?: {
    technicianId?: number;
    ticketStatus?: string;
    stage1Status?: string;
    stage2Status?: string;
    applianceType?: string;
    assignedTo?: number;
    divisionFilter?: string[];
  }): Promise<Submission[]> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.technicianId !== undefined) {
      conditions.push(eq(submissions.technicianId, filters.technicianId));
    }

    if (filters?.ticketStatus !== undefined) {
      conditions.push(eq(submissions.ticketStatus, filters.ticketStatus));
    }

    if (filters?.stage1Status !== undefined) {
      conditions.push(eq(submissions.stage1Status, filters.stage1Status));
    }

    if (filters?.stage2Status !== undefined) {
      conditions.push(eq(submissions.stage2Status, filters.stage2Status));
    }

    if (filters?.applianceType !== undefined) {
      conditions.push(eq(submissions.applianceType, filters.applianceType));
    }

    if (filters?.assignedTo !== undefined) {
      conditions.push(eq(submissions.assignedTo, filters.assignedTo));
    }

    if (filters?.divisionFilter !== undefined && filters.divisionFilter.length > 0) {
      const hasNla = filters.divisionFilter.includes("nla");
      const applianceDivisions = filters.divisionFilter.filter(d => d !== "nla" && d !== "generalist");
      if (hasNla && applianceDivisions.length > 0) {
        conditions.push(or(
          inArray(submissions.applianceType, applianceDivisions),
          eq(submissions.requestType, "parts_nla")
        ) as any);
      } else if (hasNla) {
        conditions.push(eq(submissions.requestType, "parts_nla"));
      } else {
        conditions.push(inArray(submissions.applianceType, applianceDivisions) as any);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return await db
      .select()
      .from(submissions)
      .where(whereClause)
      .orderBy(desc(submissions.createdAt));
  }

  async updateSubmission(
    id: number,
    data: Partial<InsertSubmission>
  ): Promise<Submission | undefined> {
    const result = await db
      .update(submissions)
      .set(data)
      .where(eq(submissions.id, id))
      .returning();
    return result[0];
  }

  async deleteSubmission(id: number): Promise<boolean> {
    await db.delete(smsNotifications).where(eq(smsNotifications.submissionId, id));
    const result = await db.delete(submissions).where(eq(submissions.id, id)).returning();
    return result.length > 0;
  }

  async getAllSubmissions(startDate?: Date | null, endDate?: Date | null, techLdap?: string | null): Promise<Submission[]> {
    const conditions = [];
    if (startDate) conditions.push(gte(submissions.createdAt, startDate));
    if (endDate) conditions.push(lte(submissions.createdAt, endDate));
    if (techLdap) conditions.push(sql`lower(${submissions.technicianLdapId}) = ${techLdap.toLowerCase()}`);

    if (conditions.length > 0) {
      return db.select().from(submissions).where(and(...conditions)).orderBy(desc(submissions.createdAt));
    }
    return db.select().from(submissions).orderBy(desc(submissions.createdAt));
  }

  async getSubmissionsWithTechnician(filters?: {
    technicianId?: number;
    ticketStatus?: string;
    stage1Status?: string;
    stage2Status?: string;
    applianceType?: string;
    assignedTo?: number;
    requestType?: string;
    excludeRequestType?: string;
    divisionFilter?: string[];
  }, completedToday?: boolean): Promise<(Submission & { technicianName: string; technicianPhone: string | null; assignedAgentName: string | null })[]> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.technicianId !== undefined) {
      conditions.push(eq(submissions.technicianId, filters.technicianId));
    }
    if (filters?.ticketStatus !== undefined) {
      conditions.push(eq(submissions.ticketStatus, filters.ticketStatus));
    }
    if (filters?.stage1Status !== undefined) {
      conditions.push(eq(submissions.stage1Status, filters.stage1Status));
    }
    if (filters?.stage2Status !== undefined) {
      conditions.push(eq(submissions.stage2Status, filters.stage2Status));
    }
    if (filters?.applianceType !== undefined) {
      conditions.push(eq(submissions.applianceType, filters.applianceType));
    }
    if (filters?.assignedTo !== undefined) {
      conditions.push(eq(submissions.assignedTo, filters.assignedTo));
    }
    if (filters?.requestType !== undefined) {
      conditions.push(eq(submissions.requestType, filters.requestType));
    }
    if (filters?.excludeRequestType !== undefined) {
      conditions.push(sql`${submissions.requestType} != ${filters.excludeRequestType}` as any);
    }
    if (filters?.divisionFilter !== undefined && filters.divisionFilter.length > 0) {
      const hasNla = filters.divisionFilter.includes("nla");
      const applianceDivisions = filters.divisionFilter.filter(d => d !== "nla" && d !== "generalist");
      const isNlaSpecificQuery = filters.requestType === "parts_nla";
      if (isNlaSpecificQuery && applianceDivisions.length > 0) {
        conditions.push(inArray(submissions.applianceType, applianceDivisions) as any);
      } else if (hasNla && applianceDivisions.length > 0 && !isNlaSpecificQuery) {
        conditions.push(or(
          inArray(submissions.applianceType, applianceDivisions),
          eq(submissions.requestType, "parts_nla")
        ) as any);
      } else if (hasNla) {
      } else if (applianceDivisions.length > 0) {
        conditions.push(inArray(submissions.applianceType, applianceDivisions) as any);
      }
    }
    if (completedToday) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      conditions.push(
        sql`${submissions.reviewedAt} >= ${today}` as any
      );
      conditions.push(
        sql`${submissions.ticketStatus} IN ('completed', 'approved', 'rejected', 'invalid')` as any
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const assignedAgent = alias(users, "assignedAgent");

    const result = await db
      .select({
        submission: submissions,
        technicianName: users.name,
        technicianPhone: users.phone,
        ldapTechName: technicians.name,
        ldapTechPhone: technicians.phone,
        assignedAgentName: assignedAgent.name,
      })
      .from(submissions)
      .innerJoin(users, eq(submissions.technicianId, users.id))
      .leftJoin(technicians, eq(submissions.technicianLdapId, technicians.ldapId))
      .leftJoin(assignedAgent, eq(submissions.assignedTo, assignedAgent.id))
      .where(whereClause)
      .orderBy(filters?.ticketStatus === "queued" ? asc(submissions.createdAt) : desc(submissions.createdAt));

    return result.map((r) => ({
      ...r.submission,
      technicianName: r.ldapTechName || r.technicianName,
      technicianPhone: r.submission.phoneOverride || r.ldapTechPhone || r.technicianPhone,
      assignedAgentName: r.assignedAgentName,
      racId: r.submission.technicianLdapId || "",
    }));
  }

  async getCompletedTodayCount(agentId?: number): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const conditions: any[] = [
      or(
        eq(submissions.stage1Status, "approved"),
        eq(submissions.stage1Status, "rejected")
      ),
      sql`${submissions.stage1ReviewedAt} >= ${today}`,
      sql`${submissions.requestType} != 'parts_nla'`,
    ];
    if (agentId !== undefined) {
      conditions.push(eq(submissions.assignedTo, agentId));
    }
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(and(...conditions));
    return result[0]?.count || 0;
  }

  async getAgentQueueCount(agentId?: number): Promise<number> {
    const conditions = [
      or(
        eq(submissions.stage1Status, "pending"),
        and(
          eq(submissions.stage1Status, "approved"),
          eq(submissions.stage2Status, "pending")
        )
      ),
    ];
    if (agentId !== undefined) {
      conditions.push(eq(submissions.assignedTo, agentId));
    }
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(and(...conditions));
    return result[0]?.count || 0;
  }

  async getDivisionQueueCount(divisions: string[]): Promise<number> {
    const allDivisions = ["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "all_other", "nla"];
    const isGeneralist = divisions.length >= allDivisions.length;

    const conditions: any[] = [
      eq(submissions.stage1Status, "pending"),
    ];

    if (!isGeneralist && divisions.length > 0) {
      conditions.push(inArray(submissions.applianceType, divisions));
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(and(...conditions));
    return result[0]?.count || 0;
  }

  async getStage2QueueCount(agentId?: number): Promise<number> {
    const conditions = [
      eq(submissions.stage1Status, "approved"),
      eq(submissions.stage2Status, "pending"),
    ];
    if (agentId !== undefined) {
      conditions.push(eq(submissions.assignedTo, agentId));
    }
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(and(...conditions));
    return result[0]?.count || 0;
  }

  async getQueuedCount(divisions: string[]): Promise<number> {
    const allDivisions = ["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "all_other", "nla"];
    const isGeneralist = divisions.length >= allDivisions.length;
    const conditions: any[] = [
      eq(submissions.ticketStatus, "queued"),
      sql`${submissions.requestType} != 'parts_nla'`,
    ];
    if (!isGeneralist && divisions.length > 0) {
      const appDivisions = divisions.filter(d => d !== "nla");
      if (appDivisions.length > 0) {
        conditions.push(inArray(submissions.applianceType, appDivisions));
      }
    }
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(and(...conditions));
    return result[0]?.count || 0;
  }

  async getQueuedCountAll(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(eq(submissions.ticketStatus, "queued"));
    return Number(result[0]?.count) || 0;
  }

  async getOnlineAgentCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(
        eq(users.role, "vrs_agent"),
        eq(users.agentStatus, "online"),
        eq(users.isActive, true)
      ));
    return Number(result[0]?.count) || 0;
  }

  async getPendingCount(agentId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(and(
        eq(submissions.ticketStatus, "pending"),
        eq(submissions.assignedTo, agentId),
        sql`${submissions.requestType} != 'parts_nla'`
      ));
    return result[0]?.count || 0;
  }

  async getWarrantyProviderCounts(assignedTo?: number): Promise<{ warrantyProvider: string; count: number }[]> {
    const conditions = [
      eq(submissions.stage1Status, "approved"),
      eq(submissions.stage2Status, "pending"),
    ];
    if (assignedTo !== undefined) {
      conditions.push(eq(submissions.assignedTo, assignedTo));
    }

    const result = await db
      .select({
        warrantyProvider: sql<string>`COALESCE(${submissions.warrantyProvider}, ${submissions.warrantyType})`,
        count: sql<number>`count(*)`,
      })
      .from(submissions)
      .where(and(...conditions))
      .groupBy(sql`COALESCE(${submissions.warrantyProvider}, ${submissions.warrantyType})`);

    return result.map((r) => ({
      warrantyProvider: r.warrantyProvider,
      count: Number(r.count),
    }));
  }

  async getResubmissionChain(rootId: number): Promise<Submission[]> {
    return await db
      .select()
      .from(submissions)
      .where(eq(submissions.resubmissionOf, rootId))
      .orderBy(submissions.createdAt);
  }

  async getSubmissionHistory(serviceOrder: string): Promise<Submission[]> {
    return await db
      .select()
      .from(submissions)
      .where(eq(submissions.serviceOrder, serviceOrder))
      .orderBy(submissions.createdAt);
  }

  async hasRejectedClosedForServiceOrder(serviceOrder: string): Promise<boolean> {
    const results = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.serviceOrder, serviceOrder),
          eq(submissions.ticketStatus, "rejected_closed")
        )
      )
      .limit(1);
    return results.length > 0;
  }

  async hasActiveSubmissionForServiceOrder(serviceOrder: string, technicianId: number): Promise<{ exists: boolean; status?: string }> {
    const activeStatuses = ["queued", "pending", "completed"];
    const results = await db
      .select({ id: submissions.id, ticketStatus: submissions.ticketStatus })
      .from(submissions)
      .where(
        and(
          eq(submissions.serviceOrder, serviceOrder),
          eq(submissions.technicianId, technicianId),
          inArray(submissions.ticketStatus, activeStatuses)
        )
      )
      .limit(1);
    if (results.length > 0) {
      return { exists: true, status: results[0].ticketStatus };
    }
    return { exists: false };
  }

  // SMS methods
  async createSmsNotification(
    notification: InsertSmsNotification
  ): Promise<SmsNotification> {
    const result = await db
      .insert(smsNotifications)
      .values(notification)
      .returning();
    return result[0];
  }

  async getSmsNotifications(submissionId: number): Promise<SmsNotification[]> {
    return await db
      .select()
      .from(smsNotifications)
      .where(eq(smsNotifications.submissionId, submissionId));
  }

  // RGC methods
  async createDailyRgcCode(code: InsertDailyRgcCode): Promise<DailyRgcCode> {
    const result = await db.insert(dailyRgcCodes).values(code).returning();
    return result[0];
  }

  async getDailyRgcCode(date: string): Promise<DailyRgcCode | undefined> {
    const result = await db
      .select()
      .from(dailyRgcCodes)
      .where(eq(dailyRgcCodes.validDate, date));
    return result[0];
  }

  async upsertDailyRgcCode(data: { code: string; validDate: string; createdBy: number | null }): Promise<DailyRgcCode> {
    const result = await db
      .insert(dailyRgcCodes)
      .values(data)
      .onConflictDoUpdate({
        target: dailyRgcCodes.validDate,
        set: { code: data.code, createdBy: data.createdBy },
      })
      .returning();
    return result[0];
  }

  async getOrCreateTechUser(ldapId: string, name: string, phone: string): Promise<User> {
    const existing = await db.select().from(users).where(eq(users.racId, ldapId));
    if (existing[0]) return existing[0];

    const bcrypt = await import("bcryptjs");
    const randomPassword = await bcrypt.hash(crypto.randomUUID(), 10);
    const result = await db.insert(users).values({
      email: null,
      name: name || ldapId,
      password: randomPassword,
      role: "technician",
      phone: phone || "",
      racId: ldapId,
      isActive: true,
    }).returning();
    return result[0];
  }

  // Technician methods
  async getTechnicianByLdapId(ldapId: string): Promise<Technician | undefined> {
    const result = await db.select().from(technicians).where(eq(technicians.ldapId, ldapId));
    return result[0];
  }

  async getTechnicians(activeOnly?: boolean): Promise<Technician[]> {
    if (activeOnly) {
      return await db.select().from(technicians).where(eq(technicians.isActive, true));
    }
    return await db.select().from(technicians);
  }

  async upsertTechnician(data: InsertTechnician): Promise<Technician> {
    const result = await db
      .insert(technicians)
      .values(data)
      .onConflictDoUpdate({
        target: technicians.ldapId,
        set: {
          name: data.name,
          phone: data.phone,
          district: data.district,
          state: data.state,
          managerName: data.managerName,
          techUnNo: data.techUnNo,
          isActive: data.isActive,
          lastSyncedAt: data.lastSyncedAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  }

  async deactivateTechniciansNotIn(ldapIds: string[]): Promise<number> {
    if (ldapIds.length === 0) return 0;
    const protectedIds = ["testtech1", "tmorri1"];
    const allProtected = [...new Set([...ldapIds, ...protectedIds])];
    const result = await db
      .update(technicians)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(technicians.isActive, true),
        sql`${technicians.ldapId} NOT IN (${sql.join(allProtected.map(id => sql`${id}`), sql`, `)})`
      ))
      .returning();
    return result.length;
  }

  async getTechnicianSyncInfo(): Promise<{ activeCount: number; lastSyncedAt: Date | null }> {
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(technicians)
      .where(eq(technicians.isActive, true));
    const lastSyncResult = await db
      .select({ lastSynced: sql<Date | null>`max(${technicians.lastSyncedAt})` })
      .from(technicians);
    return {
      activeCount: Number(countResult[0]?.count) || 0,
      lastSyncedAt: lastSyncResult[0]?.lastSynced || null,
    };
  }

  async getAgentsWithStatus(): Promise<{ id: number; name: string; racId: string | null; agentStatus: string; divisions: string[]; updatedAt: Date | null }[]> {
    const agents = await db
      .select()
      .from(users)
      .where(and(eq(users.role, "vrs_agent"), eq(users.isActive, true)))
      .orderBy(users.name);

    const result = [];
    for (const agent of agents) {
      const specs = await db
        .select()
        .from(vrsAgentSpecializations)
        .where(eq(vrsAgentSpecializations.userId, agent.id));
      result.push({
        id: agent.id,
        name: agent.name,
        racId: agent.racId,
        agentStatus: agent.agentStatus,
        divisions: specs.map(s => s.division),
        updatedAt: agent.updatedAt,
      });
    }
    return result;
  }

  async getAnalytics(): Promise<{
    submissionsToday: number;
    submissionsThisWeek: number;
    submissionsThisMonth: number;
    totalSubmissions: number;
    approvedCount: number;
    rejectedCount: number;
    pendingCount: number;
    avgTimeToStage1Ms: number | null;
    avgTimeToAuthCodeMs: number | null;
  }> {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await db
      .select({
        submissionsToday: sql<number>`count(*) filter (where ${submissions.createdAt} >= ${startOfToday})`,
        submissionsThisWeek: sql<number>`count(*) filter (where ${submissions.createdAt} >= ${sevenDaysAgo})`,
        submissionsThisMonth: sql<number>`count(*) filter (where ${submissions.createdAt} >= ${thirtyDaysAgo})`,
        totalSubmissions: sql<number>`count(*)`,
        approvedCount: sql<number>`count(*) filter (where ${submissions.stage1Status} = 'approved')`,
        rejectedCount: sql<number>`count(*) filter (where ${submissions.stage1Status} = 'rejected')`,
        pendingCount: sql<number>`count(*) filter (where ${submissions.stage1Status} = 'pending')`,
        avgTimeToStage1Ms: sql<number | null>`avg(extract(epoch from (${submissions.stage1ReviewedAt} - ${submissions.createdAt})) * 1000) filter (where ${submissions.stage1ReviewedAt} is not null)`,
        avgTimeToAuthCodeMs: sql<number | null>`avg(extract(epoch from (${submissions.stage2ReviewedAt} - ${submissions.stage1ReviewedAt})) * 1000) filter (where ${submissions.stage1ReviewedAt} is not null and ${submissions.stage2ReviewedAt} is not null)`,
      })
      .from(submissions);

    const row = result[0];
    return {
      submissionsToday: Number(row.submissionsToday) || 0,
      submissionsThisWeek: Number(row.submissionsThisWeek) || 0,
      submissionsThisMonth: Number(row.submissionsThisMonth) || 0,
      totalSubmissions: Number(row.totalSubmissions) || 0,
      approvedCount: Number(row.approvedCount) || 0,
      rejectedCount: Number(row.rejectedCount) || 0,
      pendingCount: Number(row.pendingCount) || 0,
      avgTimeToStage1Ms: row.avgTimeToStage1Ms !== null ? Number(row.avgTimeToStage1Ms) : null,
      avgTimeToAuthCodeMs: row.avgTimeToAuthCodeMs !== null ? Number(row.avgTimeToAuthCodeMs) : null,
    };
  }

  async getResubmissionStats(): Promise<{
    totalResubmissions: number;
    resubmissionRate: number;
    topTechnicians: { technicianId: number; techName: string; techLdap: string; totalTickets: number; resubmissions: number; rate: number }[];
  }> {
    const totalsResult = await db
      .select({
        total: sql<number>`count(*)`,
        resubmissions: sql<number>`count(*) filter (where ${submissions.resubmissionOf} is not null)`,
      })
      .from(submissions);

    const total = Number(totalsResult[0].total) || 0;
    const totalResubs = Number(totalsResult[0].resubmissions) || 0;

    const techRows = await db.execute(sql`
      select
        s.technician_id as "technicianId",
        max(u.name) as "techName",
        max(coalesce(s.technician_ldap_id, u.rac_id, '')) as "techLdap",
        count(*) as "totalTickets",
        count(*) filter (where s.resubmission_of is not null) as "resubmissions"
      from submissions s
      left join users u on u.id = s.technician_id
      group by s.technician_id
      having count(*) filter (where s.resubmission_of is not null) > 0
      order by count(*) filter (where s.resubmission_of is not null) desc
      limit 20
    `);

    const topTechnicians = (techRows.rows as any[]).map(r => ({
      technicianId: Number(r.technicianId),
      techName: r.techName || "Unknown",
      techLdap: r.techLdap || "",
      totalTickets: Number(r.totalTickets),
      resubmissions: Number(r.resubmissions),
      rate: Number(r.totalTickets) > 0 ? Math.round((Number(r.resubmissions) / Number(r.totalTickets)) * 100) : 0,
    }));

    return {
      totalResubmissions: totalResubs,
      resubmissionRate: total > 0 ? Math.round((totalResubs / total) * 100) : 0,
      topTechnicians,
    };
  }

  async getDistrictRollup(): Promise<{
    district: string;
    totalTickets: number;
    approved: number;
    rejected: number;
    pending: number;
    completed: number;
    avgTimeToStage1Ms: number | null;
  }[]> {
    const rows = await db.execute(sql`
      select
        coalesce(district_code, 'Unknown') as "district",
        count(*) as "totalTickets",
        count(*) filter (where stage1_status = 'approved') as "approved",
        count(*) filter (where stage1_status = 'rejected') as "rejected",
        count(*) filter (where stage1_status = 'pending') as "pending",
        count(*) filter (where ticket_status in ('completed', 'approved')) as "completed",
        avg(extract(epoch from (stage1_reviewed_at - created_at)) * 1000) filter (where stage1_reviewed_at is not null) as "avgTimeToStage1Ms"
      from submissions
      group by district_code
      order by count(*) desc
    `);

    return (rows.rows as any[]).map(r => ({
      district: r.district || "Unknown",
      totalTickets: Number(r.totalTickets) || 0,
      approved: Number(r.approved) || 0,
      rejected: Number(r.rejected) || 0,
      pending: Number(r.pending) || 0,
      completed: Number(r.completed) || 0,
      avgTimeToStage1Ms: r.avgTimeToStage1Ms !== null ? Number(r.avgTimeToStage1Ms) : null,
    }));
  }

  async createFeedback(data: InsertFeedback): Promise<Feedback> {
    const result = await db.insert(feedback).values(data).returning();
    return result[0];
  }

  async getFeedbackList(): Promise<(Feedback & { resolvedByName: string | null })[]> {
    const resolvedByUser = alias(users, "resolvedByUser");
    const result = await db
      .select({
        feedback: feedback,
        resolvedByName: resolvedByUser.name,
      })
      .from(feedback)
      .leftJoin(resolvedByUser, eq(feedback.resolvedBy, resolvedByUser.id))
      .orderBy(desc(feedback.createdAt));
    return result.map((r) => ({
      ...r.feedback,
      resolvedByName: r.resolvedByName,
    }));
  }

  async getFeedback(id: number): Promise<Feedback | undefined> {
    const result = await db.select().from(feedback).where(eq(feedback.id, id));
    return result[0];
  }

  async updateFeedback(id: number, data: Partial<InsertFeedback>): Promise<Feedback | undefined> {
    const result = await db
      .update(feedback)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(feedback.id, id))
      .returning();
    return result[0];
  }

  async createSubmissionNote(data: InsertSubmissionNote): Promise<SubmissionNote> {
    const [note] = await db.insert(submissionNotes).values(data).returning();
    return note;
  }

  async getSubmissionNotes(
    submissionId: number
  ): Promise<(SubmissionNote & { authorName: string })[]> {
    const rows = await db
      .select({
        id: submissionNotes.id,
        submissionId: submissionNotes.submissionId,
        authorId: submissionNotes.authorId,
        authorRole: submissionNotes.authorRole,
        body: submissionNotes.body,
        createdAt: submissionNotes.createdAt,
        authorName: users.name,
      })
      .from(submissionNotes)
      .leftJoin(users, eq(submissionNotes.authorId, users.id))
      .where(eq(submissionNotes.submissionId, submissionId))
      .orderBy(submissionNotes.createdAt);
    return rows.map((r) => ({ ...r, authorName: r.authorName ?? "Unknown" }));
  }

  async getTechnicianUsers(): Promise<TechnicianUserView[]> {
    const result = await db.execute(sql`
      SELECT
        u.id,
        u.name,
        u.rac_id AS "racId",
        u.phone,
        t.district,
        t.tech_un_no AS "techUnNo",
        t.manager_name AS "managerName",
        COUNT(s.id)::int AS "totalTickets",
        COUNT(CASE WHEN s.ticket_status IN ('queued', 'pending') THEN 1 END)::int AS "pendingCount",
        COUNT(CASE WHEN s.ticket_status IN ('completed', 'approved') THEN 1 END)::int AS "approvedCount",
        COUNT(CASE WHEN s.ticket_status = 'rejected' THEN 1 END)::int AS "rejectedCount"
      FROM users u
      LEFT JOIN technicians t ON u.rac_id = t.ldap_id
      LEFT JOIN submissions s ON u.rac_id = s.technician_ldap_id
      WHERE u.role = 'technician' AND u.is_system_account = false
      GROUP BY u.id, u.name, u.rac_id, u.phone, t.district, t.tech_un_no, t.manager_name
      ORDER BY u.name ASC
    `);
    return result.rows as TechnicianUserView[];
  }

  async getNlaQueuedCount(divisions?: string[]): Promise<number> {
    const allApplianceDivisions = ["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "all_other"];
    const conditions: any[] = [
      eq(submissions.ticketStatus, "queued"),
      eq(submissions.requestType, "parts_nla"),
    ];
    if (divisions && divisions.length > 0) {
      const applianceDivisions = divisions.filter(d => d !== "nla" && d !== "generalist");
      const isApplianceGeneralist = applianceDivisions.length >= allApplianceDivisions.length;
      if (!isApplianceGeneralist && applianceDivisions.length > 0) {
        conditions.push(inArray(submissions.applianceType, applianceDivisions));
      }
    }
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(and(...conditions));
    return Number(result[0]?.count) || 0;
  }

  async getNlaPendingCount(agentId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(and(
        eq(submissions.ticketStatus, "pending"),
        eq(submissions.requestType, "parts_nla"),
        eq(submissions.assignedTo, agentId)
      ));
    return Number(result[0]?.count) || 0;
  }

  async getNlaCompletedTodayCount(agentId?: number, divisions?: string[]): Promise<number> {
    const allApplianceDivisions = ["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "all_other"];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const conditions: any[] = [
      eq(submissions.requestType, "parts_nla"),
      gte(submissions.statusChangedAt, today),
      inArray(submissions.ticketStatus, ["completed", "approved"]),
    ];
    if (agentId) {
      conditions.push(eq(submissions.reviewedBy, agentId));
    }
    if (divisions && divisions.length > 0) {
      const applianceDivisions = divisions.filter(d => d !== "nla" && d !== "generalist");
      const isApplianceGeneralist = applianceDivisions.length >= allApplianceDivisions.length;
      if (!isApplianceGeneralist && applianceDivisions.length > 0) {
        conditions.push(inArray(submissions.applianceType, applianceDivisions));
      }
    }
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(and(...conditions));
    return Number(result[0]?.count) || 0;
  }

  async getNlaAnalytics(): Promise<{ today: number; week: number; month: number; allTime: number }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const nlaCondition = eq(submissions.requestType, "parts_nla");

    const [allTimeResult] = await db.select({ count: sql<number>`count(*)` }).from(submissions).where(nlaCondition);
    const [todayResult] = await db.select({ count: sql<number>`count(*)` }).from(submissions).where(and(nlaCondition, gte(submissions.createdAt, todayStart)));
    const [weekResult] = await db.select({ count: sql<number>`count(*)` }).from(submissions).where(and(nlaCondition, gte(submissions.createdAt, weekStart)));
    const [monthResult] = await db.select({ count: sql<number>`count(*)` }).from(submissions).where(and(nlaCondition, gte(submissions.createdAt, monthStart)));

    return {
      today: Number(todayResult?.count) || 0,
      week: Number(weekResult?.count) || 0,
      month: Number(monthResult?.count) || 0,
      allTime: Number(allTimeResult?.count) || 0,
    };
  }

  async getSystemSetting(key: string): Promise<string | undefined> {
    const result = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
    return result[0]?.value;
  }

  async setSystemSetting(key: string, value: string): Promise<void> {
    await db.insert(systemSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updatedAt: new Date() },
      });
  }
}

export const storage = new DatabaseStorage();
