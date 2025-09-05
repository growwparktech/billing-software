import mongoose from "mongoose";

const ItemSchema = new mongoose.Schema({
  ownerId: { // ✅ Changed from tenantId
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BusinessOwner', // ✅ Changed from 'Tenant'
    required: true,
    index: true
  },
  
  // ✅ ENHANCED ITEM IDENTIFICATION FIELDS
  itemCode: {
    type: String,
    trim: true,
    uppercase: true,
    index: true // For fast lookup
  },
  partNumber: {
    type: String,
    trim: true,
    uppercase: true,
    index: true
  },
  manufacturerPartNumber: {
    type: String,
    trim: true,
    uppercase: true
  },
  alternateItemCodes: [{
    type: String,
    trim: true,
    uppercase: true
  }],
  
  // ✅ EXISTING FIELDS
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  
  // ✅ ENHANCED ITEM DETAILS FOR AUTO-FILL
  brand: {
    type: String,
    trim: true
  },
  model: {
    type: String,
    trim: true
  },
  specifications: {
    type: String,
    trim: true
  },
  
  category: {
    type: String,
    trim: true,
    default: 'General'
  },
  unit: {
    type: String,
    enum: ['piece', 'kg', 'gram', 'liter', 'meter', 'feet', 'box', 'dozen', 'set', 'service', 'hour', 'sqft', 'sqm'],
    default: 'piece'
  },
  
  // ✅ PRICING FIELDS
  sellingPrice: {
    type: Number,
    required: true,
    min: 0
  },
  costPrice: {
    type: Number,
    min: 0,
    default: 0
  },
  
  // ✅ PRICING TIERS FOR VOLUME DISCOUNTS
  pricingTiers: [{
    minQuantity: { type: Number, default: 1 },
    maxQuantity: { type: Number },
    unitPrice: { type: Number, required: true },
    description: { type: String, trim: true }
  }],
  
  // ✅ TAX AND COMPLIANCE
  taxRate: {
    type: Number,
    min: 0,
    max: 50,
    default: 18 // Default GST rate
  },
  hsnCode: {
    type: String,
    trim: true // HSN code for GST compliance
  },
  
  // ✅ INVENTORY MANAGEMENT
  stockQuantity: {
    type: Number,
    min: 0,
    default: 0
  },
  minStockLevel: {
    type: Number,
    min: 0,
    default: 5
  },
  maxStockLevel: {
    type: Number,
    min: 0,
    default: 100
  },
  
  // ✅ IDENTIFICATION CODES
  sku: {
    type: String,
    trim: true,
    uppercase: true
  },
  barcode: {
    type: String,
    trim: true
  },
  
  // ✅ STATUS AND LIFECYCLE
  status: {
    type: String,
    enum: ['active', 'inactive', 'discontinued'],
    default: 'active'
  },
  
  // ✅ SALES ANALYTICS
  totalSold: {
    type: Number,
    default: 0,
    min: 0
  },
  totalRevenue: {
    type: Number,
    default: 0,
    min: 0
  },
  lastSaleDate: {
    type: Date
  },
  
  // ✅ USAGE STATISTICS FOR AUTO-SUGGEST
  timesUsed: {
    type: Number,
    default: 0
  },
  lastUsedDate: {
    type: Date
  },
  
  // ✅ ADDITIONAL METADATA
  supplier: {
    name: { type: String, trim: true },
    contact: { type: String, trim: true },
    leadTime: { type: Number, default: 0 } // days
  },
  
  // ✅ DIMENSIONS AND WEIGHT (optional)
  dimensions: {
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    unit: { type: String, enum: ['cm', 'inch', 'mm'], default: 'cm' }
  },
  weight: {
    value: { type: Number, min: 0 },
    unit: { type: String, enum: ['kg', 'gram', 'pound'], default: 'kg' }
  },
  
  // ✅ NOTES AND TAGS
  notes: {
    type: String,
    trim: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }]
}, {
  timestamps: true
});

// ✅ ENHANCED INDEXES FOR BETTER PERFORMANCE
ItemSchema.index({ ownerId: 1, name: 1 });
ItemSchema.index({ ownerId: 1, category: 1 });
ItemSchema.index({ ownerId: 1, status: 1 });
ItemSchema.index({ ownerId: 1, sku: 1 }, { sparse: true });
ItemSchema.index({ ownerId: 1, itemCode: 1 }, { sparse: true });
ItemSchema.index({ ownerId: 1, partNumber: 1 }, { sparse: true });
ItemSchema.index({ ownerId: 1, manufacturerPartNumber: 1 }, { sparse: true });
ItemSchema.index({ ownerId: 1, barcode: 1 }, { sparse: true });

// ✅ TEXT INDEX FOR FULL-TEXT SEARCH
ItemSchema.index({ 
  name: 'text', 
  description: 'text', 
  itemCode: 'text', 
  partNumber: 'text',
  brand: 'text',
  model: 'text'
}, { 
  weights: { 
    name: 10, 
    itemCode: 8, 
    partNumber: 8, 
    description: 5, 
    brand: 3, 
    model: 3 
  } 
});

// ✅ COMPOUND INDEX FOR RECENT ITEMS QUERY
ItemSchema.index({ ownerId: 1, lastUsedDate: -1, timesUsed: -1 });

// ✅ ENSURE UNIQUE CODES PER OWNER (if provided)
ItemSchema.index({ ownerId: 1, sku: 1 }, { unique: true, sparse: true });
ItemSchema.index({ ownerId: 1, itemCode: 1 }, { unique: true, sparse: true });
ItemSchema.index({ ownerId: 1, partNumber: 1 }, { unique: true, sparse: true });
ItemSchema.index({ ownerId: 1, barcode: 1 }, { unique: true, sparse: true });

