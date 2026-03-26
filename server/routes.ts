import express, { type Express } from "express";
import { createServer, type Server } from "http";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { storage } from "./storage";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { authenticateToken, requireRole, type AuthenticatedRequest } from "./middleware/auth";
import type { User, Technician } from "@shared/schema";
import * as fs from "fs";
import * as path from "path";
import { createWriteStream, createReadStream } from "fs";
import { unlink } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { randomUUID } from "crypto";
import { pipeline } from "stream/promises";
import { fetchTechniciansFromSnowflake } from "./services/snowflake";
import { seedDatabase } from "./seed";
import { sendSms, sendSmsMessage, buildStage1RejectedMessage, buildStage1InvalidMessage, buildAuthCodeMessage, buildRejectAndCloseMessage } from "./sms";
import { enhanceDescription, checkRateLimit } from "./services/openai";
import { queryServiceOrder, sendFollowup } from "./services/shsai";
import { ObjectStorageService } from "./replit_integrations/object_storage/objectStorage";
import { broadcastToDivisionAgents, broadcastToAdmins, broadcastToAgent, updateClientStatus, updateClientDivisions, getWarrantyLabel, getDivisionLabel } from "./websocket";

const execFileAsync = promisify(execFile);

const JWT_SECRET = process.env.SESSION_SECRET!;

const registerSchema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(["technician", "vrs_agent", "admin", "super_admin"]),
  phone: z.string().optional(),
  racId: z.string().regex(/^[a-zA-Z]+[a-zA-Z0-9]*$/, "LDAP ID must be letters and numbers only (e.g., MTHOMA2)").optional().or(z.literal("")),
});

