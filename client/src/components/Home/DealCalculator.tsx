import { useState } from 'react';
import { Calculator } from 'lucide-react';

import { Pill, Reveal } from '@/components/Home/primitives';

function formatUSD(n: number) {
    return `$${Math.round(n).toLocaleString()}`;
}

/** Live deal-underwriting calculator — drag the sliders, watch profit update. */
export function DealCalculator() {
    const [purchase, setPurchase] = useState(310000);
    const [rehab, setRehab] = useState(62000);
    const [arv, setArv] = useState(489000);

    const invested = purchase + rehab;
    const profit = arv - invested;
    const positive = profit >= 0;
    const roi = invested > 0 ? (profit / invested) * 100 : 0;
    const investedW = arv > 0 ? Math.min((invested / arv) * 100, 100) : 100;
    const profitW = positive ? Math.max(0, 100 - investedW) : 0;

    const sliders = [
        { label: 'Purchase Price', value: purchase, set: setPurchase, min: 100000, max: 800000, step: 5000 },
        { label: 'Rehab Budget', value: rehab, set: setRehab, min: 0, max: 250000, step: 1000 },
        { label: 'After Repair Value', value: arv, set: setArv, min: 100000, max: 1200000, step: 5000 },
    ];

    return (
        <section className="mx-auto max-w-7xl px-6 py-20">
            <Reveal>
                <div className="mx-auto max-w-2xl text-center">
                    <Pill>
                        <Calculator className="h-3.5 w-3.5 text-primary" />
                        Run the numbers
                    </Pill>
                    <h2 className="mt-5 text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
                        Underwrite a deal in seconds
                    </h2>
                    <p className="mt-4 text-base text-muted-foreground">
                        Drag the sliders and watch your projected profit update live.
                    </p>
                </div>

                <div className="mx-auto mt-10 grid max-w-4xl gap-8 rounded-2xl border border-card-border bg-card p-6 lg:grid-cols-2 lg:p-8">
                    <div className="flex flex-col justify-center gap-6">
                        {sliders.map((s) => (
                            <div key={s.label}>
                                <div className="mb-2 flex items-center justify-between">
                                    <label className="text-sm font-medium text-foreground">
                                        {s.label}
                                    </label>
                                    <span className="text-sm font-bold text-foreground">
                                        {formatUSD(s.value)}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    className="arv-range"
                                    min={s.min}
                                    max={s.max}
                                    step={s.step}
                                    value={s.value}
                                    onChange={(e) => s.set(Number(e.target.value))}
                                    aria-label={s.label}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col justify-center rounded-xl border border-border bg-background p-6 text-center">
                        <p className="text-sm text-muted-foreground">Projected Profit</p>
                        <p
                            className={`mt-1 text-4xl font-bold ${
                                positive ? 'text-spread-positive' : 'text-spread-negative'
                            }`}
                        >
                            {positive ? '' : '−'}
                            {formatUSD(Math.abs(profit))}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {roi >= 0 ? '+' : '−'}
                            {Math.abs(roi).toFixed(1)}% ROI · {formatUSD(invested)} in
                        </p>
                        <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-muted">
                            <div className="bg-muted-foreground/40" style={{ width: `${investedW}%` }} />
                            <div className="bg-spread-positive" style={{ width: `${profitW}%` }} />
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                            <span>Invested</span>
                            <span>ARV {formatUSD(arv)}</span>
                        </div>
                    </div>
                </div>
            </Reveal>
        </section>
    );
}
