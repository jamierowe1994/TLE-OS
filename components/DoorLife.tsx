"use client";

import { useEffect, useRef, useState } from "react";

/**
 * What moves on the door's picture, on a desktop only (9 Nov 2026).
 *
 *   - THE FILM. The sign-in still has a four-second living copy of itself
 *     (mist, lamplight; the camera locked off, the last second crossfaded into
 *     the first so there is no seam). It is laid over the still once it is
 *     actually playing, so nobody ever looks at a black box or a play button:
 *     if the film never starts, the photograph is the whole picture.
 *   - THE DRIFT. The picture leans a few pixels against the pointer, the way
 *     a view through a window does. The picture is always held a little larger
 *     than the screen (see door-push in app/door.css), so an edge never shows.
 *
 * Neither runs on a phone or a tablet, for anyone who asks for less motion,
 * or on a connection that asks to save data. Nothing here touches the form.
 */
export default function DoorLife({ film }: { film?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [show, setShow] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    const saver = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (calm || !wide) return;
    if (film && !saver) setShow(true);

    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const stage = document.querySelector<HTMLElement>(".door-stage");
    if (!stage) return;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let frame = 0;
    const step = () => {
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      stage.style.setProperty("--px", x.toFixed(4));
      stage.style.setProperty("--py", y.toFixed(4));
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.002 ? requestAnimationFrame(step) : 0;
    };
    const move = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth) * 2 - 1;
      ty = (e.clientY / window.innerHeight) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(step);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [film]);

  /* A tab in the background plays nothing. */
  useEffect(() => {
    if (!show) return;
    const v = video.current;
    if (!v) return;
    const sync = () => {
      if (document.hidden) v.pause();
      else void v.play().catch(() => {});
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [show]);

  if (!film || !show) return null;
  return (
    <video
      ref={video}
      className="door-film"
      data-on={playing ? "" : undefined}
      src={film}
      muted
      loop
      playsInline
      preload="auto"
      disablePictureInPicture
      tabIndex={-1}
      onPlaying={() => setPlaying(true)}
    />
  );
}
