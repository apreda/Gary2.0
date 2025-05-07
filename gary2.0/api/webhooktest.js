// Simple test endpoint for Vercel serverless functions
export default function handler(req, res) {
  // Log request details
  console.log('Test endpoint received request:', {
    method: req.method,
    url: req.url,
    headers: Object.keys(req.headers),
  });

  // Return a simple response
  res.status(200).json({ 
    success: true, 
    message: 'Webhook test endpoint is working', 
    method: req.method,
    time: new Date().toISOString()
  });
}
