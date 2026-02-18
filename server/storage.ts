import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, or, desc, sql } from "drizzle-orm";
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
  }): Promise<Submission[]>;
  getSubmissionsWithTechnician(filters?: {
    technicianId?: number;
    stage1Status?: string;
    stage2Status?: string;
    applianceType?: string;
    assignedTo?: number;
    requestType?: string;
  }, completedToday?: boolean): Promise<(Submission & { technicianName: string; technicianPhone: string | null })[]>;
  updateSubmission(
    id: number,
    data: Partial<InsertSubmission>
  ): Promise<Submission | undefined>;
  getAgentQueueCount(agentId: number): Promise<number>;
  getCompletedTodayCount(agentId: number): Promise<number>;

  getStage2QueueCount(agentId: number): Promise<number>;
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
    return await db.select().from(users);
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

  async getSubmissionsWithTechnician(filters?: {
    technicianId?: number;
    stage1Status?: string;
    stage2Status?: string;
    applianceType?: string;
    assignedTo?: number;
    requestType?: string;
  }, completedToday?: boolean): Promise<(Submission & { technicianName: string; technicianPhone: string | null })[]> {
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

    const result = await db
      .select({
        submission: submissions,
        technicianName: users.name,
        technicianPhone: users.phone,
        ldapTechName: technicians.name,
        ldapTechPhone: technicians.phone,
      })
      .from(submissions)
      .innerJoin(users, eq(submissions.technicianId, users.id))
      .leftJoin(technicians, eq(submissions.technicianLdapId, technicians.ldapId))
      .where(whereClause)
      .orderBy(desc(submissions.createdAt));

    return result.map((r) => ({
      ...r.submission,
      technicianName: r.ldapTechName || r.technicianName,
      technicianPhone: r.submission.phoneOverride || r.ldapTechPhone || r.technicianPhone,
    }));
  }

  async getCompletedTodayCount(agentId: number): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(
        and(
          eq(submissions.assignedTo, agentId),
          or(
            eq(submissions.stage1Status, "approved"),
            eq(submissions.stage1Status, "rejected")
          ),
          sql`${submissions.stage1ReviewedAt} >= ${today}`
        )
      );
    return result[0]?.count || 0;
  }

  async getAgentQueueCount(agentId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(
        and(
          eq(submissions.assignedTo, agentId),
          or(
            eq(submissions.stage1Status, "pending"),
            and(
              eq(submissions.stage1Status, "approved"),
              eq(submissions.stage2Status, "pending")
            )
          )
        )
      );

    return result[0]?.count || 0;
  }

  async getStage2QueueCount(agentId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(submissions)
      .where(
        and(
          eq(submissions.assignedTo, agentId),
          eq(submissions.stage1Status, "approved"),
          eq(submissions.stage2Status, "pending")
        )
      );
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
    const email = `${ldapId}@tech.sears.com`;
    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing[0]) return existing[0];

    const bcrypt = await import("bcryptjs");
    const randomPassword = await bcrypt.hash(crypto.randomUUID(), 10);
    const result = await db.insert(users).values({
      email,
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
