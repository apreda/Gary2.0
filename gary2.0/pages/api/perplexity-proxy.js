import axios from 'axios';

// Standard configuration for Next.js Pages Router API
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

// Define supported models
const SUPPORTED_MODELS = [
  'pplx-7b-online',
  'pplx-70b-online',
  'mixtral-8x7b-instruct',
  'mistral-7b-instruct',
  'llama-3-sonar-online',
  'llama-3-70b-online'
];

/**
 * API route handler for perplexity-proxy
 */
export default function handler(req, res) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }
  
  // Per documentation: "The API does not support CORS for browser requests.
  // Best Practice: Always call the API from your backend, not directly from the browser."
  // This proxy acts as that backend bridge
  
  // Handle the POST request
  handlePerplexityProxy(req, res);
}

/**
 * Handles the actual proxy request to Perplexity API
 */
async function handlePerplexityProxy(req, res) {
  // Log request info for debugging
  console.log('[PERPLEXITY PROXY] Received request:', {
    url: req.url,
    method: req.method,
    bodyPresent: !!req.body,
    bodyKeys: Object.keys(req.body || {})
  });
  
  try {
    // Extract request data from the parsed body (bodyParser middleware handles this)
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
      max_tokens: 512 // Increased from 256 to match your preferred configuration
    };
    
    console.log(`[PERPLEXITY PROXY] Forwarding request to Perplexity API with model: ${selectedModel}`);
    
    // Send request to Perplexity API using axios
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
