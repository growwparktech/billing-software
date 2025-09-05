import { Router } from "express";
import { BusinessOwner, Customer, Item, Invoice, BusinessSettings } from "../models/index.js";
import { generateToken } from "../middleware/auth.js";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

// ==================== ADMIN AUTHENTICATION ====================

// Admin credentials (In production, store this in database)
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123', // Plain text password as we fixed earlier
  role: 'super_admin'
};

// ✅ FIXED: Create consistent JWT secret getter
const getJwtSecret = () => {
  return process.env.JWT_SECRET || 'fallback_secret';
};

// Admin authentication middleware
const requireAdminAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    console.log('❌ No admin token provided');
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    console.log('🔍 Verifying admin token...');
    // ✅ FIXED: Use consistent JWT secret
    const decoded = jwt.verify(token, getJwtSecret());
    
    console.log('✅ Token verified, decoded payload:', decoded);
    
    if (decoded.role !== 'admin' && decoded.role !== 'super_admin') {
      console.log('❌ Insufficient role:', decoded.role);
      return res.status(403).json({ error: 'Access denied. Admin rights required.' });
    }
    
    req.admin = decoded;
    console.log('✅ Admin authentication successful');
    next();
  } catch (error) {
    console.error('❌ JWT verification failed:', error.message);
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// Role-based access control
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }
    next();
  };
};

// ==================== ADMIN LOGIN ====================

