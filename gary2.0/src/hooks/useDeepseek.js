import axios from 'axios';
import { useState } from 'react';

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1';
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY;

// Create an axios instance with default config
const deepseekClient = axios.create({
  baseURL: DEEPSEEK_API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
  }
});

export function useDeepseek() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const searchContext = async (query) => {
    if (!DEEPSEEK_API_URL || !import.meta.env.VITE_DEEPSEEK_API_KEY) {
      const error = 'Deepseek API configuration missing';
      console.error(error);
      setError(error);
      return '';
    }

    setLoading(true);
    setError(null);

    try {
      const response = await deepseekClient.post('/chat/completions', {
        model: 'deepseek-chat',
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
        throw new Error('Invalid response format from Deepseek');
      }

      return response.data.choices[0].message.content;
    } catch (err) {
      const errorMessage = err.response?.data?.error?.message || err.message || 'Failed to get response from Deepseek';
      setError(errorMessage);
      console.error('Deepseek error:', err);
      return `Error: ${errorMessage}`;
    } finally {
      setLoading(false);
    }
  };

  return {
    searchContext,
    loading,
    error,
  };
}
