import { Router } from "express";
import { BusinessOwner, Customer, Item, Invoice, BusinessSettings } from "../models/index.js";
import { generateToken, requireAuth } from "../middleware/auth.js";
import bcrypt from 'bcryptjs';

// ✅ NEW: Add multer imports for file upload
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import express from 'express';

const router = Router();

// ✅ NEW: Configure multer for logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/logos';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: businessId_timestamp.extension
    const ext = path.extname(file.originalname);
    const filename = `${req.ownerId}_${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Test route
router.get("/hello", (_req, res) => {
  res.json({ scope: "tenant", message: "Business API is working" });
});

// ==================== DEBUG ROUTES ====================

// Debug route to check customer data
router.get("/debug/customers/:id", requireAuth, async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, ownerId: req.ownerId });
    
    console.log('🔍 Raw customer from database:', {
      _id: customer._id,
      name: customer.name,
      billingAddress: customer.billingAddress,
      shippingAddress: customer.shippingAddress,
      hasBillingAddress: !!customer.billingAddress,
      hasShippingAddress: !!customer.shippingAddress,
      billingAddressKeys: customer.billingAddress ? Object.keys(customer.billingAddress) : null,
      shippingAddressKeys: customer.shippingAddress ? Object.keys(customer.shippingAddress) : null
    });
    
    res.json({ 
      customer,
      debug: {
        hasBillingAddress: !!customer.billingAddress,
        hasShippingAddress: !!customer.shippingAddress,
        billingAddressContent: customer.billingAddress,
        shippingAddressContent: customer.shippingAddress
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug route to check invoice data
router.get("/debug/invoices/:id", requireAuth, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, ownerId: req.ownerId });
    
    console.log('🔍 Raw invoice from database:', {
      invoiceNumber: invoice.invoiceNumber,
      customerInfo: invoice.customerInfo,
      customerBillingAddress: invoice.customerInfo?.billingAddress,
      customerShippingAddress: invoice.customerInfo?.shippingAddress,
      hasBillingAddress: !!invoice.customerInfo?.billingAddress,
      hasShippingAddress: !!invoice.customerInfo?.shippingAddress
    });
    
    res.json({ 
      invoice,
      debug: {
        customerBillingAddress: invoice.customerInfo?.billingAddress,
        customerShippingAddress: invoice.customerInfo?.shippingAddress,
        hasBillingAddress: !!invoice.customerInfo?.billingAddress,
        hasShippingAddress: !!invoice.customerInfo?.shippingAddress
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug route - check what addresses are actually stored
router.get("/debug/invoice-addresses/:id", requireAuth, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, ownerId: req.ownerId });
    const customer = await Customer.findOne({ _id: invoice.customerId, ownerId: req.ownerId });
    
    res.json({
      invoiceAddresses: {
        billing: invoice.customerInfo?.billingAddress,
        shipping: invoice.customerInfo?.shippingAddress
      },
      customerAddresses: {
        billing: customer?.billingAddress,
        shipping: customer?.shippingAddress
      },
      raw: {
        invoiceCustomerInfo: invoice.customerInfo,
        customerRaw: customer
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Migration route to fix existing customers
router.post("/debug/migrate-customers", requireAuth, async (req, res) => {
  try {
    console.log('🔄 Starting customer migration for owner:', req.ownerId);
    
    const customers = await Customer.find({ ownerId: req.ownerId });
    console.log(`📊 Found ${customers.length} customers to check`);
    
    let updatedCount = 0;
    const errors = [];
    
    for (const customer of customers) {
      try {
        // Check if customer has address data
        const needsUpdate = !customer.billingAddress || !customer.shippingAddress;
        
        if (needsUpdate) {
          console.log(`🔄 Updating customer: ${customer.name}`);
          
          // Add empty address objects if they don't exist
          const updates = {};
          if (!customer.billingAddress) {
            updates.billingAddress = {};
          }
          if (!customer.shippingAddress) {
            updates.shippingAddress = {};
          }
          
          await Customer.findByIdAndUpdate(customer._id, updates);
          updatedCount++;
          console.log(`✅ Updated ${customer.name} with empty address objects`);
        }
      } catch (error) {
        console.error(`❌ Failed to update ${customer.name}:`, error);
        errors.push(`${customer.name}: ${error.message}`);
      }
    }
    
    console.log(`✅ Migration completed: ${updatedCount}/${customers.length} customers updated`);
    
    res.json({
      success: true,
      message: `Migration completed: ${updatedCount} customers updated`,
      updated: updatedCount,
      total: customers.length,
      errors: errors
    });
  } catch (error) {
    console.error('❌ Migration error:', error);
    res.status(500).json({ error: 'Migration failed: ' + error.message });
  }
});

// ==================== AUTHENTICATION ROUTES ====================

// Register new business owner
router.post("/register", async (req, res) => {
  try {
    const {
      name, phone, email, password, businessName, businessPhone, businessEmail, address, gstin, plan = 'trial'
    } = req.body;

    const requiredFields = ['name', 'phone', 'password', 'businessName'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missingFields.join(', ')}` });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existingOwner = await BusinessOwner.findOne({
      $or: [{ phone }, { businessName }, { businessEmail: businessEmail }]
    });

    if (existingOwner) {
      if (existingOwner.phone === phone) return res.status(400).json({ error: "Phone number already registered" });
      if (existingOwner.businessName === businessName) return res.status(400).json({ error: "Business name already exists" });
      if (existingOwner.businessEmail === businessEmail) return res.status(400).json({ error: "Business email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const businessOwner = new BusinessOwner({
      name, phone, email, passwordHash, businessName, businessPhone, businessEmail, address, gstin, plan, status: 'active'
    });

    await businessOwner.save();

    const token = generateToken({ ownerId: businessOwner._id, role: 'owner' });

    res.status(201).json({
      message: "Business registered successfully!",
      token,
      businessOwner: {
        id: businessOwner._id, name: businessOwner.name, phone: businessOwner.phone, businessName: businessOwner.businessName, plan: businessOwner.plan
      }
    });
  } catch (error) {
    console.error("❌ Registration error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Login business owner
// ✅ UPDATE YOUR LOGIN ROUTE in tenant.js to check forceLogout

router.post("/login", async (req, res) => {
  try {
    const { businessName, phone, password } = req.body;

    if (!phone || !password || !businessName) {
      return res.status(400).json({ error: "Phone, password, and business name are required" });
    }

    const businessOwner = await BusinessOwner.findOne({ phone, businessName });
    if (!businessOwner) return res.status(401).json({ error: "Invalid credentials" });

    const isValidPassword = await businessOwner.verifyPassword(password);
    if (!isValidPassword) return res.status(401).json({ error: "Invalid credentials" });

    if (businessOwner.status !== "active") {
      return res.status(401).json({ error: "Business account is suspended" });
    }

    // ✅ NEW: Check for forced logout
    if (businessOwner.forceLogout) {
      console.log('🚪 Forced logout detected for business:', businessOwner.businessName);
      
      // Clear the forceLogout flag after checking
      await BusinessOwner.findByIdAndUpdate(businessOwner._id, {
        $unset: { forceLogout: 1, logoutTimestamp: 1 }
      });
      
      return res.status(401).json({ 
        error: "Your session has been terminated by an administrator. Please login again.",
        forceLogout: true
      });
    }

    // ✅ Check if account is locked AFTER successful authentication
    if (businessOwner.isLocked) {
      console.log('🔒 Locked account login attempt:', businessOwner.businessName);
      const token = generateToken({ ownerId: businessOwner._id, role: 'owner' });
      
      return res.json({
        message: "Login successful but account is locked",
        token,
        user: {
          id: businessOwner._id,
          name: businessOwner.name,
          phone: businessOwner.phone,
          email: businessOwner.email,
          role: 'owner',
          isLocked: true // ✅ CRITICAL: Include this flag
        },
        tenant: {
          id: businessOwner._id,
          businessName: businessOwner.businessName
        }
      });
    }

    const token = generateToken({ ownerId: businessOwner._id, role: 'owner' });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: businessOwner._id,
        name: businessOwner.name,
        phone: businessOwner.phone,
        email: businessOwner.email,
        role: 'owner',
        isLocked: false
      },
      tenant: {
        id: businessOwner._id,
        businessName: businessOwner.businessName
      }
    });

  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ error: error.message });
  }
});


