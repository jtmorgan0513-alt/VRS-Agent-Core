import type { Express } from "express";
import { createServer, type Server } from "http";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { storage } from "./storage";
import { authenticateToken, requireRole, type AuthenticatedRequest } from "./middleware/auth";
import type { User } from "@shared/schema";
import { seedDatabase } from "./seed";

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

  // ========================================================================
  // SUBMISSION ROUTES
  // ========================================================================

  const createSubmissionSchema = z.object({
    serviceOrder: z.string().min(1, "Service order is required"),
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
        assignedTo?: number;
        applianceType?: string;
      } = {};

      if (user.role === "technician") {
        filters.technicianId = user.id;
      } else if (user.role === "vrs_agent") {
        filters.assignedTo = user.id;
      }

      if (req.query.stage1Status) {
        filters.stage1Status = req.query.stage1Status as string;
      }
      if (req.query.applianceType) {
        filters.applianceType = req.query.applianceType as string;
      }

      const submissions = await storage.getSubmissions(filters);
      return res.status(200).json({ submissions });
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

  return httpServer;
}
