import { Router } from "express";
import { BusinessOwner, BusinessSettings } from "../models/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ✅ NEW: Get business bank details
router.get("/", requireAuth, async (req, res) => {
  try {
    console.log('🏦 Loading business bank details for owner:', req.ownerId);

    // Get from BusinessSettings first, fallback to BusinessOwner
    const settings = await BusinessSettings.findOne({ ownerId: req.ownerId });
    const businessOwner = await BusinessOwner.findById(req.ownerId);

    let bankDetails = null;

    if (settings?.bankDetails) {
      bankDetails = settings.bankDetails;
    } else if (businessOwner?.bankDetails) {
      bankDetails = businessOwner.bankDetails;
    }

    console.log('✅ Bank details loaded:', bankDetails ? 'Found' : 'Not found');

    res.json({
      success: true,
      bankDetails: bankDetails || {
        bankName: '',
        branchName: '',
        accountNumber: '',
        ifscCode: '',
        accountType: 'Current',
        accountHolderName: businessOwner?.businessName || '',
        panCardNumber: '', // ✅ NEW: PAN Card field
        upiId: '',
        qrCodeUrl: '',
        isActive: true
      }
    });

  } catch (error) {
    console.error('❌ Error loading bank details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ FIXED: Update business bank details AND create bank account entry for switching
router.put("/", requireAuth, async (req, res) => {
  try {
    console.log('🏦 Updating business bank details for owner:', req.ownerId);
    console.log('📝 Bank details data:', req.body);

    const {
      bankName,
      branchName,
      accountNumber,
      ifscCode,
      accountType,
      accountHolderName,
      panCardNumber, // ✅ NEW: PAN Card field
      upiId,
      qrCodeUrl,
      isActive
    } = req.body;

    // Validate required fields
    if (!bankName || !accountHolderName) {
      return res.status(400).json({
        success: false,
        error: 'Bank name and account holder name are required'
      });
    }

    // Validate IFSC code format (if provided)
    if (ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid IFSC code format'
      });
    }

    // ✅ NEW: Validate PAN card format (if provided)
    if (panCardNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panCardNumber.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid PAN Card number format (e.g., ABCDE1234F)'
      });
    }

    const bankDetailsData = {
      bankName: bankName.trim(),
      branchName: branchName?.trim() || '',
      accountNumber: accountNumber?.trim() || '',
      ifscCode: ifscCode?.toUpperCase().trim() || '',
      accountType: accountType || 'Current',
      accountHolderName: accountHolderName.trim(),
      panCardNumber: panCardNumber?.toUpperCase().trim() || '', // ✅ NEW: PAN Card
      upiId: upiId?.trim() || '',
      qrCodeUrl: qrCodeUrl?.trim() || '',
      isActive: isActive !== false,
      updatedAt: new Date()
    };

    // Get or create settings
    let settings = await BusinessSettings.findOne({ ownerId: req.ownerId });
    if (!settings) {
      settings = new BusinessSettings({ ownerId: req.ownerId });
    }

    // Update main bank details
    settings.bankDetails = bankDetailsData;

    // Initialize bankAccounts array if not exists
    if (!settings.bankAccounts) {
      settings.bankAccounts = [];
    }

    // ✅ NEW: Also create/update entry in bankAccounts array for switching functionality
    const primaryAccountId = 'primary-main';
    const existingAccountIndex = settings.bankAccounts.findIndex(acc => acc.id === primaryAccountId);
    
    const bankAccountEntry = {
      id: primaryAccountId,
      bankName: bankDetailsData.bankName,
      branchName: bankDetailsData.branchName,
      accountNumber: bankDetailsData.accountNumber,
      ifscCode: bankDetailsData.ifscCode,
      accountType: bankDetailsData.accountType,
      accountHolderName: bankDetailsData.accountHolderName,
      panCardNumber: bankDetailsData.panCardNumber,
      upiId: bankDetailsData.upiId,
      isPrimary: true,
      isActive: true,
      createdAt: existingAccountIndex === -1 ? new Date() : settings.bankAccounts[existingAccountIndex].createdAt,
      updatedAt: new Date()
    };

    if (existingAccountIndex === -1) {
      // Add new entry to bankAccounts
      settings.bankAccounts.push(bankAccountEntry);
      console.log('✅ Added new entry to bankAccounts array');
    } else {
      // Update existing entry
      settings.bankAccounts[existingAccountIndex] = bankAccountEntry;
      console.log('✅ Updated existing entry in bankAccounts array');
    }

    // Make sure this is the only primary account
    settings.bankAccounts.forEach((account, index) => {
      if (account.id !== primaryAccountId) {
        account.isPrimary = false;
      }
    });

    await settings.save();

    console.log('✅ Bank details updated successfully');
    console.log('📊 Total bank accounts now:', settings.bankAccounts.length);

    res.json({
      success: true,
      message: "Bank details updated successfully",
      bankDetails: settings.bankDetails
    });

  } catch (error) {
    console.error('❌ Error updating bank details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ NEW: Add multiple bank accounts
router.post("/accounts", requireAuth, async (req, res) => {
  try {
    console.log('🏦 Adding new bank account for owner:', req.ownerId);

    const {
      bankName,
      branchName,
      accountNumber,
      ifscCode,
      accountType,
      accountHolderName,
      panCardNumber, // ✅ NEW: PAN Card field
      upiId,
      isPrimary
    } = req.body;

    // Validate required fields
    if (!bankName || !accountNumber || !accountHolderName) {
      return res.status(400).json({
        success: false,
        error: 'Bank name, account number, and account holder name are required'
      });
    }

    // ✅ NEW: Validate PAN card format (if provided)
    if (panCardNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panCardNumber.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid PAN Card number format'
      });
    }

    const newAccount = {
      id: new Date().getTime().toString(),
      bankName: bankName.trim(),
      branchName: branchName?.trim() || '',
      accountNumber: accountNumber.trim(),
      ifscCode: ifscCode?.toUpperCase().trim() || '',
      accountType: accountType || 'Current',
      accountHolderName: accountHolderName.trim(),
      panCardNumber: panCardNumber?.toUpperCase().trim() || '', // ✅ NEW: PAN Card
      upiId: upiId?.trim() || '',
      isPrimary: isPrimary || false,
      isActive: true,
      createdAt: new Date()
    };

    // Get current settings
    let settings = await BusinessSettings.findOne({ ownerId: req.ownerId });
    
    if (!settings) {
      settings = new BusinessSettings({ ownerId: req.ownerId });
    }

    // Initialize bankAccounts array if not exists
    if (!settings.bankAccounts) {
      settings.bankAccounts = [];
    }

    // If this is set as primary, make others non-primary
    if (isPrimary) {
      settings.bankAccounts.forEach(account => {
        account.isPrimary = false;
      });
      
      // ✅ Also update main bankDetails if this becomes primary
      settings.bankDetails = {
        bankName: newAccount.bankName,
        branchName: newAccount.branchName,
        accountNumber: newAccount.accountNumber,
        ifscCode: newAccount.ifscCode,
        accountType: newAccount.accountType,
        accountHolderName: newAccount.accountHolderName,
        panCardNumber: newAccount.panCardNumber,
        upiId: newAccount.upiId,
        qrCodeUrl: '',
        isActive: true,
        updatedAt: new Date()
      };
    }

    // Add new account
    settings.bankAccounts.push(newAccount);

    await settings.save();

    console.log('✅ New bank account added successfully');

    res.json({
      success: true,
      message: "Bank account added successfully",
      bankAccount: newAccount,
      totalAccounts: settings.bankAccounts.length
    });

  } catch (error) {
    console.error('❌ Error adding bank account:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ NEW: Get all bank accounts
router.get("/accounts", requireAuth, async (req, res) => {
  try {
    console.log('🏦 Loading all bank accounts for owner:', req.ownerId);

    const settings = await BusinessSettings.findOne({ ownerId: req.ownerId });
    
    const bankAccounts = settings?.bankAccounts || [];

    console.log(`✅ Found ${bankAccounts.length} bank accounts`);

    res.json({
      success: true,
      bankAccounts,
      count: bankAccounts.length
    });

  } catch (error) {
    console.error('❌ Error loading bank accounts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ ENHANCED: Update specific bank account with primary switching logic
router.put("/accounts/:accountId", requireAuth, async (req, res) => {
  try {
    const { accountId } = req.params;
    console.log('🏦 Updating bank account:', accountId, 'for owner:', req.ownerId);

    // ✅ NEW: Validate PAN card if provided in update
    if (req.body.panCardNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(req.body.panCardNumber.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid PAN Card number format'
      });
    }

    const settings = await BusinessSettings.findOne({ ownerId: req.ownerId });
    
    if (!settings || !settings.bankAccounts) {
      return res.status(404).json({
        success: false,
        error: 'No bank accounts found'
      });
    }

    const accountIndex = settings.bankAccounts.findIndex(acc => acc.id === accountId);
    
    if (accountIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Bank account not found'
      });
    }

    // Update account details
    const updatedAccount = {
      ...settings.bankAccounts[accountIndex].toObject(),
      ...req.body,
      panCardNumber: req.body.panCardNumber?.toUpperCase().trim() || settings.bankAccounts[accountIndex].panCardNumber || '', // ✅ NEW: Handle PAN card update
      updatedAt: new Date()
    };

    // If setting as primary, make others non-primary and update main bankDetails
    if (req.body.isPrimary) {
      settings.bankAccounts.forEach((account, index) => {
        if (index !== accountIndex) {
          account.isPrimary = false;
        }
      });
      
      // ✅ CRITICAL: Update main bankDetails when switching primary
      settings.bankDetails = {
        bankName: updatedAccount.bankName,
        branchName: updatedAccount.branchName,
        accountNumber: updatedAccount.accountNumber,
        ifscCode: updatedAccount.ifscCode,
        accountType: updatedAccount.accountType,
        accountHolderName: updatedAccount.accountHolderName,
        panCardNumber: updatedAccount.panCardNumber,
        upiId: updatedAccount.upiId,
        qrCodeUrl: settings.bankDetails?.qrCodeUrl || '',
        isActive: true,
        updatedAt: new Date()
      };
      
      console.log('✅ Updated main bankDetails with new primary account');
    }

    settings.bankAccounts[accountIndex] = updatedAccount;
    await settings.save();

    console.log('✅ Bank account updated successfully');

    res.json({
      success: true,
      message: "Bank account updated successfully",
      bankAccount: updatedAccount
    });

  } catch (error) {
    console.error('❌ Error updating bank account:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ ENHANCED: Delete bank account with primary handling
router.delete("/accounts/:accountId", requireAuth, async (req, res) => {
  try {
    const { accountId } = req.params;
    console.log('🗑️ Deleting bank account:', accountId, 'for owner:', req.ownerId);

    const settings = await BusinessSettings.findOne({ ownerId: req.ownerId });
    
    if (!settings || !settings.bankAccounts) {
      return res.status(404).json({
        success: false,
        error: 'No bank accounts found'
      });
    }

    // Find the account to delete
    const accountToDelete = settings.bankAccounts.find(account => account.id === accountId);
    
    if (!accountToDelete) {
      return res.status(404).json({
        success: false,
        error: 'Bank account not found'
      });
    }

    // Don't allow deletion of primary-main account
    if (accountId === 'primary-main') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete the main bank account. Please update it instead.'
      });
    }

    const initialCount = settings.bankAccounts.length;
    const wasPrimary = accountToDelete.isPrimary;
    
    // Remove the account
    settings.bankAccounts = settings.bankAccounts.filter(account => account.id !== accountId);

    if (settings.bankAccounts.length === initialCount) {
      return res.status(404).json({
        success: false,
        error: 'Bank account not found'
      });
    }

    // If we deleted the primary account, make another one primary
    if (wasPrimary && settings.bankAccounts.length > 0) {
      // Make the first remaining account primary
      settings.bankAccounts[0].isPrimary = true;
      
      // Update main bankDetails
      const newPrimary = settings.bankAccounts[0];
      settings.bankDetails = {
        bankName: newPrimary.bankName,
        branchName: newPrimary.branchName,
        accountNumber: newPrimary.accountNumber,
        ifscCode: newPrimary.ifscCode,
        accountType: newPrimary.accountType,
        accountHolderName: newPrimary.accountHolderName,
        panCardNumber: newPrimary.panCardNumber,
        upiId: newPrimary.upiId,
        qrCodeUrl: settings.bankDetails?.qrCodeUrl || '',
        isActive: true,
        updatedAt: new Date()
      };
      
      console.log('✅ Made remaining account primary after deletion');
    }

    await settings.save();

    console.log('✅ Bank account deleted successfully');

    res.json({
      success: true,
      message: "Bank account deleted successfully",
      remainingAccounts: settings.bankAccounts.length
    });

  } catch (error) {
    console.error('❌ Error deleting bank account:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ NEW: Validate bank details including PAN
router.post("/validate", requireAuth, async (req, res) => {
  try {
    const { ifscCode, accountNumber, panCardNumber } = req.body; // ✅ NEW: Add PAN validation

    const validation = {
      ifscValid: false,
      bankName: '',
      branchName: '',
      accountNumberValid: false,
      panCardValid: false // ✅ NEW: PAN validation result
    };

    // Validate IFSC code format
    if (ifscCode && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.toUpperCase())) {
      validation.ifscValid = true;
      
      // Mock bank name extraction (in real implementation, use IFSC API)
      const bankCode = ifscCode.substring(0, 4);
      const bankNames = {
        'SBIN': 'State Bank of India',
        'HDFC': 'HDFC Bank',
        'ICIC': 'ICICI Bank',
        'AXIS': 'Axis Bank',
        'UTIB': 'Axis Bank',
        'KKBK': 'Kotak Mahindra Bank',
        'YESB': 'Yes Bank',
        'INDB': 'Indian Bank',
        'PUNB': 'Punjab National Bank',
        'IDIB': 'Indian Bank' // ✅ Added for your IFSC code
      };
      
      validation.bankName = bankNames[bankCode] || 'Unknown Bank';
      validation.branchName = 'Branch details available on validation';
    }

    // Basic account number validation (length check)
    if (accountNumber && accountNumber.length >= 9 && accountNumber.length <= 18) {
      validation.accountNumberValid = true;
    }

    // ✅ NEW: PAN Card validation
    if (panCardNumber && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panCardNumber.toUpperCase())) {
      validation.panCardValid = true;
    }

    res.json({
      success: true,
      validation
    });

  } catch (error) {
    console.error('❌ Error validating bank details:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
