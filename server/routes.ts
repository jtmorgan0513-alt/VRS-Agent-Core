import express, { type Express } from "express";
import { createServer, type Server } from "http";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { storage } from "./storage";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { authenticateToken, requireRole, type AuthenticatedRequest } from "./middleware/auth";
import type { User } from "@shared/schema";
import { seedDatabase } from "./seed";
import { sendSms, buildStage1ApprovedMessage, buildStage1RejectedMessage, buildAuthCodeMessage } from "./sms";

const JWT_SECRET = process.env.SESSION_SECRET!;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(["technician", "vrs_agent", "admin"]),
  phone: z.string().optional(),
  racId: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function sanitizeUser(user: User): Omit<User, "password"> {
  const { password, ...sanitized } = user;
  return sanitized;
}

function signToken(user: User): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  await seedDatabase();

  registerObjectStorageRoutes(app);

  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      const { email, password, name, role, phone, racId } = parsed.data;

      if (role !== "technician") {
        return res.status(403).json({ error: "Only technician self-registration is allowed" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: "Email already exists" });
      }

      const hashedPassword = await bcryptjs.hash(password, 10);
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        name,
        role,
        phone: phone || null,
        racId: racId || null,
      });

      return res.status(201).json({ user: sanitizeUser(user), token: signToken(user) });
    } catch (error) {
      console.error("Registration error:", error);
      return res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      const { email, password } = parsed.data;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const passwordMatch = await bcryptjs.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: "Account is deactivated" });
      }

      return res.status(200).json({ user: sanitizeUser(user), token: signToken(user) });
    } catch (error) {
      console.error("Login error:", error);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        return res.status(401).json({ error: "No user found" });
      }

      const user = await storage.getUser(authReq.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({ user: sanitizeUser(user) });
    } catch (error) {
      console.error("Get user error:", error);
      return res.status(500).json({ error: "Failed to get user" });
    }
  });

  const updateMeSchema = z.object({
    firstLogin: z.boolean().optional(),
    lastSeenVersion: z.string().optional(),
  });

  app.patch("/api/users/me", authenticateToken, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const parsed = updateMeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const updated = await storage.updateUser(authReq.user.id, parsed.data);
      if (!updated) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({ user: sanitizeUser(updated) });
    } catch (error) {
      console.error("Update me error:", error);
      return res.status(500).json({ error: "Failed to update user" });
    }
  });

  // ========================================================================
  // SUBMISSION ROUTES
  // ========================================================================

  const createSubmissionSchema = z.object({
    serviceOrder: z.string().regex(/^\d{4}-\d{8}$/, "Service order must be in format DDDD-SSSSSSSS (e.g., 8175-12345678)"),
    applianceType: z.enum(["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac"]),
    requestType: z.enum(["authorization", "non_repairable_review"]),
    warrantyType: z.enum(["sears_protect", "b2b"]).default("sears_protect"),
    warrantyProvider: z.string().optional(),
    issueDescription: z.string().min(1, "Issue description is required"),
    estimateAmount: z.string().optional(),
    photos: z.string().optional(),
    videoUrl: z.string().optional(),
    voiceNoteUrl: z.string().optional(),
    phone: z.string().min(1, "Phone number is required"),
  });

  async function autoAssignAgent(applianceType: string): Promise<number | null> {
    const eligibleAgents = await storage.getAgentsByDivision(applianceType);
    if (eligibleAgents.length === 0) return null;

    let bestAgent = eligibleAgents[0];
    let lowestCount = await storage.getAgentQueueCount(bestAgent.id);

    for (let i = 1; i < eligibleAgents.length; i++) {
      const count = await storage.getAgentQueueCount(eligibleAgents[i].id);
      if (count < lowestCount) {
        lowestCount = count;
        bestAgent = eligibleAgents[i];
      }
    }

    return bestAgent.id;
  }

  app.post("/api/submissions", authenticateToken, requireRole("technician"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const parsed = createSubmissionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const user = await storage.getUser(authReq.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const assignedTo = await autoAssignAgent(parsed.data.applianceType);

      const submission = await storage.createSubmission({
        technicianId: user.id,
        racId: user.racId || "",
        phone: parsed.data.phone,
        serviceOrder: parsed.data.serviceOrder,
        districtCode: parsed.data.serviceOrder.split("-")[0],
        applianceType: parsed.data.applianceType,
        requestType: parsed.data.requestType,
        warrantyType: parsed.data.warrantyType,
        warrantyProvider: parsed.data.warrantyProvider || null,
        issueDescription: parsed.data.issueDescription,
        estimateAmount: parsed.data.estimateAmount || null,
        photos: parsed.data.photos || null,
        videoUrl: parsed.data.videoUrl || null,
        voiceNoteUrl: parsed.data.voiceNoteUrl || null,
        assignedTo: assignedTo,
        stage1Status: "pending",
        stage2Status: "pending",
        stage1ReviewedBy: null,
        stage1ReviewedAt: null,
        stage1RejectionReason: null,
        stage2ReviewedBy: null,
        stage2ReviewedAt: null,
        authCode: null,
        rgcCode: null,
      });

      return res.status(201).json({ submission });
    } catch (error) {
      console.error("Create submission error:", error);
      return res.status(500).json({ error: "Failed to create submission" });
    }
  });

  app.get("/api/submissions", authenticateToken, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user!;

      let filters: {
        technicianId?: number;
        stage1Status?: string;
        stage2Status?: string;
        assignedTo?: number;
        applianceType?: string;
      } = {};

      if (user.role === "technician") {
        filters.technicianId = user.id;
      } else if (user.role === "vrs_agent") {
        if (req.query.allQueue !== "true") {
          filters.assignedTo = user.id;
        }
      }

      if (req.query.stage1Status) {
        filters.stage1Status = req.query.stage1Status as string;
      }
      if (req.query.stage2Status) {
        filters.stage2Status = req.query.stage2Status as string;
      }
      if (req.query.applianceType) {
        filters.applianceType = req.query.applianceType as string;
      }

      const completedToday = req.query.completedToday === "true";

      if (user.role === "vrs_agent" || user.role === "admin") {
        let result = await storage.getSubmissionsWithTechnician(filters, completedToday);

        const search = req.query.search as string | undefined;
        if (search && result.length > 0) {
          const searchTerm = search.toLowerCase();
          result = result.filter(sub => 
            sub.serviceOrder.toLowerCase().includes(searchTerm) ||
            sub.serviceOrder.replace(/^(\d{4})-/, '').includes(searchTerm)
          );
        }

        return res.status(200).json({ submissions: result });
      }

      let techResult = await storage.getSubmissions(filters);

      const techSearch = req.query.search as string | undefined;
      if (techSearch && techResult.length > 0) {
        const searchTerm = techSearch.toLowerCase();
        techResult = techResult.filter(sub => 
          sub.serviceOrder.toLowerCase().includes(searchTerm) ||
          sub.serviceOrder.replace(/^(\d{4})-/, '').includes(searchTerm)
        );
      }

      return res.status(200).json({ submissions: techResult });
    } catch (error) {
      console.error("Get submissions error:", error);
      return res.status(500).json({ error: "Failed to get submissions" });
    }
  });

  app.get("/api/submissions/:id", authenticateToken, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid submission ID" });
      }

      const submission = await storage.getSubmission(id);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const user = authReq.user!;
      if (user.role === "technician" && submission.technicianId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (user.role === "vrs_agent" && submission.assignedTo !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      return res.status(200).json({ submission });
    } catch (error) {
      console.error("Get submission error:", error);
      return res.status(500).json({ error: "Failed to get submission" });
    }
  });

  // ========================================================================
  // STAGE 1 REVIEW ROUTES
  // ========================================================================

  const stage1ActionSchema = z.object({
    action: z.enum(["approve", "reject"]),
    rejectionReason: z.string().optional(),
  });

  app.patch("/api/submissions/:id/stage1", authenticateToken, requireRole("vrs_agent"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid submission ID" });
      }

      const parsed = stage1ActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const submission = await storage.getSubmission(id);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (submission.assignedTo !== authReq.user!.id) {
        return res.status(403).json({ error: "Not assigned to you" });
      }

      if (submission.stage1Status !== "pending") {
        return res.status(400).json({ error: "Submission already reviewed" });
      }

      const { action, rejectionReason } = parsed.data;

      if (action === "reject" && !rejectionReason) {
        return res.status(400).json({ error: "Rejection reason is required" });
      }

      const updateData: Record<string, unknown> = {
        stage1Status: action === "approve" ? "approved" : "rejected",
        stage1ReviewedBy: authReq.user!.id,
        stage1ReviewedAt: new Date(),
        updatedAt: new Date(),
      };

      if (action === "reject") {
        updateData.stage1RejectionReason = rejectionReason;
      }

      const updated = await storage.updateSubmission(id, updateData as any);

      const smsMessage = action === "approve"
        ? buildStage1ApprovedMessage(submission.serviceOrder)
        : buildStage1RejectedMessage(submission.serviceOrder, rejectionReason || "");
      const smsType = action === "approve" ? "stage1_approved" : "stage1_rejected";
      await sendSms(submission.id, submission.phone, smsType, smsMessage);

      return res.status(200).json({ submission: updated });
    } catch (error) {
      console.error("Stage 1 review error:", error);
      return res.status(500).json({ error: "Failed to process review" });
    }
  });

  // ========================================================================
  // AGENT STATS ROUTE
  // ========================================================================

  app.get("/api/agent/stats", authenticateToken, requireRole("vrs_agent"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user!.id;

      const queueCount = await storage.getAgentQueueCount(userId);
      const completedToday = await storage.getCompletedTodayCount(userId);
      const stage2Count = await storage.getStage2QueueCount(userId);

      return res.status(200).json({ queueCount, completedToday, stage2Count });
    } catch (error) {
      console.error("Agent stats error:", error);
      return res.status(500).json({ error: "Failed to get agent stats" });
    }
  });

  // ========================================================================
  // STAGE 2 REVIEW ROUTES
  // ========================================================================

  const stage2ActionSchema = z.object({
    authCode: z.string().min(1, "Authorization code is required"),
  });

  app.patch("/api/submissions/:id/stage2", authenticateToken, requireRole("vrs_agent"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid submission ID" });
      }

      const parsed = stage2ActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const submission = await storage.getSubmission(id);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (submission.assignedTo !== authReq.user!.id) {
        return res.status(403).json({ error: "Not assigned to you" });
      }

      if (submission.stage1Status !== "approved") {
        return res.status(400).json({ error: "Submission not approved at Stage 1" });
      }

      if (submission.stage2Status !== "pending") {
        return res.status(400).json({ error: "Stage 2 already processed" });
      }

      const { authCode } = parsed.data;

      const todayStr = new Date().toISOString().slice(0, 10);
      let todayRgcCode = null as Awaited<ReturnType<typeof storage.getDailyRgcCode>> | null;
      if (submission.warrantyType === "sears_protect") {
        todayRgcCode = await storage.getDailyRgcCode(todayStr) || null;
        if (!todayRgcCode) {
          return res.status(400).json({ error: "No RGC code has been set for today. Please contact an administrator." });
        }
      }

      const rgcCode = todayRgcCode?.code || null;

      const updated = await storage.updateSubmission(id, {
        authCode,
        rgcCode,
        stage2Status: "approved",
        stage2ReviewedBy: authReq.user!.id,
        stage2ReviewedAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const rgcCodeForSms = submission.warrantyType === "sears_protect" ? (todayRgcCode?.code || null) : null;
      const smsMessage = buildAuthCodeMessage(submission.serviceOrder, authCode, rgcCodeForSms);
      await sendSms(submission.id, submission.phone, "auth_code_sent", smsMessage);

      return res.status(200).json({ submission: updated });
    } catch (error) {
      console.error("Stage 2 review error:", error);
      return res.status(500).json({ error: "Failed to process Stage 2 review" });
    }
  });

  // ========================================================================
  // WARRANTY PROVIDER COUNTS
  // ========================================================================

  app.get("/api/agent/warranty-counts", authenticateToken, requireRole("vrs_agent"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const assignedTo = req.query.allQueue === "true" ? undefined : authReq.user!.id;
      const counts = await storage.getWarrantyProviderCounts(assignedTo);
      return res.status(200).json({ counts });
    } catch (error) {
      console.error("Warranty counts error:", error);
      return res.status(500).json({ error: "Failed to get warranty counts" });
    }
  });

  // ========================================================================
  // ADMIN RGC CODE ROUTES
  // ========================================================================

  const rgcCodeSchema = z.object({
    code: z.string().regex(/^\d{5}$/, "Must be exactly 5 digits"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  });

  app.post("/api/admin/rgc-code", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const parsed = rgcCodeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const fullCode = `RGC${parsed.data.code}`;
      const result = await storage.upsertDailyRgcCode({
        code: fullCode,
        validDate: parsed.data.date,
        createdBy: authReq.user!.id,
      });

      return res.status(200).json({ rgcCode: result });
    } catch (error) {
      console.error("Admin set RGC code error:", error);
      return res.status(500).json({ error: "Failed to set RGC code" });
    }
  });

  app.get("/api/admin/rgc-code", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
      const rgcCode = await storage.getDailyRgcCode(date);

      if (rgcCode) {
        const user = rgcCode.createdBy ? await storage.getUser(rgcCode.createdBy) : null;
        return res.status(200).json({ rgcCode, createdByName: user?.name });
      }

      return res.status(200).json({ rgcCode: null });
    } catch (error) {
      console.error("Admin get RGC code error:", error);
      return res.status(500).json({ error: "Failed to get RGC code" });
    }
  });

  // ========================================================================
  // AGENT RGC ROUTES
  // ========================================================================

  const verifyRgcSchema = z.object({
    code: z.string().regex(/^\d{5}$/, "Must be exactly 5 digits"),
  });

  app.post("/api/agent/verify-rgc", authenticateToken, requireRole("vrs_agent"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const parsed = verifyRgcSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const fullCode = "RGC" + parsed.data.code;
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayCode = await storage.getDailyRgcCode(todayStr);

      if (!todayCode) {
        return res.status(400).json({ error: "No RGC code has been set for today. Please contact an administrator." });
      }

      if (todayCode.code !== fullCode) {
        return res.status(400).json({ error: "Code does not match today's RGC. Please verify with your admin." });
      }

      await storage.updateUser(authReq.user!.id, { lastRgcCodeEntry: todayStr } as any);
      return res.status(200).json({ success: true, code: todayCode.code });
    } catch (error) {
      console.error("Verify RGC error:", error);
      return res.status(500).json({ error: "Failed to verify RGC code" });
    }
  });

  app.get("/api/agent/rgc-status", authenticateToken, requireRole("vrs_agent"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = await storage.getUser(authReq.user!.id);
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayCode = await storage.getDailyRgcCode(todayStr);

      if (!todayCode) {
        return res.status(200).json({ needsEntry: false, missingCode: true, code: null });
      }

      if ((user as any)?.lastRgcCodeEntry !== todayStr) {
        return res.status(200).json({ needsEntry: true, missingCode: false, code: null });
      }

      return res.status(200).json({ needsEntry: false, missingCode: false, code: todayCode.code });
    } catch (error) {
      console.error("RGC status error:", error);
      return res.status(500).json({ error: "Failed to get RGC status" });
    }
  });

  // ========================================================================
  // ADMIN ROUTES
  // ========================================================================

  app.post("/api/admin/users", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      const { email, password, name, role, phone, racId } = parsed.data;

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: "Email already exists" });
      }

      const hashedPassword = await bcryptjs.hash(password, 10);
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        name,
        role,
        phone: phone || null,
        racId: racId || null,
      });

      return res.status(201).json({ user: sanitizeUser(user) });
    } catch (error) {
      console.error("Admin create user error:", error);
      return res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.get("/api/admin/users", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const users = await storage.getUsers();
      const sanitizedUsers = users.map(sanitizeUser);
      return res.status(200).json({ users: sanitizedUsers });
    } catch (error) {
      console.error("Admin get users error:", error);
      return res.status(500).json({ error: "Failed to get users" });
    }
  });

  const updateUserSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    racId: z.string().optional(),
    role: z.enum(["technician", "vrs_agent", "admin"]).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(6).optional(),
  });

  app.patch("/api/admin/users/:id", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const updateData: Record<string, unknown> = {};
      
      if (parsed.data.name !== undefined) {
        updateData.name = parsed.data.name;
      }
      if (parsed.data.email !== undefined) {
        updateData.email = parsed.data.email;
      }
      if (parsed.data.phone !== undefined) {
        updateData.phone = parsed.data.phone;
      }
      if (parsed.data.racId !== undefined) {
        updateData.racId = parsed.data.racId;
      }
      if (parsed.data.role !== undefined) {
        updateData.role = parsed.data.role;
      }
      if (parsed.data.isActive !== undefined) {
        updateData.isActive = parsed.data.isActive;
      }
      if (parsed.data.password !== undefined) {
        const hashedPassword = await bcryptjs.hash(parsed.data.password, 10);
        updateData.password = hashedPassword;
      }

      const updatedUser = await storage.updateUser(id, updateData as any);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      return res.status(200).json({ user: sanitizeUser(updatedUser) });
    } catch (error) {
      console.error("Admin update user error:", error);
      return res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.get("/api/admin/users/:id/specializations", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const specializations = await storage.getSpecializations(id);
      return res.status(200).json({ specializations });
    } catch (error) {
      console.error("Admin get specializations error:", error);
      return res.status(500).json({ error: "Failed to get specializations" });
    }
  });

  const setSpecializationsSchema = z.object({
    divisions: z.array(z.enum(["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac"])),
  });

  app.patch("/api/admin/users/:id/specializations", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const parsed = setSpecializationsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      await storage.setSpecializations(id, parsed.data.divisions);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Admin set specializations error:", error);
      return res.status(500).json({ error: "Failed to set specializations" });
    }
  });

  app.get("/api/admin/analytics", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const analytics = await storage.getAnalytics();
      return res.status(200).json(analytics);
    } catch (error) {
      console.error("Admin analytics error:", error);
      return res.status(500).json({ error: "Failed to get analytics" });
    }
  });

  return httpServer;
}
