import { Router } from "express";
import { BusinessOwner, Customer, Item, Invoice, BusinessSettings } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx'; // ✅ NEW: Import xlsx library

const router = Router();

// ✅ Configure multer for Excel file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/inventory';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `inventory_${req.ownerId}_${Date.now()}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are allowed'), false);
    }
  }
});

// ==================== PRODUCT/INVENTORY MANAGEMENT ====================

// ✅ COPIED FROM TENANT.JS: Get all products with inventory details
router.get("/products", requireAuth, async (req, res) => {
  try {
    console.log('📦 Loading products for owner:', req.ownerId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000;
    const search = req.query.search;
    const category = req.query.category;
    const skip = (page - 1) * limit;

    const filter = { ownerId: req.ownerId, status: 'active' };

    // Apply search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { itemCode: { $regex: search, $options: 'i' } },
        { partNumber: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { brand: { $regex: search, $options: 'i' } }
      ];
    }

    // Apply category filter
    if (category) {
      filter.category = category;
    }

    const products = await Item.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Item.countDocuments(filter);

    console.log(`✅ Loaded ${products.length} products`);
    res.json({
      success: true,
      products,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    console.error('❌ Error loading products:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ COPIED FROM TENANT.JS: Create product
router.post("/products", requireAuth, async (req, res) => {
  try {
    const product = new Item({ ...req.body, ownerId: req.ownerId });
    await product.save();
    res.status(201).json({
      success: true,
      message: "Product created successfully",
      product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ COPIED FROM TENANT.JS: Update product
router.put("/products/:id", requireAuth, async (req, res) => {
  try {
    const product = await Item.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.ownerId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json({
      success: true,
      message: "Product updated successfully",
      product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ COPIED FROM TENANT.JS: Delete product
router.delete("/products/:id", requireAuth, async (req, res) => {
  try {
    const product = await Item.findOneAndDelete({ _id: req.params.id, ownerId: req.ownerId });
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json({
      success: true,
      message: "Product deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ FIXED: Item lookup by code/part number (for auto-fill)
router.get("/products/lookup/:code", requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const searchCode = code.toUpperCase();
    console.log(`🔍 Looking up product by code: ${searchCode}`);

    // Use the static method from the enhanced Item schema
    const item = await Item.findByIdentifier(req.ownerId, code);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: "Product not found"
      });
    }

    // Update usage statistics
    await item.updateUsageStats();

    console.log(`✅ Product found: ${item.name}`);

    // ✅ FIXED: Ensure all fields including unit are returned with schema-compliant values
    res.json({
      success: true,
      product: {
        _id: item._id,
        itemCode: item.itemCode,
        partNumber: item.partNumber,
        name: item.name,
        description: item.description,
        sellingPrice: item.sellingPrice,
        taxRate: item.taxRate,
        hsnCode: item.hsnCode,
        unit: item.unit || 'piece', // ✅ CRITICAL: Default to 'piece' matching your schema
        brand: item.brand,
        model: item.model,
        stockQuantity: item.stockQuantity
      }
    });
  } catch (error) {
    console.error("❌ Product lookup error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ FIXED: Product template lookup by code (for auto-fill from business settings)
router.get("/products/template/:code", requireAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const searchCode = code.toUpperCase();
    console.log(`🔍 Looking up product template by code: ${searchCode}`);

    // Get business settings with item templates
    const settings = await BusinessSettings.findOne({ ownerId: req.ownerId });

    if (!settings || !settings.itemTemplates || settings.itemTemplates.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No product templates found"
      });
    }

    // ✅ FIXED: Direct array search instead of using findItemTemplate method
    const template = settings.itemTemplates.find(t => 
      t.itemCode && t.itemCode.toUpperCase() === searchCode
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Product template not found"
      });
    }

    console.log(`✅ Product template found: ${template.name}`);

    // ✅ FIXED: Ensure unit field matches your schema enum
    res.json({
      success: true,
      product: {
        itemCode: template.itemCode,
        name: template.name,
        description: template.description || template.name,
        sellingPrice: template.unitPrice,
        taxRate: template.taxRate,
        hsnCode: template.hsnCode,
        unit: template.unit || 'piece' // ✅ CRITICAL: Default to 'piece' matching your schema
      }
    });
  } catch (error) {
    console.error("❌ Product template lookup error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ FIXED: Product search with autocomplete
router.get("/products/search", requireAuth, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q || q.length < 2) {
      return res.json({
        success: true,
        products: []
      });
    }

    console.log(`🔍 Searching products with query: ${q}`);

    // Use the static method from the enhanced Item schema
    const items = await Item.intelligentSearch(req.ownerId, q, parseInt(limit));

    // ✅ FIXED: Ensure unit field is included in search results
    const productsWithUnit = items.map(item => ({
      ...item.toObject ? item.toObject() : item,
      unit: item.unit || 'piece' // ✅ CRITICAL: Include unit field
    }));

    res.json({
      success: true,
      products: productsWithUnit
    });
  } catch (error) {
    console.error("❌ Product search error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ COPIED FROM TENANT.JS: Recent products (frequently used)
router.get("/products/recent", requireAuth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const recentProducts = await Item.find({
      ownerId: req.ownerId,
      status: 'active',
      timesUsed: { $gt: 0 }
    })
    .select('itemCode partNumber name description sellingPrice taxRate hsnCode unit stockQuantity timesUsed lastUsedDate brand model')
    .sort({ lastUsedDate: -1, timesUsed: -1 })
    .limit(parseInt(limit));

    console.log(`📋 Found ${recentProducts.length} recent products`);

    res.json({
      success: true,
      products: recentProducts
    });
  } catch (error) {
    console.error("❌ Recent products error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ ENHANCED: Excel/CSV bulk import with full processing
router.post("/products/bulk", requireAuth, upload.single('file'), async (req, res) => {
  try {
    let products = [];

    if (req.file) {
      // ✅ NEW: Process Excel or CSV file
      console.log(`📤 Processing uploaded file: ${req.file.filename}`);
      const filePath = req.file.path;
      const fileExtension = path.extname(req.file.originalname).toLowerCase();

      try {
        if (fileExtension === '.csv') {
          // Handle CSV files
          const workbook = XLSX.readFile(filePath, { type: 'file' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          products = XLSX.utils.sheet_to_json(worksheet);
        } else {
          // Handle Excel files (.xlsx, .xls)
          const workbook = XLSX.readFile(filePath);
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          products = XLSX.utils.sheet_to_json(worksheet);
        }

        console.log(`📊 Parsed ${products.length} rows from ${req.file.originalname}`);

        // Clean up - delete uploaded file after processing
        fs.unlinkSync(filePath);
      } catch (parseError) {
        console.error('❌ File parsing error:', parseError);
        // Clean up file on error
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        return res.status(400).json({
          success: false,
          error: 'Failed to parse file. Please check the format and try again.'
        });
      }
    } else if (req.body.products) {
      // Handle JSON data
      products = JSON.parse(req.body.products);
    } else {
      return res.status(400).json({
        success: false,
        error: "Products data or file is required"
      });
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid products found in the file"
      });
    }

    console.log(`📦 Bulk importing ${products.length} products`);

    const createdProducts = [];
    const errors = [];

    // ✅ ENHANCED: Better data mapping and validation
    for (let i = 0; i < products.length; i++) {
      try {
        const row = products[i];

        // ✅ Map Excel column names to database fields (flexible mapping)
        const productData = {
          ownerId: req.ownerId,
          itemCode: row.itemCode || row.ItemCode || row['Item Code'] || '',
          partNumber: row.partNumber || row.PartNumber || row['Part Number'] || '',
          name: row.name || row.Name || row['Product Name'] || '',
          description: row.description || row.Description || '',
          brand: row.brand || row.Brand || '',
          model: row.model || row.Model || '',
          category: row.category || row.Category || 'General',
          unit: row.unit || row.Unit || 'piece', // ✅ UPDATED: Default to 'piece' matching schema
          sellingPrice: parseFloat(row.sellingPrice || row.SellingPrice || row['Selling Price'] || 0),
          costPrice: parseFloat(row.costPrice || row.CostPrice || row['Cost Price'] || 0),
          taxRate: parseFloat(row.taxRate || row.TaxRate || row['Tax Rate'] || 18),
          hsnCode: row.hsnCode || row.HSNCode || row['HSN Code'] || '',
          stockQuantity: parseInt(row.stockQuantity || row.StockQuantity || row['Stock Quantity'] || 0),
          minStockLevel: parseInt(row.minStockLevel || row.MinStockLevel || row['Min Stock Level'] || 5),
          maxStockLevel: parseInt(row.maxStockLevel || row.MaxStockLevel || row['Max Stock Level'] || 100),
          sku: row.sku || row.SKU || '',
          barcode: row.barcode || row.Barcode || ''
        };

        // Validate required fields
        if (!productData.name) {
          errors.push(`Row ${i + 1}: Product name is required`);
          continue;
        }

        if (productData.sellingPrice <= 0) {
          errors.push(`Row ${i + 1}: Valid selling price is required`);
          continue;
        }

        const product = new Item(productData);
        await product.save();
        createdProducts.push(product);
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    console.log(`✅ Bulk import completed: ${createdProducts.length}/${products.length} products created`);

    res.json({
      success: true,
      message: `Successfully imported ${createdProducts.length} out of ${products.length} products`,
      created: createdProducts.length,
      total: products.length,
      errors: errors.length,
      products: createdProducts,
      errorDetails: errors
    });
  } catch (error) {
    console.error("❌ Bulk import error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ NEW: Excel Export Endpoint
router.get("/products/export", requireAuth, async (req, res) => {
  try {
    console.log('📤 Exporting products to Excel for owner:', req.ownerId);

    const products = await Item.find({
      ownerId: req.ownerId,
      status: 'active'
    }).lean();

    // ✅ Format data for Excel export
    const exportData = products.map(product => ({
      'Item Code': product.itemCode || '',
      'Part Number': product.partNumber || '',
      'Product Name': product.name,
      'Description': product.description || '',
      'Brand': product.brand || '',
      'Model': product.model || '',
      'Category': product.category || 'General',
      'Unit': product.unit || 'piece', // ✅ UPDATED: Default to 'piece' matching schema
      'Selling Price': product.sellingPrice || 0,
      'Cost Price': product.costPrice || 0,
      'Tax Rate': product.taxRate || 18,
      'HSN Code': product.hsnCode || '',
      'Stock Quantity': product.stockQuantity || 0,
      'Min Stock Level': product.minStockLevel || 5,
      'Max Stock Level': product.maxStockLevel || 100,
      'SKU': product.sku || '',
      'Barcode': product.barcode || '',
      'Status': product.status || 'active',
      'Created Date': product.createdAt ? new Date(product.createdAt).toLocaleDateString() : '',
      'Last Updated': product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : ''
    }));

    // ✅ Create Excel workbook
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();

    // ✅ Set column widths for better readability
    worksheet['!cols'] = [
      { wch: 12 }, // Item Code
      { wch: 15 }, // Part Number
      { wch: 25 }, // Product Name
      { wch: 30 }, // Description
      { wch: 15 }, // Brand
      { wch: 15 }, // Model
      { wch: 12 }, // Category
      { wch: 8 },  // Unit
      { wch: 12 }, // Selling Price
      { wch: 12 }, // Cost Price
      { wch: 10 }, // Tax Rate
      { wch: 12 }, // HSN Code
      { wch: 12 }, // Stock Quantity
      { wch: 12 }, // Min Stock
      { wch: 12 }, // Max Stock
      { wch: 12 }, // SKU
      { wch: 15 }, // Barcode
      { wch: 10 }, // Status
      { wch: 12 }, // Created Date
      { wch: 12 }  // Last Updated
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

    // ✅ Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx'
    });

    // ✅ Set response headers for file download
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `products_export_${timestamp}.xlsx`;

    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Length', excelBuffer.length);

    console.log(`✅ Excel export completed: ${products.length} products exported`);

    // Send the Excel file
    res.send(excelBuffer);
  } catch (error) {
    console.error('❌ Excel export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export products: ' + error.message
    });
  }
});

// ✅ NEW: Download template endpoint
router.get("/products/template", requireAuth, (req, res) => {
  try {
    console.log('📥 Generating product import template...');

    // ✅ Create sample template data with schema-compliant unit
    const templateData = [{
      'Item Code': 'ITM-001',
      'Part Number': 'PN-001',
      'Product Name': 'Sample Product',
      'Description': 'Sample product description',
      'Brand': 'Sample Brand',
      'Model': 'Model X',
      'Category': 'Electronics',
      'Unit': 'piece', // ✅ UPDATED: Use 'piece' matching schema
      'Selling Price': 100,
      'Cost Price': 80,
      'Tax Rate': 18,
      'HSN Code': '1234',
      'Stock Quantity': 50,
      'Min Stock Level': 10,
      'Max Stock Level': 200,
      'SKU': 'SKU001',
      'Barcode': '1234567890123'
    }];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();

    // ✅ Set column widths
    worksheet['!cols'] = [
      { wch: 12 }, { wch: 15 }, { wch: 25 }, { wch: 30 },
      { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 8 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Product Template');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=product_import_template.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    console.log('✅ Template generated successfully');
    res.send(buffer);
  } catch (error) {
    console.error('❌ Template download error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ COPIED FROM TENANT.JS: Product categories list
router.get("/products/categories", requireAuth, async (req, res) => {
  try {
    const categories = await Item.distinct('category', {
      ownerId: req.ownerId,
      status: 'active'
    });

    console.log(`🏷️ Found ${categories.length} categories`);

    res.json({
      success: true,
      categories: categories.filter(Boolean)
    });
  } catch (error) {
    console.error("❌ Categories error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ COPIED FROM TENANT.JS: Get pricing for product and quantity
router.get("/products/:id/pricing", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity = 1 } = req.query;

    const product = await Item.findOne({
      _id: id,
      ownerId: req.ownerId,
      status: 'active'
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found"
      });
    }

    const unitPrice = product.getPriceForQuantity(parseInt(quantity));
    const lineTotal = unitPrice * parseInt(quantity);
    const taxAmount = (lineTotal * product.taxRate) / 100;
    const totalAmount = lineTotal + taxAmount;

    res.json({
      success: true,
      product: {
        _id: product._id,
        name: product.name,
        description: product.description,
        itemCode: product.itemCode,
        partNumber: product.partNumber
      },
      pricing: {
        quantity: parseInt(quantity),
        unitPrice,
        lineTotal,
        taxRate: product.taxRate,
        taxAmount,
        totalAmount
      }
    });
  } catch (error) {
    console.error("❌ Pricing calculation error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ NEW: Stock Operations for Add/Remove Inventory
router.post("/products/:id/stock/add", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, reason, serialNumbers = [] } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid quantity is required"
      });
    }

    const product = await Item.findOne({ _id: id, ownerId: req.ownerId });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found"
      });
    }

    // Update stock quantity
    product.stockQuantity = (product.stockQuantity || 0) + parseInt(quantity);
    await product.save();

    console.log(`📦 Added ${quantity} units to ${product.name}. New stock: ${product.stockQuantity}`);

    res.json({
      success: true,
      message: `Added ${quantity} units successfully`,
      product: {
        _id: product._id,
        name: product.name,
        itemCode: product.itemCode,
        stockQuantity: product.stockQuantity,
        stockStatus: product.stockStatus
      }
    });
  } catch (error) {
    console.error("❌ Add stock error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post("/products/:id/stock/remove", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, reason } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "Valid quantity is required"
      });
    }

    const product = await Item.findOne({ _id: id, ownerId: req.ownerId });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found"
      });
    }

    // Check if sufficient stock is available
    if (product.stockQuantity < quantity) {
      return res.status(400).json({
        success: false,
        error: `Insufficient stock. Available: ${product.stockQuantity}, Requested: ${quantity}`
      });
    }

    // Update stock quantity
    product.stockQuantity = Math.max(0, product.stockQuantity - parseInt(quantity));
    await product.save();

    console.log(`📦 Removed ${quantity} units from ${product.name}. New stock: ${product.stockQuantity}`);

    res.json({
      success: true,
      message: `Removed ${quantity} units successfully`,
      product: {
        _id: product._id,
        name: product.name,
        itemCode: product.itemCode,
        stockQuantity: product.stockQuantity,
        stockStatus: product.stockStatus
      }
    });
  } catch (error) {
    console.error("❌ Remove stock error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test route
router.get("/test", requireAuth, (req, res) => {
  res.json({
    success: true,
    message: "Inventory API is working!",
    ownerId: req.ownerId
  });
});

export default router;
