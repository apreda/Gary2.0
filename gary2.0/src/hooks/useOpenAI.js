import axios from 'axios';
import { useState, useEffect } from 'react';

// We'll initialize the client dynamically to ensure the API key is always up to date
function createOpenAIClient() {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  
  // Debug logging to help diagnose API key issues
  if (!apiKey) {
    console.error('⚠️ OpenAI API key not found in environment variables');
  } else {
    // Mask the key for security when logging
    const maskedKey = apiKey.substring(0, 5) + '...' + apiKey.substring(apiKey.length - 4);
    console.log(`OpenAI API key loaded (masked): ${maskedKey}`);
  }
  
  return axios.create({
    baseURL: 'https://api.openai.com/v1',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }
  });
}

export function useOpenAI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [openaiClient, setOpenaiClient] = useState(null);
  
  // Initialize the client when the hook is first used
  useEffect(() => {
    setOpenaiClient(createOpenAIClient());
  }, []);

  const searchContext = async (query) => {
    if (!openaiClient || !import.meta.env.VITE_OPENAI_API_KEY) {
      const error = 'OpenAI API configuration missing';
      console.error(error);
      setError(error);
      return '';
    }

    setLoading(true);
    setError(null);

    try {
      // Create a fresh client each time to ensure we have the latest API key
      const client = createOpenAIClient();
      
      console.log('Sending request to OpenAI API...');
      const response = await client.post('/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are Gary, a confident sports betting analyst bear. Give direct, entertaining betting advice based on the odds and game state. Be confident and use emojis occasionally.'
          },
          {
            role: 'user',
            content: query
          }
        ],
        temperature: 0.8,
        max_tokens: 250,
        top_p: 0.9
      });

      if (!response.data?.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from OpenAI');
      }

      const content = response.data.choices[0].message.content;
      setLoading(false);
      return content;
    } catch (err) {
      console.error('OpenAI API error:', err);
      const errorMessage = err.response?.data?.error?.message || err.message;
      setError(`OpenAI API error: ${errorMessage}`);
      setLoading(false);
      return '';
    }
  };

  const askGary = async (question) => {
    return searchContext(`Question about sports betting: ${question}`);
  };

  return {
    loading,
    error,
    searchContext,
    askGary
  };
}

export default useOpenAI;
