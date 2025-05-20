import axios from 'axios';

// Explicitly define configuration for Next.js API route
export const config = {
  api: {
    // Enable body parsing
    bodyParser: true,
    // Increase the payload size limit if needed
    bodyParser: {
      sizeLimit: '1mb'
    },
    // Disable default CORS handling (we'll do it manually)
    externalResolver: true,
  },
};

// Define supported models
const SUPPORTED_MODELS = [
  'pplx-7b-online',
  'pplx-70b-online',
  'mixtral-8x7b-instruct',
  'mistral-7b-instruct'
];

/**
 * API route handler for perplexity-proxy
 */
export default function handler(req, res) {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS requests (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  // Only accept POST requests
  if (req.method !== 'POST') {
    // Explicitly indicate which methods are allowed
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    res.status(405).json({ error: `Method ${req.method} Not Allowed` });
    return;
  }
  
  // Now handle the actual proxy logic
  handlePerplexityProxy(req, res);
}

/**
 * Handles the actual proxy request to Perplexity API
 */
async function handlePerplexityProxy(req, res) {
  console.log('[PERPLEXITY PROXY] Received request:', {
    url: req.url,
    method: req.method,
    bodyPresent: !!req.body,
    bodyKeys: Object.keys(req.body || {})
  });
  
  try {
    // Extract request data
    const { model, messages } = req.body;
    
    // Validate required parameters
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log('[PERPLEXITY PROXY] Invalid request - missing messages array');
      res.status(400).json({ error: 'Missing required parameter: messages' });
      return;
    }
    
    // Select and validate model
    const selectedModel = model || 'pplx-7b-online';
    if (!SUPPORTED_MODELS.includes(selectedModel)) {
      console.log(`[PERPLEXITY PROXY] Invalid model requested: ${selectedModel}`);
      res.status(400).json({
        error: 'Invalid model',
        message: `Model '${selectedModel}' is not supported. Please use one of: ${SUPPORTED_MODELS.join(', ')}`
      });
      return;
    }
    
    // Get API key from environment
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      console.error('[PERPLEXITY PROXY] Missing API key in environment');
      res.status(500).json({ error: 'Server configuration error: Missing API key' });
      return;
    }
    
    // Prepare request to Perplexity API
    const requestData = {
      model: selectedModel,
      messages,
      max_tokens: 256
    };
    
    console.log(`[PERPLEXITY PROXY] Forwarding request to Perplexity API with model: ${selectedModel}`);
    
    // Send request to Perplexity API
    const perplexityResponse = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      requestData,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('[PERPLEXITY PROXY] Successfully received response from Perplexity API');
    
    // Forward the response back to the client
    res.status(200).json(perplexityResponse.data);
  } catch (error) {
    console.error('[PERPLEXITY PROXY] Error:', error.message);
    
    // Structured error response
    const errorResponse = {
      error: 'Error calling Perplexity API',
      message: error.message
    };
    
    // Add more details if available
    if (error.response) {
      errorResponse.status = error.response.status;
      errorResponse.data = error.response.data;
      console.error(`[PERPLEXITY PROXY] Status: ${error.response.status}`, error.response.data);
      
      // Forward the actual error status
      res.status(error.response.status).json(errorResponse);
    } else {
      // Generic server error if no response
      res.status(500).json(errorResponse);
    }
  }
}
