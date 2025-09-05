// ✅ CRITICAL: This MUST be the very first line to fix env loading
import 'dotenv/config';

import express from "express";
import cors from "cors";
import { connectDB } from "./db.js";
import tenantRoutes from "./routes/tenant.js";
import publicRoutes from "./routes/public.js";
import adminPanelRoutes from "./routes/adminPanel.js";
import inventoryRoutes from "./routes/inventory.js";
import overdueRemindersRoutes from "./routes/overdueReminders.js"; // ✅ Existing overdue reminders route
import bankDetailsRoutes from "./routes/bankDetails.js"; // ✅ Existing bank details route
import paymentRoutes from "./routes/payments.js"; // ✅ NEW: Payment routes import
import path from "path";
import serveIndex from "serve-index";

// ✅ DEBUG: Environment variables check
console.log('🔍 Environment Variables Debug:');
console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? 'Loaded ✅' : 'Missing ❌');
console.log('RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? 'Loaded ✅' : 'Missing ❌');
console.log('UNLOCK_PAYMENT_AMOUNT:', process.env.UNLOCK_PAYMENT_AMOUNT || 'Using default 20000');

const app = express();

app.use(cors());
app.use(express.json());

// ✅ UPDATED: Serve uploads with both static files AND directory listing
const uploadsPath = path.join(process.cwd(), 'uploads');
app.use("/api/uploads", express.static(uploadsPath));
app.use("/api/uploads", serveIndex(uploadsPath, {
  'icons': true,
  'view': 'details',
  'template': 'html'
}));

// Health check
app.get("/health", (_req, res) => {
  res.json({ 
    ok: true, 
    dbConfigured: Boolean(process.env.MONGO_URI),
    timestamp: new Date(),
    version: "1.0.0"
  });
});

// ✅ Enhanced health check for admin panel
app.get("/api/health", (_req, res) => {
  res.json({
    status: "healthy",
    services: {
      database: Boolean(process.env.MONGO_URI),
      server: "running",
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      razorpay: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
    },
    timestamp: new Date()
  });
});

// Mount routes
app.use("/api/public", publicRoutes);
app.use("/api/tenant", tenantRoutes);
app.use("/api/admin-panel", adminPanelRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api", overdueRemindersRoutes); // ✅ Existing overdue reminders route
app.use("/api/bank-details", bankDetailsRoutes); // ✅ Existing bank details route
app.use("/api/payments", paymentRoutes); // ✅ NEW: Mount payment routes

// ✅ Global error handler for better admin panel debugging
app.use((err, req, res, next) => {
  console.error("❌ Global error:", err);
  
  // Don't expose error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    error: isDevelopment ? err.message : 'Internal server error',
    ...(isDevelopment && { stack: err.stack })
  });
});

// ✅ Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date()
  });
});

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    // Connect to database
    await connectDB(process.env.MONGO_URI);
    console.log("✅ Database connected successfully");
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 Backend running on http://localhost:${PORT}`);
      console.log(`📊 Admin Panel API: http://localhost:${PORT}/api/admin-panel`);
      console.log(`🏢 Tenant API: http://localhost:${PORT}/api/tenant`);
      console.log(`🌐 Public API: http://localhost:${PORT}/api/public`);
      console.log(`📦 Inventory API: http://localhost:${PORT}/api/inventory`);
      console.log(`🚨 Overdue Reminders API: http://localhost:${PORT}/api/overdue-reminders`);
      console.log(`🏦 Bank Details API: http://localhost:${PORT}/api/bank-details`);
      console.log(`💳 Payment API: http://localhost:${PORT}/api/payments`); // ✅ NEW: Payment API log
      console.log(`💾 File uploads: http://localhost:${PORT}/api/uploads`);
      console.log(`📁 Directory listing: http://localhost:${PORT}/api/uploads/`);
      console.log(`❤️ Health check: http://localhost:${PORT}/health`);
      
      // ✅ Log environment info
      console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📝 Node version: ${process.version}`);
      
      // ✅ Admin login instructions
      console.log(`\n🛡️ ADMIN PANEL READY:`);
      console.log(`   Login at: POST /api/admin-panel/login`);
      console.log(`   Username: admin`);
      console.log(`   Password: admin123`);

      // ✅ Inventory API instructions
      console.log(`\n📦 INVENTORY SYSTEM READY:`);
      console.log(`   Products: GET /api/inventory/products`);
      console.log(`   Search: GET /api/inventory/products/search?q=query`);
      console.log(`   Add Stock: POST /api/inventory/products/:id/stock/add`);
      console.log(`   Test API: GET /api/inventory/test`);

      // ✅ Overdue reminders API instructions
      console.log(`\n🚨 OVERDUE REMINDERS SYSTEM READY:`);
      console.log(`   Get Overdue: GET /api/overdue-reminders`);
      console.log(`   Dismiss Reminders: POST /api/overdue-reminders/dismiss`);
      console.log(`   Dashboard will auto-show overdue alerts`);

      // ✅ Bank Details API instructions
      console.log(`\n🏦 BANK DETAILS SYSTEM READY:`);
      console.log(`   Get Bank Details: GET /api/bank-details`);
      console.log(`   Update Bank Details: PUT /api/bank-details`);
      console.log(`   Add Bank Account: POST /api/bank-details/accounts`);
      console.log(`   Get All Accounts: GET /api/bank-details/accounts`);
      console.log(`   Update Account: PUT /api/bank-details/accounts/:id`);
      console.log(`   Delete Account: DELETE /api/bank-details/accounts/:id`);
      console.log(`   Validate Details: POST /api/bank-details/validate`);
      console.log(`   🆔 PAN Card validation included in all operations`);

      // ✅ NEW: Payment API instructions
      console.log(`\n💳 RAZORPAY PAYMENT SYSTEM READY:`);
      console.log(`   Create Unlock Order: POST /api/payments/create-unlock-order`);
      console.log(`   Verify Payment: POST /api/payments/verify-unlock-payment`);
      console.log(`   Payment History: GET /api/payments/payment-history`);
      console.log(`   💰 Unlock Amount: ₹${(process.env.UNLOCK_PAYMENT_AMOUNT || 20000) / 100}`);
      console.log(`   🔑 Razorpay Key: ${process.env.RAZORPAY_KEY_ID ? 'Configured ✅' : 'Missing ❌'}`);

      // ✅ Final environment validation
      if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        console.log(`\n⚠️ WARNING: Razorpay not fully configured!`);
        console.log(`   Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your .env file`);
        console.log(`   Get keys from: https://dashboard.razorpay.com/app/keys`);
      } else {
        console.log(`\n✅ All systems operational! Payment integration ready.`);
      }
    });
    
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// ✅ Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT. Graceful shutdown...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM. Graceful shutdown...');
  process.exit(0);
});

// ✅ Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

start().catch((e) => {
  console.error("❌ Fatal start error:", e);
  process.exit(1);
});
