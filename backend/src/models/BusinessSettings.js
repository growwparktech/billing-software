import mongoose from 'mongoose';

const businessSettingsSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessOwner',
    required: true,
    unique: true // One settings document per business owner
  },
  
  // ✅ Business Owner GSTIN for Tax Calculations
  businessInfo: {
    ownerGSTIN: {
      type: String,
      trim: true,
      uppercase: true,
      validate: {
        validator: function(gstin) {
          if (!gstin) return true; // GSTIN is optional
          
          // Validate GSTIN format: 15 characters, specific pattern
          const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;
          return gstinRegex.test(gstin);
        },
        message: 'Invalid GSTIN format. Must be 15 characters in format: XXAAAAANNNNXNXN'
      }
    },
    businessName: {
      type: String,
      trim: true
    },
    logoUrl: {
      type: String,
      trim: true,
      default: ''
    },
    businessAddress: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' }
    },
    businessPhone: String,
    businessEmail: String,
    // ✅ NEW: Business Owner PAN Card (separate from bank PAN)
    ownerPanCard: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 10,
      validate: {
        validator: function(pan) {
          if (!pan) return true; // PAN is optional
          return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
        },
        message: 'Invalid PAN Card number format (e.g., ABCDE1234F)'
      }
    }
  },
  
  // Item Configuration Settings
  itemSettings: {
    itemCodePrefix: {
      type: String,
      default: 'ITM',
      maxlength: 10,
      trim: true,
      uppercase: true
    },
    itemPartNumberPrefix: {
      type: String,
      default: 'PN',
      maxlength: 10,
      trim: true,
      uppercase: true
    },
    autoGenerateItemCodes: {
      type: Boolean,
      default: true
    },
    nextItemCodeSequence: {
      type: Number,
      default: 1
    },
    nextPartNumberSequence: {
      type: Number,
      default: 1
    }
  },
  
  // ✅ Item Templates for Quick Auto-Fill
  itemTemplates: [{
    itemCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    taxRate: {
      type: Number,
      required: true,
      min: 0,
      max: 50,
      default: 18
    },
    hsnCode: {
      type: String,
      trim: true
    },
    unit: {
      type: String,
      default: 'NOS',
      trim: true
    }
  }],
  
  // ✅ UPDATED: Invoice Default Settings with Separate Prefixes
  invoiceSettings: {
    defaultTaxRate: {
      type: Number,
      default: 18,
      min: 0,
      max: 50
    },
    defaultPaymentTerms: {
      type: String,
      default: '30 days',
      enum: ['Immediate', '15 days', '30 days', '45 days', '60 days']
    },
    defaultTaxType: {
      type: String,
      default: 'IGST',
      enum: ['IGST', 'CGST_SGST']
    },
    
    // ✅ NEW: Separate Invoice Prefixes for Each Type
    salesInvoicePrefix: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 15,
      default: function() {
        return `SALE-${new Date().getFullYear()}`;
      },
      validate: {
        validator: function(prefix) {
          if (!prefix) return true;
          const prefixRegex = /^[A-Z0-9-]+$/;
          return prefixRegex.test(prefix);
        },
        message: 'Sales invoice prefix can only contain letters, numbers, and hyphens'
      }
    },
    
    purchaseInvoicePrefix: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 15,
      default: function() {
        return `PUR-${new Date().getFullYear()}`;
      },
      validate: {
        validator: function(prefix) {
          if (!prefix) return true;
          const prefixRegex = /^[A-Z0-9-]+$/;
          return prefixRegex.test(prefix);
        },
        message: 'Purchase invoice prefix can only contain letters, numbers, and hyphens'
      }
    },
    
    quotationInvoicePrefix: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 15,
      default: function() {
        return `QUOT-${new Date().getFullYear()}`;
      },
      validate: {
        validator: function(prefix) {
          if (!prefix) return true;
          const prefixRegex = /^[A-Z0-9-]+$/;
          return prefixRegex.test(prefix);
        },
        message: 'Quotation prefix can only contain letters, numbers, and hyphens'
      }
    },
    
    // ✅ DEPRECATED: Keep old invoicePrefix for backward compatibility (will be migrated)
    invoicePrefix: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 15,
      default: function() {
        return `INV-${new Date().getFullYear()}`;
      },
      validate: {
        validator: function(prefix) {
          if (!prefix) return true;
          const prefixRegex = /^[A-Z0-9-]+$/;
          return prefixRegex.test(prefix);
        },
        message: 'Invoice prefix can only contain letters, numbers, and hyphens'
      }
    }
  },

  // ✅ NEW: Primary Bank Details Section with PAN Card
  bankDetails: {
    bankName: {
      type: String,
      trim: true
    },
    branchName: {
      type: String,
      trim: true
    },
    accountNumber: {
      type: String,
      trim: true
    },
    ifscCode: {
      type: String,
      trim: true,
      uppercase: true,
      validate: {
        validator: function(ifsc) {
          if (!ifsc) return true; // IFSC is optional
          return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
        },
        message: 'Invalid IFSC code format'
      }
    },
    accountType: {
      type: String,
      enum: ['Current', 'Savings', 'Other'],
      default: 'Current'
    },
    accountHolderName: {
      type: String,
      trim: true
    },
    // ✅ NEW: PAN Card field for bank account
    panCardNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 10,
      validate: {
        validator: function(pan) {
          if (!pan) return true; // PAN is optional
          return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
        },
        message: 'Invalid PAN Card number format (e.g., ABCDE1234F)'
      }
    },
    upiId: {
      type: String,
      trim: true
    },
    qrCodeUrl: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },

  // ✅ NEW: Multiple Bank Accounts Support with PAN Card
  bankAccounts: [{
    id: {
      type: String,
      required: true
    },
    bankName: {
      type: String,
      required: true,
      trim: true
    },
    branchName: {
      type: String,
      trim: true
    },
    accountNumber: {
      type: String,
      required: true,
      trim: true
    },
    ifscCode: {
      type: String,
      trim: true,
      uppercase: true,
      validate: {
        validator: function(ifsc) {
          if (!ifsc) return true;
          return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
        },
        message: 'Invalid IFSC code format'
      }
    },
    accountType: {
      type: String,
      enum: ['Current', 'Savings', 'Other'],
      default: 'Current'
    },
    accountHolderName: {
      type: String,
      required: true,
      trim: true
    },
    // ✅ NEW: PAN Card field for individual accounts
    panCardNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 10,
      validate: {
        validator: function(pan) {
          if (!pan) return true;
          return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
        },
        message: 'Invalid PAN Card number format'
      }
    },
    upiId: {
      type: String,
      trim: true
    },
    isPrimary: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // ✅ NEW: Payment & Transaction Settings
  paymentSettings: {
    acceptCash: {
      type: Boolean,
      default: true
    },
    acceptCard: {
      type: Boolean,
      default: true
    },
    acceptUPI: {
      type: Boolean,
      default: true
    },
    acceptCheque: {
      type: Boolean,
      default: true
    },
    defaultPaymentMethod: {
      type: String,
      enum: ['cash', 'card', 'upi', 'cheque', 'bank_transfer'],
      default: 'cash'
    },
    // Payment gateway settings (for future use)
    paymentGateway: {
      provider: {
        type: String,
        enum: ['razorpay', 'stripe', 'paytm', 'phonepe', 'none'],
        default: 'none'
      },
      merchantId: {
        type: String,
        trim: true
      },
      apiKey: {
        type: String,
        trim: true
      },
      secretKey: {
        type: String,
        trim: true
      },
      isActive: {
        type: Boolean,
        default: false
      }
    }
  },

  // ✅ NEW: Business Compliance Settings
  complianceSettings: {
    gstRegistered: {
      type: Boolean,
      default: false
    },
    eInvoiceRequired: {
      type: Boolean,
      default: false
    },
    eInvoiceThreshold: {
      type: Number,
      default: 500000 // 5 Lakh threshold for e-invoice
    },
    tdsApplicable: {
      type: Boolean,
      default: false
    },
    compositeGST: {
      type: Boolean,
      default: false
    }
  }
  
}, {
  timestamps: true
});

