import axios from 'axios';

// CORS headers to allow requests from betwithgary.ai
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Allow from any origin in development and production for testing
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type'
};

// Array of supported Perplexity models
const supportedModels = [
  'pplx-7b-online', 
  'pplx-70b-online', 
  'mixtral-8x7b-instruct',
  'mistral-7b-instruct'  // Our fallback model
];

// This configuration is needed for Vercel deployment
export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  // Set CORS headers for all responses
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST requests beyond this point
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Debug log to verify the endpoint is being hit correctly
  console.log('Perplexity proxy received request:', { 
    method: req.method,
    url: req.url,
    headers: req.headers,
    bodyKeys: Object.keys(req.body || {})
  });

  try {
    // Get data from the request body
    const { model, messages } = req.body;

    // More debug logging
    console.log('Request payload:', { model, messageCount: messages?.length });

    // Validate model
    const selectedModel = model || 'pplx-7b-online';
    if (!supportedModels.includes(selectedModel)) {
      return res.status(400).json({ 
        error: 'Invalid model', 
        message: `Model ${selectedModel} is not supported. Please use one of: ${supportedModels.join(', ')}`
      });
    }

    // API key is stored server-side for security - NEVER expose in client code
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.error('PERPLEXITY_API_KEY environment variable is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    // Prepare the request payload
    const requestPayload = {
      model: selectedModel,
      messages,
      max_tokens: 256
    };

    // Make the request to Perplexity from the server
    console.log('Sending request to Perplexity API');
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      requestPayload,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Perplexity API responded successfully');
    
    // Return the data from Perplexity
    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Perplexity API proxy error:', error);
    
    // Return detailed error information
    return res.status(error.response?.status || 500).json({
      error: 'Error calling Perplexity API',
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
  }
}
