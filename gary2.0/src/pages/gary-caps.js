// Script to apply gold styling to capitalized words in Gary's analysis
export function initGaryCaps() {
  document.addEventListener('DOMContentLoaded', function() {
    highlightGaryCaps();
    
    // Watch for DOM changes to catch dynamic content updates
    const observer = new MutationObserver(function(mutations) {
      highlightGaryCaps();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

function highlightGaryCaps() {
  // Find all Gary's analysis content sections
  const analysisElements = document.querySelectorAll('.gary-analysis-content');
  
  analysisElements.forEach(element => {
    const text = element.textContent;
    if (!text) return;
    
    // Create a highlighted version by wrapping capitalized words in gold spans
    let newHTML = '';
    const words = text.split(' ');
    
    words.forEach(word => {
      // Check if word is all caps (at least 2 characters to avoid "I", "A", etc.)
      if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
        newHTML += `<span class="gary-caps">${word}</span> `;
      } else {
        newHTML += word + ' ';
      }
    });
    
    // Only replace if there's at least one capitalized word
    if (newHTML !== text && newHTML.includes('gary-caps')) {
      element.innerHTML = newHTML;
    }
  });
}
