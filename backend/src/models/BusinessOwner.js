import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const BusinessOwnerSchema = new mongoose.Schema({
  // Owner Personal Info
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  
  // Business Info
  businessName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  businessPhone: {
    type: String,
    trim: true
  },
  businessEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  gstin: {
    type: String,
    trim: true,
    sparse: true
  },
  
  // Subscription Info
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'expired'],
    default: 'active'
  },
  trialEndsAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  },
  subscriptionEndsAt: {
    type: Date
  },
  
  // ✅ Lock/Unlock functionality (EXISTING)
  isLocked: {
    type: Boolean,
    default: false
  },

  // ✅ Force logout functionality (EXISTING)
  forceLogout: {
    type: Boolean,
    default: false
  },

  // ✅ Logout timestamp for tracking (EXISTING)
  logoutTimestamp: {
    type: Date
  },

  // ✅ Admin action logging (EXISTING)
  lastAdminAction: {
    action: String,        // e.g., 'Forced Logout', 'Account Locked', etc.
    reason: String,        // Reason for the action
    adminUser: String,     // Which admin performed the action
    timestamp: Date        // When the action was performed
  },

  // ✅ NEW: Simple Payment History for ₹200 Unlock
  payments: [{
    razorpayOrderId: {
      type: String,
      required: true
    },
    razorpayPaymentId: {
      type: String,
      required: true
    },
    razorpaySignature: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true        // Amount in paise (20000 = ₹200)
    },
    currency: {
      type: String,
      default: 'INR'
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending'
    },
    paymentMethod: {
      type: String          // card, netbanking, wallet, upi
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    completedAt: {
      type: Date
    },
    purpose: {
      type: String,
      default: 'account_unlock'
    },
    notes: {
      type: String
    }
  }],

  // ✅ NEW: Simple Payment Statistics
  paymentStats: {
    totalPaid: {
      type: Number,
      default: 0            // Total paid in paise
    },
    totalUnlockPayments: {
      type: Number,
      default: 0
    },
    lastPaymentAmount: {
      type: Number,
      default: 0
    },
    firstPaymentDate: {
      type: Date
    }
  }

}, {
  timestamps: true
});

// Password verification method (EXISTING - UNCHANGED)
BusinessOwnerSchema.methods.verifyPassword = async function(password) {
  try {
    console.log('🔐 Verifying password for business owner:', this.name);
    const isValid = await bcrypt.compare(password, this.passwordHash);
    console.log('🔐 Password verification result:', isValid);
    return isValid;
  } catch (error) {
    console.error('❌ Password verification error:', error);
    return false;
  }
};

// ✅ NEW: Simple unlock method after ₹200 payment
BusinessOwnerSchema.methods.unlockViaPayment = function(paymentData) {
  // Add payment record
  this.payments.push(paymentData);
  
  // Unlock account
  this.isLocked = false;
  
  // Update payment stats
  this.paymentStats.totalPaid += paymentData.amount;
  this.paymentStats.totalUnlockPayments += 1;
  this.paymentStats.lastPaymentAmount = paymentData.amount;
  
  if (!this.paymentStats.firstPaymentDate) {
    this.paymentStats.firstPaymentDate = new Date();
  }
  
  // Log the unlock action
  this.lastAdminAction = {
    action: 'Account Unlocked via Payment',
    reason: `₹${paymentData.amount / 100} payment completed`,
    adminUser: 'system',
    timestamp: new Date()
  };
  
  return this.save();
};

// ✅ NEW: Get payment history
BusinessOwnerSchema.methods.getPaymentHistory = function(limit = 10) {
  return this.payments
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
};

// Indexes for performance (EXISTING + NEW)
BusinessOwnerSchema.index({ phone: 1 });
BusinessOwnerSchema.index({ businessName: 1 });
BusinessOwnerSchema.index({ businessEmail: 1 });
BusinessOwnerSchema.index({ status: 1 });
BusinessOwnerSchema.index({ isLocked: 1 });                     // ✅ EXISTING: Index for lock status
BusinessOwnerSchema.index({ forceLogout: 1 });                  // ✅ EXISTING: Index for logout flag
BusinessOwnerSchema.index({ 'payments.razorpayPaymentId': 1 }); // ✅ NEW: Index for payment lookup
BusinessOwnerSchema.index({ 'payments.status': 1 });            // ✅ NEW: Index for payment status

const BusinessOwner = mongoose.model('BusinessOwner', BusinessOwnerSchema);
export default BusinessOwner;