// ✅ Indexes for performance
businessSettingsSchema.index({ ownerId: 1 });
businessSettingsSchema.index({ 'itemTemplates.itemCode': 1 }); // For fast item template lookup
businessSettingsSchema.index({ 'businessInfo.ownerGSTIN': 1 }); // ✅ For tax calculations
businessSettingsSchema.index({ 'businessInfo.ownerPanCard': 1 }, { sparse: true }); // ✅ NEW: Business owner PAN index
businessSettingsSchema.index({ 'bankDetails.panCardNumber': 1 }, { sparse: true }); // ✅ NEW: Primary bank PAN index
businessSettingsSchema.index({ 'bankAccounts.panCardNumber': 1 }, { sparse: true }); // ✅ NEW: Multiple bank PAN index
businessSettingsSchema.index({ 'bankAccounts.id': 1 }); // For fast bank account lookup
businessSettingsSchema.index({ 'bankAccounts.isPrimary': 1 }); // For finding primary account

// ✅ Method to find item template by code
businessSettingsSchema.methods.findItemTemplate = function(itemCode) {
  const searchCode = itemCode.toUpperCase();
  return this.itemTemplates.find(template => 
    template.itemCode.toUpperCase() === searchCode
  );
};

// ✅ Method to get owner GSTIN for tax calculations
businessSettingsSchema.methods.getOwnerGSTIN = function() {
  return this.businessInfo?.ownerGSTIN || null;
};

