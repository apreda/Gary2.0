# Gary 2.0 Consolidated CSS Structure

This directory contains consolidated CSS files that provide a single source of truth for all styling in the Gary 2.0 application.

## Structure

The CSS has been organized into four main files:

1. **design-system.css** - Core design system with colors, typography, and shared components
2. **pick-cards.css** - All styles related to pick cards (front, back, flip animations)
3. **premium-carousel.css** - Styles for the premium fanned-out carousel display
4. **page-layouts.css** - Page-specific layouts, including RealGaryPicks

## Implementation Guide

To implement these consolidated styles:

1. Import these files in the main application entry point or specific component files
2. Remove the old duplicate CSS files once the transition is complete
3. Update any component-specific class names as needed

## Migration Process

The migration should be done in phases:

1. First, implement the consolidated CSS alongside existing CSS
2. Test thoroughly to ensure all components render correctly
3. Remove the duplicate CSS files once verified

## Design Principles

- Gold and black premium theme
- Consistent spacing and typography
- Reusable components
- Mobile-responsive design