// Get business owner profile
router.get("/profile", requireAuth, (req, res) => {
  res.json({ message: "Business owner profile", businessOwner: req.businessOwner });
});

// Dashboard totals endpoint
router.get("/dashboard/totals", requireAuth, async (req, res) => {
  try {
    console.log('📊 Calculating dashboard totals for owner:', req.ownerId);

    // Get all invoices for this owner
    const invoices = await Invoice.find({ ownerId: req.ownerId });

    // Calculate totals by invoice type
    const salesInvoices = invoices.filter(inv => inv.invoiceType === 'SALES');
    const quotationInvoices = invoices.filter(inv => inv.invoiceType === 'QUOTATION');
    const purchaseInvoices = invoices.filter(inv => inv.invoiceType === 'PURCHASE');

    // Calculate amounts
    const salesTotal = salesInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
    const quotationTotal = quotationInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
    const purchaseTotal = purchaseInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);

    // Calculate counts
    const salesCount = salesInvoices.length;
    const quotationCount = quotationInvoices.length;
    const purchaseCount = purchaseInvoices.length;

    // Calculate pending amounts
    const salesPending = salesInvoices.filter(inv => inv.paymentStatus === 'pending').reduce((sum, inv) => sum + (inv.balanceAmount || 0), 0);
    const quotationPending = quotationInvoices.filter(inv => inv.paymentStatus === 'pending').reduce((sum, inv) => sum + (inv.balanceAmount || 0), 0);
    const purchasePending = purchaseInvoices.filter(inv => inv.paymentStatus === 'pending').reduce((sum, inv) => sum + (inv.balanceAmount || 0), 0);

    console.log(`✅ Dashboard totals calculated - Sales: ₹${salesTotal}, Quotations: ₹${quotationTotal}, Purchases: ₹${purchaseTotal}`);

    res.json({
      success: true,
      totals: {
        sales: {
          totalAmount: salesTotal,
          count: salesCount,
          pendingAmount: salesPending,
          avgAmount: salesCount > 0 ? salesTotal / salesCount : 0
        },
        quotations: {
          totalAmount: quotationTotal,
          count: quotationCount,
          pendingAmount: quotationPending,
          avgAmount: quotationCount > 0 ? quotationTotal / quotationCount : 0
        },
        purchases: {
          totalAmount: purchaseTotal,
          count: purchaseCount,
          pendingAmount: purchasePending,
          avgAmount: purchaseCount > 0 ? purchaseTotal / purchaseCount : 0
        },
        overall: {
          totalInvoices: invoices.length,
          totalAmount: salesTotal + quotationTotal + purchaseTotal,
          totalPending: salesPending + quotationPending + purchasePending
        }
      }
    });
  } catch (error) {
    console.error('❌ Error calculating dashboard totals:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== CUSTOMER MANAGEMENT ====================

// Create customer
router.post("/customers", requireAuth, async (req, res) => {
  try {
    const { 
      name, phone, email, 
      billingAddress,
      shippingAddress,
      gstin, vendorCode, 
      customerType = "individual", 
      paymentTerms = "immediate", 
      creditLimit = 0, 
      notes, 
      bankDetails 
    } = req.body;

    console.log('🔄 Creating customer with addresses:', {
      billingAddress,
      shippingAddress,
      vendorCode
    });

    const existingCustomer = await Customer.findOne({ ownerId: req.ownerId, phone });
    if (existingCustomer) {
      return res.status(400).json({ error: "Customer already exists with this phone number" });
    }

    const customer = new Customer({ 
      ownerId: req.ownerId, 
      name, phone, email, 
      billingAddress,
      shippingAddress,
      gstin, 
      vendorCode: vendorCode?.trim() || '', 
      customerType, paymentTerms, creditLimit, notes, bankDetails 
    });

    await customer.save();

    console.log('✅ Customer created with addresses:', {
      billingAddress: customer.billingAddress,
      shippingAddress: customer.shippingAddress,
      vendorCode: customer.vendorCode,
      billingStreet: customer.billingAddress?.street,
      billingCity: customer.billingAddress?.city,
      shippingStreet: customer.shippingAddress?.street,
      shippingCity: customer.shippingAddress?.city
    });

    res.status(201).json({ message: "Customer created successfully", customer });
  } catch (error) {
    console.error('❌ Customer creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all customers
router.get("/customers", requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000;
    const search = req.query.search;
    const skip = (page - 1) * limit;

    const filter = { ownerId: req.ownerId };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { vendorCode: { $regex: search, $options: 'i' } }
      ];
    }

    const customers = await Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await Customer.countDocuments(filter);

    // Calculate real financial data from invoices
    const customersWithFinancials = await Promise.all(
      customers.map(async (customer) => {
        // Get all invoices for this customer
        const invoices = await Invoice.find({
          ownerId: req.ownerId,
          customerId: customer._id
        });

        // Calculate totals by invoice type
        const salesInvoices = invoices.filter(inv => inv.invoiceType === 'SALES');
        const quotationInvoices = invoices.filter(inv => inv.invoiceType === 'QUOTATION');
        const purchaseInvoices = invoices.filter(inv => inv.invoiceType === 'PURCHASE');

        const salesAmount = salesInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
        const quotationAmount = quotationInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
        const purchaseAmount = purchaseInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
        const outstandingBalance = invoices.reduce((sum, inv) => sum + (inv.balanceAmount || 0), 0);

        // Get last invoice date
        const sortedInvoices = invoices.sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate));
        const lastInvoiceDate = sortedInvoices.length > 0 ? sortedInvoices[0].invoiceDate : null;

        return {
          ...customer.toObject(),
          salesAmount,
          quotationAmount,
          purchaseAmount,
          totalSales: salesAmount,
          outstandingBalance,
          lastInvoiceDate
        };
      })
    );

    console.log(`✅ Loaded ${customersWithFinancials.length} customers with financial data`);

    res.json({
      customers: customersWithFinancials,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('❌ Error loading customers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single customer
router.get("/customers/:id", requireAuth, async (req, res) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, ownerId: req.ownerId });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    res.json({ customer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update customer
router.put("/customers/:id", requireAuth, async (req, res) => {
  try {
    console.log('🔄 Updating customer with data:', req.body);
    
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.ownerId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!customer) return res.status(404).json({ error: "Customer not found" });

    console.log('✅ Customer updated with addresses:', {
      billingAddress: customer.billingAddress,
      shippingAddress: customer.shippingAddress
    });

    res.json({ message: "Customer updated successfully", customer });
  } catch (error) {
    console.error('❌ Customer update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete customer
router.delete("/customers/:id", requireAuth, async (req, res) => {
  try {
    const customer = await Customer.findOneAndDelete({ _id: req.params.id, ownerId: req.ownerId });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    res.json({ message: "Customer deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ITEM MANAGEMENT ====================

// Create item
router.post("/items", requireAuth, async (req, res) => {
  try {
    const item = new Item({ ...req.body, ownerId: req.ownerId });
    await item.save();

    res.status(201).json({ message: "Item created successfully", item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all items
router.get("/items", requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000;
    const skip = (page - 1) * limit;

    const items = await Item.find({ ownerId: req.ownerId }).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await Item.countDocuments({ ownerId: req.ownerId });

    res.json({
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update item
router.put("/items/:id", requireAuth, async (req, res) => {
  try {
    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.ownerId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!item) return res.status(404).json({ error: "Item not found" });

    res.json({ message: "Item updated successfully", item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete item
router.delete("/items/:id", requireAuth, async (req, res) => {
  try {
    const item = await Item.findOneAndDelete({ _id: req.params.id, ownerId: req.ownerId });
    if (!item) return res.status(404).json({ error: "Item not found" });

    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Item lookup by code/part number (for auto-fill)
router.get("/items/lookup/:code", requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const searchCode = code.toUpperCase();

    console.log(`🔍 Looking up item by code: ${searchCode}`);

    const item = await Item.findByIdentifier(req.ownerId, code);

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    await item.updateUsageStats();

    console.log(`✅ Item found: ${item.name}`);

    res.json({ 
      item: {
        ...item.toObject(),
        unit: item.unit || 'piece'
      }
    });

  } catch (error) {
    console.error("❌ Item lookup error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Item template lookup by code (for auto-fill from business settings)
router.get("/items/template/:code", requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const searchCode = code.toUpperCase();

    console.log(`🔍 Looking up item template by code: ${searchCode}`);

    const settings = await BusinessSettings.findOne({ ownerId: req.ownerId });

    if (!settings || !settings.itemTemplates || settings.itemTemplates.length === 0) {
      return res.status(404).json({ error: "No item templates found" });
    }

    const template = settings.findItemTemplate(searchCode);

    if (!template) {
      return res.status(404).json({ error: "Item template not found" });
    }

    console.log(`✅ Item template found: ${template.name}`);

    res.json({
      item: {
        itemCode: template.itemCode,
        name: template.name,
        description: template.description || template.name,
        sellingPrice: template.unitPrice,
        taxRate: template.taxRate,
        hsnCode: template.hsnCode,
        unit: template.unit || 'piece'
      }
    });
  } catch (error) {
    console.error("❌ Item template lookup error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Item search with autocomplete
router.get("/items/search", requireAuth, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.json({ items: [] });
    }

    console.log(`🔍 Searching items with query: ${q}`);

    const items = await Item.intelligentSearch(req.ownerId, q, parseInt(limit));

    res.json({ items });
  } catch (error) {
    console.error("❌ Item search error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Recent items (frequently used)
router.get("/items/recent", requireAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const recentItems = await Item.find({
      ownerId: req.ownerId,
      status: 'active',
      timesUsed: { $gt: 0 }
    })
    .select('itemCode partNumber name description sellingPrice taxRate hsnCode unit stockQuantity timesUsed lastUsedDate brand model')
    .sort({ lastUsedDate: -1, timesUsed: -1 })
    .limit(parseInt(limit));

    console.log(`📋 Found ${recentItems.length} recent items`);

    res.json({ items: recentItems });
  } catch (error) {
    console.error("❌ Recent items error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk item import/creation
router.post("/items/bulk", requireAuth, async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items array is required" });
    }

    console.log(`📦 Bulk importing ${items.length} items`);

    const createdItems = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const itemData = { ...items[i], ownerId: req.ownerId };
        const item = new Item(itemData);
        await item.save();
        createdItems.push(item);
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    console.log(`✅ Bulk import completed: ${createdItems.length}/${items.length} items created`);

    res.json({
      success: true,
      created: createdItems.length,
      errors: errors.length,
      items: createdItems,
      errorDetails: errors
    });
  } catch (error) {
    console.error("❌ Bulk import error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Item categories list
router.get("/items/categories", requireAuth, async (req, res) => {
  try {
    const categories = await Item.distinct('category', {
      ownerId: req.ownerId,
      status: 'active'
    });

    console.log(`🏷️ Found ${categories.length} categories`);

    res.json({ categories: categories.filter(Boolean) });
  } catch (error) {
    console.error("❌ Categories error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get pricing for item and quantity
router.get("/items/:id/pricing", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity = 1 } = req.query;

    const item = await Item.findOne({ _id: id, ownerId: req.ownerId, status: 'active' });

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const unitPrice = item.getPriceForQuantity(parseInt(quantity));
    const lineTotal = unitPrice * parseInt(quantity);
    const taxAmount = (lineTotal * item.taxRate) / 100;
    const totalAmount = lineTotal + taxAmount;

    res.json({
      item: {
        _id: item._id,
        name: item.name,
        description: item.description,
        itemCode: item.itemCode,
        partNumber: item.partNumber
      },
      pricing: {
        quantity: parseInt(quantity),
        unitPrice,
        lineTotal,
        taxRate: item.taxRate,
        taxAmount,
        totalAmount
      }
    });
  } catch (error) {
    console.error("❌ Pricing calculation error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== BUSINESS SETTINGS MANAGEMENT ====================

// Get business settings
router.get("/settings", requireAuth, async (req, res) => {
  try {
    console.log('🔄 Loading business settings for owner:', req.ownerId);

    let settings = await BusinessSettings.findOne({ ownerId: req.ownerId });

    if (!settings) {
      console.log('📝 Creating default settings for new business');
      settings = new BusinessSettings({
        ownerId: req.ownerId
      });
      await settings.save();
    }

    console.log('✅ Business settings loaded successfully');

    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('❌ Error loading business settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update business settings
router.put("/settings", requireAuth, async (req, res) => {
  try {
    console.log('🔄 Updating business settings for owner:', req.ownerId);

    const updateData = { ...req.body };
    
    // Remove fields that should not be overwritten
    delete updateData.bankAccounts;
    delete updateData.bankDetails;
    delete updateData._id;
    delete updateData.ownerId;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    delete updateData.__v;

    const settings = await BusinessSettings.findOneAndUpdate(
      { ownerId: req.ownerId },
      { $set: updateData },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    console.log('✅ Business settings updated successfully');

    res.json({
      success: true,
      message: "Settings updated successfully!",
      settings
    });
  } catch (error) {
    console.error('❌ Error updating business settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Logo upload endpoint
router.post("/upload-logo", requireAuth, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No logo file provided' });
    }

    console.log('📸 Logo upload for owner:', req.ownerId);

    const logoUrl = `/uploads/logos/${req.file.filename}`;

    const settings = await BusinessSettings.findOneAndUpdate(
      { ownerId: req.ownerId },
      {
        $set: {
          'businessInfo.logoUrl': logoUrl
        }
      },
      { new: true, upsert: true, runValidators: true }
    );

    console.log('✅ Logo uploaded and settings updated');

    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      logoUrl: logoUrl,
      settings: settings
    });
  } catch (error) {
    console.error('❌ Logo upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Reset settings to defaults
router.post("/settings/reset", requireAuth, async (req, res) => {
  try {
    console.log('🔄 Resetting business settings to defaults for owner:', req.ownerId);

    await BusinessSettings.findOneAndDelete({ ownerId: req.ownerId });

    const defaultSettings = new BusinessSettings({
      ownerId: req.ownerId
    });
    await defaultSettings.save();

    console.log('✅ Business settings reset to defaults');

    res.json({
      success: true,
      message: "Settings reset to defaults",
      settings: defaultSettings
    });
  } catch (error) {
    console.error('❌ Error resetting business settings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get settings for invoice auto-fill
router.get("/settings/invoice-defaults", requireAuth, async (req, res) => {
  try {
    const settings = await BusinessSettings.findOne({ ownerId: req.ownerId });
    const currentYear = new Date().getFullYear();

    if (!settings) {
      return res.json({
        success: true,
        defaults: {
          defaultTaxRate: 18,
          defaultPaymentTerms: '30 days',
          defaultTaxType: 'IGST',
          invoicePrefix: `INV-${currentYear}`,
          itemCodePrefix: 'ITM',
          itemPartNumberPrefix: 'PN'
        }
      });
    }

    res.json({
      success: true,
      defaults: {
        defaultTaxRate: settings.invoiceSettings?.defaultTaxRate || 18,
        defaultPaymentTerms: settings.invoiceSettings?.defaultPaymentTerms || '30 days',
        defaultTaxType: settings.invoiceSettings?.defaultTaxType || 'IGST',
        invoicePrefix: settings.invoiceSettings?.invoicePrefix || `INV-${currentYear}`,
        itemCodePrefix: settings.itemSettings?.itemCodePrefix || 'ITM',
        itemPartNumberPrefix: settings.itemSettings?.itemPartNumberPrefix || 'PN'
      }
    });
  } catch (error) {
    console.error('❌ Error loading invoice defaults:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== INVOICE MANAGEMENT ====================

// Migration route to fix existing invoices
router.post("/invoices/migrate-tags", requireAuth, async (req, res) => {
  try {
    console.log("🔄 Starting invoice tags migration for owner:", req.ownerId);

    const invoicesToUpdate = await Invoice.find({
      ownerId: req.ownerId,
      $or: [
        { tags: { $exists: false } },
        { tags: { $size: 0 } },
        { invoiceType: { $exists: false } }
      ]
    });

    console.log(`📊 Found ${invoicesToUpdate.length} invoices to update`);

    let updatedCount = 0;
    const errors = [];

    for (const invoice of invoicesToUpdate) {
      try {
        let newTags = [];
        let newType = 'SALES';

        if (invoice.invoiceType) {
          newType = invoice.invoiceType;
          newTags = [invoice.invoiceType];
        } else if (invoice.tags && invoice.tags.length > 0) {
          newTags = invoice.tags;
          if (invoice.tags.includes('SALES')) newType = 'SALES';
          else if (invoice.tags.includes('PURCHASE')) newType = 'PURCHASE';
          else if (invoice.tags.includes('QUOTATION')) newType = 'QUOTATION';
        } else {
          newTags = ['SALES'];
          newType = 'SALES';
        }

        await Invoice.findByIdAndUpdate(
          invoice._id,
          {
            $set: {
              tags: newTags,
              invoiceType: newType
            }
          }
        );

        updatedCount++;
        console.log(`✅ Updated ${invoice.invoiceNumber} -> Tags: ${JSON.stringify(newTags)}, Type: ${newType}`);
      } catch (updateError) {
        console.error(`❌ Failed to update ${invoice.invoiceNumber}:`, updateError);
        errors.push(`${invoice.invoiceNumber}: ${updateError.message}`);
      }
    }

    console.log(`✅ Migration completed: ${updatedCount}/${invoicesToUpdate.length} invoices updated`);

    res.json({
      success: true,
      message: `Migration completed: ${updatedCount} invoices updated`,
      updated: updatedCount,
      total: invoicesToUpdate.length,
      errors: errors
    });
  } catch (error) {
    console.error("❌ Migration error:", error);
    res.status(500).json({ error: "Migration failed: " + error.message });
  }
});

// ✅ COMPLETE: Create invoice with SAFE CALCULATIONS + FLAT CUSTOMER FIELDS + PREFIX FUNCTIONALITY
router.post("/invoices", requireAuth, async (req, res) => {
  try {
    const {
      customerId,
      
      // ✅ FLAT CUSTOMER FIELDS
      customerName,
      customerPhone,
      customerEmail,
      customerGstin,
      customerVendorCode,
      
      // ✅ FLAT ADDRESS FIELDS
      billingStreet,
      billingCity,
      billingState,
      billingPincode,
      billingCountry,
      
      shippingStreet,
      shippingCity,
      shippingState,
      shippingPincode,
      shippingCountry,
      
      sameAsShipping,
      
      lineItems,
      dueDate,
      discountAmount = 0,
      transportCharges = 0,
      otherCharges = 0,
      notes,
      taxType = 'IGST',
      taxRate = 18,
      tags = [],
      invoiceType,
      roundingAdjustment = 0,
      bankDetails = {},
      authorization = {},
      invoiceFooter = {}
    } = req.body;

    console.log("=== CREATING INVOICE WITH SAFE CALCULATIONS + PREFIX ===");
    console.log("Owner ID:", req.ownerId);
    console.log("Customer ID:", customerId);
    console.log("Invoice Type:", invoiceType);

    // ✅ CRITICAL: Safe number conversion function
    const safeNumber = (value, defaultValue = 0) => {
      if (value === null || value === undefined || value === '') {
        return defaultValue;
      }
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    // ✅ ENHANCED: Tags and type handling
    let finalTags = [];
    let finalInvoiceType = 'SALES';

    if (invoiceType) {
      finalInvoiceType = invoiceType.toUpperCase();
      finalTags = tags && tags.length > 0 ? tags : [finalInvoiceType];
    } else if (tags && tags.length > 0) {
      finalTags = tags;
      if (tags.includes('SALES') || tags.includes('SALE')) finalInvoiceType = 'SALES';
      else if (tags.includes('PURCHASE') || tags.includes('BUY')) finalInvoiceType = 'PURCHASE';
      else if (tags.includes('QUOTATION') || tags.includes('QUOTE')) finalInvoiceType = 'QUOTATION';
    } else {
      finalTags = ['SALES'];
      finalInvoiceType = 'SALES';
    }

    console.log("✅ Final Invoice Type:", finalInvoiceType);
    console.log("✅ Final Tags:", finalTags);

    // Validation
    if (!customerId) {
      return res.status(400).json({ error: "Customer ID is required" });
    }

    if (!lineItems || lineItems.length === 0) {
      return res.status(400).json({ error: "Line items are required" });
    }

    // Get customer record
    const customer = await Customer.findOne({ _id: customerId, ownerId: req.ownerId });
    if (!customer) return res.status(400).json({ error: "Customer not found" });

    // Get business owner
    const businessOwner = req.businessOwner;

    // ✅ RESTORED: Get type-specific invoice prefix from business settings
    console.log('🔄 Fetching business settings for type-specific invoice prefix...');
    const businessSettings = await BusinessSettings.findOne({ ownerId: req.ownerId });
    
    const currentYear = new Date().getFullYear();
    
    // ✅ RESTORED: Use the getInvoicePrefixByType method or fallback
    let customPrefix;
    if (businessSettings && businessSettings.getInvoicePrefixByType) {
      customPrefix = businessSettings.getInvoicePrefixByType(finalInvoiceType);
    } else {
      // Fallback prefix logic
      const prefixMap = {
        'SALES': businessSettings?.invoiceSettings?.salesInvoicePrefix || `SALE-${currentYear}`,
        'PURCHASE': businessSettings?.invoiceSettings?.purchaseInvoicePrefix || `PUR-${currentYear}`,
        'QUOTATION': businessSettings?.invoiceSettings?.quotationInvoicePrefix || `QUOT-${currentYear}`
      };
      customPrefix = prefixMap[finalInvoiceType] || `INV-${currentYear}`;
    }
    
    console.log('🏷️ Using type-specific invoice prefix:', customPrefix, 'for type:', finalInvoiceType);

    // Customer data with fallbacks
    let finalCustomerName = customerName || customer.name || '';
    let finalCustomerPhone = customerPhone || customer.phone || '';
    let finalCustomerEmail = customerEmail || customer.email || '';
    let finalCustomerGstin = customerGstin || customer.gstin || '';
    let finalCustomerVendorCode = customerVendorCode || customer.vendorCode || '';

    // Address data with fallbacks
    let finalBillingStreet = billingStreet || customer.billingAddress?.street || '';
    let finalBillingCity = billingCity || customer.billingAddress?.city || '';
    let finalBillingState = billingState || customer.billingAddress?.state || '';
    let finalBillingPincode = billingPincode || customer.billingAddress?.pincode || '';
    let finalBillingCountry = billingCountry || customer.billingAddress?.country || 'India';

    let finalShippingStreet = shippingStreet || customer.shippingAddress?.street || finalBillingStreet;
    let finalShippingCity = shippingCity || customer.shippingAddress?.city || finalBillingCity;
    let finalShippingState = shippingState || customer.shippingAddress?.state || finalBillingState;
    let finalShippingPincode = shippingPincode || customer.shippingAddress?.pincode || finalBillingPincode;
    let finalShippingCountry = shippingCountry || customer.shippingAddress?.country || finalBillingCountry;

    // Same as shipping logic
    if (sameAsShipping) {
      finalShippingStreet = finalBillingStreet;
      finalShippingCity = finalBillingCity;
      finalShippingState = finalBillingState;
      finalShippingPincode = finalBillingPincode;
      finalShippingCountry = finalBillingCountry;
    }

    // ✅ RESTORED: Generate unique invoice number with type-specific prefix
    let invoiceNumber;
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      const sequence = timestamp.toString().slice(-6) + random.toString().padStart(3, '0');
      
      // ✅ RESTORED: USE TYPE-SPECIFIC PREFIX FROM BUSINESS SETTINGS
      invoiceNumber = `${customPrefix}-${sequence}`;
      
      const existing = await Invoice.findOne({ invoiceNumber });
      if (!existing) {
        console.log("✅ Generated unique invoice number with type-specific prefix:", invoiceNumber);
        break;
      }
      
      attempts++;
      if (attempts >= maxAttempts) {
        return res.status(500).json({ error: "Could not generate unique invoice number" });
      }
    }

    // ✅ CRITICAL FIX: Process line items with SAFE CALCULATIONS
    console.log('🔢 Processing line items with safe calculations...');
    const processedLineItems = lineItems.map((item, index) => {
      // Safe number conversion for all item fields
      const quantity = safeNumber(item.quantity, 1);
      const unitPrice = safeNumber(item.unitPrice, 0);
      const itemTaxRate = safeNumber(item.taxRate || item.gstRate || taxRate, 18);

      console.log(`Item ${index + 1} safe values:`, { 
        originalQuantity: item.quantity, 
        safeQuantity: quantity,
        originalUnitPrice: item.unitPrice,
        safeUnitPrice: unitPrice,
        originalTaxRate: item.taxRate,
        safeTaxRate: itemTaxRate
      });

      // Safe calculations
      let lineTotal = quantity * unitPrice;
      if (isNaN(lineTotal)) {
        console.warn(`⚠️ Line total NaN for item ${index + 1}, setting to 0`);
        lineTotal = 0;
      }

      let taxAmount = (lineTotal * itemTaxRate) / 100;
      if (isNaN(taxAmount)) {
        console.warn(`⚠️ Tax amount NaN for item ${index + 1}, setting to 0`);
        taxAmount = 0;
      }

      let totalAmount = lineTotal + taxAmount;
      if (isNaN(totalAmount)) {
        console.warn(`⚠️ Total amount NaN for item ${index + 1}, setting to lineTotal`);
        totalAmount = lineTotal;
      }

      return {
        name: item.name || item.description || `Item ${index + 1}`,
        description: item.description || item.name || `Item ${index + 1}`,
        quantity,
        unit: item.unit || 'piece',
        unitPrice,
        taxRate: itemTaxRate,
        lineTotal: Math.round(lineTotal * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100,
        hsnCode: item.hsnCode || ''
      };
    });

    // ✅ CRITICAL FIX: Calculate totals with SAFE ARITHMETIC
    console.log('🧮 Calculating totals with safe arithmetic...');
    
    let subtotal = processedLineItems.reduce((sum, item) => {
      const itemTotal = safeNumber(item.lineTotal, 0);
      return sum + itemTotal;
    }, 0);

    let totalTaxAmount = processedLineItems.reduce((sum, item) => {
      const itemTax = safeNumber(item.taxAmount, 0);
      return sum + itemTax;
    }, 0);

    // Safe conversion of additional charges
    const safeDiscountAmount = safeNumber(discountAmount, 0);
    const safeTransportCharges = safeNumber(transportCharges, 0);
    const safeOtherCharges = safeNumber(otherCharges, 0);
    const safeRoundingAdjustment = safeNumber(roundingAdjustment, 0);

    console.log('💰 Safe charge values:', {
      safeDiscountAmount,
      safeTransportCharges,
      safeOtherCharges,
      safeRoundingAdjustment
    });

    // ✅ CRITICAL: Final amount calculation with NaN protection
    let finalAmount = subtotal + totalTaxAmount - safeDiscountAmount + safeTransportCharges + safeOtherCharges + safeRoundingAdjustment;
    
    if (isNaN(finalAmount)) {
      console.error('❌ Final amount is NaN! Using subtotal + tax as fallback.');
      finalAmount = subtotal + totalTaxAmount;
    }

    // ✅ CRITICAL: Balance amount calculation with NaN protection
    const paidAmount = 0;
    let balanceAmount = finalAmount - paidAmount;
    
    if (isNaN(balanceAmount)) {
      console.error('❌ Balance amount is NaN! Setting to final amount.');
      balanceAmount = finalAmount;
    }

    // Round all amounts
    subtotal = Math.round(subtotal * 100) / 100;
    totalTaxAmount = Math.round(totalTaxAmount * 100) / 100;
    finalAmount = Math.round(finalAmount * 100) / 100;
    balanceAmount = Math.round(balanceAmount * 100) / 100;

    console.log('✅ Final safe calculations:', {
      subtotal,
      totalTaxAmount,
      finalAmount,
      balanceAmount,
      allAreNumbers: {
        subtotal: !isNaN(subtotal),
        totalTaxAmount: !isNaN(totalTaxAmount),
        finalAmount: !isNaN(finalAmount),
        balanceAmount: !isNaN(balanceAmount)
      }
    });

    // Tax breakdown calculation
    const actualTaxRate = safeNumber(taxRate, 18);
    let igst = 0, cgst = 0, sgst = 0;
    
    if (taxType === 'CGST_SGST') {
      cgst = Math.round((totalTaxAmount / 2) * 100) / 100;
      sgst = Math.round((totalTaxAmount / 2) * 100) / 100;
    } else {
      igst = Math.round(totalTaxAmount * 100) / 100;
    }

    // Create safe address objects for customerInfo (backward compatibility)
    const safeBillingAddress = {
      street: finalBillingStreet || '',
      city: finalBillingCity || '',
      state: finalBillingState || '',
      pincode: finalBillingPincode || '',
      country: finalBillingCountry || 'India'
    };

    const safeShippingAddress = {
      street: finalShippingStreet || '',
      city: finalShippingCity || '',
      state: finalShippingState || '',
      pincode: finalShippingPincode || '',
      country: finalShippingCountry || 'India'
    };

    // ✅ CREATE INVOICE WITH ALL SAFE VALUES + FLAT CUSTOMER FIELDS
    const invoice = new Invoice({
      ownerId: req.ownerId,
      customerId: customer._id,
      
      // ✅ FLAT CUSTOMER FIELDS
      customerName: finalCustomerName,
      customerPhone: finalCustomerPhone,
      customerEmail: finalCustomerEmail,
      customerGstin: finalCustomerGstin,
      customerVendorCode: finalCustomerVendorCode,
      
      // ✅ FLAT BILLING ADDRESS FIELDS
      billingStreet: finalBillingStreet,
      billingCity: finalBillingCity,
      billingState: finalBillingState,
      billingPincode: finalBillingPincode,
      billingCountry: finalBillingCountry,
      
      // ✅ FLAT SHIPPING ADDRESS FIELDS
      shippingStreet: finalShippingStreet,
      shippingCity: finalShippingCity,
      shippingState: finalShippingState,
      shippingPincode: finalShippingPincode,
      shippingCountry: finalShippingCountry,
      
      sameAsShipping: sameAsShipping || false,
      
      invoiceNumber, // ✅ RESTORED: Uses type-specific prefix from business settings
      invoiceDate: new Date(),
      dueDate: new Date(dueDate),
      status: 'pending',
      paymentStatus: 'pending',
      tags: finalTags,
      invoiceType: finalInvoiceType,
      
      // ✅ BACKWARD COMPATIBILITY: customerInfo
      customerInfo: {
        name: finalCustomerName,
        phone: finalCustomerPhone,
        email: finalCustomerEmail,
        address: customer.address || '',
        gstin: finalCustomerGstin,
        billingAddress: safeBillingAddress,
        shippingAddress: safeShippingAddress,
        vendorCode: finalCustomerVendorCode
      },
      
      businessInfo: {
        name: businessOwner.businessName,
        phone: businessOwner.businessPhone || businessOwner.phone,
        email: businessOwner.businessEmail || businessOwner.email,
        address: businessOwner.address,
        gstin: businessOwner.gstin,
        panNumber: businessOwner.panNumber || '',
        companyRegNumber: businessOwner.companyRegNumber || '',
        website: businessOwner.website || '',
        logoUrl: businessOwner.logoUrl || ''
      },
      
      bankDetails: {
        bankName: bankDetails.bankName || '',
        branchName: bankDetails.branchName || '',
        accountNumber: bankDetails.accountNumber || '',
        ifscCode: bankDetails.ifscCode || '',
        accountType: bankDetails.accountType || 'Current',
        accountHolderName: bankDetails.accountHolderName || businessOwner.businessName
      },
      
      authorization: {
        authorizedSignatoryName: authorization.authorizedSignatoryName || businessOwner.name,
        designation: authorization.designation || 'Authorized Signatory',
        signatureUrl: authorization.signatureUrl || ''
      },
      
      invoiceFooter: {
        termsAndConditions: invoiceFooter.termsAndConditions || 'Payment is due within 30 days.',
        footerNotes: invoiceFooter.footerNotes || '',
        paymentInstructions: invoiceFooter.paymentInstructions || 'Please make payment to the above bank account.',
        thankYouMessage: invoiceFooter.thankYouMessage || 'Thank you for your business!'
      },
      
      // ✅ CRITICAL: All numeric fields with safe values
      igst,
      cgst,
      sgst,
      taxRate: actualTaxRate,
      taxType,
      lineItems: processedLineItems,
      subtotal,
      totalTaxAmount,
      discountAmount: safeDiscountAmount,
      transportCharges: safeTransportCharges,
      otherCharges: safeOtherCharges,
      roundingAdjustment: safeRoundingAdjustment,
      finalAmount,
      paidAmount: 0,
      balanceAmount,
      notes,
      createdBy: req.ownerId
    });

    // ✅ FINAL VALIDATION: Double-check critical fields before saving
    const criticalFields = {
      finalAmount: invoice.finalAmount,
      balanceAmount: invoice.balanceAmount,
      subtotal: invoice.subtotal,
      totalTaxAmount: invoice.totalTaxAmount
    };

    console.log('🔍 Pre-save validation of critical fields:', criticalFields);

    for (const [field, value] of Object.entries(criticalFields)) {
      if (isNaN(value)) {
        console.error(`❌ CRITICAL: ${field} is NaN before save:`, value);
        return res.status(400).json({ 
          error: `Invalid calculation: ${field} resulted in NaN. Please check your input values.` 
        });
      }
    }

    await invoice.save();

    console.log("✅ Invoice created successfully with type-specific prefix:", invoice.invoiceNumber);
    console.log("💰 Final amounts saved:", {
      finalAmount: invoice.finalAmount,
      balanceAmount: invoice.balanceAmount
    });

    res.status(201).json({
      message: "Invoice created successfully",
      invoice: {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber, // ✅ RESTORED: Returns type-specific prefixed number
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        status: invoice.status,
        paymentStatus: invoice.paymentStatus,
        finalAmount: invoice.finalAmount,
        balanceAmount: invoice.balanceAmount,
        
        // ✅ INCLUDE FLAT CUSTOMER FIELDS IN RESPONSE
        customerName: invoice.customerName,
        customerPhone: invoice.customerPhone,
        customerEmail: invoice.customerEmail,
        customerGstin: invoice.customerGstin,
        customerVendorCode: invoice.customerVendorCode,
        billingStreet: invoice.billingStreet,
        billingCity: invoice.billingCity,
        billingState: invoice.billingState,
        billingPincode: invoice.billingPincode,
        billingCountry: invoice.billingCountry,
        shippingStreet: invoice.shippingStreet,
        shippingCity: invoice.shippingCity,
        shippingState: invoice.shippingState,
        shippingPincode: invoice.shippingPincode,
        shippingCountry: invoice.shippingCountry,
        sameAsShipping: invoice.sameAsShipping,
        
        // ✅ KEEP OLD customerInfo for backward compatibility
        customerInfo: invoice.customerInfo,
        businessInfo: invoice.businessInfo,
        bankDetails: invoice.bankDetails,
        authorization: invoice.authorization,
        invoiceFooter: invoice.invoiceFooter,
        lineItems: invoice.lineItems,
        subtotal: invoice.subtotal,
        totalTaxAmount: invoice.totalTaxAmount,
        discountAmount: invoice.discountAmount,
        igst: invoice.igst,
        cgst: invoice.cgst,
        sgst: invoice.sgst,
        taxRate: invoice.taxRate,
        taxType: invoice.taxType,
        tags: invoice.tags,
        invoiceType: invoice.invoiceType,
        notes: invoice.notes
      }
    });

  } catch (error) {
    console.error("❌ Invoice creation error:", error);
    res.status(500).json({ error: "Failed to create invoice: " + error.message });
  }
});

// Get all invoices
router.get("/invoices", requireAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000;
    const skip = (page - 1) * limit;

    const filter = { ownerId: req.ownerId };

    if (req.query.type) {
      filter.invoiceType = req.query.type.toUpperCase();
    }

    if (req.query.tags) {
      const tagArray = req.query.tags.split(',');
      filter.tags = { $in: tagArray };
    }

    const invoices = await Invoice.find(filter)
      .populate('customerId', 'name phone email')
      .sort({ invoiceDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Invoice.countDocuments(filter);

    console.log(`📊 Fetched ${invoices.length} invoices for owner ${req.ownerId}`);
    if (invoices.length > 0) {
      console.log(`🏷️ Sample invoice tags:`, invoices[0].tags);
      console.log(`📋 Sample invoice type:`, invoices[0].invoiceType);
    }

    res.json({
      invoices,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single invoice
router.get("/invoices/:id", requireAuth, async (req, res) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, ownerId: req.ownerId });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const customer = await Customer.findOne({ _id: invoice.customerId, ownerId: req.ownerId });
    
    const invoiceWithAddresses = {
      ...invoice.toObject(),
      customerBillingAddress: customer?.billingAddress || {},
      customerShippingAddress: customer?.shippingAddress || {},
      customerInfo: {
        ...invoice.customerInfo,
        billingAddress: customer?.billingAddress || {},
        shippingAddress: customer?.shippingAddress || {}
      }
    };

    console.log('🎯 EXPLICIT ADDRESS FETCH:', {
      customerBilling: customer?.billingAddress,
      customerShipping: customer?.shippingAddress
    });

    res.json({ invoice: invoiceWithAddresses });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update invoice
router.put("/invoices/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log("=== UPDATING INVOICE ===");
    console.log("Invoice ID:", id);
    console.log("Owner ID:", req.ownerId);

    if (updateData.tags !== undefined || updateData.invoiceType !== undefined) {
      if (updateData.invoiceType && (!updateData.tags || updateData.tags.length === 0)) {
        updateData.tags = [updateData.invoiceType];
      }
      console.log("✅ Updated tags for consistency:", updateData.tags);
    }

    if (updateData.lineItems || updateData.transportCharges !== undefined || updateData.otherCharges !== undefined) {
      updateData.lineItems = updateData.lineItems.map((item, index) => {
        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(item.unitPrice) || 0;
        const taxRate = Number(item.taxRate || item.gstRate) || Number(updateData.taxRate) || 18;

        const lineTotal = quantity * unitPrice;
        const taxAmount = (lineTotal * taxRate) / 100;
        const totalAmount = lineTotal + taxAmount;

        return {
          name: item.name || item.description || `Item ${index + 1}`,
          description: item.description || item.name || `Item ${index + 1}`,
          quantity,
          unit: item.unit || 'piece',
          unitPrice,
          taxRate,
          lineTotal: Math.round(lineTotal * 100) / 100,
          taxAmount: Math.round(taxAmount * 100) / 100,
          totalAmount: Math.round(totalAmount * 100) / 100,
          hsnCode: item.hsnCode || ''
        };
      });

      const subtotal = updateData.lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const totalTaxAmount = updateData.lineItems.reduce((sum, item) => sum + item.taxAmount, 0);
      const finalAmount = subtotal + totalTaxAmount - (updateData.discountAmount || 0) + (updateData.transportCharges || 0) + (updateData.otherCharges || 0);

      updateData.subtotal = Math.round(subtotal * 100) / 100;
      updateData.totalTaxAmount = Math.round(totalTaxAmount * 100) / 100;
      updateData.finalAmount = Math.round(finalAmount * 100) / 100;
      updateData.balanceAmount = Math.round(finalAmount * 100) / 100;

      const actualTaxRate = updateData.lineItems.length > 0 ?
        updateData.lineItems[0].taxRate : Number(updateData.taxRate) || 18;

      const taxType = updateData.taxType || 'IGST';
      if (taxType === 'CGST_SGST') {
        updateData.cgst = Math.round((totalTaxAmount / 2) * 100) / 100;
        updateData.sgst = Math.round((totalTaxAmount / 2) * 100) / 100;
        updateData.igst = 0;
      } else {
        updateData.igst = Math.round(totalTaxAmount * 100) / 100;
        updateData.cgst = 0;
        updateData.sgst = 0;
      }

      updateData.taxType = taxType;
      updateData.taxRate = actualTaxRate;
    }

    const invoice = await Invoice.findOneAndUpdate(
      { _id: id, ownerId: req.ownerId },
      updateData,
      { new: true, runValidators: true }
    ).populate('customerId', 'name phone email');

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    console.log("✅ Invoice updated successfully:", invoice.invoiceNumber);

    res.json({
      success: true,
      message: "Invoice updated successfully",
      invoice
    });
  } catch (error) {
    console.error("❌ Invoice update error:", error);
    res.status(500).json({ error: "Failed to update invoice: " + error.message });
  }
});

// Delete invoice
router.delete("/invoices/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findOneAndDelete({
      _id: id,
      ownerId: req.ownerId
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    console.log("✅ Invoice deleted successfully:", invoice.invoiceNumber);

    res.json({
      success: true,
      message: "Invoice deleted successfully"
    });
  } catch (error) {
    console.error("❌ Invoice delete error:", error);
    res.status(500).json({ error: "Failed to delete invoice: " + error.message });
  }
});

// Update invoice status
router.put("/invoices/:id/status", requireAuth, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["pending", "paid", "cancelled"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const invoice = await Invoice.findOne({ _id: req.params.id, ownerId: req.ownerId });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    invoice.status = status;
    invoice.paymentStatus = status;

    if (status === 'paid') {
      invoice.paidAmount = invoice.finalAmount;
      invoice.balanceAmount = 0;
      invoice.paidDate = new Date();
    } else if (status === 'pending') {
      invoice.paidAmount = 0;
      invoice.balanceAmount = invoice.finalAmount;
      invoice.paidDate = null;
    }

    await invoice.save();

    res.json({ message: `Invoice marked as ${status}`, invoice });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get customer financial summary with real invoice data
router.get("/customers/financial-summary", requireAuth, async (req, res) => {
  try {
    console.log('💰 Calculating customer financial summary for owner:', req.ownerId);

    const customers = await Customer.find({ ownerId: req.ownerId });

    const customerFinancials = await Promise.all(
      customers.map(async (customer) => {
        const invoices = await Invoice.find({
          ownerId: req.ownerId,
          customerId: customer._id
        });

        const salesInvoices = invoices.filter(inv => inv.invoiceType === 'SALES');
        const quotationInvoices = invoices.filter(inv => inv.invoiceType === 'QUOTATION');
        const purchaseInvoices = invoices.filter(inv => inv.invoiceType === 'PURCHASE');

        const salesAmount = salesInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
        const quotationAmount = quotationInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
        const purchaseAmount = purchaseInvoices.reduce((sum, inv) => sum + (inv.finalAmount || 0), 0);
        const outstandingBalance = invoices.reduce((sum, inv) => sum + (inv.balanceAmount || 0), 0);

        const lastInvoiceDate = invoices.length > 0 ?
          Math.max(...invoices.map(inv => new Date(inv.invoiceDate).getTime())) : null;

        return {
          ...customer.toObject(),
          salesAmount,
          quotationAmount,
          purchaseAmount,
          totalSales: salesAmount,
          outstandingBalance,
          lastInvoiceDate: lastInvoiceDate ? new Date(lastInvoiceDate) : null
        };
      })
    );

    console.log(`✅ Financial summary calculated for ${customerFinancials.length} customers`);

    res.json({
      success: true,
      customers: customerFinancials
    });
  } catch (error) {
    console.error('❌ Error calculating customer financial summary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Specific vendor code lookup endpoint
router.get("/customers/lookup-by-vendor-code/:code", requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const searchCode = code.toUpperCase().trim();

    console.log(`🔍 Looking up customer by vendor code: ${searchCode}`);

    const customer = await Customer.findOne({
      ownerId: req.ownerId,
      vendorCode: { $regex: `^${searchCode}$`, $options: 'i' }
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer with this vendor code not found" });
    }

    console.log(`✅ Found customer by vendor code: ${customer.name}`);

    res.json({ customer });
  } catch (error) {
    console.error("❌ Vendor code lookup error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
