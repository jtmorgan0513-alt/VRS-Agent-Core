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
  updateSubmission(
    id: number,
    data: Partial<InsertSubmission>
  ): Promise<Submission | undefined>;
  getAgentQueueCount(agentId: number): Promise<number>;

  // SMS methods
  createSmsNotification(
    notification: InsertSmsNotification
  ): Promise<SmsNotification>;
  getSmsNotifications(submissionId: number): Promise<SmsNotification[]>;

  // RGC methods
  createDailyRgcCode(code: InsertDailyRgcCode): Promise<DailyRgcCode>;
  getDailyRgcCode(date: string): Promise<DailyRgcCode | undefined>;
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
}

export const storage = new DatabaseStorage();
