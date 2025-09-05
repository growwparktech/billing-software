import mongoose from "mongoose";

// ✅ FIXED: Address schema with proper closing brace
const addressSchema = {
  street: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  pincode: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    default: 'India',
    trim: true
  }
}; // ✅ FIXED: Added missing closing brace

const CustomerSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessOwner',
    required: true,
    index: true
  },
  
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  phone: {
    type: String,
    required: true,
    trim: true
  },
  
  email: {
    type: String,
    lowercase: true,
    trim: true
  },

  // ✅ NEW: Vendor Code field
  vendorCode: {
    type: String,
    trim: true,
    uppercase: true,
    maxlength: 50,
    default: ''
  },
  
  // ✅ UPDATED: Separate billing and shipping addresses
  billingAddress: {
    type: addressSchema,
    default: () => ({})
  },
  
  shippingAddress: {
    type: addressSchema,
    default: () => ({})
  },
  
  // ✅ ENHANCED: GSTIN with validation and state extraction
  gstin: {
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
  
  // ✅ NEW: Auto-extracted state code from GSTIN
  gstStateCode: {
    type: String,
    length: 2
  },
  
  // ✅ NEW: Auto-extracted state name from GSTIN  
  gstStateName: {
    type: String
  },
  
  customerType: {
    type: String,
    enum: ['individual', 'business'],
    default: 'individual'
  },
  
  paymentTerms: {
    type: String,
    enum: ['immediate', '15_days', '30_days', '45_days', '60_days'],
    default: 'immediate'
  },
  
  creditLimit: {
    type: Number,
    default: 0,
    min: 0
  },
  
  totalSales: {
    type: Number,
    default: 0,
    min: 0
  },
  
  outstandingBalance: {
    type: Number,
    default: 0
  },
  
  lastInvoiceDate: {
    type: Date
  },
  
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  
  notes: {
    type: String,
    trim: true
  },

  // ✅ FIXED: Bank Details with proper structure
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
      uppercase: true
    },
    accountHolderName: {
      type: String,
      trim: true
    }
  } // ✅ FIXED: Proper closing without extra comma
}, {
  timestamps: true, // ✅ FIXED: Moved timestamps outside of schema fields
  minimize: false   // ✅ CRITICAL FIX: Prevents empty nested objects from being removed
});

// ✅ NEW: Pre-save hook to extract state info from GSTIN
CustomerSchema.pre('save', function(next) {
  if (this.gstin) {
    // Extract state code (first 2 digits)
    this.gstStateCode = this.gstin.substring(0, 2);
    
    // Map state code to state name
    const stateMapping = {
      '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
      '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
      '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
      '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
      '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
      '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
      '24': 'Gujarat', '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli',
      '27': 'Maharashtra', '28': 'Andhra Pradesh', '29': 'Karnataka', '30': 'Goa',
      '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Pudicherry',
      '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh'
    };
    
    this.gstStateName = stateMapping[this.gstStateCode] || 'Unknown State';
  } else {
    this.gstStateCode = undefined;
    this.gstStateName = undefined;
  }
  
  next();
});

// ✅ NEW: Method to check if billing and shipping addresses are the same
CustomerSchema.methods.hasSameAddresses = function() {
  if (!this.billingAddress || !this.shippingAddress) return false;
  
  return (
    this.billingAddress.street === this.shippingAddress.street &&
    this.billingAddress.city === this.shippingAddress.city &&
    this.billingAddress.state === this.shippingAddress.state &&
    this.billingAddress.pincode === this.shippingAddress.pincode &&
    this.billingAddress.country === this.shippingAddress.country
  );
};

// ✅ NEW: Method to get formatted billing address
CustomerSchema.methods.getFormattedBillingAddress = function() {
  if (!this.billingAddress) return 'No billing address provided';
  
  const parts = [
    this.billingAddress.street,
    this.billingAddress.city,
    this.billingAddress.state,
    this.billingAddress.pincode,
    this.billingAddress.country
  ].filter(part => part && part.trim());
  
  return parts.length > 0 ? parts.join(', ') : 'No billing address provided';
};

// ✅ NEW: Method to get formatted shipping address
CustomerSchema.methods.getFormattedShippingAddress = function() {
  if (!this.shippingAddress) return 'No shipping address provided';
  
  const parts = [
    this.shippingAddress.street,
    this.shippingAddress.city,
    this.shippingAddress.state,
    this.shippingAddress.pincode,
    this.shippingAddress.country
  ].filter(part => part && part.trim());
  
  return parts.length > 0 ? parts.join(', ') : 'No shipping address provided';
};

// ✅ NEW: Method to sync shipping address with billing address
CustomerSchema.methods.syncShippingToBilling = function() {
  if (this.billingAddress) {
    this.shippingAddress = {
      street: this.billingAddress.street,
      city: this.billingAddress.city,
      state: this.billingAddress.state,
      pincode: this.billingAddress.pincode,
      country: this.billingAddress.country
    };
  }
};

// ✅ NEW: Static method to find customers by state code
CustomerSchema.statics.findByStateCode = function(ownerId, stateCode) {
  return this.find({
    ownerId: ownerId,
    gstStateCode: stateCode,
    status: 'active'
  });
};

// ✅ NEW: Static method to find customers with pending balances
CustomerSchema.statics.findWithPendingBalances = function(ownerId) {
  return this.find({
    ownerId: ownerId,
    outstandingBalance: { $gt: 0 },
    status: 'active'
  }).sort({ outstandingBalance: -1 });
};

// Indexes for performance optimization
CustomerSchema.index({ ownerId: 1, phone: 1 }, { unique: true });
CustomerSchema.index({ ownerId: 1, name: 1 });
CustomerSchema.index({ ownerId: 1, status: 1 });
CustomerSchema.index({ ownerId: 1, gstStateCode: 1 }); // ✅ For tax calculations
CustomerSchema.index({ ownerId: 1, vendorCode: 1 }); // ✅ NEW: For vendor code lookups
CustomerSchema.index({ ownerId: 1, outstandingBalance: 1 }); // ✅ NEW: For financial queries
CustomerSchema.index({ ownerId: 1, customerType: 1 }); // ✅ NEW: For filtering by customer type

// ✅ NEW: Compound index for location-based queries
CustomerSchema.index({ 
  ownerId: 1, 
  'billingAddress.state': 1,
  'billingAddress.city': 1 
});

// ✅ NEW: Text index for search functionality
CustomerSchema.index({
  name: 'text',
  vendorCode: 'text',
  'billingAddress.city': 'text',
  'billingAddress.state': 'text'
});

const Customer = mongoose.model('Customer', CustomerSchema);

export default Customer;
