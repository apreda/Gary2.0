import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createCheckoutSession, handleStripeWebhook, getUserSubscription, cancelSubscription, createCustomerPortalSession } from './stripe.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS Configuration
const corsOptions = {
  origin: '*', // Allow all origins in production for now
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Stripe webhook needs raw body
app.use('/api/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Create checkout session
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    // Validate required fields
    const { priceId, userId, email, successUrl, cancelUrl } = req.body;
    
    if (!priceId) {
      return res.status(400).json({ error: 'Missing required parameter: priceId' });
    }
    
    console.log('API received checkout request with:', { userId, email, priceId });
    
    // Pass the request directly to the createCheckoutSession function
    const session = await createCheckoutSession(req);
    
    // Return the session URL that the client will redirect to
    res.status(200).json(session);
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: `Failed to create checkout session: ${error.message}` });
  }
});

// Handle Stripe webhook
app.post('/api/webhook', async (req, res) => {
  try {
    const result = await handleStripeWebhook({
      headers: req.headers,
      body: req.body
    });
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// Get user subscription
app.get('/api/subscription/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const subscription = await getUserSubscription(userId);
    
    res.status(200).json(subscription || { active: false });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Cancel subscription
app.post('/api/cancel-subscription', async (req, res) => {
  try {
    const { userId } = req.body;
    const result = await cancelSubscription(userId);
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Create customer portal session
app.post('/api/create-portal-session', async (req, res) => {
  try {
    const { userId } = req.body;
    const session = await createCustomerPortalSession(userId);
    
    res.status(200).json(session);
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' ? 'Server error' : err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Stripe API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
