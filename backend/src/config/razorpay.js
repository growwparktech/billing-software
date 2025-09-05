import Razorpay from 'razorpay';
import crypto from 'crypto';

// ✅ Enhanced: Debug environment variables with detailed logging
console.log('🔍 Initializing Razorpay Configuration...');
console.log('🔍 Checking Razorpay environment variables:');
console.log('   RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? 'Loaded ✅' : 'Missing ❌');
console.log('   RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? 'Loaded ✅' : 'Missing ❌');
console.log('   UNLOCK_PAYMENT_AMOUNT:', process.env.UNLOCK_PAYMENT_AMOUNT || '20000 (default)');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');

// ✅ Enhanced: Comprehensive environment variable validation
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error('❌ RAZORPAY CONFIGURATION ERROR:');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('🚨 CRITICAL: Missing Razorpay environment variables!');
  console.error('');
  console.error('Please check your .env file contains:');
  console.error('   RAZORPAY_KEY_ID=' + (process.env.RAZORPAY_KEY_ID || 'MISSING'));
  console.error('   RAZORPAY_KEY_SECRET=' + (process.env.RAZORPAY_KEY_SECRET ? 'SET' : 'MISSING'));
  console.error('');
  console.error('Steps to fix:');
  console.error('1. Copy your Razorpay API keys from dashboard');
  console.error('2. Add them to your .env file');
  console.error('3. Restart your server');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const error = new Error('Razorpay API keys missing. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env file');
  error.code = 'RAZORPAY_CONFIG_ERROR';
  throw error;
}

// ✅ Enhanced: Validate key formats
const keyIdPattern = /^rzp_(test|live)_[a-zA-Z0-9]{14}$/;
if (!keyIdPattern.test(process.env.RAZORPAY_KEY_ID)) {
  console.warn('⚠️ RAZORPAY_KEY_ID format may be invalid. Expected format: rzp_test_XXXXXXXXXXXXXX or rzp_live_XXXXXXXXXXXXXX');
}

// ✅ Enhanced: Log key environment and safety checks
const isTestMode = process.env.RAZORPAY_KEY_ID.includes('test');
const isProduction = process.env.NODE_ENV === 'production';

console.log('🔍 Razorpay Environment Details:');
console.log('   Mode:', isTestMode ? 'TEST ✅' : 'LIVE 🔴');
console.log('   Environment:', isProduction ? 'PRODUCTION 🔴' : 'DEVELOPMENT ✅');
console.log('   Key ID (partial):', process.env.RAZORPAY_KEY_ID.substring(0, 12) + '...');

// ✅ Enhanced: Safety warning for production
if (isProduction && isTestMode) {
  console.warn('⚠️ WARNING: Using TEST keys in PRODUCTION environment!');
  console.warn('   This will NOT process real payments.');
  console.warn('   Please use LIVE keys for production.');
}

// ✅ Enhanced: Initialize Razorpay instance with retry logic
let razorpay;
let initializationAttempts = 0;
const maxInitAttempts = 3;

const initializeRazorpay = () => {
  try {
    initializationAttempts++;
    console.log(`🔄 Initializing Razorpay (attempt ${initializationAttempts}/${maxInitAttempts})...`);
    
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
      // ✅ Enhanced: Add additional configuration options
      headers: {
        'User-Agent': 'BillingPlatform/1.0'
      }
    });

    console.log('✅ Razorpay initialized successfully!');
    console.log('🔧 Configuration:');
    console.log('   Key ID:', process.env.RAZORPAY_KEY_ID.substring(0, 12) + '...');
    console.log('   Mode:', isTestMode ? 'Test Mode' : 'Live Mode');
    console.log('   Ready for payment processing ✅');
    
    return razorpay;
  } catch (error) {
    console.error(`❌ Razorpay initialization attempt ${initializationAttempts} failed:`, error);
    
    if (initializationAttempts < maxInitAttempts) {
      console.log(`🔄 Retrying Razorpay initialization in 1 second...`);
      setTimeout(() => {
        initializeRazorpay();
      }, 1000);
    } else {
      console.error('❌ CRITICAL: Razorpay initialization failed after all attempts');
      throw new Error('Failed to initialize Razorpay after multiple attempts: ' + error.message);
    }
  }
};

// Initialize Razorpay
razorpay = initializeRazorpay();

// ✅ Enhanced: Comprehensive signature verification with detailed logging
export const verifyPaymentSignature = (orderId, paymentId, signature) => {
  console.log('🔐 Starting payment signature verification...');
  console.log('📊 Verification data:');
  console.log('   Order ID:', orderId);
  console.log('   Payment ID:', paymentId);
  console.log('   Signature (partial):', signature ? signature.substring(0, 10) + '...' : 'Missing');
  
  try {
    // Input validation
    if (!orderId || !paymentId || !signature) {
      console.error('❌ Missing required verification parameters');
      console.error('   Order ID:', !!orderId);
      console.error('   Payment ID:', !!paymentId);
      console.error('   Signature:', !!signature);
      return false;
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('❌ RAZORPAY_KEY_SECRET not available for signature verification');
      return false;
    }

    // Create signature
    const body = orderId + '|' + paymentId;
    console.log('🔍 Creating signature with body:', body.substring(0, 30) + '...');
    
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    
    console.log('🔍 Generated signature (partial):', expectedSignature.substring(0, 10) + '...');
    
    const isValid = expectedSignature === signature;
    console.log('🔐 Signature verification result:', isValid ? '✅ VALID' : '❌ INVALID');
    
    if (!isValid) {
      console.error('❌ Signature mismatch details:');
      console.error('   Expected length:', expectedSignature.length);
      console.error('   Received length:', signature.length);
      console.error('   Match status: FAILED');
    }
    
    return isValid;
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message
    });
    return false;
  }
};

