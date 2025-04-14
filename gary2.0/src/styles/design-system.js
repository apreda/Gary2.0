// Design tokens
export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
};

export const typography = {
  heading1: 'font-bold text-4xl tracking-tight',
  heading2: 'font-semibold text-3xl tracking-tight',
  heading3: 'font-semibold text-2xl',
  body: 'text-base leading-relaxed',
  caption: 'text-sm text-gray-500',
};

export const animation = {
  transition: 'transition-all duration-300 ease-in-out',
  hover: 'hover:scale-102 hover:shadow-lg',
  pressed: 'active:scale-98',
  fadeIn: 'animate-fadeIn',
  slideIn: 'animate-slideIn',
};

export const elevation = {
  low: 'shadow-sm',
  medium: 'shadow-md',
  high: 'shadow-lg',
  card: 'shadow-xl',
};

// Component base styles
export const card = {
  base: 'rounded-xl bg-white dark:bg-gray-800 overflow-hidden',
  interactive: 'cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-102',
  gradient: 'bg-gradient-to-br from-blue-600 to-blue-800',
};

export const button = {
  base: 'rounded-lg font-semibold px-4 py-2 transition-all duration-300',
  primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
  secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 active:bg-gray-400',
  success: 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800',
};

export const input = {
  base: 'rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none',
  error: 'border-red-500 focus:ring-red-500',
};
