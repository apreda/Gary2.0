# CSS Migration Guide: Global to Component-Level Styling

This guide outlines how to transition the Gary2.0 site from using global CSS to component-level styling.

## Why We're Migrating

- **Increased Flexibility**: Style each page differently without fighting global defaults
- **Easier Maintenance**: Changes to one component don't affect others
- **Better Performance**: Only load the CSS needed for visible components
- **Improved Developer Experience**: Less time debugging CSS conflicts

## Migration Steps

### 1. Define CSS Variables (✅ Done)

We've created `/src/styles/variables.css` with design tokens for:
- Colors
- Typography
- Spacing
- Borders & Shadows
- Z-indices

### 2. Remove Global Background & Font Styles (✅ Started)

- Removed global black background from index.css and base.css
- Removed hardcoded values for text color and font family

### 3. Create Component CSS Modules (🔄 In Progress)

For each component:

1. Create a CSS module in `/src/components/modules/` (e.g., `GaryHero.module.css`)
2. Move component styles from global CSS to the module
3. Use CSS variables instead of hardcoded values
4. Import and apply styles in the component

### 4. Update Page Components (⏳ Upcoming)

For each page:
1. Create a CSS module in `/src/pages/modules/` (e.g., `Home.module.css`)
2. Define page-specific styles using CSS modules
3. Apply `className={styles.pageName}` instead of global classes

### 5. Remove Unused Global Styles (⏳ Upcoming)

As components adopt their own modules, gradually remove unused global styles.

## Getting Started

### Example Conversion

**Before (GlobalComponent.jsx)**:
```jsx
import React from 'react';
import '../global.css';

function GlobalComponent() {
  return <div className="global-container">
    <h1 className="global-title">Title</h1>
  </div>;
}
```

**After (ModularComponent.jsx)**:
```jsx
import React from 'react';
import styles from './modules/ModularComponent.module.css';

function ModularComponent() {
  return <div className={styles.container}>
    <h1 className={styles.title}>Title</h1>
  </div>;
}
```

## Best Practices

1. **Use CSS variables** for consistent design tokens
2. **Avoid !important** flags except in rare cases
3. **Name classes** specifically to their component
4. **Keep specificity low** by using flat class selectors
5. **Combine with Tailwind** when appropriate for quick styling
