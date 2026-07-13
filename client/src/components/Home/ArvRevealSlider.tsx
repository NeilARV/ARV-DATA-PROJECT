import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Home } from 'lucide-react';

import { Reveal, sectionHeading } from '@/components/Home/primitives';

/** Drag-to-reveal "Before → After Repair Value" comparison — the heart of ARV. */
export function ArvRevealSlider() {
    const trackRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const [pos, setPos] = useState(55);

    const updateFromX = (clientX: number) => {
        const el = trackRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const next = ((clientX - rect.left) / rect.width) * 100;
        setPos(Math.max(0, Math.min(100, next)));
    };

    return (
        <section className="mx-auto max-w-7xl px-6 py-20">
            <Reveal>
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className={sectionHeading}>See the After Repair Value</h2>
                    <p className="mt-4 text-base text-muted-foreground">
                        Drag the handle to watch a deal go from its as-is purchase price to its full
                        repaired value.
                    </p>
                </div>

                <div
                    ref={trackRef}
                    role="slider"
                    tabIndex={0}
                    aria-label="Reveal before and after repair value"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(pos)}
                    onPointerDown={(e) => {
                        draggingRef.current = true;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        updateFromX(e.clientX);
                    }}
                    onPointerMove={(e) => {
                        if (draggingRef.current) updateFromX(e.clientX);
                    }}
                    onPointerUp={() => {
                        draggingRef.current = false;
                    }}
                    onPointerCancel={() => {
                        draggingRef.current = false;
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 4));
                        if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 4));
                    }}
                    className="relative mx-auto mt-10 h-72 max-w-3xl cursor-ew-resize select-none overflow-hidden rounded-2xl border border-card-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {/* AFTER layer — full base */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-primary/10">
                        <Home className="h-12 w-12 text-primary" />
                        <span className="inline-flex items-center rounded-md bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                            After
                        </span>
                        <p className="mt-1 text-sm text-muted-foreground">After Repair Value</p>
                        <p className="text-2xl font-bold text-foreground">$489,000</p>
                        <p className="text-sm font-semibold text-spread-positive">+$179K uplift</p>
                    </div>

                    {/* BEFORE layer — clipped to the left of the handle */}
                    <div
                        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-muted"
                        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
                    >
                        <Home className="h-12 w-12 text-muted-foreground/40" />
                        <span className="inline-flex items-center rounded-md bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                            Before
                        </span>
                        <p className="mt-1 text-sm text-muted-foreground">As-Is Purchase</p>
                        <p className="text-2xl font-bold text-foreground">$310,000</p>
                        <p className="text-sm text-muted-foreground">Needs full rehab</p>
                    </div>

                    {/* draggable handle */}
                    <div
                        className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-primary"
                        style={{ left: `${pos}%` }}
                    >
                        <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-background text-primary">
                            <ChevronLeft className="-mr-1 h-4 w-4" />
                            <ChevronRight className="-ml-1 h-4 w-4" />
                        </div>
                    </div>
                </div>
            </Reveal>
        </section>
    );
}
