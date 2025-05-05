# Component CSS Modules

This directory contains component-specific CSS module files that avoid global styling.

## Benefits of Component-Scoped CSS

1. **No Style Conflicts**: Styles only apply to the component they're meant for
2. **Easier Maintenance**: Design changes to one component don't affect others
3. **Better Performance**: Only load the CSS needed for components on screen
4. **More Flexibility**: Each page can have its own unique look and feel

## How to Use

1. Create a CSS module for each component (e.g., `Button.module.css`)
2. Import the styles in your component: `import styles from './Button.module.css'`
3. Apply classes using the styles object: `className={styles.button}`

## CSS Variables

We use CSS variables (defined in `/src/styles/variables.css`) to ensure design consistency while maintaining component independence.
