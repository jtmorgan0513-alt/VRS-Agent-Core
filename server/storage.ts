import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, or, desc, sql, isNull, inArray } from "drizzle-orm";
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
    stage1Status?: string;
    stage2Status?: string;
    applianceType?: string;
    assignedTo?: number;
    divisionFilter?: string[];
  }): Promise<Submission[]>;
  getSubmissionsWithTechnician(filters?: {
    technicianId?: number;
    stage1Status?: string;
    stage2Status?: string;
    applianceType?: string;
    assignedTo?: number;
    requestType?: string;
    divisionFilter?: string[];
  }, completedToday?: boolean): Promise<(Submission & { technicianName: string; technicianPhone: string | null; assignedAgentName: string | null })[]>;
  updateSubmission(
    id: number,
    data: Partial<InsertSubmission>
  ): Promise<Submission | undefined>;
  deleteSubmission(id: number): Promise<boolean>;
  getAgentQueueCount(agentId?: number): Promise<number>;
  getDivisionQueueCount(divisions: string[]): Promise<number>;
  getCompletedTodayCount(agentId?: number): Promise<number>;

  getStage2QueueCount(agentId?: number): Promise<number>;
  getWarrantyProviderCounts(assignedTo?: number): Promise<{ warrantyProvider: string; count: number }[]>;

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
    await db.delete(vrsAgentSpecializations).where(eq(vrsAgentSpecializations.userId, id));
    await db.update(dailyRgcCodes).set({ createdBy: null } as any).where(eq(dailyRgcCodes.createdBy, id));
    await db.update(submissions).set({ assignedTo: null } as any).where(eq(submissions.assignedTo, id));
    await db.update(submissions).set({ stage1ReviewedBy: null } as any).where(eq(submissions.stage1ReviewedBy, id));
    await db.update(submissions).set({ stage2ReviewedBy: null } as any).where(eq(submissions.stage2ReviewedBy, id));
    const techSubmissions = await db.select({ id: submissions.id }).from(submissions).where(eq(submissions.technicianId, id));
    if (techSubmissions.length > 0) {
      const subIds = techSubmissions.map(s => s.id);
      await db.delete(smsNotifications).where(inArray(smsNotifications.submissionId, subIds));
      await db.delete(submissions).where(inArray(submissions.id, subIds));
    }
    const result = await db.delete(users).where(eq(users.id, id)).returning();
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
      conditions.push(inArray(submissions.applianceType, filters.divisionFilter) as any);
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

  async getSubmissionsWithTechnician(filters?: {
    technicianId?: number;
    stage1Status?: string;
    stage2Status?: string;
    applianceType?: string;
    assignedTo?: number;
    requestType?: string;
    divisionFilter?: string[];
  }, completedToday?: boolean): Promise<(Submission & { technicianName: string; technicianPhone: string | null; assignedAgentName: string | null })[]> {
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.technicianId !== undefined) {
      conditions.push(eq(submissions.technicianId, filters.technicianId));
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
    if (filters?.divisionFilter !== undefined && filters.divisionFilter.length > 0) {
      conditions.push(inArray(submissions.applianceType, filters.divisionFilter) as any);
    }
    if (completedToday) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      conditions.push(
        sql`${submissions.stage1ReviewedAt} >= ${today}` as any
      );
      conditions.push(
        sql`(${submissions.stage1Status} = 'approved' OR ${submissions.stage1Status} = 'rejected')` as any
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
      .orderBy(desc(submissions.createdAt));

    return result.map((r) => ({
      ...r.submission,
      technicianName: r.ldapTechName || r.technicianName,
      technicianPhone: r.submission.phoneOverride || r.ldapTechPhone || r.technicianPhone,
      assignedAgentName: r.assignedAgentName,
    }));
  }

  async getCompletedTodayCount(agentId?: number): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const conditions = [
      or(
        eq(submissions.stage1Status, "approved"),
        eq(submissions.stage1Status, "rejected")
      ),
      sql`${submissions.stage1ReviewedAt} >= ${today}`,
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
    const allDivisions = ["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "all_other"];
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
    const result = await db
      .update(technicians)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(technicians.isActive, true),
        sql`${technicians.ldapId} NOT IN (${sql.join(ldapIds.map(id => sql`${id}`), sql`, `)})`
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
}

export const storage = new DatabaseStorage();
