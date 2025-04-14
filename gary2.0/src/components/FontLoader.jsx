import React, { useEffect } from 'react';

export function FontLoader() {
  useEffect(() => {
    // Add preconnect for Google Fonts
    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = 'https://fonts.googleapis.com';
    document.head.appendChild(preconnect);
    
    const preconnectGstatic = document.createElement('link');
    preconnectGstatic.rel = 'preconnect';
    preconnectGstatic.href = 'https://fonts.gstatic.com';
    preconnectGstatic.crossOrigin = 'anonymous';
    document.head.appendChild(preconnectGstatic);
    
    // Add the font stylesheets - Montserrat for headings and Inter for body text
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@500;600;700;800;900&display=swap';
    document.head.appendChild(fontLink);

    // Add Kaushan Script for certain accent text elements
    const specialFontLink = document.createElement('link');
    specialFontLink.rel = 'stylesheet';
    specialFontLink.href = 'https://fonts.googleapis.com/css2?family=Kaushan+Script&display=swap';
    document.head.appendChild(specialFontLink);
    
    // Clean up the links when the component is unmounted
    return () => {
      document.head.removeChild(preconnect);
      document.head.removeChild(preconnectGstatic);
      document.head.removeChild(fontLink);
      document.head.removeChild(specialFontLink);
    };
  }, []);

  return null; // This component doesn't render anything
}

export default FontLoader;
