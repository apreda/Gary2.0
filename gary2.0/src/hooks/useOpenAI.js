import axios from 'axios';
import { useState, useEffect } from 'react';

// Use secure proxy instead of direct OpenAI client
const OPENAI_PROXY_URL = '/api/openai-proxy';

export function useOpenAI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const searchContext = async (query) => {
    setLoading(true);
    setError(null);

    try {
      console.log('Sending request to OpenAI via secure proxy...');
      
      const requestData = {
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
        max_tokens: 250
      };

      const response = await axios.post(OPENAI_PROXY_URL, requestData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
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
