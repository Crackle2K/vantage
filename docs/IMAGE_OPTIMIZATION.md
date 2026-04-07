# Image Optimization

## Current Issues

| Asset | Size | Issue |
|-------|------|-------|
| Vantage.png (logo) | 2.0 MB | Too large for logo |
| Explore.png | 1.0 MB | Unoptimized PNG |
| laperlasalon&spa.webp | 1.5 MB | Large WebP |
| hero2.mp4 + hero3.mp4 | 64 MB | Massive videos |
| Unsplash images | External | No size parameters |

**Total: ~72 MB assets**

## Action Items

### 1. Convert PNG → WebP
- `Vantage.png` → `Vantage.webp` (target: <50KB)
- `Explore.png` → `Explore.webp` (target: <200KB)
- `Activity.png` → `Activity.webp`
- `Pricing.png` → `Pricing.webp`

Use `<picture>` for fallbacks:
```html
<picture>
  <source srcset="/Images/Vantage.webp" type="image/webp">
  <img src="/Images/Vantage.png" alt="Vantage">
</picture>
```

### 2. Add Unsplash Parameters
```tsx
// Before
"https://images.unsplash.com/photo-xxx"

// After
"https://images.unsplash.com/photo-xxx?w=400&q=80&auto=format"
```

### 3. Install Vite Plugin
```bash
npm install -D vite-plugin-imagemin
```

### 4. Compress Videos
- Use HandBrake or FFmpeg
- Target: H.264, 720p, ~5MB each
- Add `preload="metadata"` to video elements

### 5. Add Image Dimensions
Add `width` and `height` attributes to all `<img>` tags to prevent CLS.

## Expected Savings

| Change | Before | After | Savings |
|--------|--------|-------|---------|
| Videos | 64 MB | 15 MB | ~77% |
| PNGs | 3.4 MB | 500 KB | ~85% |
| Unsplash | Variable | Optimized | ~60% |

**Total estimated savings: ~85% reduction**
