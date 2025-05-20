import axios from 'axios';

// CORS headers to allow requests from betwithgary.ai
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NODE_ENV === 'production' 
    ? 'https://www.betwithgary.ai' 
    : '*',
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

  // Get data from the request body
  const { model, messages } = req.body;

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

  try {
    // Make the request to Perplexity from the server
    const response = await axios.post(
      'https://api.perplexity.ai/chat/completions',
      {
        model: selectedModel,
        messages,
        max_tokens: 256
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

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
