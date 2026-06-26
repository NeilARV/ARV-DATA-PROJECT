import { useLocation } from 'wouter';

import { Logo } from '@/components/Home/primitives';

// Footer link groups. `to` is an internal route; items without one are placeholders (no page yet).
const groups: { title: string; items: { label: string; to?: string }[] }[] = [
    {
        title: 'Product',
        items: [
            { label: 'Data', to: '/data' },
            { label: 'Deals', to: '/deals' },
            { label: 'Vendors', to: '/vendors' },
            { label: 'Mastermind', to: '/mastermind' },
        ],
    },
    {
        title: 'Company',
        items: [{ label: 'About' }, { label: 'Careers' }, { label: 'Contact', to: '/contact' }],
    },
    {
        title: 'Legal',
        items: [{ label: 'Privacy' }, { label: 'Terms' }],
    },
];

export function Footer() {
    const [, setLocation] = useLocation();

    return (
        <footer className="border-t border-border">
            <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-6 py-12 lg:grid-cols-4">
                <div className="col-span-2 lg:col-span-1">
                    <Logo />
                    <p className="mt-3 max-w-xs text-sm text-muted-foreground">
                        Real estate investing intelligence for serious operators.
                    </p>
                </div>
                {groups.map((group) => (
                    <div key={group.title}>
                        <p className="text-sm font-semibold text-foreground">{group.title}</p>
                        <ul className="mt-3 space-y-2">
                            {group.items.map((item) => (
                                <li key={item.label}>
                                    <button
                                        type="button"
                                        onClick={() => item.to && setLocation(item.to)}
                                        className="text-sm text-muted-foreground transition hover:text-foreground"
                                    >
                                        {item.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
            <div className="border-t border-border">
                <div className="mx-auto flex max-w-7xl items-center justify-center px-6 py-5 text-xs text-muted-foreground">
                    <span>© {new Date().getFullYear()} ARV Finance. All rights reserved.</span>
                </div>
            </div>
        </footer>
    );
}