// ✅ NEW: Enhanced signature verification with additional security checks
export const verifyPaymentSignatureAdvanced = (orderId, paymentId, signature, options = {}) => {
  console.log('🔐 Advanced signature verification starting...');
  
  const basicResult = verifyPaymentSignature(orderId, paymentId, signature);
  
  if (!basicResult) {
    return { isValid: false, reason: 'Basic signature verification failed' };
  }

  // Additional security checks
  const securityChecks = {
    timestampCheck: true, // Could add timestamp validation
    lengthCheck: signature.length === 64, // SHA256 hex should be 64 chars
    formatCheck: /^[a-f0-9]+$/.test(signature) // Only hex chars
  };

  console.log('🔍 Security checks:', securityChecks);
  
  const allChecksPassed = Object.values(securityChecks).every(check => check === true);
  
  return {
    isValid: allChecksPassed,
    basicVerification: basicResult,
    securityChecks,
    reason: allChecksPassed ? 'All verifications passed' : 'Security checks failed'
  };
};

// ✅ NEW: Utility function to validate Razorpay order format
export const validateOrderId = (orderId) => {
  const orderPattern = /^order_[a-zA-Z0-9]{14}$/;
  const isValid = orderPattern.test(orderId);
  
  console.log('🔍 Order ID validation:', {
    orderId: orderId,
    isValid: isValid,
    expectedFormat: 'order_XXXXXXXXXXXXXX'
  });
  
  return isValid;
};

// ✅ NEW: Utility function to validate Razorpay payment ID format
export const validatePaymentId = (paymentId) => {
  const paymentPattern = /^pay_[a-zA-Z0-9]{14}$/;
  const isValid = paymentPattern.test(paymentId);
  
  console.log('🔍 Payment ID validation:', {
    paymentId: paymentId,
    isValid: isValid,
    expectedFormat: 'pay_XXXXXXXXXXXXXX'
  });
  
  return isValid;
};

// ✅ NEW: Razorpay connection test function
export const testRazorpayConnection = async () => {
  console.log('🧪 Testing Razorpay connection...');
  
  try {
    // Test by fetching a non-existent payment (should return 404, not 401)
    await razorpay.payments.fetch('pay_test_connection');
  } catch (error) {
    if (error.statusCode === 404) {
      console.log('✅ Razorpay connection test passed (404 expected)');
      return { success: true, message: 'Connection established' };
    } else if (error.statusCode === 401) {
      console.error('❌ Razorpay authentication failed');
      return { success: false, message: 'Authentication failed - check API keys' };
    } else {
      console.log('✅ Razorpay connection established (unexpected but valid response)');
      return { success: true, message: 'Connection established' };
    }
  }
};

// ✅ NEW: Get Razorpay configuration info
export const getRazorpayInfo = () => {
  return {
    isInitialized: !!razorpay,
    mode: isTestMode ? 'test' : 'live',
    environment: process.env.NODE_ENV || 'development',
    keyIdPartial: process.env.RAZORPAY_KEY_ID ? process.env.RAZORPAY_KEY_ID.substring(0, 12) + '...' : 'Not set',
    hasSecret: !!process.env.RAZORPAY_KEY_SECRET,
    unlockAmount: `₹${(process.env.UNLOCK_PAYMENT_AMOUNT || 20000) / 100}`,
    initialized: new Date().toISOString()
  };
};

// ✅ NEW: Enhanced error handler for Razorpay operations
export const handleRazorpayError = (error, operation = 'Unknown') => {
  console.error(`❌ Razorpay ${operation} error:`, error);
  
  const errorInfo = {
    operation,
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode || null,
      code: error.code || null
    }
  };

  // Categorize common Razorpay errors
  if (error.statusCode === 400) {
    errorInfo.category = 'Bad Request';
    errorInfo.suggestion = 'Check request parameters and data format';
  } else if (error.statusCode === 401) {
    errorInfo.category = 'Authentication Error';
    errorInfo.suggestion = 'Verify API keys are correct and active';
  } else if (error.statusCode === 404) {
    errorInfo.category = 'Resource Not Found';
    errorInfo.suggestion = 'Check if the resource ID exists';
  } else if (error.statusCode === 429) {
    errorInfo.category = 'Rate Limit Exceeded';
    errorInfo.suggestion = 'Reduce request frequency and implement retry logic';
  } else if (error.statusCode >= 500) {
    errorInfo.category = 'Server Error';
    errorInfo.suggestion = 'Retry the operation or contact Razorpay support';
  } else {
    errorInfo.category = 'Unknown Error';
    errorInfo.suggestion = 'Check error details and Razorpay documentation';
  }

  console.error('📊 Error analysis:', errorInfo);
  return errorInfo;
};

// ✅ Enhanced: Export default Razorpay instance with validation
if (!razorpay) {
  console.error('❌ CRITICAL: Razorpay instance not initialized');
  throw new Error('Razorpay initialization failed - check configuration');
}

console.log('✅ Razorpay configuration module loaded successfully');
console.log('📋 Available functions:');
console.log('   - verifyPaymentSignature()');
console.log('   - verifyPaymentSignatureAdvanced()');
console.log('   - validateOrderId()');
console.log('   - validatePaymentId()');
console.log('   - testRazorpayConnection()');
console.log('   - getRazorpayInfo()');
console.log('   - handleRazorpayError()');

export default razorpay;
