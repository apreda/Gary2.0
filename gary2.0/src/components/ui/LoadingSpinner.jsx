export function LoadingSpinner({ size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4'
  };

  return (
    <div className={`relative ${className}`}>
      <div 
        className={`
          ${sizeClasses[size]}
          animate-spin
          rounded-full
          border-solid
          border-blue-400
          border-t-transparent
          border-l-transparent
          shadow-lg
          transition-all
          duration-300
        `}
      />
      <div 
        className={`
          ${sizeClasses[size]}
          absolute
          top-0
          animate-ping
          rounded-full
          border-solid
          border-blue-400/30
          opacity-75
        `}
      />
    </div>
  );
}
