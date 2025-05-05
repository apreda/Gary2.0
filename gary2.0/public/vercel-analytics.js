// Vercel Analytics script
(function() {
  // Only run in production environments
  if (window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1') {
    console.log('Vercel Analytics not loaded in development');
    return;
  }

  // Create and append the Vercel Analytics script
  const script = document.createElement('script');
  script.defer = true;
  script.src = '/_vercel/insights/script.js';
  
  // Append to document
  if (document.head) {
    document.head.appendChild(script);
    console.log('Vercel Analytics script loaded');
  } else {
    // If head isn't available yet, wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', function() {
      document.head.appendChild(script);
      console.log('Vercel Analytics script loaded after DOM ready');
    });
  }
})();
