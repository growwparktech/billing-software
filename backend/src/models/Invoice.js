import mongoose from 'mongoose';

const lineItemSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: false },
  name: { type: String, required: true },
  description: { type: String, required: true },
  unit: { type: String, default: 'piece' },
  quantity: { type: Number, required: true, min: 0 },
  unitPrice: { type: Number, required: true, min: 0 },
  taxRate: { type: Number, default: 18, min: 0, max: 100 },
  lineTotal: { type: Number, required: true },
  taxAmount: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
  hsnCode: { type: String, default: '' }
});

const invoiceSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessOwner', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  invoiceNumber: { type: String, required: true },
  invoiceDate: { type: Date, required: true, default: Date.now },
  dueDate: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'paid', 'cancelled', 'draft', 'completed'], default: 'pending' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'overdue', 'cancelled'], default: 'pending' },

  // ✅ NEW: FLAT CUSTOMER FIELDS - No nested objects!
  customerName: { type: String, required: true },
  customerPhone: { type: String },
  customerEmail: { type: String },
  customerGstin: { type: String },
  customerVendorCode: { type: String },
  
  // ✅ NEW: FLAT BILLING ADDRESS FIELDS
  billingStreet: { type: String },
  billingCity: { type: String },
  billingState: { type: String },
  billingPincode: { type: String },
  billingCountry: { type: String, default: 'India' },
  
  // ✅ NEW: FLAT SHIPPING ADDRESS FIELDS  
  shippingStreet: { type: String },
  shippingCity: { type: String },
  shippingState: { type: String },
  shippingPincode: { type: String },
  shippingCountry: { type: String, default: 'India' },
  
  // ✅ NEW: ADDRESS FLAGS
  sameAsShipping: { type: Boolean, default: false },

  // ✅ KEEP OLD customerInfo for backward compatibility (but prefer flat fields above)
  customerInfo: {
    name: { type: String },
    phone: String,
    email: String,
    address: mongoose.Schema.Types.Mixed,
    gstin: String,
    // ✅ Keep these for backward compatibility but use flat fields above
    billingAddress: mongoose.Schema.Types.Mixed,
    shippingAddress: mongoose.Schema.Types.Mixed,
    vendorCode: String
  },

  businessInfo: {
    name: String,
    phone: String,
    email: String,
    address: String,
    gstin: String,
    // ✅ NEW: Additional business details
    panNumber: String,
    companyRegNumber: String,
    website: String,
    logoUrl: String
  },

  // ✅ NEW: Bank Details Section
  bankDetails: {
    bankName: String,
    branchName: String,
    accountNumber: String,
    ifscCode: String,
    accountType: { type: String, enum: ['Current', 'Savings', 'Other'], default: 'Current' },
    accountHolderName: String
  },

  // ✅ NEW: Authorization Section
  authorization: {
    authorizedSignatoryName: String,
    designation: String,
    signatureUrl: String
  },

  // ✅ NEW: Invoice Footer Section
  invoiceFooter: {
    termsAndConditions: String,
    footerNotes: String,
    paymentInstructions: String,
    thankYouMessage: { type: String, default: 'Thank you for your business!' }
  },

  // ✅ NEW: Tags and Invoice Type Support
  tags: {
    type: [String],
    default: []
  },
  invoiceType: {
    type: String,
    enum: ['SALES', 'PURCHASE', 'QUOTATION'],
    default: 'SALES'
  },

  // ✅ NEW: Tax Breakdown Fields
  igst: { type: Number, default: 0 },
  cgst: { type: Number, default: 0 },
  sgst: { type: Number, default: 0 },
  taxRate: { type: Number, default: 18 },
  taxType: { type: String, enum: ['IGST', 'CGST_SGST'], default: 'IGST' },

  lineItems: [lineItemSchema],
  subtotal: { type: Number, required: true, default: 0 },
  totalTaxAmount: { type: Number, required: true, default: 0 },
  discountType: { type: String, enum: ['amount', 'percentage'], default: 'amount' },
  discountValue: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  roundingAdjustment: { type: Number, default: 0 },
  
  // ✅ NEW: Optional charge fields
  transportCharges: { type: Number, default: 0 },
  otherCharges: { type: Number, default: 0 },
  
  finalAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, required: true },
  notes: String,
  terms: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessOwner' },
  sentDate: Date,
  viewedDate: Date,
  paidDate: Date
}, { timestamps: true });

