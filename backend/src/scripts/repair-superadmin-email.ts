import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { User } from "../models/index.js";

const email = process.env.INITIAL_SUPERADMIN_EMAIL?.trim().toLowerCase();
if (!email || !email.includes("@") || email.includes("mailto:") || email.startsWith("[")) throw new Error("INITIAL_SUPERADMIN_EMAIL must be a plain email address");
await connectDatabase();
const result = await User.updateOne({ role: "SUPERADMIN", deletedAt: null }, { $set: { email } });
console.log(result.modifiedCount ? `Updated SuperAdmin email to ${email}` : "No SuperAdmin email was changed");
await disconnectDatabase();
