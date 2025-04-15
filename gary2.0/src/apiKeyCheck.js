// API Key Check utilities - Non-JSX version

// Helper function to create DOM elements with proper styling
const createStyledElement = (type, props = {}, children = []) => {
  const element = document.createElement(type);
  
  // Apply styles
  if (props.style) {
    Object.assign(element.style, props.style);
  }
  
  // Apply other props
  if (props.className) {
    element.className = props.className;
  }
  
  if (props.id) {
    element.id = props.id;
  }
  
  if (props.onClick) {
    element.addEventListener('click', props.onClick);
  }
  
  // Add children
  if (typeof children === 'string') {
    element.textContent = children;
  } else if (Array.isArray(children)) {
    children.forEach(child => {
      if (child) {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else {
          element.appendChild(child);
        }
      }
    });
  }
  
  return element;
};

// Create the API Key Check component as a function that returns HTML
const createApiKeyCheckUI = (container) => {
  if (!container) {
    console.error('Container element not found');
    return;
  }
  
  // Clear existing content
  container.innerHTML = '';
  
  // API status object
  const apiStatus = {
    oddsApiKey: {
      present: false,
      value: '',
      masked: ''
    },
    deepseekApiKey: {
      present: false,
      value: '',
      masked: ''
    },
    isProduction: window.location.hostname !== 'localhost'
  };
  
  // Initialize UI
  const initUI = () => {
    // Check for environment variables
    const oddsApiKey = import.meta?.env?.VITE_ODDS_API_KEY || '';
    const deepseekApiKey = import.meta?.env?.VITE_DEEPSEEK_API_KEY || '';
    
    // Mask the keys for security (show only first 5 and last 4 chars)
    const maskKey = (key) => {
      if (!key) return '';
      if (key.length <= 9) return '********';
      return `${key.slice(0, 5)}...${key.slice(-4)}`;
    };
    
    // Update status
    apiStatus.oddsApiKey.present = !!oddsApiKey;
    apiStatus.oddsApiKey.value = oddsApiKey;
    apiStatus.oddsApiKey.masked = maskKey(oddsApiKey);
    
    apiStatus.deepseekApiKey.present = !!deepseekApiKey;
    apiStatus.deepseekApiKey.value = deepseekApiKey;
    apiStatus.deepseekApiKey.masked = maskKey(deepseekApiKey);
    
    // Build UI
    buildUI();
  };
  
  // Test Odds API function
  const testOddsApi = async () => {
    try {
      // Make a direct request to the Odds API with the key to test it
      const apiKey = apiStatus.oddsApiKey.value;
      if (!apiKey) {
        alert('No API key found to test');
        return;
      }
      
      const response = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${apiKey}`);
      const data = await response.json();
      
      if (response.ok) {
        alert(`Success! Retrieved ${data.length} sports from The Odds API.`);
      } else {
        alert(`API Error: ${data.message || response.statusText}`);
      }
    } catch (error) {
      alert(`Error testing API key: ${error.message}`);
    }
  };
  
  // Build the UI
  const buildUI = () => {
    // Main container
    const mainDiv = createStyledElement('div', {
      style: {
        maxWidth: '600px',
        margin: '40px auto',
        padding: '20px',
        background: '#222',
        borderRadius: '8px',
        border: '2px solid #FFC94C'
      }
    });
    
    // Header
    const header = createStyledElement('h2', {
      style: {
        color: '#FFC94C',
        marginTop: 0
      }
    }, 'API Key Status');
    
    // Environment info
    const envDiv = createStyledElement('div', {
      style: { marginBottom: '20px' }
    });
    
    const envInfo = createStyledElement('p', {}, [
      createStyledElement('strong', {}, 'Environment: '),
      apiStatus.isProduction ? 'Production' : 'Development'
    ]);
    
    envDiv.appendChild(envInfo);
    
    // Odds API section
    const oddsApiDiv = createStyledElement('div', {
      style: {
        background: '#333',
        padding: '15px',
        borderRadius: '4px',
        marginBottom: '20px'
      }
    });
    
    const oddsApiHeader = createStyledElement('h3', {
      style: {
        margin: '0 0 10px 0',
        color: '#FFC94C'
      }
    }, 'The Odds API');
    
    const keyPresent = createStyledElement('p', {}, [
      createStyledElement('strong', {}, 'Key Present: '),
      createStyledElement('span', {
        style: {
          color: apiStatus.oddsApiKey.present ? '#4CAF50' : '#F44336'
        }
      }, apiStatus.oddsApiKey.present ? '✓ YES' : '✗ NO')
    ]);
    
    oddsApiDiv.appendChild(oddsApiHeader);
    oddsApiDiv.appendChild(keyPresent);
    
    if (apiStatus.oddsApiKey.present) {
      const keyInfo = createStyledElement('p', {}, [
        createStyledElement('strong', {}, 'Key: '),
        apiStatus.oddsApiKey.masked
      ]);
      oddsApiDiv.appendChild(keyInfo);
    }
    
    const testButton = createStyledElement('button', {
      style: {
        background: '#FFC94C',
        border: 'none',
        color: '#000',
        padding: '8px 16px',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold',
        marginTop: '10px'
      },
      onClick: testOddsApi
    }, 'Test Odds API Key');
    
    oddsApiDiv.appendChild(testButton);
    
    // DeepSeek API section
    const deepseekApiDiv = createStyledElement('div', {
      style: {
        background: '#333',
        padding: '15px',
        borderRadius: '4px'
      }
    });
    
    const deepseekApiHeader = createStyledElement('h3', {
      style: {
        margin: '0 0 10px 0',
        color: '#FFC94C'
      }
    }, 'DeepSeek API');
    
    const deepseekKeyPresent = createStyledElement('p', {}, [
      createStyledElement('strong', {}, 'Key Present: '),
      createStyledElement('span', {
        style: {
          color: apiStatus.deepseekApiKey.present ? '#4CAF50' : '#F44336'
        }
      }, apiStatus.deepseekApiKey.present ? '✓ YES' : '✗ NO')
    ]);
    
    deepseekApiDiv.appendChild(deepseekApiHeader);
    deepseekApiDiv.appendChild(deepseekKeyPresent);
    
    if (apiStatus.deepseekApiKey.present) {
      const keyInfo = createStyledElement('p', {}, [
        createStyledElement('strong', {}, 'Key: '),
        apiStatus.deepseekApiKey.masked
      ]);
      deepseekApiDiv.appendChild(keyInfo);
    }
    
    // Footer info
    const footerDiv = createStyledElement('div', {
      style: {
        marginTop: '20px',
        fontSize: '14px',
        color: '#888'
      }
    });
    
    const footerText = createStyledElement('p', {}, 'If keys are missing, make sure they are set in your Vercel environment variables:');
    
    const footerList = createStyledElement('ul');
    const item1 = createStyledElement('li', {}, 'VITE_ODDS_API_KEY');
    const item2 = createStyledElement('li', {}, 'VITE_DEEPSEEK_API_KEY');
    
    footerList.appendChild(item1);
    footerList.appendChild(item2);
    footerDiv.appendChild(footerText);
    footerDiv.appendChild(footerList);
    
    // Assemble all components
    mainDiv.appendChild(header);
    mainDiv.appendChild(envDiv);
    mainDiv.appendChild(oddsApiDiv);
    mainDiv.appendChild(deepseekApiDiv);
    mainDiv.appendChild(footerDiv);
    
    // Add to container
    container.appendChild(mainDiv);
  };
  
  // Initialize
  initUI();
  
  // Return methods for external use
  return {
    refresh: initUI,
    testOddsApi
  };
};

// Export a factory function that can be used where React components are expected
const ApiKeyCheck = () => {
  // This is a stub component that will be initialized with DOM manipulation
  // when it's mounted to the DOM
  return {
    mount: (container) => createApiKeyCheckUI(container)
  };
};

export default ApiKeyCheck;
