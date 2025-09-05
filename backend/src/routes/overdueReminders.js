import { Router } from "express";
import { Invoice } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ✅ UPDATED: Get overdue + soon-to-be-overdue invoices (3 days warning)
router.get("/overdue-reminders", requireAuth, async (req, res) => {
  try {
    console.log('🚨 Fetching overdue + soon-to-be-overdue invoices for owner:', req.ownerId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // ✅ NEW: Calculate 3 days from now for early warning
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);

    // ✅ ENHANCED: Find invoices that are overdue OR due within next 3 days
    const criticalInvoices = await Invoice.find({
      ownerId: req.ownerId,
      dueDate: { $lte: threeDaysFromNow }, // Due today or within 3 days (includes overdue)
      paymentStatus: { $in: ['pending', 'partial'] },
      status: { $ne: 'cancelled' }
    })
    .populate('customerId', 'name phone email')
    .sort({ dueDate: 1 }) // Oldest/most urgent first
    .limit(20);

    // ✅ ENHANCED: Calculate days with proper categorization
    const invoicesWithStatus = criticalInvoices.map(invoice => {
      const dueDate = new Date(invoice.dueDate);
      const diffTime = dueDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let status, urgency, daysOverdue = 0, daysUntilDue = 0;
      
      if (diffDays < 0) {
        // Already overdue
        status = 'overdue';
        urgency = 'critical';
        daysOverdue = Math.abs(diffDays);
      } else if (diffDays === 0) {
        // Due today
        status = 'due-today';
        urgency = 'high';
        daysUntilDue = 0;
      } else if (diffDays <= 3) {
        // Due within next 3 days
        status = 'due-soon';
        urgency = diffDays === 1 ? 'high' : 'medium';
        daysUntilDue = diffDays;
      }
      
      return {
        ...invoice.toObject(),
        status,
        urgency,
        daysOverdue,
        daysUntilDue,
        totalDays: daysOverdue > 0 ? -daysOverdue : daysUntilDue
      };
    });

    // ✅ ENHANCED: Categorize invoices for better display
    const overdueInvoices = invoicesWithStatus.filter(inv => inv.status === 'overdue');
    const dueTodayInvoices = invoicesWithStatus.filter(inv => inv.status === 'due-today');
    const dueSoonInvoices = invoicesWithStatus.filter(inv => inv.status === 'due-soon');

    const totalCriticalAmount = criticalInvoices.reduce((sum, inv) => sum + (inv.balanceAmount || 0), 0);
    const totalCriticalCount = criticalInvoices.length;

    console.log(`🚨 Found ${totalCriticalCount} critical invoices (${overdueInvoices.length} overdue, ${dueTodayInvoices.length} due today, ${dueSoonInvoices.length} due soon)`);

    res.json({
      success: true,
      critical: {
        invoices: invoicesWithStatus,
        categories: {
          overdue: overdueInvoices,
          dueToday: dueTodayInvoices,
          dueSoon: dueSoonInvoices
        },
        summary: {
          total: totalCriticalCount,
          overdue: overdueInvoices.length,
          dueToday: dueTodayInvoices.length,
          dueSoon: dueSoonInvoices.length,
          totalAmount: totalCriticalAmount
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching critical invoices:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ POST /overdue-reminders/dismiss - Dismiss reminders for today
router.post("/overdue-reminders/dismiss", requireAuth, async (req, res) => {
  try {
    console.log('🔕 User dismissed overdue reminders for today:', req.ownerId);

    res.json({
      success: true,
      message: "Reminders dismissed for today"
    });
  } catch (error) {
    console.error('❌ Error dismissing reminders:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