// ✅ Method to extract state code from owner GSTIN
businessSettingsSchema.methods.getOwnerStateCode = function() {
  const gstin = this.getOwnerGSTIN();
  return gstin ? gstin.substring(0, 2) : null;
};

// ✅ DEPRECATED: Method to get custom invoice prefix (for backward compatibility)
businessSettingsSchema.methods.getInvoicePrefix = function() {
  return this.invoiceSettings?.invoicePrefix || `INV-${new Date().getFullYear()}`;
};

// ✅ NEW: Method to get appropriate prefix based on invoice type
businessSettingsSchema.methods.getInvoicePrefixByType = function(invoiceType) {
  const currentYear = new Date().getFullYear();
  
  switch (invoiceType?.toUpperCase()) {
    case 'SALES':
    case 'SALE':
      return this.invoiceSettings?.salesInvoicePrefix || `SALE-${currentYear}`;
    
    case 'PURCHASE':
    case 'PURCHASES':
      return this.invoiceSettings?.purchaseInvoicePrefix || `PUR-${currentYear}`;
    
    case 'QUOTATION':
    case 'QUOTE':
      return this.invoiceSettings?.quotationInvoicePrefix || `QUOT-${currentYear}`;
    
    default:
      console.warn(`Unknown invoice type: ${invoiceType}, using SALES prefix`);
      return this.invoiceSettings?.salesInvoicePrefix || `SALE-${currentYear}`;
  }
};

// ✅ NEW: Method to validate and clean prefix by type
businessSettingsSchema.methods.validateInvoicePrefixByType = function(invoiceType, prefix) {
  const currentYear = new Date().getFullYear();
  
  if (!prefix) {
    return this.getInvoicePrefixByType(invoiceType);
  }
  
  // Clean the prefix: remove invalid chars, limit length, uppercase
  const cleaned = prefix
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .substring(0, 15);
  
  return cleaned || this.getInvoicePrefixByType(invoiceType);
};

// ✅ DEPRECATED: Method to validate and clean invoice prefix (for backward compatibility)
businessSettingsSchema.methods.validateInvoicePrefix = function(prefix) {
  if (!prefix) return `INV-${new Date().getFullYear()}`;
  
  // Clean the prefix: remove invalid chars, limit length, uppercase
  const cleaned = prefix
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .substring(0, 15);
  
  return cleaned || `INV-${new Date().getFullYear()}`;
};

// ✅ NEW: Method to get primary bank account
businessSettingsSchema.methods.getPrimaryBankAccount = function() {
  // First check for primary account in bankAccounts array
  if (this.bankAccounts && this.bankAccounts.length > 0) {
    const primaryAccount = this.bankAccounts.find(account => 
      account.isPrimary && account.isActive
    );
    
    if (primaryAccount) {
      return primaryAccount;
    }
    
    // If no primary, return first active account
    const firstActive = this.bankAccounts.find(account => account.isActive);
    if (firstActive) {
      return firstActive;
    }
  }
  
  // Fallback to main bankDetails if available
  if (this.bankDetails && this.bankDetails.isActive && this.bankDetails.bankName) {
    return {
      ...this.bankDetails.toObject(),
      id: 'primary',
      isPrimary: true
    };
  }
  
  return null;
};

