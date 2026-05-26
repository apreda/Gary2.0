//
//  GaryOrbShaders.metal
//
//  Metal Shading Language functions wired into SwiftUI via ShaderLibrary.
//  Powers the Apple-Intelligence-tier visual layer of GaryOrbView.
//
//  Three stitchable shaders:
//    - garyPlasma          (color effect)        — fluid noise interior
//    - garyChromaAB        (layer effect)        — chromatic aberration on edges
//    - garyDistortion      (distortion effect)   — pixel displacement / ripple
//
//  Each shader receives the same state encoded as a float:
//    0 = idle    1 = listening    2 = thinking    3 = speaking
//

#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>

using namespace metal;

// ── Hash / noise helpers ────────────────────────────────────────────────────

static inline float gary_hash(float2 p) {
    p = fract(p * float2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

static inline float gary_noise(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep interpolation

    float a = gary_hash(i);
    float b = gary_hash(i + float2(1.0, 0.0));
    float c = gary_hash(i + float2(0.0, 1.0));
    float d = gary_hash(i + float2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractional Brownian Motion — layered noise for organic flow
static inline float gary_fbm(float2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
        v += a * gary_noise(p);
        p *= 2.0;
        a *= 0.5;
    }
    return v;
}

// ── State color palettes ────────────────────────────────────────────────────
// Returns (warm color, accent color) pairs for each state

static inline void gary_palette(float state, thread half3 &warm, thread half3 &accent) {
    if (state < 0.5) {
        // idle — pure gold tones
        warm   = half3(1.00h, 0.80h, 0.25h);
        accent = half3(0.55h, 0.35h, 0.08h);
    } else if (state < 1.5) {
        // listening — gold + cyan electricity
        warm   = half3(1.00h, 0.88h, 0.35h);
        accent = half3(0.20h, 0.65h, 0.85h);
    } else if (state < 2.5) {
        // thinking — gold + cosmic purple
        warm   = half3(0.95h, 0.65h, 0.30h);
        accent = half3(0.55h, 0.20h, 0.65h);
    } else {
        // speaking — gold + warm orange
        warm   = half3(1.00h, 0.85h, 0.40h);
        accent = half3(0.95h, 0.45h, 0.10h);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PLASMA — color effect: paints fluid energy inside the orb
// ─────────────────────────────────────────────────────────────────────────────

[[ stitchable ]] half4 garyPlasma(
    float2 position,
    half4 currentColor,
    float4 boundingRect,
    float time,
    float state,
    float amplitude
) {
    float w = boundingRect.z;
    float h = boundingRect.w;
    float2 center = float2(w * 0.5, h * 0.5);
    float dim = min(w, h);
    float2 uv = (position - center) / dim;
    float dist = length(uv);

    // Outside the orb: keep whatever the parent view drew
    if (dist > 0.50) {
        return currentColor;
    }

    // Time evolution — faster as Gary engages
    float speed = 0.20 + 0.10 * state + amplitude * 0.30;
    float t = time * speed;

    // Two-pass FBM with a flow displacement — gives that "liquid energy" look
    float2 flow = float2(
        gary_fbm(uv * 2.6 + t * 0.8),
        gary_fbm(uv * 2.6 + t * 0.8 + 17.0)
    );
    float plasma = gary_fbm(uv * 3.8 + (flow - 0.5) * 1.4 + t * 0.6);

    // Secondary high-frequency detail layer
    float detail = gary_fbm(uv * 9.0 - t * 0.4) * 0.30;
    plasma = saturate(plasma * 0.85 + detail);

    // State-driven palette
    half3 warm; half3 accent;
    gary_palette(state, warm, accent);
    half3 col = mix(accent, warm, half(plasma));

    // Inner-to-edge falloff — bright core, dimmer rim
    float radial = 1.0 - smoothstep(0.10, 0.50, dist);
    col *= half(0.55 + 0.55 * radial);

    // Amplitude boost — orb visibly brightens with audio
    col += half3(half(amplitude) * 0.18h);

    // Edge feathering for smooth blend with the SwiftUI core behind it
    float edgeAlpha = smoothstep(0.50, 0.38, dist);

    return half4(col, half(edgeAlpha));
}

// ─────────────────────────────────────────────────────────────────────────────
// CHROMATIC ABERRATION — layer effect: RGB color separation on edges
// ─────────────────────────────────────────────────────────────────────────────

[[ stitchable ]] half4 garyChromaAB(
    float2 position,
    SwiftUI::Layer layer,
    float4 boundingRect,
    float intensity
) {
    float w = boundingRect.z;
    float h = boundingRect.w;
    float2 center = float2(w * 0.5, h * 0.5);
    float dim = min(w, h);
    float2 dir = (position - center) / max(dim, 1.0);
    float dist = length(dir);

    // Stronger offset at the edges — quadratic falloff
    float offset = pow(dist, 2.2) * intensity * 12.0;
    float2 nDir = dist > 0.0001 ? normalize(dir) : float2(0.0, 0.0);
    float2 shift = nDir * offset;

    half4 sR = layer.sample(position + shift);
    half4 sG = layer.sample(position);
    half4 sB = layer.sample(position - shift);

    return half4(sR.r, sG.g, sB.b, sG.a);
}

// ─────────────────────────────────────────────────────────────────────────────
// DISTORTION — distortion effect: warps pixels based on state + amplitude
// ─────────────────────────────────────────────────────────────────────────────

[[ stitchable ]] float2 garyDistortion(
    float2 position,
    float time,
    float amplitude,
    float state
) {
    // Smooth flowing displacement field
    float t = time * 0.45;
    float2 uv = position * 0.020;

    float dx = (gary_noise(uv + float2(t, 0.0)) - 0.5) * 2.0;
    float dy = (gary_noise(uv + float2(0.0, t) + 100.0) - 0.5) * 2.0;

    // Thinking state — more chaotic warping
    float stateBoost = 1.0;
    if (state > 1.5 && state < 2.5) stateBoost = 2.6;
    else if (state > 0.5 && state < 1.5) stateBoost = 1.4;  // listening: subtle
    else if (state > 2.5) stateBoost = 1.8;                  // speaking: rhythmic

    float magnitude = (1.5 + amplitude * 6.0) * stateBoost;
    return position + float2(dx, dy) * magnitude;
}
