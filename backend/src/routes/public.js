import { Router } from "express";
import bcrypt from 'bcryptjs';
import { BusinessOwner } from "../models/index.js";
import { generateToken } from "../middleware/auth.js";

const router = Router();

// Business registration (matches frontend expectation)
router.post("/register-business", async (req, res) => {
  try {
    const {
      // Owner details
      ownerName,
      ownerPhone, 
      ownerEmail,
      ownerPassword,
      // Business details  
      businessName,
      businessPhone,
      businessEmail,
      businessAddress,
      gstin,
      plan = 'trial'
    } = req.body;

    console.log("=== PUBLIC BUSINESS REGISTRATION ===");
    console.log("Business Name:", businessName);
    console.log("Owner Name:", ownerName);

    // Validation
    const requiredFields = ['ownerName', 'ownerPhone', 'ownerPassword', 'businessName', 'businessEmail'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    if (ownerPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Check for duplicates
    const existingOwner = await BusinessOwner.findOne({
      $or: [
        { phone: ownerPhone },
        { businessName },
        { businessEmail }
      ]
    });

    if (existingOwner) {
      if (existingOwner.phone === ownerPhone) {
        return res.status(400).json({ error: "Phone number already registered. Please login instead." });
      }
      if (existingOwner.businessName === businessName) {
        return res.status(400).json({ error: "Business name already exists. Please choose a different name." });
      }
      if (existingOwner.businessEmail === businessEmail) {
        return res.status(400).json({ error: "Business email already exists. Please choose a different email." });
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(ownerPassword, 12);

    // Create business owner
    const businessOwner = new BusinessOwner({
      name: ownerName,
      phone: ownerPhone,
      email: ownerEmail,
      passwordHash,
      businessName,
      businessPhone,
      businessEmail,
      address: businessAddress,
      gstin,
      plan,
      status: 'active'
    });

    await businessOwner.save();
    console.log("✅ Business owner created:", businessOwner.name);

    // Generate token
    const token = generateToken({
      ownerId: businessOwner._id,
      role: 'owner'
    });

    res.status(201).json({
      message: "Business registered successfully! Welcome to BillingPro!",
      token,
      user: {
        id: businessOwner._id,
        name: businessOwner.name,
        phone: businessOwner.phone,
        email: businessOwner.email,
        role: 'owner'
      },
      tenant: {
        id: businessOwner._id,
        businessName: businessOwner.businessName,
        plan: businessOwner.plan
      }
    });

  } catch (error) {
    console.error("❌ Registration error:", error);
    res.status(500).json({
      error: "Failed to register business: " + error.message
    });
  }
});

// Check business name availability  
router.get("/check-business-name/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const existing = await BusinessOwner.findOne({
      businessName: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    res.json({
      available: !existing,
      message: existing ? "Business name already taken" : "Business name available"
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
