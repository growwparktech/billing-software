import jwt from "jsonwebtoken";
import { BusinessOwner } from "../models/index.js";

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key_here";

// Generate JWT token
export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

// Middleware to verify business owner token
export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    
    if (!token) {
      return res.status(401).json({ error: "Authentication token required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (!decoded.ownerId) {
      return res.status(403).json({ error: "Invalid token format" });
    }

    const businessOwner = await BusinessOwner.findById(decoded.ownerId);
    
    if (!businessOwner || businessOwner.status !== "active") {
      return res.status(401).json({ error: "Invalid or inactive business owner" });
    }

    req.businessOwner = businessOwner;
    req.ownerId = businessOwner._id;
    next();

  } catch (error) {
    console.error("❌ Auth middleware error:", error);
    res.status(401).json({ error: "Invalid token" });
  }
}