// ✅ VIRTUAL FOR PROFIT MARGIN CALCULATION
ItemSchema.virtual('profitMargin').get(function() {
  if (this.costPrice > 0) {
    return ((this.sellingPrice - this.costPrice) / this.costPrice * 100).toFixed(2);
  }
  return 0;
});

// ✅ VIRTUAL FOR STOCK STATUS
ItemSchema.virtual('stockStatus').get(function() {
  if (this.stockQuantity <= 0) {
    return 'out_of_stock';
  } else if (this.stockQuantity <= this.minStockLevel) {
    return 'low_stock';
  } else if (this.stockQuantity >= this.maxStockLevel) {
    return 'overstock';
  }
  return 'in_stock';
});

// ✅ VIRTUAL FOR PRIMARY IDENTIFIER (returns first available identifier)
ItemSchema.virtual('primaryId').get(function() {
  return this.itemCode || this.partNumber || this.sku || this.manufacturerPartNumber || this._id.toString().substr(-6);
});

// ✅ VIRTUAL FOR DISPLAY NAME (includes primary identifier)
ItemSchema.virtual('displayName').get(function() {
  const primaryId = this.primaryId;
  return `${primaryId} - ${this.name}`;
});

// ✅ VIRTUAL FOR PRICING INFO
ItemSchema.virtual('pricingInfo').get(function() {
  return {
    sellingPrice: this.sellingPrice,
    costPrice: this.costPrice,
    profitMargin: this.profitMargin,
    hasTiers: this.pricingTiers && this.pricingTiers.length > 0
  };
});

// ✅ INSTANCE METHOD TO GET PRICE FOR QUANTITY
ItemSchema.methods.getPriceForQuantity = function(quantity) {
  // Check pricing tiers
  if (this.pricingTiers && this.pricingTiers.length > 0) {
    const applicableTier = this.pricingTiers
      .filter(tier => quantity >= tier.minQuantity && (!tier.maxQuantity || quantity <= tier.maxQuantity))
      .sort((a, b) => b.minQuantity - a.minQuantity)[0]; // Get the highest applicable tier
    
    if (applicableTier) {
      return applicableTier.unitPrice;
    }
  }
  
  // Return default selling price
  return this.sellingPrice;
};

// ✅ INSTANCE METHOD TO UPDATE USAGE STATS
ItemSchema.methods.updateUsageStats = function() {
  this.timesUsed = (this.timesUsed || 0) + 1;
  this.lastUsedDate = new Date();
  return this.save();
};

// ✅ STATIC METHOD TO FIND BY ANY IDENTIFIER
ItemSchema.statics.findByIdentifier = function(ownerId, identifier) {
  const searchCode = identifier.toUpperCase();
  return this.findOne({
    ownerId: ownerId,
    $or: [
      { itemCode: searchCode },
      { partNumber: searchCode },
      { manufacturerPartNumber: searchCode },
      { alternateItemCodes: searchCode },
      { sku: searchCode },
      { barcode: identifier } // Keep original case for barcode
    ],
    status: 'active'
  });
};

// ✅ STATIC METHOD FOR INTELLIGENT SEARCH
ItemSchema.statics.intelligentSearch = function(ownerId, query, limit = 10) {
  const searchRegex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); // Escape regex chars
  
  return this.find({
    ownerId: ownerId,
    status: 'active',
    $or: [
      { name: searchRegex },
      { description: searchRegex },
      { itemCode: searchRegex },
      { partNumber: searchRegex },
      { manufacturerPartNumber: searchRegex },
      { sku: searchRegex },
      { brand: searchRegex },
      { model: searchRegex },
      { category: searchRegex },
      { tags: searchRegex }
    ]
  })
  .select('itemCode partNumber name description sellingPrice taxRate hsnCode unit stockQuantity brand model timesUsed lastUsedDate')
  .sort({ timesUsed: -1, name: 1 })
  .limit(limit);
};

// ✅ PRE-SAVE MIDDLEWARE TO ENSURE DATA CONSISTENCY
ItemSchema.pre('save', function(next) {
  // Auto-generate item code if not provided
  if (!this.itemCode && !this.partNumber && !this.sku) {
    const prefix = this.category ? this.category.substr(0, 3).toUpperCase() : 'ITM';
    const timestamp = Date.now().toString().substr(-6);
    this.itemCode = `${prefix}-${timestamp}`;
  }
  
  // Ensure at least one pricing tier exists if selling price is set
  if (this.sellingPrice > 0 && (!this.pricingTiers || this.pricingTiers.length === 0)) {
    this.pricingTiers = [{
      minQuantity: 1,
      unitPrice: this.sellingPrice,
      description: 'Standard Price'
    }];
  }
  
  // Normalize codes to uppercase
  if (this.itemCode) this.itemCode = this.itemCode.toUpperCase();
  if (this.partNumber) this.partNumber = this.partNumber.toUpperCase();
  if (this.manufacturerPartNumber) this.manufacturerPartNumber = this.manufacturerPartNumber.toUpperCase();
  if (this.sku) this.sku = this.sku.toUpperCase();
  
  next();
});

// ✅ Include virtuals in JSON output
ItemSchema.set('toJSON', { virtuals: true });
ItemSchema.set('toObject', { virtuals: true });

const Item = mongoose.model('Item', ItemSchema);
export default Item;