const loginSchema = z.object({
  identifier: z.string().min(1),
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

const ALL_DIVISIONS = ["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "all_other"];

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

      if (racId) {
        const existingByRacId = await storage.getUserByRacId(racId);
        if (existingByRacId) {
          return res.status(409).json({ error: "LDAP ID already exists" });
        }
      }

      const hashedPassword = await bcryptjs.hash(password, 10);
      const user = await storage.createUser({
        email: email || null,
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
      const { identifier, password } = parsed.data;

      let user = await storage.getUserByRacId(identifier);
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

  // ========================================================================
  // FORGOT / RESET PASSWORD (PUBLIC - no auth required)
  // ========================================================================

  const forgotPasswordSchema = z.object({
    identifier: z.string().min(1),
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const genericMessage = "If your LDAP ID is on file and has a phone number, you will receive a reset code via SMS.";

      const user = await storage.getUserByRacId(parsed.data.identifier);
      if (!user || !user.phone) {
        return res.status(200).json({ message: genericMessage });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedCode = await bcryptjs.hash(code, 10);
      const expires = new Date(Date.now() + 15 * 60 * 1000);

      await storage.updateUser(user.id, {
        passwordResetToken: hashedCode,
        passwordResetExpires: expires,
      } as any);

      const smsBody = `VRS Password Reset - Your reset code is: ${code}. This code expires in 15 minutes.`;
      try {
        await sendSmsMessage(user.phone, smsBody);
      } catch (smsErr: any) {
        console.error("Forgot password SMS error:", smsErr.message);
      }

      return res.status(200).json({ message: genericMessage });
    } catch (error) {
      console.error("Forgot password error:", error);
      return res.status(500).json({ error: "An error occurred" });
    }
  });

  const resetPasswordSchema = z.object({
    identifier: z.string().min(1),
    code: z.string().min(1),
    newPassword: z.string().min(8).regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/,
      "Password must contain at least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character (!@#$%^&*)"
    ),
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const user = await storage.getUserByRacId(parsed.data.identifier);
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset code" });
      }

      if (!user.passwordResetToken || !user.passwordResetExpires) {
        return res.status(400).json({ error: "Invalid or expired reset code" });
      }

      if (new Date() > new Date(user.passwordResetExpires)) {
        return res.status(400).json({ error: "Invalid or expired reset code" });
      }

      const codeMatch = await bcryptjs.compare(parsed.data.code, user.passwordResetToken);
      if (!codeMatch) {
        return res.status(400).json({ error: "Invalid or expired reset code" });
      }

      const hashedPassword = await bcryptjs.hash(parsed.data.newPassword, 10);
      await storage.updateUser(user.id, {
        password: hashedPassword,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        passwordResetToken: null,
        passwordResetExpires: null,
      } as any);

      return res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      return res.status(500).json({ error: "An error occurred" });
    }
  });

  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/,
      "Password must contain at least 8 characters, 1 uppercase, 1 lowercase, 1 number, and 1 special character (!@#$%^&*)"
    ),
  });

  app.post("/api/auth/change-password", authenticateToken, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const user = await storage.getUser(authReq.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const passwordMatch = await bcryptjs.compare(parsed.data.currentPassword, user.password);
      if (!passwordMatch) {
        return res.status(400).json({ error: "Current password is incorrect" });
      }

      const hashedPassword = await bcryptjs.hash(parsed.data.newPassword, 10);
      const updated = await storage.updateUser(user.id, {
        password: hashedPassword,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      } as any);

      if (!updated) {
        return res.status(500).json({ error: "Failed to update password" });
      }

      return res.status(200).json({ user: sanitizeUser(updated) });
    } catch (error) {
      console.error("Change password error:", error);
      return res.status(500).json({ error: "Failed to change password" });
    }
  });

  const techLoginSchema = z.object({
    ldapId: z.string().min(1, "LDAP ID is required").regex(/^[a-z][a-z0-9]*$/i, "Invalid LDAP ID format"),
  });

  app.post("/api/auth/tech-login", async (req, res) => {
    try {
      const parsed = techLoginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const ldapId = parsed.data.ldapId.toLowerCase().trim();
      const technician = await storage.getTechnicianByLdapId(ldapId);

      if (!technician) {
        return res.status(404).json({ error: "ID not found. Please contact your manager." });
      }

      if (!technician.isActive) {
        return res.status(403).json({ error: "Account is inactive. Please contact your manager." });
      }

      const techUser = await storage.getOrCreateTechUser(
        technician.ldapId,
        technician.name || ldapId,
        technician.phone || ""
      );

      const token = jwt.sign(
        {
          id: techUser.id,
          email: techUser.email,
          name: technician.name || ldapId,
          role: "technician",
          ldapId: technician.ldapId,
          isTechnician: true,
        },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      const safeUser = {
        id: techUser.id,
        email: techUser.email,
        name: technician.name || ldapId,
        role: "technician" as const,
        phone: technician.phone,
        racId: technician.ldapId,
        isActive: technician.isActive,
        firstLogin: true,
        lastSeenVersion: null,
        lastRgcCodeEntry: null,
        createdAt: technician.createdAt,
        updatedAt: technician.updatedAt,
        district: technician.district,
        ldapId: technician.ldapId,
      };

      return res.status(200).json({ user: safeUser, token, technician });
    } catch (error) {
      console.error("Tech login error:", error);
      return res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        return res.status(401).json({ error: "No user found" });
      }

      if (authReq.user.isTechnician && authReq.user.ldapId) {
        const technician = await storage.getTechnicianByLdapId(authReq.user.ldapId);
        if (!technician || !technician.isActive) {
          return res.status(404).json({ error: "Technician not found or inactive" });
        }
        const safeUser = {
          id: authReq.user.id,
          email: null,
          name: technician.name || technician.ldapId,
          role: "technician",
          phone: technician.phone,
          racId: technician.ldapId,
          isActive: technician.isActive,
          firstLogin: true,
          lastSeenVersion: null,
          lastRgcCodeEntry: null,
          createdAt: technician.createdAt,
          updatedAt: technician.updatedAt,
          district: technician.district,
          ldapId: technician.ldapId,
        };
        return res.status(200).json({ user: safeUser });
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

  app.patch("/api/tech/update-phone", authenticateToken, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user?.isTechnician || !authReq.user?.ldapId) {
        return res.status(403).json({ error: "Only technicians can update phone" });
      }
      const schema = z.object({ phone: z.string().min(7, "Valid phone number required") });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      return res.status(200).json({ phone: parsed.data.phone });
    } catch (error) {
      console.error("Tech update phone error:", error);
      return res.status(500).json({ error: "Failed to update phone" });
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
  // AI ENHANCEMENT ROUTES
  // ========================================================================

  app.post("/api/ai/enhance-description", authenticateToken, requireRole("technician"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const schema = z.object({
        description: z.string().min(20, "Description must be at least 20 characters").max(2000),
        applianceType: z.string().min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      if (!checkRateLimit(authReq.user!.id)) {
        return res.status(429).json({ error: "Rate limit exceeded. You can use AI enhancement 5 times per hour." });
      }

      const enhanced = await enhanceDescription(parsed.data.description, parsed.data.applianceType);
      return res.status(200).json({ enhanced, original: parsed.data.description });
    } catch (error: any) {
      console.error("AI enhance error:", error);
      return res.status(500).json({ error: "AI enhancement unavailable. You can still submit your original description." });
    }
  });

  // ========================================================================
  // SUBMISSION ROUTES
  // ========================================================================

  const createSubmissionSchema = z.object({
    serviceOrder: z.string().regex(/^\d{4}-\d{8}$/, "Service order must be in format DDDD-SSSSSSSS (e.g., 8175-12345678)"),
    applianceType: z.enum(["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "all_other"]),
    requestType: z.enum(["authorization", "infestation_non_accessible"]),
    warrantyType: z.enum(["sears_protect"]).default("sears_protect"),
    warrantyProvider: z.string().optional(),
    issueDescription: z.string().min(1, "Issue description is required").max(2000, "Description must be 2000 characters or less"),
    originalDescription: z.string().optional(),
    aiEnhanced: z.boolean().optional(),
    estimateAmount: z.string().optional(),
    photos: z.string().optional(),
    videoUrl: z.string().optional(),
    voiceNoteUrl: z.string().optional(),
    phone: z.string().min(1, "Phone number is required"),
    appealNotes: z.string().optional(),
    resubmissionOf: z.number().optional(),
  });

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

      const isClosed = await storage.hasRejectedClosedForServiceOrder(parsed.data.serviceOrder);
      if (isClosed) {
        return res.status(400).json({ error: "This service order has been permanently closed and cannot accept new submissions. The repair was determined to not be covered under warranty. Please offer the customer a cash call estimate instead." });
      }

      if (!parsed.data.resubmissionOf) {
        const activeCheck = await storage.hasActiveSubmissionForServiceOrder(parsed.data.serviceOrder, user.id);
        if (activeCheck.exists) {
          const statusLabels: Record<string, string> = {
            queued: "in the queue waiting for an agent",
            pending: "currently being reviewed by an agent",
            completed: "already approved",
          };
          const statusMsg = statusLabels[activeCheck.status || ""] || "already active";
          return res.status(409).json({ error: `You already have a submission for SO# ${parsed.data.serviceOrder} that is ${statusMsg}. Duplicate submissions are not allowed.` });
        }
      }

      if (parsed.data.resubmissionOf) {
        const originalSub = await storage.getSubmission(parsed.data.resubmissionOf);
        if (!originalSub) {
          return res.status(400).json({ error: "Original submission not found" });
        }
        if (originalSub.technicianId !== user.id) {
          return res.status(403).json({ error: "You can only resubmit your own tickets" });
        }
        if (originalSub.serviceOrder !== parsed.data.serviceOrder) {
          return res.status(400).json({ error: "Service order must match the original submission" });
        }
        if (originalSub.ticketStatus === "invalid" || originalSub.stage1Status === "invalid") {
          return res.status(400).json({ error: "Invalid submissions cannot be resubmitted" });
        }
        if (originalSub.ticketStatus === "rejected_closed") {
          return res.status(400).json({ error: "This submission has been permanently closed and cannot be resubmitted. The repair was determined to not be covered under warranty." });
        }
        const MAX_RESUBMISSIONS = 3;
        let rootId = parsed.data.resubmissionOf;
        if (originalSub.resubmissionOf) {
          rootId = originalSub.resubmissionOf;
        }
        const chain = await storage.getResubmissionChain(rootId);
        const validResubmissions = chain.filter(s => s.ticketStatus !== "invalid" && s.stage1Status !== "invalid");
        if (validResubmissions.length >= MAX_RESUBMISSIONS) {
          return res.status(400).json({ error: `Maximum ${MAX_RESUBMISSIONS} resubmissions reached. Please call VRS directly for assistance.` });
        }
      }

      let originalAgent: number | null = null;
      if (parsed.data.resubmissionOf) {
        const origSub = await storage.getSubmission(parsed.data.resubmissionOf);
        if (origSub) {
          originalAgent = origSub.reviewedBy || origSub.stage1ReviewedBy || null;
          if (originalAgent) {
            const agentUser = await storage.getUser(originalAgent);
            if (!agentUser || agentUser.role === "technician" || !agentUser.isActive) {
              originalAgent = null;
            } else if (agentUser.agentStatus === "offline") {
              console.log(`[resubmission] Original agent ${agentUser.ldapId} (id=${originalAgent}) is offline — routing to queue instead`);
              originalAgent = null;
            }
          }
        }
      }


      const submission = await storage.createSubmission({
        technicianId: user.id,
        racId: user.racId || "",
        technicianLdapId: authReq.user?.ldapId || null,
        phoneOverride: req.body.phoneOverride || null,
        phone: parsed.data.phone,
        serviceOrder: parsed.data.serviceOrder,
        districtCode: parsed.data.serviceOrder.split("-")[0],
        applianceType: parsed.data.applianceType,
        requestType: parsed.data.requestType,
        warrantyType: parsed.data.warrantyType,
        warrantyProvider: parsed.data.warrantyProvider || null,
        issueDescription: parsed.data.issueDescription,
        originalDescription: (parsed.data.aiEnhanced && parsed.data.originalDescription) ? parsed.data.originalDescription : null,
        aiEnhanced: (parsed.data.aiEnhanced && parsed.data.originalDescription) ? true : false,
        estimateAmount: parsed.data.estimateAmount || null,
        photos: parsed.data.photos || null,
        videoUrl: parsed.data.videoUrl || null,
        voiceNoteUrl: parsed.data.voiceNoteUrl || null,
        assignedTo: originalAgent,
        ticketStatus: originalAgent ? "pending" : "queued",
        statusChangedAt: new Date(),
        stage1Status: "pending",
        stage2Status: "pending",
        stage1ReviewedBy: null,
        stage1ReviewedAt: null,
        stage1RejectionReason: null,
        stage2ReviewedBy: null,
        stage2ReviewedAt: null,
        authCode: null,
        rgcCode: null,
        appealNotes: parsed.data.appealNotes || null,
        resubmissionOf: parsed.data.resubmissionOf || null,
      });

      if (originalAgent) {
        broadcastToAgent(originalAgent, {
          type: "resubmission_received",
          payload: {
            submissionId: submission.id,
            serviceOrder: submission.serviceOrder,
            applianceType: parsed.data.applianceType,
            applianceLabel: getDivisionLabel(parsed.data.applianceType),
            warrantyLabel: getWarrantyLabel(parsed.data.warrantyType),
            message: "A technician has resubmitted a ticket you previously reviewed.",
          },
        });

        const resubmitClaimMsg = `VRS Update for SO#${submission.serviceOrder}: Your resubmission has been received and has been assigned to the same VRS agent for review. Please stand by — you will receive a follow-up text with the result shortly.`;
        const resubmitSmsPhone = submission.phoneOverride || submission.phone;
        sendSms(submission.id, resubmitSmsPhone, "ticket_claimed", resubmitClaimMsg).catch(err => {
          console.error("Failed to send resubmission claim SMS:", err);
        });
      } else {
        broadcastToDivisionAgents(parsed.data.applianceType, {
          type: "new_ticket",
          payload: {
            submissionId: submission.id,
            serviceOrder: submission.serviceOrder,
            applianceType: parsed.data.applianceType,
            applianceLabel: getDivisionLabel(parsed.data.applianceType),
            warrantyLabel: getWarrantyLabel(parsed.data.warrantyType),
          },
        });
      }

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
        ticketStatus?: string;
        stage1Status?: string;
        stage2Status?: string;
        assignedTo?: number;
        applianceType?: string;
        requestType?: string;
        divisionFilter?: string[];
      } = {};

      if (user.role === "technician") {
        filters.technicianId = user.id;
      } else if (user.role === "vrs_agent") {
        const isCompletedToday = req.query.completedToday === "true";
        const ticketStatusFilter = req.query.ticketStatus as string | undefined;

        if (ticketStatusFilter === "queued" && !isCompletedToday) {
          const specs = await storage.getSpecializations(user.id);
          const divisions = specs.map(s => s.division);
          if (divisions.length === 0) {
            return res.status(200).json({ submissions: [] });
          }
          const isGeneralist = divisions.length >= ALL_DIVISIONS.length;
          if (!isGeneralist) {
            filters.divisionFilter = divisions;
          }
        } else if (ticketStatusFilter === "pending") {
          filters.assignedTo = user.id;
        } else if (isCompletedToday) {
          filters.assignedTo = user.id;
        } else {
          filters.assignedTo = user.id;
        }
      }

      if (req.query.ticketStatus) {
        filters.ticketStatus = req.query.ticketStatus as string;
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
      if (req.query.requestType) {
        filters.requestType = req.query.requestType as string;
      }

      const completedToday = req.query.completedToday === "true";

      if (user.role === "vrs_agent" || user.role === "admin" || user.role === "super_admin") {
        let result = await storage.getSubmissionsWithTechnician(filters, completedToday);

        const search = req.query.search as string | undefined;
        if (search && result.length > 0) {
          const searchTerm = search.toLowerCase();
          result = result.filter(sub => 
            sub.serviceOrder.toLowerCase().includes(searchTerm) ||
            sub.serviceOrder.replace(/^(\d{4})-/, '').includes(searchTerm) ||
            sub.racId.toLowerCase().includes(searchTerm)
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
          sub.serviceOrder.replace(/^(\d{4})-/, '').includes(searchTerm) ||
          sub.serviceOrder.toLowerCase().includes(searchTerm)
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
      if (user.role === "vrs_agent") {
        const isAssignedToAgent = submission.assignedTo === user.id;
        const isQueued = submission.ticketStatus === "queued";
        if (!isAssignedToAgent && !isQueued) {
          return res.status(403).json({ error: "Access denied" });
        }
        if (isQueued) {
          const specs = await storage.getSpecializations(user.id);
          const divisions = specs.map(s => s.division);
          const isGeneralist = divisions.length >= ALL_DIVISIONS.length;
          if (!isGeneralist && !divisions.includes(submission.applianceType)) {
            return res.status(403).json({ error: "Access denied" });
          }
        }
      }

      return res.status(200).json({ submission });
    } catch (error) {
      console.error("Get submission error:", error);
      return res.status(500).json({ error: "Failed to get submission" });
    }
  });

  // ========================================================================
  // SUBMISSION HISTORY (for message thread view)
  // ========================================================================

  app.get("/api/submissions/:id/history", authenticateToken, async (req, res) => {
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

      const allRelated = await storage.getSubmissionHistory(submission.serviceOrder);
      const rootId = submission.resubmissionOf || submission.id;
      const chain = allRelated.filter(s => s.id === rootId || s.resubmissionOf === rootId);
      chain.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());

      const reviewerIds = new Set<number>();
      chain.forEach(s => {
        if (s.stage1ReviewedBy) reviewerIds.add(s.stage1ReviewedBy);
        if (s.stage2ReviewedBy) reviewerIds.add(s.stage2ReviewedBy);
      });

      const reviewerNames: Record<number, string> = {};
      for (const rid of reviewerIds) {
        const u = await storage.getUser(rid);
        if (u) reviewerNames[rid] = u.name;
      }

      const techUser = await storage.getUser(submission.technicianId);
      const techName = techUser?.name || "Technician";

      const resubmissionCount = chain.filter(s => s.resubmissionOf != null && s.stage1Status !== "invalid").length;
      const maxResubmissions = 3;

      return res.status(200).json({
        history: chain,
        reviewerNames,
        technicianName: techName,
        resubmissionCount,
        maxResubmissions,
      });
    } catch (error) {
      console.error("Submission history error:", error);
      return res.status(500).json({ error: "Failed to get submission history" });
    }
  });

  // ========================================================================
  // ADMIN AUDIT TRAIL — Full timeline for a submission
  // ========================================================================

  app.get("/api/admin/submissions/:id/audit", authenticateToken, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid submission ID" });

      const submission = await storage.getSubmission(id);
      if (!submission) return res.status(404).json({ error: "Submission not found" });

      const smsLogs = await storage.getSmsNotifications(id);

      const userIds = new Set<number>();
      if (submission.technicianId) userIds.add(submission.technicianId);
      if (submission.assignedTo) userIds.add(submission.assignedTo);
      if (submission.reviewedBy) userIds.add(submission.reviewedBy);
      if (submission.stage1ReviewedBy) userIds.add(submission.stage1ReviewedBy);
      if (submission.stage2ReviewedBy) userIds.add(submission.stage2ReviewedBy);

      const userNames: Record<number, string> = {};
      for (const uid of userIds) {
        const u = await storage.getUser(uid);
        if (u) userNames[uid] = u.name;
      }

      function safeIso(val: any): string {
        if (!val) return new Date().toISOString();
        try {
          const d = val instanceof Date ? val : new Date(val);
          if (isNaN(d.getTime())) return new Date().toISOString();
          return d.toISOString();
        } catch { return new Date().toISOString(); }
      }

      const timeline: { timestamp: string; event: string; actor: string; detail?: string }[] = [];

      timeline.push({
        timestamp: safeIso(submission.createdAt),
        event: "Submitted",
        actor: userNames[submission.technicianId] || "Technician",
        detail: `SO# ${submission.serviceOrder} — ${submission.applianceType}`,
      });

      const claimSms = smsLogs.find(s => s.messageType === "ticket_claimed");
      if (claimSms) {
        const claimAgent = submission.assignedTo
          ? userNames[submission.assignedTo]
          : (submission.reviewedBy ? userNames[submission.reviewedBy] : null)
            || (submission.stage1ReviewedBy ? userNames[submission.stage1ReviewedBy] : null);
        timeline.push({
          timestamp: safeIso(claimSms.sentAt),
          event: "Claimed by Agent",
          actor: claimAgent || "Agent",
        });
      }

      if (submission.reassignmentNotes) {
        const reassignAgent = submission.assignedTo ? userNames[submission.assignedTo] : null;
        timeline.push({
          timestamp: safeIso(submission.updatedAt),
          event: "Reassigned",
          actor: "Admin",
          detail: `${submission.reassignmentNotes}${reassignAgent ? ` → ${reassignAgent}` : ""}`,
        });
      }

      if (submission.submissionApproved && submission.submissionApprovedAt) {
        timeline.push({
          timestamp: safeIso(submission.submissionApprovedAt),
          event: "Submission Approved",
          actor: userNames[submission.stage1ReviewedBy!] || userNames[submission.reviewedBy!] || "Agent",
          detail: "Submission reviewed and approved; pending authorization code",
        });
      }

      if (submission.ticketStatus === "completed" && submission.reviewedAt) {
        timeline.push({
          timestamp: safeIso(submission.reviewedAt),
          event: "Approved & Auth Code Issued",
          actor: userNames[submission.reviewedBy!] || userNames[submission.stage2ReviewedBy!] || "Agent",
          detail: submission.authCode ? `Auth Code: ${submission.authCode}` : undefined,
        });
      }

      if (submission.ticketStatus === "rejected" && submission.reviewedAt) {
        timeline.push({
          timestamp: safeIso(submission.reviewedAt),
          event: "Rejected",
          actor: userNames[submission.reviewedBy!] || userNames[submission.stage1ReviewedBy!] || "Agent",
          detail: submission.stage1RejectionReason || undefined,
        });
      }

      if (submission.ticketStatus === "rejected_closed" && submission.reviewedAt) {
        timeline.push({
          timestamp: safeIso(submission.reviewedAt),
          event: "Rejected & Closed",
          actor: userNames[submission.reviewedBy!] || userNames[submission.stage1ReviewedBy!] || "Agent",
          detail: submission.stage1RejectionReason || "Not covered under warranty",
        });
      }

      if (submission.ticketStatus === "invalid" && submission.reviewedAt) {
        timeline.push({
          timestamp: safeIso(submission.reviewedAt),
          event: "Marked Invalid",
          actor: userNames[submission.reviewedBy!] || userNames[submission.stage1ReviewedBy!] || "Agent",
          detail: submission.invalidReason || undefined,
        });
      }

      if (submission.statusChangedAt && submission.statusChangedAt !== submission.createdAt) {
        timeline.push({
          timestamp: safeIso(submission.statusChangedAt),
          event: `Status → ${submission.ticketStatus === "completed" ? "Approved" : submission.ticketStatus === "rejected" ? "Rejected" : submission.ticketStatus === "rejected_closed" ? "Closed" : submission.ticketStatus === "invalid" ? "Invalid" : submission.ticketStatus === "pending" ? "Pending" : submission.ticketStatus}`,
          actor: "System",
        });
      }

      smsLogs.forEach(sms => {
        const typeLabels: Record<string, string> = {
          ticket_claimed: "Claim SMS Sent",
          submission_approved: "Approval SMS Sent",
          ticket_approved: "Auth Code SMS Sent",
          ticket_rejected: "Rejection SMS Sent",
          ticket_rejected_closed: "Reject & Close SMS Sent",
          ticket_invalid: "Invalid SMS Sent",
          auth_code_sent: "Auth Code SMS Sent",
        };
        timeline.push({
          timestamp: safeIso(sms.sentAt),
          event: typeLabels[sms.messageType] || `SMS: ${sms.messageType}`,
          actor: "System",
          detail: `To: ${sms.recipientPhone}`,
        });
      });

      timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const deduped = timeline.filter((entry, i, arr) => {
        if (i === 0) return true;
        return !(entry.event === arr[i - 1].event && entry.timestamp === arr[i - 1].timestamp);
      });

      return res.status(200).json({
        submission,
        timeline: deduped,
        userNames,
        smsLogs,
      });
    } catch (error) {
      console.error("Admin audit trail error:", error);
      return res.status(500).json({ error: "Failed to get audit trail" });
    }
  });

  // ========================================================================
  // TICKET CLAIM ROUTE — Agent claims a queued ticket
  // ========================================================================

  app.patch("/api/submissions/:id/claim", authenticateToken, requireRole("vrs_agent", "admin"), async (req, res) => {
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

      if (submission.ticketStatus !== "queued") {
        return res.status(400).json({ error: "Ticket is no longer available — it may have been claimed by another agent" });
      }

      if (authReq.user!.role === "vrs_agent") {
        const specs = await storage.getSpecializations(authReq.user!.id);
        const divisions = specs.map(s => s.division);
        
        const isGeneralist = divisions.length >= ALL_DIVISIONS.length;
        if (!isGeneralist && !divisions.includes(submission.applianceType)) {
          return res.status(403).json({ error: "You don't have the division specialization for this ticket" });
        }
      }

      const updated = await storage.updateSubmission(id, {
        ticketStatus: "pending",
        statusChangedAt: new Date(),
        assignedTo: authReq.user!.id,
        updatedAt: new Date(),
      } as any);

      if (authReq.user!.role === "vrs_agent" && authReq.user!.agentStatus !== "working") {
        await storage.updateUser(authReq.user!.id, { agentStatus: "working", updatedAt: new Date() } as any);
        updateClientStatus(authReq.user!.id, "working");
        broadcastToAdmins({
          type: "agent_status_changed",
          payload: { userId: authReq.user!.id, name: authReq.user!.name, status: "working" },
        });
      }

      broadcastToDivisionAgents(submission.applianceType, {
        type: "ticket_claimed",
        payload: { submissionId: id },
      }, authReq.user!.id);

      const warrantyCompany = (submission.warrantyProvider || submission.warrantyType || "").toLowerCase();
      const isTwoStage = ["american home shield", "ahs", "first american"].some(w => warrantyCompany.includes(w));

      let claimSmsMessage: string;
      if (isTwoStage) {
        claimSmsMessage = `VRS Update for SO#${submission.serviceOrder}: Your submission has been received and a VRS agent is now reviewing it.\n\n1. Your photos and details will be reviewed. If anything is missing, you'll receive a text with details so you can quickly resubmit.\n2. If approved, VRS will obtain your authorization code and send it to you.\n\nPlease stand by — you will receive a follow-up text with the result shortly.`;
      } else {
        claimSmsMessage = `VRS Update for SO#${submission.serviceOrder}: Your submission has been received and a VRS agent is now reviewing it. Please stand by — you will receive a follow-up text with the result shortly.`;
      }

      const claimSmsPhone = submission.phoneOverride || submission.phone;
      sendSms(submission.id, claimSmsPhone, "ticket_claimed", claimSmsMessage).catch(err => {
        console.error("Failed to send claim SMS:", err);
      });

      return res.status(200).json({ submission: updated });
    } catch (error) {
      console.error("Claim ticket error:", error);
      return res.status(500).json({ error: "Failed to claim ticket" });
    }
  });

  // ========================================================================
  // UNIFIED TICKET PROCESS ROUTE — Approve / Reject / Invalid
  // ========================================================================

  const processActionSchema = z.object({
    action: z.enum(["approve", "reject", "reject_and_close", "invalid", "approve_submission"]),
    rejectionReasons: z.array(z.string()).optional(),
    rejectedMedia: z.object({
      photos: z.array(z.object({ url: z.string(), reason: z.string() })).optional(),
      video: z.object({ rejected: z.boolean(), reason: z.string().optional() }).optional(),
      voiceNote: z.object({ rejected: z.boolean(), reason: z.string().optional() }).optional(),
    }).optional(),
    agentNotes: z.string().optional(),
    technicianMessage: z.string().optional(),
    authCode: z.string().optional(),
    invalidReason: z.string().optional(),
    invalidInstructions: z.string().optional(),
  });

  app.patch("/api/submissions/:id/process", authenticateToken, requireRole("vrs_agent", "admin"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid submission ID" });
      }

      const parsed = processActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const submission = await storage.getSubmission(id);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (submission.ticketStatus !== "pending") {
        return res.status(400).json({ error: "Ticket must be in pending status to process" });
      }

      if (submission.assignedTo !== authReq.user!.id && authReq.user!.role !== "admin" && authReq.user!.role !== "super_admin") {
        return res.status(403).json({ error: "This ticket is not assigned to you" });
      }

      const { action, rejectionReasons, rejectedMedia, agentNotes, technicianMessage, invalidReason, invalidInstructions } = parsed.data;
      let { authCode } = parsed.data;

      if (submission.submissionApproved && (action === "reject" || action === "reject_and_close" || action === "invalid" || action === "approve_submission")) {
        return res.status(400).json({ error: "Submission has already been approved. Only authorization (approve) is allowed at this stage." });
      }

      if (action === "invalid" && !invalidReason) {
        return res.status(400).json({ error: "Invalid reason is required" });
      }

      const updateData: Record<string, unknown> = {
        reviewedBy: authReq.user!.id,
        reviewedAt: new Date(),
        agentNotes: agentNotes || null,
        updatedAt: new Date(),
      };

      let smsMessage: string;
      let smsType: string;

      if (action === "approve_submission") {
        updateData.submissionApproved = true;
        updateData.submissionApprovedAt = new Date();
        updateData.stage1Status = "approved";
        updateData.stage1ReviewedBy = authReq.user!.id;
        updateData.stage1ReviewedAt = new Date();

        smsMessage = `VRS Update for SO#${submission.serviceOrder}: Your submission has been reviewed and APPROVED. VRS is now working on obtaining your authorization code. Please stand by.`;
        smsType = "submission_approved";

        const updated = await storage.updateSubmission(id, updateData as any);
        const approveSmsPhone = submission.phoneOverride || submission.phone;
        await sendSms(submission.id, approveSmsPhone, smsType, smsMessage);

        return res.status(200).json({ submission: updated });
      }

      if (action === "approve") {
        const isNonPartsRequest = submission.requestType !== "authorization";
        let rgcCode: string | null = null;

        if (!isNonPartsRequest) {
          const warrantyCompany = (submission.warrantyProvider || submission.warrantyType || "").toLowerCase();
          const needsRgcOnly = ["sears_protect", "sears protect", "sears pa", "sears_pa", "legacy sears", "legacy_sears_cinch", "legacy sears / cinch", "cinch"].some(w => warrantyCompany.includes(w)) || submission.warrantyType === "sears_protect";
          const needsExternalAuth = ["american home shield", "ahs", "first american"].some(w => warrantyCompany.includes(w));

          const todayStr = new Date().toISOString().slice(0, 10);
          const todayRgcCode = await storage.getDailyRgcCode(todayStr);
          if (!todayRgcCode) {
            return res.status(400).json({ error: "No RGC code has been set for today. Please contact an administrator." });
          }
          rgcCode = todayRgcCode.code;

          if (needsExternalAuth) {
            if (!authCode || !authCode.trim()) {
              return res.status(400).json({ error: "External authorization code is required for this warranty provider" });
            }
          } else {
            authCode = rgcCode;
          }
        }

        updateData.ticketStatus = "completed";
        updateData.statusChangedAt = new Date();
        updateData.authCode = authCode || null;
        updateData.rgcCode = rgcCode;
        updateData.stage1Status = "approved";
        updateData.stage1ReviewedBy = authReq.user!.id;
        updateData.stage1ReviewedAt = new Date();
        updateData.stage2Status = "approved";
        updateData.stage2Outcome = "approved";
        updateData.stage2ReviewedBy = authReq.user!.id;
        updateData.stage2ReviewedAt = new Date();

        const authDisplay = authCode || rgcCode || "";
        smsMessage = buildAuthCodeMessage(submission.serviceOrder, authDisplay, rgcCode);
        smsType = "ticket_approved";

      } else if (action === "reject") {
        updateData.ticketStatus = "rejected";
        updateData.statusChangedAt = new Date();
        updateData.assignedTo = null;
        updateData.stage1Status = "rejected";
        updateData.stage1ReviewedBy = authReq.user!.id;
        updateData.stage1ReviewedAt = new Date();
        updateData.rejectionReasons = rejectionReasons ? JSON.stringify(rejectionReasons) : null;
        updateData.rejectedMedia = rejectedMedia ? JSON.stringify(rejectedMedia) : null;
        updateData.technicianMessage = technicianMessage || null;
        updateData.stage1RejectionReason = rejectionReasons?.join(", ") || "More information needed";

        const host = req.get("host") || "";
        const protocol = req.get("x-forwarded-proto") || req.protocol || "https";
        const resubmitLink = `${protocol}://${host}/tech/resubmit/${submission.id}`;

        const rejectionParts: string[] = [];
        if (rejectionReasons && rejectionReasons.length > 0) {
          rejectionParts.push(rejectionReasons.join(", "));
        }
        if (rejectedMedia) {
          const mediaIssues: string[] = [];
          if (rejectedMedia.photos && rejectedMedia.photos.length > 0) {
            mediaIssues.push(`${rejectedMedia.photos.length} photo(s) rejected`);
          }
          if (rejectedMedia.video?.rejected) {
            mediaIssues.push("Video rejected" + (rejectedMedia.video.reason ? `: ${rejectedMedia.video.reason}` : ""));
          }
          if (rejectedMedia.voiceNote?.rejected) {
            mediaIssues.push("Voice note rejected" + (rejectedMedia.voiceNote.reason ? `: ${rejectedMedia.voiceNote.reason}` : ""));
          }
          if (mediaIssues.length > 0) rejectionParts.push(mediaIssues.join("; "));
        }
        const reasonText = rejectionParts.length > 0 ? rejectionParts.join(". ") : "More information needed";
        const fullMessage = technicianMessage ? `${reasonText}\n\nAgent message: ${technicianMessage}` : reasonText;
        smsMessage = buildStage1RejectedMessage(submission.serviceOrder, fullMessage, resubmitLink);
        smsType = "ticket_rejected";

      } else if (action === "reject_and_close") {
        updateData.ticketStatus = "rejected_closed";
        updateData.statusChangedAt = new Date();
        updateData.assignedTo = null;
        updateData.stage1Status = "rejected";
        updateData.stage1ReviewedBy = authReq.user!.id;
        updateData.stage1ReviewedAt = new Date();
        updateData.stage2Status = "not_applicable";
        updateData.rejectionReasons = rejectionReasons ? JSON.stringify(rejectionReasons) : null;
        updateData.technicianMessage = technicianMessage || null;
        updateData.stage1RejectionReason = rejectionReasons?.join(", ") || "Not covered under warranty";

        const reasonText = rejectionReasons && rejectionReasons.length > 0
          ? rejectionReasons.join(", ")
          : "Not covered under warranty";
        const fullMsg = technicianMessage ? `${reasonText}\n\nAgent message: ${technicianMessage}` : reasonText;
        smsMessage = buildRejectAndCloseMessage(submission.serviceOrder, fullMsg);
        smsType = "ticket_rejected_closed";

      } else {
        updateData.ticketStatus = "invalid";
        updateData.statusChangedAt = new Date();
        updateData.stage1Status = "invalid";
        updateData.stage1ReviewedBy = authReq.user!.id;
        updateData.stage1ReviewedAt = new Date();
        updateData.stage2Status = "not_applicable";
        updateData.invalidReason = invalidReason;
        updateData.invalidInstructions = invalidInstructions || null;

        smsMessage = buildStage1InvalidMessage(submission.serviceOrder, invalidReason || "", invalidInstructions);
        smsType = "ticket_invalid";
      }

      const updated = await storage.updateSubmission(id, updateData as any);

      const reviewSmsPhone = submission.phoneOverride || submission.phone;
      await sendSms(submission.id, reviewSmsPhone, smsType, smsMessage);

      if (authReq.user!.role === "vrs_agent") {
        await storage.updateUser(authReq.user!.id, { agentStatus: "online", updatedAt: new Date() } as any);
        updateClientStatus(authReq.user!.id, "online");
        broadcastToAdmins({
          type: "agent_status_changed",
          payload: { userId: authReq.user!.id, name: authReq.user!.name, status: "online" },
        });
      }

      if (action === "reject") {
        broadcastToDivisionAgents(submission.applianceType, {
          type: "ticket_queued",
          payload: {
            submissionId: id,
            serviceOrder: submission.serviceOrder,
            applianceType: submission.applianceType,
            applianceLabel: getDivisionLabel(submission.applianceType),
            warrantyLabel: getWarrantyLabel(submission.warrantyType),
          },
        });
      }

      return res.status(200).json({ submission: updated });
    } catch (error) {
      console.error("Process ticket error:", error);
      return res.status(500).json({ error: "Failed to process ticket" });
    }
  });

  // ========================================================================
  // AGENT STATS ROUTE
  // ========================================================================

  app.get("/api/agent/stats", authenticateToken, requireRole("vrs_agent", "admin"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userRole = authReq.user!.role;

      if (userRole === "vrs_agent") {
        const specs = await storage.getSpecializations(authReq.user!.id);
        const divisions = specs.map(s => s.division);
        const queueCount = await storage.getQueuedCount(divisions);
        const pendingCount = await storage.getPendingCount(authReq.user!.id);
        const completedToday = await storage.getCompletedTodayCount(authReq.user!.id);
        return res.status(200).json({ queueCount, pendingCount, completedToday });
      }

      
      const queueCount = await storage.getQueuedCount(ALL_DIVISIONS);
      const completedToday = await storage.getCompletedTodayCount();

      return res.status(200).json({ queueCount, pendingCount: 0, completedToday });
    } catch (error) {
      console.error("Agent stats error:", error);
      return res.status(500).json({ error: "Failed to get agent stats" });
    }
  });

  // ========================================================================
  // AGENT STATUS ROUTES
  // ========================================================================

  app.patch("/api/agent/status", authenticateToken, requireRole("vrs_agent", "admin", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const statusSchema = z.object({ status: z.enum(["online", "offline"]) });
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Status must be 'online' or 'offline'" });
      }

      if (parsed.data.status === "offline") {
        const pendingCount = await storage.getPendingCount(authReq.user!.id);
        if (pendingCount > 0) {
          return res.status(400).json({ error: "You have an open ticket. Complete it or ask an admin to reassign it before going unavailable.", hasPendingTicket: true });
        }
      }

      const updated = await storage.updateUser(authReq.user!.id, { agentStatus: parsed.data.status, updatedAt: new Date() } as any);
      updateClientStatus(authReq.user!.id, parsed.data.status);
      broadcastToAdmins({
        type: "agent_status_changed",
        payload: { userId: authReq.user!.id, name: authReq.user!.name, status: parsed.data.status },
      });

      if (parsed.data.status === "online") {
        const specs = await storage.getSpecializations(authReq.user!.id);
        const divisions = specs.map(s => s.division);
        
        const isGeneralist = divisions.length >= ALL_DIVISIONS.length;

        const allSubmissions = await storage.getSubmissions({});
        const queuedTickets = (allSubmissions as any[]).filter((s: any) => {
          if (s.ticketStatus !== "queued") return false;
          if (isGeneralist) return true;
          return divisions.includes(s.applianceType);
        });

        if (queuedTickets.length > 0) {
          for (const ticket of queuedTickets) {
            broadcastToAgent(authReq.user!.id, {
              type: "pending_tickets",
              payload: {
                submissionId: ticket.id,
                serviceOrder: ticket.serviceOrder,
                applianceType: ticket.applianceType,
                applianceLabel: getDivisionLabel(ticket.applianceType),
                warrantyLabel: getWarrantyLabel(ticket.warrantyType),
              },
            });
          }
        }
      }

      return res.status(200).json({ agentStatus: updated?.agentStatus });
    } catch (error) {
      console.error("Agent status error:", error);
      return res.status(500).json({ error: "Failed to update status" });
    }
  });

  app.patch("/api/admin/users/:id/status", authenticateToken, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid user ID" });
      const statusSchema = z.object({ status: z.enum(["online", "working", "offline"]) });
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid status value" });
      }
      const user = await storage.getUser(id);
      if (!user || user.role !== "vrs_agent") {
        return res.status(400).json({ error: "User is not a VRS agent" });
      }
      const updated = await storage.updateUser(id, { agentStatus: parsed.data.status } as any);
      updateClientStatus(id, parsed.data.status);
      broadcastToAdmins({
        type: "agent_status_changed",
        payload: { userId: id, name: user.name, status: parsed.data.status },
      });
      return res.status(200).json({ agentStatus: updated?.agentStatus });
    } catch (error) {
      console.error("Admin set agent status error:", error);
      return res.status(500).json({ error: "Failed to update agent status" });
    }
  });

  app.get("/api/admin/agent-status", authenticateToken, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const agents = await storage.getAgentsWithStatus();
      return res.status(200).json({ agents });
    } catch (error) {
      console.error("Agent status list error:", error);
      return res.status(500).json({ error: "Failed to get agent status" });
    }
  });

  app.delete("/api/submissions/:id", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid submission ID" });

      const submission = await storage.getSubmission(id);
      if (!submission) return res.status(404).json({ message: "Submission not found" });

      const deleted = await storage.deleteSubmission(id);
      if (!deleted) return res.status(500).json({ message: "Failed to delete submission" });

      res.json({ message: "Submission deleted" });
    } catch (error) {
      console.error("Delete submission error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/submissions/:id/reassign", authenticateToken, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid submission ID" });
      }

      const bodySchema = z.object({
        agentId: z.number().optional(),
        notes: z.string().optional(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const submission = await storage.getSubmission(id);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (submission.ticketStatus !== "pending" && submission.ticketStatus !== "queued") {
        return res.status(400).json({ error: "Can only reassign queued or pending tickets" });
      }

      if (parsed.data.agentId) {
        const agent = await storage.getUser(parsed.data.agentId);
        if (!agent || (agent.role !== "vrs_agent" && agent.role !== "admin" && agent.role !== "super_admin")) {
          return res.status(400).json({ error: "Invalid agent" });
        }
        if (!agent.isActive) {
          return res.status(400).json({ error: "Cannot assign to an inactive user" });
        }

        const updated = await storage.updateSubmission(id, {
          assignedTo: parsed.data.agentId,
          ticketStatus: "pending",
          statusChangedAt: new Date(),
          reassignmentNotes: parsed.data.notes || null,
          updatedAt: new Date(),
        } as any);

        broadcastToAgent(parsed.data.agentId, {
          type: "ticket_assigned",
          payload: {
            submissionId: updated.id,
            serviceOrder: updated.serviceOrder,
            message: `A ticket has been assigned to you by an admin.`,
          },
        });

        return res.status(200).json({ submission: updated });
      }

      const updated = await storage.updateSubmission(id, {
        ticketStatus: "queued",
        statusChangedAt: new Date(),
        assignedTo: null,
        reassignmentNotes: parsed.data.notes || null,
        updatedAt: new Date(),
      } as any);

      broadcastToDivisionAgents(updated.applianceType, {
        type: "ticket_queued",
        payload: {
          submissionId: updated.id,
          serviceOrder: updated.serviceOrder,
          applianceType: updated.applianceType,
          applianceLabel: getDivisionLabel(updated.applianceType),
          warrantyLabel: getWarrantyLabel(updated.warrantyType),
        },
      });

      return res.status(200).json({ submission: updated });
    } catch (error) {
      console.error("Reassign submission error:", error);
      return res.status(500).json({ error: "Failed to reassign submission" });
    }
  });

  // ========================================================================
  // DIVISION CORRECTION ROUTE — Agent corrects ticket's appliance type
  // ========================================================================

  app.patch("/api/submissions/:id/correct-division", authenticateToken, requireRole("vrs_agent", "admin", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid submission ID" });
      }

      const bodySchema = z.object({
        newDivision: z.enum(["refrigeration", "laundry", "cooking", "dishwasher", "microwave", "hvac", "all_other"]),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid division" });
      }

      const submission = await storage.getSubmission(id);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (submission.ticketStatus !== "pending") {
        return res.status(400).json({ error: "Can only correct division on pending tickets" });
      }

      if (authReq.user!.role === "vrs_agent" && submission.assignedTo !== authReq.user!.id) {
        return res.status(403).json({ error: "You can only correct division on your own tickets" });
      }

      const oldDivision = submission.applianceType;
      const newDivision = parsed.data.newDivision;

      if (oldDivision === newDivision) {
        return res.status(400).json({ error: "New division is the same as current" });
      }

      const DIVISION_LABELS: Record<string, string> = {
        refrigeration: "Refrigeration", laundry: "Laundry", cooking: "Cooking",
        dishwasher: "Dishwasher / Compactor", microwave: "Microwave", hvac: "HVAC", all_other: "All Other",
      };
      const correctionNote = `Division corrected from ${DIVISION_LABELS[oldDivision] || oldDivision} to ${DIVISION_LABELS[newDivision] || newDivision} by ${authReq.user!.name}`;

      const existingNotes = submission.agentNotes ? submission.agentNotes + "\n" + correctionNote : correctionNote;

      let agentHasNewDivision = false;
      if (authReq.user!.role === "vrs_agent") {
        const specs = await storage.getSpecializations(authReq.user!.id);
        const divisions = specs.map(s => s.division);
        
        const isGeneralist = divisions.length >= ALL_DIVISIONS.length;
        agentHasNewDivision = isGeneralist || divisions.includes(newDivision);
      } else {
        agentHasNewDivision = true;
      }

      if (agentHasNewDivision) {
        const updated = await storage.updateSubmission(id, {
          applianceType: newDivision,
          agentNotes: existingNotes,
          updatedAt: new Date(),
        } as any);
        return res.status(200).json({ submission: updated, agentKeepsTicket: true });
      } else {
        const updated = await storage.updateSubmission(id, {
          applianceType: newDivision,
          ticketStatus: "queued",
          statusChangedAt: new Date(),
          assignedTo: null,
          agentNotes: existingNotes,
          updatedAt: new Date(),
        } as any);

        await storage.updateUser(authReq.user!.id, { agentStatus: "online", updatedAt: new Date() } as any);
        updateClientStatus(authReq.user!.id, "online");

        broadcastToAdmins({
          type: "agent_status_changed",
          payload: { userId: authReq.user!.id, name: authReq.user!.name, status: "online" },
        });

        broadcastToDivisionAgents(newDivision, {
          type: "ticket_queued",
          payload: {
            submissionId: id,
            serviceOrder: submission.serviceOrder,
            applianceType: newDivision,
            applianceLabel: getDivisionLabel(newDivision),
            warrantyLabel: getWarrantyLabel(submission.warrantyType),
          },
        });

        return res.status(200).json({ submission: updated, agentKeepsTicket: false });
      }
    } catch (error) {
      console.error("Correct division error:", error);
      return res.status(500).json({ error: "Failed to correct division" });
    }
  });

  // ========================================================================
  // WARRANTY PROVIDER COUNTS
  // ========================================================================

  app.get("/api/agent/warranty-counts", authenticateToken, requireRole("vrs_agent", "admin"), async (req, res) => {
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

  app.post("/api/agent/verify-rgc", authenticateToken, requireRole("vrs_agent", "admin"), async (req, res) => {
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

  app.get("/api/agent/rgc-status", authenticateToken, requireRole("vrs_agent", "admin"), async (req, res) => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayCode = await storage.getDailyRgcCode(todayStr);

      if (!todayCode) {
        return res.status(200).json({ needsEntry: false, missingCode: true, code: null });
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

      if (racId) {
        const existingByRacId = await storage.getUserByRacId(racId);
        if (existingByRacId) {
          return res.status(409).json({ error: "LDAP ID already exists" });
        }
      }

      const hashedPassword = await bcryptjs.hash(password, 10);
      const user = await storage.createUser({
        email: email || null,
        password: hashedPassword,
        name,
        role,
        phone: phone || null,
        racId: racId || null,
      });

      if (role === "admin" || role === "super_admin") {
        await storage.setSpecializations(user.id, ALL_DIVISIONS);
      }

      return res.status(201).json({ user: sanitizeUser(user) });
    } catch (error) {
      console.error("Admin create user error:", error);
      return res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.get("/api/admin/users", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const users = await storage.getUsers();
      const sanitizedUsers = users.map(sanitizeUser).filter(u => !u.isSystemAccount);
      return res.status(200).json({ users: sanitizedUsers });
    } catch (error) {
      console.error("Admin get users error:", error);
      return res.status(500).json({ error: "Failed to get users" });
    }
  });

  const updateUserSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional().nullable(),
    phone: z.string().optional().nullable(),
    racId: z.string().regex(/^[a-zA-Z]+[a-zA-Z0-9]*$/, "LDAP ID must be letters and numbers only (e.g., MTHOMA2)").optional().nullable().or(z.literal("")),
    role: z.enum(["technician", "vrs_agent", "admin", "super_admin"]).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(6).optional(),
    resetPassword: z.boolean().optional(),
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

      if (user.isSystemAccount) {
        const authReq = req as AuthenticatedRequest;
        if (!authReq.user || authReq.user.role !== "super_admin") {
          return res.status(403).json({ error: "System accounts cannot be modified" });
        }
        if (parsed.data.role !== undefined || parsed.data.isActive === false) {
          return res.status(403).json({ error: "Cannot change role or deactivate system accounts" });
        }
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
      if (parsed.data.resetPassword === true) {
        const authReq = req as AuthenticatedRequest;
        if (authReq.user?.role === "admin" && user.role !== "vrs_agent" && user.role !== "technician") {
          return res.status(403).json({ error: "Admins can only reset passwords for agents and technicians" });
        }
        const hashedPassword = await bcryptjs.hash("VRS2026!", 10);
        updateData.password = hashedPassword;
        updateData.mustChangePassword = true;
        updateData.passwordChangedAt = null;
      }

      const updatedUser = await storage.updateUser(id, updateData as any);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (parsed.data.role && (parsed.data.role === "admin" || parsed.data.role === "super_admin")) {
        await storage.setSpecializations(id, ALL_DIVISIONS);
      }

      return res.status(200).json({ user: sanitizeUser(updatedUser) });
    } catch (error) {
      console.error("Admin update user error:", error);
      return res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:id", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }

      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.isSystemAccount) {
        return res.status(403).json({ error: "System accounts cannot be deleted" });
      }

      if (authReq.user?.role === "admin" && user.role !== "vrs_agent" && user.role !== "technician") {
        return res.status(403).json({ error: "Admins can only delete agents and technicians" });
      }

      await storage.deleteUser(id);
      return res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Admin delete user error:", error);
      return res.status(500).json({ error: "Failed to delete user" });
    }
  });

  app.get("/api/agent/specializations", authenticateToken, requireRole("vrs_agent", "admin", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (authReq.user!.role === "admin" || authReq.user!.role === "super_admin") {
        return res.status(200).json({ divisions: ALL_DIVISIONS });
      }
      const specializations = await storage.getSpecializations(authReq.user!.id);
      const divisions = specializations.map(s => s.division);
      return res.status(200).json({ divisions });
    } catch (error) {
      console.error("Agent get own specializations error:", error);
      return res.status(500).json({ error: "Failed to get specializations" });
    }
  });

  app.patch("/api/agent/specializations", authenticateToken, requireRole("vrs_agent"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const parsed = setSpecializationsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }
      if (parsed.data.divisions.length === 0) {
        return res.status(400).json({ error: "You must select at least one division" });
      }
      await storage.setSpecializations(authReq.user!.id, parsed.data.divisions);
      updateClientDivisions(authReq.user!.id, parsed.data.divisions);
      return res.status(200).json({ success: true, divisions: parsed.data.divisions });
    } catch (error) {
      console.error("Agent set own specializations error:", error);
      return res.status(500).json({ error: "Failed to set specializations" });
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
    divisions: z.array(z.enum(["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "all_other"])),
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
      updateClientDivisions(id, parsed.data.divisions);
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

  app.get("/api/admin/analytics/resubmissions", authenticateToken, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const stats = await storage.getResubmissionStats();
      return res.status(200).json(stats);
    } catch (error) {
      console.error("Resubmission stats error:", error);
      return res.status(500).json({ error: "Failed to get resubmission stats" });
    }
  });

  app.get("/api/admin/analytics/districts", authenticateToken, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const rollup = await storage.getDistrictRollup();
      return res.status(200).json(rollup);
    } catch (error) {
      console.error("District rollup error:", error);
      return res.status(500).json({ error: "Failed to get district rollup" });
    }
  });

  // ========================================================================
  // CSV EXPORT ROUTE (Admin)
  // ========================================================================

  app.get("/api/admin/export-csv", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const range = (req.query.range as string) || "all";
      const customStart = req.query.startDate as string | undefined;
      const customEnd = req.query.endDate as string | undefined;
      const techLdap = req.query.techLdap as string | undefined;
      const now = new Date();
      let startDate: Date | null = null;
      let endDate: Date | null = null;

      if (customStart) {
        startDate = new Date(customStart);
        if (customEnd) {
          const end = new Date(customEnd);
          end.setHours(23, 59, 59, 999);
          endDate = end;
        }
      } else if (range === "today") {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (range === "week") {
        const day = now.getDay();
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      } else if (range === "month") {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      const allSubmissions = await storage.getAllSubmissions(startDate, endDate, techLdap || null);

      const userCache: Record<number, string> = {};
      const getUserName = async (userId: number | null): Promise<string> => {
        if (!userId) return "";
        if (userCache[userId]) return userCache[userId];
        const u = await storage.getUser(userId);
        userCache[userId] = u?.name || "";
        return userCache[userId];
      };

      const headers = [
        "ID", "Service Order", "Technician LDAP", "Technician Name", "Phone",
        "District", "Appliance Type", "Request Type", "Warranty Type", "Warranty Provider",
        "Issue Description", "Estimate Amount",
        "Ticket Status", "Reviewed By", "Reviewed At", "Rejection Reasons",
        "Auth Code", "RGC Code", "Assigned To",
        "Created At", "Updated At"
      ];

      const escCsv = (val: any): string => {
        if (val === null || val === undefined) return "";
        let str = String(val);
        if (/^[=+\-@\t\r]/.test(str)) {
          str = "'" + str;
        }
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows: string[] = [headers.join(",")];

      for (const s of allSubmissions) {
        const techName = await getUserName(s.technicianId);
        const reviewerName = await getUserName(s.reviewedBy);
        const assignedName = await getUserName(s.assignedTo);

        let rejReasons = "";
        if (s.rejectionReasons) {
          try { rejReasons = JSON.parse(s.rejectionReasons).join("; "); } catch { rejReasons = s.rejectionReasons; }
        }

        rows.push([
          s.id,
          escCsv(s.serviceOrder),
          escCsv(s.technicianLdapId || s.racId),
          escCsv(techName),
          escCsv(s.phone),
          escCsv(s.districtCode),
          escCsv(s.applianceType),
          escCsv(s.requestType),
          escCsv(s.warrantyType),
          escCsv(s.warrantyProvider),
          escCsv(s.issueDescription),
          escCsv(s.estimateAmount),
          escCsv(s.ticketStatus),
          escCsv(reviewerName),
          s.reviewedAt ? new Date(s.reviewedAt).toISOString() : "",
          escCsv(rejReasons),
          escCsv(s.authCode),
          escCsv(s.rgcCode),
          escCsv(assignedName),
          s.createdAt ? new Date(s.createdAt).toISOString() : "",
          s.updatedAt ? new Date(s.updatedAt).toISOString() : "",
        ].join(","));
      }

      const csv = rows.join("\n");
      let rangeLabel = customStart ? `${customStart}${customEnd ? '_to_' + customEnd : ''}` : range === "today" ? "today" : range === "week" ? "this-week" : range === "month" ? "this-month" : "all-time";
      if (techLdap) rangeLabel += `-tech-${techLdap}`;
      const filename = `vrs-tickets-${rangeLabel}-${now.toISOString().slice(0, 10)}.csv`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    } catch (error) {
      console.error("CSV export error:", error);
      return res.status(500).json({ error: "Failed to export CSV" });
    }
  });

  // ========================================================================
  // TECHNICIAN SYNC ROUTES (Admin)
  // ========================================================================

  app.post("/api/admin/sync-technicians", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const snowflakeData = await fetchTechniciansFromSnowflake();

      let added = 0;
      let updated = 0;
      const syncedLdapIds: string[] = [];

      for (const tech of snowflakeData) {
        const existing = await storage.getTechnicianByLdapId(tech.ldapId);
        await storage.upsertTechnician({
          ldapId: tech.ldapId,
          name: tech.name,
          phone: tech.phone,
          district: tech.district,
          state: tech.state,
          managerName: tech.managerName,
          techUnNo: tech.techUnNo,
          isActive: true,
          lastSyncedAt: new Date(),
        });
        syncedLdapIds.push(tech.ldapId);
        if (existing) {
          updated++;
        } else {
          added++;
        }
      }

      const deactivated = await storage.deactivateTechniciansNotIn(syncedLdapIds);

      return res.status(200).json({
        synced: snowflakeData.length,
        added,
        updated,
        deactivated,
      });
    } catch (error: any) {
      console.error("Snowflake sync error:", error);
      return res.status(500).json({ error: `Sync failed: ${error.message || "Unknown error"}` });
    }
  });

  app.get("/api/admin/technician-metrics", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const info = await storage.getTechnicianSyncInfo();
      return res.status(200).json(info);
    } catch (error) {
      console.error("Technician metrics error:", error);
      return res.status(500).json({ error: "Failed to get technician metrics" });
    }
  });

  app.post("/api/admin/import-users", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const csvPath = path.join(process.cwd(), "attached_assets", "VRS_Auth_Replit_Name_List(Names)_1771470188669.csv");
      const csvContent = fs.readFileSync(csvPath, "utf-8");
      const lines = csvContent.split("\n").filter((line) => line.trim());
      const header = lines[0];
      const dataLines = lines.slice(1);

      let imported = 0;
      let skipped = 0;
      const defaultPassword = await bcryptjs.hash("VRS2026!", 10);

      for (const line of dataLines) {
        const parts = line.split(",");
        if (parts.length < 4) continue;

        const firstName = parts[0].trim();
        const lastName = parts[1].trim();
        const ldapId = parts[2].trim();
        const roleStr = parts[3].trim();

        if (!firstName || !lastName || !ldapId || !roleStr) continue;

        const racId = ldapId;
        const existing = await storage.getUserByRacId(racId);
        if (existing) {
          skipped++;
          continue;
        }

        const name = `${firstName} ${lastName}`;
        const role = roleStr === "Admin" ? "admin" : "vrs_agent";

        const newUser = await storage.createUser({
          email: null,
          password: defaultPassword,
          name,
          role,
          phone: null,
          racId,
          isActive: true,
          firstLogin: true,
          mustChangePassword: true,
        });
        if (role === "admin" || role === "super_admin") {
          await storage.setSpecializations(newUser.id, ALL_DIVISIONS);
        }
        imported++;
      }

      return res.status(200).json({ imported, skipped });
    } catch (error) {
      console.error("CSV import error:", error);
      return res.status(500).json({ error: "Failed to import users" });
    }
  });

  app.post("/api/shsai/query", authenticateToken, requireRole("vrs_agent"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const parsed = z.object({ serviceOrder: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Service order is required" });
      }
      const { serviceOrder } = parsed.data;
      const user = await storage.getUser(authReq.user!.id);
      const agentUserId = user?.racId || authReq.user!.email || authReq.user!.name;
      const result = await queryServiceOrder(agentUserId, serviceOrder);
      return res.json({ success: true, data: result });
    } catch (error) {
      console.error("SHSAI query error:", error);
      return res.status(500).json({ success: false, error: "Failed to query SHSAI" });
    }
  });

  app.post("/api/shsai/followup", authenticateToken, requireRole("vrs_agent"), async (req, res) => {
    try {
      const parsed = z.object({
        sessionId: z.string().min(1),
        trackId: z.string().min(1),
        threadId: z.string().min(1),
        deviceInfo: z.string().min(1),
        message: z.string().min(1),
      }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Session info and message are required" });
      }
      const { sessionId, trackId, threadId, deviceInfo, message } = parsed.data;
      const content = await sendFollowup({ sessionId, trackId, threadId, deviceInfo }, message);
      return res.json({ success: true, data: { content } });
    } catch (error) {
      console.error("SHSAI followup error:", error);
      return res.status(500).json({ success: false, error: "Failed to send follow-up" });
    }
  });

  // ========================================================================
  // FEEDBACK ROUTES
  // ========================================================================

  app.post("/api/feedback", authenticateToken, requireRole("technician"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const user = authReq.user!;

      const feedbackSchema = z.object({
        feedbackType: z.enum(["issue", "improvement", "general"]),
        priority: z.enum(["low", "medium", "high"]),
        description: z.string().min(1, "Description is required").max(2000),
        attachmentUrl: z.string().optional().nullable(),
      });

      const parsed = feedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const fb = await storage.createFeedback({
        technicianId: user.id,
        technicianName: user.name,
        technicianRacId: user.ldapId || "",
        feedbackType: parsed.data.feedbackType,
        priority: parsed.data.priority,
        description: parsed.data.description,
        attachmentUrl: parsed.data.attachmentUrl || null,
        status: "new",
        adminNotes: null,
        resolvedBy: null,
        resolvedAt: null,
      });

      return res.status(201).json({ feedback: fb });
    } catch (error) {
      console.error("Create feedback error:", error);
      return res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  app.get("/api/feedback", authenticateToken, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const list = await storage.getFeedbackList();
      return res.status(200).json({ feedback: list });
    } catch (error) {
      console.error("Get feedback error:", error);
      return res.status(500).json({ error: "Failed to get feedback" });
    }
  });

  app.patch("/api/feedback/:id", authenticateToken, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid feedback ID" });

      const updateSchema = z.object({
        status: z.enum(["new", "in_progress", "resolved", "dismissed"]).optional(),
        adminNotes: z.string().optional().nullable(),
      });

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input" });
      }

      const updates: any = { ...parsed.data };
      if (parsed.data.status === "resolved") {
        updates.resolvedBy = authReq.user!.id;
        updates.resolvedAt = new Date();
      }

      const updated = await storage.updateFeedback(id, updates);
      if (!updated) return res.status(404).json({ error: "Feedback not found" });

      return res.status(200).json({ feedback: updated });
    } catch (error) {
      console.error("Update feedback error:", error);
      return res.status(500).json({ error: "Failed to update feedback" });
    }
  });

  // ========================================================================
  // VIDEO CONVERSION ROUTE
  // ========================================================================

  const convertMediaSchema = z.object({
    objectPath: z.string().min(1),
  });

  app.post("/api/uploads/convert-audio", authenticateToken, requireRole("technician"), async (req, res) => {
    const parsed = convertMediaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "objectPath is required" });
    }

    const { objectPath } = parsed.data;
    const objectStorageService = new ObjectStorageService();
    const inputPath = `/tmp/audio-input-${randomUUID()}`;
    const outputPath = `/tmp/audio-output-${randomUUID()}.mp3`;

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const readStream = objectFile.createReadStream();
      const writeStream = createWriteStream(inputPath);
      await pipeline(readStream, writeStream);

      await execFileAsync("ffmpeg", [
        "-i", inputPath,
        "-codec:a", "libmp3lame",
        "-qscale:a", "4",
        "-y",
        outputPath,
      ], { timeout: 60000 });

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const newObjectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      const fileBuffer = fs.readFileSync(outputPath);
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "audio/mpeg" },
        body: fileBuffer,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed with status ${uploadRes.status}`);
      }

      try { await unlink(inputPath); } catch {}
      try { await unlink(outputPath); } catch {}

      return res.status(200).json({ objectPath: newObjectPath, converted: true });
    } catch (error: any) {
      console.error("Audio conversion error:", error);
      try { await unlink(inputPath); } catch {}
      try { await unlink(outputPath); } catch {}
      return res.status(200).json({ objectPath, converted: false, error: error.message || "Conversion failed" });
    }
  });

  app.post("/api/uploads/convert-video", authenticateToken, requireRole("technician"), async (req, res) => {
    const parsed = convertMediaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "objectPath is required" });
    }

    const { objectPath } = parsed.data;
    const objectStorageService = new ObjectStorageService();
    const inputPath = `/tmp/video-input-${randomUUID()}`;
    const outputPath = `/tmp/video-output-${randomUUID()}.mp4`;

    try {
      const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
      const readStream = objectFile.createReadStream();
      const writeStream = createWriteStream(inputPath);
      await pipeline(readStream, writeStream);

      await execFileAsync("ffmpeg", [
        "-i", inputPath,
        "-c:v", "libx264",
        "-c:a", "aac",
        "-movflags", "+faststart",
        "-preset", "fast",
        "-crf", "23",
        outputPath,
      ], { timeout: 120000 });

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const newObjectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      const fileBuffer = fs.readFileSync(outputPath);
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4" },
        body: fileBuffer,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed with status ${uploadRes.status}`);
      }

      try { await unlink(inputPath); } catch {}
      try { await unlink(outputPath); } catch {}

      return res.status(200).json({ objectPath: newObjectPath, converted: true });
    } catch (error: any) {
      console.error("Video conversion error:", error);
      try { await unlink(inputPath); } catch {}
      try { await unlink(outputPath); } catch {}
      return res.status(200).json({ objectPath, converted: false, error: error.message || "Conversion failed" });
    }
  });

  app.post("/api/admin/clear-test-submissions", authenticateToken, requireRole("super_admin"), async (req, res) => {
    try {
      const { db } = await import("./db");
      const { sql } = await import("drizzle-orm");
      const smsResult = await db.execute(sql`DELETE FROM sms_notifications`);
      const subResult = await db.execute(sql`DELETE FROM submissions`);
      return res.status(200).json({
        message: "All submissions and SMS logs cleared",
        deletedSubmissions: subResult.rowCount,
        deletedSms: smsResult.rowCount,
      });
    } catch (error) {
      console.error("Clear submissions error:", error);
      return res.status(500).json({ error: "Failed to clear submissions" });
    }
  });

  return httpServer;
}
