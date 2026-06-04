# Dev Instructions: Product Hunt Launch Badge

## What to do
Add a "Featured on Product Hunt" badge to the betwithgary.ai landing page for launch day (Thursday March 18, 2026).

## Where to add it
File: `gary2.0/src/pages/Home.jsx`

Add the badge **above the main CTA button** in the hero section, around line 712 (before the "Download on the App Store" link).

## Code to add

```jsx
{/* Product Hunt Launch Badge - Add above the App Store CTA */}
<div className="flex justify-center mb-4">
  <a
    href="https://www.producthunt.com/posts/gary-a-i?utm_source=badge-featured"
    target="_blank"
    rel="noopener noreferrer"
  >
    <img
      src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=YOUR_POST_ID&theme=dark"
      alt="Gary A.I. - Free AI sports picks for every game, every day | Product Hunt"
      style={{ width: '250px', height: '54px' }}
      width="250"
      height="54"
    />
  </a>
</div>
```

## Important notes

1. **Replace `YOUR_POST_ID`** — After the PH listing is published, get the actual post ID from the Product Hunt embed widget generator at: https://www.producthunt.com/posts/gary-a-i/embed (the URL may vary based on the slug PH assigns)

2. **Use `theme=dark`** — matches our black background. Available themes: `light`, `dark`, `neutral`

3. **Remove after launch week** — The badge is most effective during launch day/week. Consider removing it after ~7 days or keeping it permanently as social proof.

4. **Deploy timing** — Deploy this change BEFORE 12:01 AM PT on Thursday March 18th so it's live when the PH listing goes live.

## Alternative: Custom badge (if PH embed isn't ready)

If the PH embed URL isn't available yet, use this custom badge as a temporary placeholder:

```jsx
<div className="flex justify-center mb-4">
  <a
    href="https://www.producthunt.com/posts/gary-a-i"
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#ff6154]/30 hover:border-[#ff6154]/60 transition-colors"
    style={{ backgroundColor: 'rgba(255, 97, 84, 0.1)' }}
  >
    <span style={{ color: '#ff6154', fontWeight: 600, fontSize: '0.9rem' }}>
      🚀 We're live on Product Hunt!
    </span>
  </a>
</div>
```
