/**
 * Test Perplexity API Integration
 * 
 * This tests the Perplexity API to ensure it's working correctly and properly
 * loads the API key from the environment variables.
 */
import dotenv from 'dotenv';
import { perplexityService } from './services/perplexityService.js';

// Load environment variables
dotenv.config();

// Explicitly set the API key
const PERPLEXITY_API_KEY = process.env.VITE_PERPLEXITY_API_KEY;
perplexityService.API_KEY = PERPLEXITY_API_KEY;

async function testPerplexityAPI() {
  console.log('🧠 TESTING PERPLEXITY API 🧠');
  console.log('---------------------------');
  
  // 1. Check if API key is loaded
  console.log('1. Checking API key...');
  const apiKey = perplexityService.API_KEY;
  
  if (!apiKey) {
    console.error('❌ API key is not set!');
    console.log('Make sure VITE_PERPLEXITY_API_KEY is properly set in your .env file');
    return;
  }
  
  console.log(`✅ API key is set (masked): ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);
  
  // 2. Test a basic search query
  console.log('\n2. Testing basic search...');
  const query = 'What is the current MLB season?';
  
  try {
    const result = await perplexityService.search(query);
    console.log('Search response:', result);
    
    if (result.success) {
      console.log('✅ Search successful!');
      console.log('\nResponse data:');
      console.log(result.data);
    } else {
      console.error('❌ Search failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error during search:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
  
  // 3. Test fetchRealTimeInfo method which we may use instead
  console.log('\n3. Testing fetchRealTimeInfo method...');
  
  try {
    const rtQuery = 'Provide information about the MLB game between Angels and Athletics today';
    const rtResult = await perplexityService.fetchRealTimeInfo(rtQuery);
    
    if (rtResult) {
      console.log('✅ fetchRealTimeInfo successful!');
      console.log('\nResponse:');
      console.log(rtResult);
    } else {
      console.error('❌ fetchRealTimeInfo returned empty result');
    }
  } catch (error) {
    console.error('❌ Error during fetchRealTimeInfo:', error.message);
  }
}

// Run the test
testPerplexityAPI();
