import { Router } from 'express';
import razorpay, { verifyPaymentSignature } from '../config/razorpay.js';
import { BusinessOwner } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ✅ Simple ₹200 payment - NO auto-unlock
router.post('/create-unlock-order', requireAuth, async (req, res) => {
  try {
    console.log('💳 Creating ₹200 payment for user:', req.ownerId);
    
    const businessOwner = await BusinessOwner.findById(req.ownerId);
    if (!businessOwner) {
      return res.status(404).json({ 
        success: false, 
        error: 'Business not found' 
      });
    }

    console.log('✅ Business found:', businessOwner.businessName);

    const amount = 20000; // ₹200 in paise
    
    // ✅ FIXED: Receipt length <= 40 characters
    const shortId = businessOwner._id.toString().substring(0, 15);
    const shortTime = Date.now().toString().slice(-8);
    const receiptId = `pay_${shortId}_${shortTime}`; // 31 chars total ✅
    
    console.log('🧾 Receipt ID:', receiptId, `(${receiptId.length} chars)`);
    
    const options = {
      amount: amount,
      currency: 'INR',
      receipt: receiptId, // ✅ Now under 40 chars
      notes: {
        businessId: businessOwner._id.toString(),
        businessName: businessOwner.businessName,
        purpose: 'payment_200',
        ownerName: businessOwner.name
      }
    };

    console.log('🔄 Creating Razorpay order...');
    const order = await razorpay.orders.create(options);
    
    console.log('✅ Razorpay order created:', order.id);

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        businessName: businessOwner.businessName,
        ownerName: businessOwner.name,
        ownerEmail: businessOwner.email || businessOwner.businessEmail,
        ownerPhone: businessOwner.phone
      },
      razorpayKeyId: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('❌ Error creating payment order:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create payment order' 
    });
  }
});

// ✅ Simple payment verification - NO auto-unlock  
router.post('/verify-unlock-payment', requireAuth, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id, 
      razorpay_signature
    } = req.body;

    console.log('🔍 Verifying ₹200 payment...');
    
    // Verify signature
    const isValidSignature = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValidSignature) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid payment signature' 
      });
    }

    // Get payment details
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    
    if (payment.status !== 'captured') {
      return res.status(400).json({ 
        success: false, 
        error: 'Payment not completed' 
      });
    }

    console.log('✅ ₹200 Payment verified successfully!');

    // ✅ SIMPLE: Just confirm payment - NO account unlocking
    res.json({
      success: true,
      message: '🎉 Payment Successful! ₹200 payment completed.',
      payment: {
        amount: '₹200',
        status: 'completed',
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id
      }
    });

  } catch (error) {
    console.error('❌ Error verifying payment:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Payment verification failed' 
    });
  }
});

export default router;