// Admin login endpoint
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log('🔐 Admin panel login attempt:', username);

    if (!username || !password) {
      console.log('❌ Missing username or password');
      return res.status(400).json({ error: "Username and password are required" });
    }

    // Check admin credentials
    if (username !== ADMIN_CREDENTIALS.username) {
      console.log('❌ Username mismatch!');
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    console.log('✅ Username matches! Testing password...');
    // Plain text password comparison (as we fixed earlier)
    const isValidPassword = (password === ADMIN_CREDENTIALS.password);
    console.log('🔍 Password comparison result:', isValidPassword);
    
    if (!isValidPassword) {
      console.log('❌ Password mismatch!');
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    console.log('✅ Password matches! Generating token...');

    // ✅ FIXED: Generate admin token with consistent secret
    const jwtSecret = getJwtSecret();
    const tokenPayload = {
      username: ADMIN_CREDENTIALS.username,
      role: ADMIN_CREDENTIALS.role,
      loginTime: new Date(),
      type: 'admin' // Add type to distinguish admin tokens
    };

    const token = jwt.sign(tokenPayload, jwtSecret, { 
      expiresIn: '24h' // Add expiration
    });

    console.log('🔑 Token generated with secret:', jwtSecret.substring(0, 10) + '...');
    console.log('✅ Admin panel login successful');

    res.json({
      success: true,
      message: "Admin panel login successful",
      token,
      admin: {
        username: ADMIN_CREDENTIALS.username,
        role: ADMIN_CREDENTIALS.role,
        loginTime: new Date()
      }
    });

  } catch (error) {
    console.error("❌ Admin panel login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ==================== DASHBOARD ANALYTICS ====================

router.get("/dashboard/stats", requireAdminAuth, async (req, res) => {
  try {
    console.log('📊 Loading admin panel dashboard stats...');
    console.log('👤 Admin user:', req.admin.username);

    // Get basic counts (removed totalItems as requested)
    const [
      totalBusinesses,
      totalCustomers, 
      totalInvoices
    ] = await Promise.all([
      BusinessOwner.countDocuments(),
      Customer.countDocuments(),
      Invoice.countDocuments()
    ]);

    // Get invoice stats by status
    const invoiceStats = await Invoice.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$finalAmount' }
        }
      }
    ]);

    // Get invoice stats by type
    const invoiceTypeStats = await Invoice.aggregate([
      {
        $group: {
          _id: '$invoiceType',
          count: { $sum: 1 },
          totalAmount: { $sum: '$finalAmount' }
        }
      }
    ]);

    // Get monthly revenue (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyRevenue = await Invoice.aggregate([
      {
        $match: {
          invoiceDate: { $gte: sixMonthsAgo },
          status: { $in: ['paid', 'completed'] }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$invoiceDate' },
            month: { $month: '$invoiceDate' }
          },
          totalRevenue: { $sum: '$finalAmount' },
          invoiceCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Get recent registrations (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRegistrations = await BusinessOwner.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    const stats = {
      overview: {
        totalBusinesses,
        totalCustomers,
        totalInvoices,
        recentRegistrations
      },
      invoiceStats,
      invoiceTypeStats,
      monthlyRevenue,
      systemHealth: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date()
      }
    };

    console.log('✅ Admin panel dashboard stats loaded successfully');
    console.log('📊 Stats overview:', {
      businesses: totalBusinesses,
      customers: totalCustomers,
      invoices: totalInvoices
    });

    res.json({ success: true, stats });

  } catch (error) {
    console.error('❌ Error loading admin panel dashboard stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== BUSINESS MANAGEMENT ====================

router.get("/businesses", requireAdminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search;
    const status = req.query.status;
    
    const skip = (page - 1) * limit;
    const filter = {};

    // Apply filters
    if (search) {
      filter.$or = [
        { businessName: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { businessEmail: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { gstin: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) filter.status = status;

    const businesses = await BusinessOwner.find(filter)
      .select('-passwordHash') // Exclude password
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await BusinessOwner.countDocuments(filter);

    // Get additional stats for each business
    const businessesWithStats = await Promise.all(
      businesses.map(async (business) => {
        const [invoiceCount, customerCount, totalRevenue, recentActivity] = await Promise.all([
          Invoice.countDocuments({ ownerId: business._id }),
          Customer.countDocuments({ ownerId: business._id }),
          Invoice.aggregate([
            { $match: { ownerId: business._id, status: { $in: ['paid', 'completed'] } } },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
          ]),
          Invoice.findOne({ ownerId: business._id }).sort({ createdAt: -1 }).select('createdAt')
        ]);

        return {
          ...business.toObject(),
          stats: {
            invoiceCount,
            customerCount,
            totalRevenue: totalRevenue[0]?.total || 0,
            lastActivity: recentActivity?.createdAt || business.createdAt
          }
        };
      })
    );

    console.log(`📋 Admin panel loaded ${businessesWithStats.length} businesses`);

    res.json({
      success: true,
      businesses: businessesWithStats,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });

  } catch (error) {
    console.error('❌ Error loading businesses in admin panel:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single business details with complete overview
router.get("/businesses/:id", requireAdminAuth, async (req, res) => {
  try {
    const business = await BusinessOwner.findById(req.params.id).select('-passwordHash');
    
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Get comprehensive business data
    const [invoices, customers, items, settings] = await Promise.all([
      Invoice.find({ ownerId: business._id })
        .populate('customerId', 'name')
        .sort({ createdAt: -1 })
        .limit(20),
      Customer.find({ ownerId: business._id })
        .sort({ createdAt: -1 })
        .limit(20),
      Item.find({ ownerId: business._id })
        .sort({ createdAt: -1 })
        .limit(20),
      BusinessSettings.findOne({ ownerId: business._id })
    ]);

    // Calculate business analytics
    const analytics = await Invoice.aggregate([
      { $match: { ownerId: business._id } },
      {
        $group: {
          _id: null,
          totalInvoices: { $sum: 1 },
          totalRevenue: { $sum: '$finalAmount' },
          avgInvoiceValue: { $avg: '$finalAmount' },
          paidInvoices: {
            $sum: { $cond: [{ $in: ['$status', ['paid', 'completed']] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      business: {
        ...business.toObject(),
        recentInvoices: invoices,
        recentCustomers: customers,
        recentItems: items,
        settings,
        analytics: analytics[0] || {
          totalInvoices: 0,
          totalRevenue: 0,
          avgInvoiceValue: 0,
          paidInvoices: 0
        }
      }
    });

  } catch (error) {
    console.error('❌ Error loading business details in admin panel:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update business status (suspend/activate)
router.put("/businesses/:id/status", requireAdminAuth, requireRole(['super_admin']), async (req, res) => {
  try {
    const { status, reason } = req.body;
    
    if (!['active', 'suspended', 'inactive'].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const business = await BusinessOwner.findByIdAndUpdate(
      req.params.id,
      { 
        status, 
        updatedAt: new Date(),
        // Add admin action log
        lastAdminAction: {
          action: `Status changed to ${status}`,
          reason: reason || 'No reason provided',
          adminUser: req.admin.username,
          timestamp: new Date()
        }
      },
      { new: true }
    ).select('-passwordHash');

    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    console.log(`✅ Admin panel: Business ${business.businessName} status updated to: ${status} by ${req.admin.username}`);

    res.json({
      success: true,
      message: `Business status updated to ${status}`,
      business
    });

  } catch (error) {
    console.error('❌ Error updating business status in admin panel:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ NEW: Lock single business account
router.put("/businesses/:id/lock", requireAdminAuth, requireRole(['super_admin']), async (req, res) => {
  try {
    const businessId = req.params.id;
    console.log('🔒 Admin locking business account:', businessId, 'by:', req.admin.username);
    
    const business = await BusinessOwner.findByIdAndUpdate(
      businessId,
      { 
        isLocked: true,
        updatedAt: new Date(),
        lastAdminAction: {
          action: 'Account Locked',
          reason: 'Locked by admin',
          adminUser: req.admin.username,
          timestamp: new Date()
        }
      },
      { new: true }
    ).select('-passwordHash');

    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    console.log(`✅ Business account ${business.businessName} locked by ${req.admin.username}`);
    
    res.json({
      success: true,
      message: `Business account "${business.businessName}" has been locked`,
      business
    });
  } catch (error) {
    console.error('❌ Error locking business account:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ NEW: Unlock single business account
router.put("/businesses/:id/unlock", requireAdminAuth, requireRole(['super_admin']), async (req, res) => {
  try {
    const businessId = req.params.id;
    console.log('🔓 Admin unlocking business account:', businessId, 'by:', req.admin.username);
    
    const business = await BusinessOwner.findByIdAndUpdate(
      businessId,
      { 
        isLocked: false,
        updatedAt: new Date(),
        lastAdminAction: {
          action: 'Account Unlocked',
          reason: 'Unlocked by admin',
          adminUser: req.admin.username,
          timestamp: new Date()
        }
      },
      { new: true }
    ).select('-passwordHash');

    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    console.log(`✅ Business account ${business.businessName} unlocked by ${req.admin.username}`);
    
    res.json({
      success: true,
      message: `Business account "${business.businessName}" has been unlocked`,
      business
    });
  } catch (error) {
    console.error('❌ Error unlocking business account:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ NEW: Force logout shop owner
router.post("/logout-shop/:businessId", requireAdminAuth, requireRole(['super_admin']), async (req, res) => {
  try {
    const { businessId } = req.params;
    
    console.log('🚪 Admin forcing logout for business:', businessId, 'by admin:', req.admin.username);
    
    // Find the business
    const business = await BusinessOwner.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    console.log('🏢 Found business to logout:', business.businessName);

    // ✅ Set forceLogout flag to force re-authentication
    await BusinessOwner.findByIdAndUpdate(
      businessId,
      {
        $set: {
          forceLogout: true,
          logoutTimestamp: new Date(),
          lastAdminAction: {
            action: 'Forced Logout',
            reason: 'Admin forced logout',
            adminUser: req.admin.username,
            timestamp: new Date()
          }
        }
      }
    );

    console.log(`✅ Shop owner for "${business.businessName}" marked for forced logout by ${req.admin.username}`);

    res.json({
      success: true,
      message: `Shop owner for "${business.businessName}" has been logged out`,
      businessId: businessId,
      businessName: business.businessName
    });

  } catch (error) {
    console.error('❌ Error forcing shop owner logout:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to logout shop owner',
      details: error.message 
    });
  }
});

// ✅ NEW: Delete business (super admin only)
router.delete("/businesses/:id", requireAdminAuth, requireRole(['super_admin']), async (req, res) => {
  try {
    const businessId = req.params.id;
    
    console.log('🗑️ Admin panel: Delete business request for ID:', businessId);
    console.log('👤 Requested by admin:', req.admin.username);
    
    // Find the business first to get its details for logging
    const business = await BusinessOwner.findById(businessId).select('-passwordHash');
    
    if (!business) {
      console.log('❌ Business not found for deletion:', businessId);
      return res.status(404).json({ error: "Business not found" });
    }

    console.log('🏢 Found business to delete:', business.businessName);

    // Get counts of related data for logging
    const [invoiceCount, customerCount, itemCount, settingsCount] = await Promise.all([
      Invoice.countDocuments({ ownerId: businessId }),
      Customer.countDocuments({ ownerId: businessId }),
      Item.countDocuments({ ownerId: businessId }),
      BusinessSettings.countDocuments({ ownerId: businessId })
    ]);

    console.log('📊 Related data to be deleted:', {
      invoices: invoiceCount,
      customers: customerCount,
      items: itemCount,
      settings: settingsCount
    });

    // Delete the business and all related data in parallel
    const deletePromises = [
      BusinessOwner.findByIdAndDelete(businessId),
      Customer.deleteMany({ ownerId: businessId }),
      Invoice.deleteMany({ ownerId: businessId }),
      Item.deleteMany({ ownerId: businessId }),
      BusinessSettings.deleteOne({ ownerId: businessId })
    ];

    const [deletedBusiness, deletedCustomers, deletedInvoices, deletedItems, deletedSettings] = await Promise.all(deletePromises);

    console.log('✅ Successfully deleted business and related data:', {
      business: deletedBusiness ? 1 : 0,
      customers: deletedCustomers.deletedCount || 0,
      invoices: deletedInvoices.deletedCount || 0,
      items: deletedItems.deletedCount || 0,
      settings: deletedSettings.deletedCount || 0
    });

    console.log(`✅ Admin panel: Business "${business.businessName}" completely deleted by ${req.admin.username}`);

    res.json({
      success: true,
      message: `Business "${business.businessName}" and all related data deleted successfully`,
      deletedData: {
        business: 1,
        customers: deletedCustomers.deletedCount || 0,
        invoices: deletedInvoices.deletedCount || 0,
        items: deletedItems.deletedCount || 0,
        settings: deletedSettings.deletedCount || 0
      }
    });

  } catch (error) {
    console.error('❌ Error deleting business in admin panel:', error);
    res.status(500).json({ 
      error: "Failed to delete business",
      details: error.message 
    });
  }
});

// ==================== INVOICE OVERSIGHT ====================

router.get("/invoices", requireAdminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const invoiceType = req.query.invoiceType;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) filter.status = status;
    if (invoiceType) filter.invoiceType = invoiceType;

    const invoices = await Invoice.find(filter)
      .populate('ownerId', 'businessName name')
      .populate('customerId', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Invoice.countDocuments(filter);

    res.json({
      success: true,
      invoices,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });

  } catch (error) {
    console.error('❌ Error loading invoices in admin panel:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== SYSTEM ADMINISTRATION ====================

router.get("/system/health", requireAdminAuth, async (req, res) => {
  try {
    // Test database connectivity
    const dbHealth = await BusinessOwner.countDocuments({}).then(() => 'connected').catch(() => 'disconnected');
    
    const healthCheck = {
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: dbHealth,
      services: {
        invoiceService: 'running',
        emailService: 'running', // You can add actual checks here
        fileStorage: 'running'
      },
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    res.json({ success: true, health: healthCheck });
  } catch (error) {
    console.error('❌ System health check error:', error);
    res.status(500).json({ 
      success: false, 
      health: { 
        status: 'unhealthy', 
        error: error.message 
      } 
    });
  }
});

// ==================== REPORTS & ANALYTICS ====================

router.get("/reports/summary", requireAdminAuth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const [invoiceReport, revenueReport, userActivity] = await Promise.all([
      Invoice.aggregate([
        { $match: dateFilter },
        { 
          $group: { 
            _id: { status: '$status', type: '$invoiceType' }, 
            count: { $sum: 1 }, 
            totalAmount: { $sum: '$finalAmount' } 
          } 
        }
      ]),
      Invoice.aggregate([
        { $match: { ...dateFilter, status: { $in: ['paid', 'completed'] } } },
        { 
          $group: { 
            _id: null, 
            totalRevenue: { $sum: '$finalAmount' }, 
            count: { $sum: 1 },
            avgInvoiceValue: { $avg: '$finalAmount' }
          } 
        }
      ]),
      BusinessOwner.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            newRegistrations: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    res.json({
      success: true,
      reports: {
        summary: {
          dateRange: { startDate, endDate },
          generatedAt: new Date()
        },
        invoiceReport,
        revenueReport: revenueReport[0] || { totalRevenue: 0, count: 0, avgInvoiceValue: 0 },
        userActivity
      }
    });

  } catch (error) {
    console.error('❌ Error generating admin reports:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