// ✅ NEW: Method to get all active bank accounts
businessSettingsSchema.methods.getActiveBankAccounts = function() {
  const accounts = [];
  
  // Add primary bank details if available
  if (this.bankDetails && this.bankDetails.isActive && this.bankDetails.bankName) {
    accounts.push({
      ...this.bankDetails.toObject(),
      id: 'primary',
      isPrimary: true
    });
  }
  
  // Add other bank accounts
  if (this.bankAccounts && this.bankAccounts.length > 0) {
    const activeAccounts = this.bankAccounts.filter(account => account.isActive);
    accounts.push(...activeAccounts);
  }
  
  return accounts;
};

// ✅ NEW: Method to validate PAN card format
businessSettingsSchema.methods.validatePanCard = function(panNumber) {
  if (!panNumber) return true; // PAN is optional
  
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
  return panRegex.test(panNumber.toUpperCase());
};

// ✅ NEW: Method to get owner PAN card
businessSettingsSchema.methods.getOwnerPanCard = function() {
  return this.businessInfo?.ownerPanCard || null;
};

// ✅ NEW: Method to check if business is GST registered
businessSettingsSchema.methods.isGSTRegistered = function() {
  return !!(this.businessInfo?.ownerGSTIN && this.complianceSettings?.gstRegistered);
};

// ✅ NEW: Method to check if e-invoice is required for amount
businessSettingsSchema.methods.isEInvoiceRequired = function(invoiceAmount) {
  if (!this.complianceSettings?.eInvoiceRequired) return false;
  
  const threshold = this.complianceSettings.eInvoiceThreshold || 500000;
  return invoiceAmount >= threshold;
};

// Method to get next item code
businessSettingsSchema.methods.getNextItemCode = function() {
  const code = `${this.itemSettings.itemCodePrefix}-${String(this.itemSettings.nextItemCodeSequence).padStart(3, '0')}`;
  this.itemSettings.nextItemCodeSequence += 1;
  return code;
};

// Method to get next part number
businessSettingsSchema.methods.getNextPartNumber = function() {
  const partNumber = `${this.itemSettings.itemPartNumberPrefix}-${String(this.itemSettings.nextPartNumberSequence).padStart(3, '0')}`;
  this.itemSettings.nextPartNumberSequence += 1;
  return partNumber;
};

// ✅ NEW: Static method to find settings by owner PAN
businessSettingsSchema.statics.findByOwnerPAN = function(panNumber) {
  const searchPAN = panNumber.toUpperCase();
  return this.findOne({
    'businessInfo.ownerPanCard': searchPAN
  });
};

// ✅ NEW: Static method to find settings by bank PAN
businessSettingsSchema.statics.findByBankPAN = function(panNumber) {
  const searchPAN = panNumber.toUpperCase();
  return this.find({
    $or: [
      { 'bankDetails.panCardNumber': searchPAN },
      { 'bankAccounts.panCardNumber': searchPAN }
    ]
  });
};

// ✅ Pre-save middleware to ensure data consistency
businessSettingsSchema.pre('save', function(next) {
  // Ensure only one primary bank account
  if (this.bankAccounts && this.bankAccounts.length > 0) {
    const primaryAccounts = this.bankAccounts.filter(account => account.isPrimary);
    
    if (primaryAccounts.length > 1) {
      // Keep only the first primary, make others non-primary
      let foundFirst = false;
      this.bankAccounts.forEach(account => {
        if (account.isPrimary) {
          if (foundFirst) {
            account.isPrimary = false;
          } else {
            foundFirst = true;
          }
        }
      });
    }
  }
  
  // Update timestamps for modified bank accounts
  if (this.bankAccounts) {
    this.bankAccounts.forEach(account => {
      if (account.isModified || account.isNew) {
        account.updatedAt = new Date();
      }
    });
  }
  
  next();
});

const BusinessSettings = mongoose.model('BusinessSettings', businessSettingsSchema);

export default BusinessSettings;
