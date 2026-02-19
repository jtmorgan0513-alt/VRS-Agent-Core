import bcryptjs from "bcryptjs";
import { storage } from "./storage";

const SEED_USERS = [
  {
    email: null,
    password: "admin123",
    name: "System Admin",
    role: "admin",
    phone: "5551234567",
    racId: "sysadmin",
  },
  {
    email: null,
    password: "tech123",
    name: "Tyler Morrison",
    role: "technician",
    phone: "9105550147",
    racId: "tmorri1",
  },
  {
    email: null,
    password: "agent123",
    name: "Maria Johnson",
    role: "vrs_agent",
    phone: "5559876543",
    racId: "mjohnson1",
    specializations: ["refrigeration", "laundry"],
  },
  {
    email: null,
    password: "agent123",
    name: "James Chen",
    role: "vrs_agent",
    phone: "5551112222",
    racId: "jchen1",
    specializations: ["cooking", "dishwasher", "microwave", "laundry", "refrigeration", "hvac", "generalist"],
  },
  {
    email: null,
    password: "VRS!M@ster2026#Secure",
    name: "System Administrator",
    role: "super_admin",
    phone: null,
    racId: "VRS_MASTER",
    isSystemAccount: true,
  },
] as const;

export async function seedDatabase() {
  for (const seedUser of SEED_USERS) {
    let user = seedUser.racId ? await storage.getUserByRacId(seedUser.racId) : null;

    if (!user) {
      const hashedPassword = await bcryptjs.hash(seedUser.password, 10);
      const createData: any = {
        email: null,
        password: hashedPassword,
        name: seedUser.name,
        role: seedUser.role,
        phone: seedUser.phone,
        racId: seedUser.racId,
        mustChangePassword: false,
      };
      if ("isSystemAccount" in seedUser) {
        createData.isSystemAccount = true;
        createData.mustChangePassword = false;
      }
      user = await storage.createUser(createData);
      console.log(`Seeded user: ${seedUser.name} / ${seedUser.racId} (${seedUser.role})`);
    }

    if ("specializations" in seedUser && seedUser.specializations) {
      const existing = await storage.getSpecializations(user.id);
      if (existing.length === 0) {
        await storage.setSpecializations(user.id, [...seedUser.specializations]);
        console.log(`Seeded specializations for: ${seedUser.name}`);
      }
    }
  }
}
