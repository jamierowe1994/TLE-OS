"use client";

import { useEffect, useRef } from "react";

/**
 * A video that can actually be blended.
 *
 * mix-blend-mode on a <video> is a promise Chrome doesn't always keep: videos
 * composite on their own hardware layer, and during accelerated scrolling the
 * compositor can drop the blend for exactly one frame class — the video paints
 * opaque and the white plate flashes in. That is the "white at the top of the
 * scroll" bug, and no amount of isolation on ancestors fixes it, because the
 * exception IS the video layer itself.
 *
 * So the video never reaches the screen. It plays hidden, and every frame is
 * copied onto a canvas; the blend classes ride the CANVAS, which composites as
 * ordinary content on every scroll frame. Costs one drawImage per frame on a
 * 288px element — nothing.
 *
 * Frames are only copied while playing and on-screen (IntersectionObserver),
 * so a dashboard left open in a background tab isn't burning anybody's fan.
 */
export default function BlendVideo({
  src,
  className = "",
  keyed = false,
}: {
  src: string;
  /** Goes on the canvas — put the blend classes (e.g. art-video) here. */
  className?: string;
  /** TRUE ALPHA instead of blending: every frame's white plate is keyed out
   *  per-pixel (alpha = how dark the ink is), so the canvas needs no
   *  mix-blend-mode at all. Use for FIXED elements — a fixed layer is
   *  compositor-promoted and Chrome drops blends across that boundary,
   *  which is how the white box came back. Pair with `.art`, not
   *  `.art-video`, so dark mode inverts the keyed ink like any drawing. */
  keyed?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: keyed });
    if (!ctx) return;

    let raf = 0;
    let visible = true;

    const draw = () => {
      if (visible && video.readyState >= 2) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.drawImage(video, 0, 0);
        if (keyed && canvas.width) {
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = frame.data;
          for (let i = 0; i < d.length; i += 4) {
            // Luminance → alpha: white vanishes, ink stays ink.
            const luma = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
            d[i + 3] = 255 - luma;
            d[i] = d[i + 1] = d[i + 2] = 16; // the house ink
          }
          ctx.putImageData(frame, 0, 0);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      // Pausing the hidden video when off-screen also stops the decode work.
      if (visible) void video.play().catch(() => {});
      else video.pause();
    });
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden
        // Present but never painted — display:none would stall decoding in
        // some browsers, so it's parked off-canvas instead.
        className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px opacity-0"
      />
      <canvas ref={canvasRef} aria-hidden className={className} />
    </>
  );
}
