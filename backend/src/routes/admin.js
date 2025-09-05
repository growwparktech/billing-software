import { Router } from "express";
import bcrypt from 'bcryptjs'; // ✅ ADDED: Import bcrypt
import { Admin, Tenant, User } from "../models/index.js";
import { generateToken, requireAdmin } from "../middleware/auth.js";

const router = Router();

// Test route (no auth required)
router.get("/hello", (_req, res) => {
  res.json({ scope: "admin", message: "Admin API is working" });
});

// ✅ FIXED: Register new admin (with password hashing)
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ error: "Admin already exists with this email" });
    }

    // ✅ FIXED: Hash the password before storing
    const passwordHash = await bcrypt.hash(password, 12);

    const admin = new Admin({
      name,
      email,
      passwordHash, // ✅ FIXED: Now properly hashed
      role: "admin"
    });

    await admin.save();

    const token = generateToken({
      adminId: admin._id,
      role: "admin"
    });

    res.status(201).json({
      message: "Admin created successfully",
      token,
      admin
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin login (unchanged - this was already correct)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isValidPassword = await admin.verifyPassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (admin.status !== "active") {
      return res.status(401).json({ error: "Admin account is suspended" });
    }

    const token = generateToken({
      adminId: admin._id,
      role: "admin"
    });

    res.json({
      message: "Login successful",
      token,
      admin
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Protected admin profile
router.get("/profile", requireAdmin, (req, res) => {
  res.json({
    message: "Admin profile",
    admin: req.admin
  });
});

// ==================== TENANT MANAGEMENT ENDPOINTS ====================

// Create new tenant (shop/business)
router.post("/tenants", requireAdmin, async (req, res) => {
  try {
    const { businessName, ownerName, phone, email, address, gstin, plan = "trial" } = req.body;
    
    // Check if tenant already exists
    const existingTenant = await Tenant.findOne({
      $or: [{ phone }, { email }]
    });
    
    if (existingTenant) {
      return res.status(400).json({ error: "Tenant already exists with this phone or email" });
    }

    // Create new tenant
    const tenant = new Tenant({
      businessName,
      ownerName,
      phone,
      email,
      address,
      gstin,
      plan,
      status: "active"
    });

    await tenant.save();

    res.status(201).json({
      message: "Tenant created successfully",
      tenant
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all tenants (with pagination)
router.get("/tenants", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status; // optional filter
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (status) {
      filter.status = status;
    }

    const tenants = await Tenant.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
      
    const total = await Tenant.countDocuments(filter);

    res.json({
      tenants,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single tenant by ID
router.get("/tenants/:id", requireAdmin, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    res.json({ tenant });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update tenant status (activate/suspend)
router.put("/tenants/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!["active", "suspended", "expired"].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be: active, suspended, or expired" });
    }

    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    res.json({
      message: `Tenant status updated to ${status}`,
      tenant
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update tenant details
router.put("/tenants/:id", requireAdmin, async (req, res) => {
  try {
    const { businessName, ownerName, phone, email, address, gstin, plan } = req.body;
    
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { businessName, ownerName, phone, email, address, gstin, plan },
      { new: true, runValidators: true }
    );
    
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    res.json({
      message: "Tenant updated successfully",
      tenant
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NEW MULTI-TENANT ADDITIONS ====================

// ✅ FIXED: Create tenant + shop owner together (with password hashing)
router.post("/tenants/with-owner", requireAdmin, async (req, res) => {
  try {
    const {
      businessName,
      ownerName,
      businessPhone,
      businessEmail,
      address,
      gstin,
      plan = "trial",
      // Shop owner credentials
      ownerPhone,
      ownerPassword,
      ownerEmail
    } = req.body;

    // Validation
    if (!businessName || !ownerName || !businessPhone || !ownerPhone || !ownerPassword) {
      return res.status(400).json({
        error: "Business name, owner name, business phone, owner phone, and password are required"
      });
    }

    if (ownerPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Check if business already exists
    const existingTenant = await Tenant.findOne({
      $or: [{ phone: businessPhone }, { email: businessEmail }, { businessName }]
    });
    
    if (existingTenant) {
      return res.status(400).json({
        error: "Business already exists with this phone, email, or business name"
      });
    }

    // Check if owner phone already exists
    const existingUser = await User.findOne({ phone: ownerPhone });
    if (existingUser) {
      return res.status(400).json({
        error: "User already exists with this phone number"
      });
    }

    // Create tenant
    const tenant = new Tenant({
      businessName,
      ownerName,
      phone: businessPhone,
      email: businessEmail,
      address,
      gstin,
      plan,
      status: "active"
    });

    const savedTenant = await tenant.save();

    // ✅ FIXED: Hash password before storing
    const passwordHash = await bcrypt.hash(ownerPassword, 12);

    // Create shop owner user
    const shopOwner = new User({
      tenantId: savedTenant._id,
      name: ownerName,
      phone: ownerPhone,
      email: ownerEmail || businessEmail,
      passwordHash, // ✅ FIXED: Now properly hashed
      role: "owner",
      status: "active"
    });

    await shopOwner.save();

    // ✅ FIXED: Generate token with 'user' role for consistency
    const token = generateToken({
      userId: shopOwner._id,
      tenantId: savedTenant._id,
      role: 'user' // ✅ FIXED: Changed from 'owner' to 'user'
    });

    res.status(201).json({
      message: "Business and shop owner created successfully",
      token, // ✅ ADDED: Include token in response
      tenant: savedTenant,
      shopOwner: {
        id: shopOwner._id,
        name: shopOwner.name,
        phone: shopOwner.phone,
        email: shopOwner.email,
        role: shopOwner.role
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users for a tenant
router.get("/tenants/:id/users", requireAdmin, async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const users = await User.find({ tenantId: tenant._id })
      .select('-passwordHash')
      .sort({ createdAt: -1 });

    res.json({
      tenant: {
        businessName: tenant.businessName,
        status: tenant.status
      },
      users
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