// ✅ ENHANCED PRE-SAVE MIDDLEWARE WITH FLAT FIELD SYNC
invoiceSchema.pre('save', function() {
  // ✅ SYNC FLAT FIELDS TO customerInfo for backward compatibility
  if (this.customerName) {
    this.customerInfo = this.customerInfo || {};
    this.customerInfo.name = this.customerName;
    this.customerInfo.phone = this.customerPhone;
    this.customerInfo.email = this.customerEmail;
    this.customerInfo.gstin = this.customerGstin;
    this.customerInfo.vendorCode = this.customerVendorCode;
    
    // ✅ Create address objects from flat fields
    if (this.billingStreet || this.billingCity || this.billingState || this.billingPincode) {
      this.customerInfo.billingAddress = {
        street: this.billingStreet || '',
        city: this.billingCity || '',
        state: this.billingState || '',
        pincode: this.billingPincode || '',
        country: this.billingCountry || 'India'
      };
    }
    
    if (this.shippingStreet || this.shippingCity || this.shippingState || this.shippingPincode) {
      this.customerInfo.shippingAddress = {
        street: this.shippingStreet || '',
        city: this.shippingCity || '',
        state: this.shippingState || '',
        pincode: this.shippingPincode || '',
        country: this.shippingCountry || 'India'
      };
    }
  }

  // ✅ CALCULATE TOTALS
  this.subtotal = this.lineItems.reduce((sum, item) => sum + (item.lineTotal || 0), 0);
  this.totalTaxAmount = this.lineItems.reduce((sum, item) => sum + (item.taxAmount || 0), 0);
  this.finalAmount = this.subtotal + this.totalTaxAmount - (this.discountAmount || 0) + (this.transportCharges || 0) + (this.otherCharges || 0) + (this.roundingAdjustment || 0);
  this.balanceAmount = this.finalAmount - (this.paidAmount || 0);

  // ✅ AUTO-CALCULATE TAX BREAKDOWN IF NOT SET
  if (this.totalTaxAmount > 0 && (this.igst === 0 && this.cgst === 0 && this.sgst === 0)) {
    if (this.taxType === 'CGST_SGST') {
      this.cgst = Math.round((this.totalTaxAmount / 2) * 100) / 100;
      this.sgst = Math.round((this.totalTaxAmount / 2) * 100) / 100;
      this.igst = 0;
    } else {
      this.igst = Math.round(this.totalTaxAmount * 100) / 100;
      this.cgst = 0;
      this.sgst = 0;
    }
  }

  // ✅ UPDATE PAYMENT STATUS
  if (this.balanceAmount <= 0) {
    this.paymentStatus = 'paid';
    this.status = 'paid';
  } else if (this.paidAmount > 0) {
    this.paymentStatus = 'partial';
  } else {
    this.paymentStatus = 'pending';
  }
});

// ✅ HELPER METHODS FOR ADDRESS FORMATTING
invoiceSchema.methods.getFormattedBillingAddress = function() {
  const parts = [
    this.billingStreet,
    this.billingCity,
    this.billingState,
    this.billingPincode,
    this.billingCountry
  ].filter(part => part && part.trim());
  
  return parts.length > 0 ? parts.join(', ') : '';
};

invoiceSchema.methods.getFormattedShippingAddress = function() {
  const parts = [
    this.shippingStreet,
    this.shippingCity,
    this.shippingState,
    this.shippingPincode,
    this.shippingCountry
  ].filter(part => part && part.trim());
  
  return parts.length > 0 ? parts.join(', ') : this.getFormattedBillingAddress();
};

invoiceSchema.methods.areAddressesSame = function() {
  return (
    this.billingStreet === this.shippingStreet &&
    this.billingCity === this.shippingCity &&
    this.billingState === this.shippingState &&
    this.billingPincode === this.shippingPincode &&
    this.billingCountry === this.shippingCountry
  );
};

// ✅ INDEXES
invoiceSchema.index({ ownerId: 1, invoiceNumber: 1 });
invoiceSchema.index({ ownerId: 1, customerId: 1 });
invoiceSchema.index({ ownerId: 1, invoiceDate: -1 });
invoiceSchema.index({ ownerId: 1, customerName: 1 }); // ✅ NEW: Index for customer name search
invoiceSchema.index({ ownerId: 1, billingCity: 1 }); // ✅ NEW: Index for city-based filtering
invoiceSchema.index({ ownerId: 1, invoiceType: 1, tags: 1 }); // ✅ NEW: Index for type and tag filtering

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;
