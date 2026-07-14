// INTERIM — marketing button class strings, pending consolidation into the shared <Button>
// component (client/src/components/ui/button.tsx). These duplicate Button's variants but with the
// home page's look (larger padding, ring-2, borderless primary, no elevate overlay). Once Button
// adopts that look app-wide, replace these with <Button> at the call sites and delete this file.

export const btnPrimary =
    'inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition hover:brightness-90 active:brightness-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export const btnOutline =
    'inline-flex items-center justify-center gap-2 rounded-md border border-border bg-transparent px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export const btnGhost =
    'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
