import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CountySubscriptionAccordion } from '@/components/CountySubscriptionAccordion';
import type { CountySubscriptionSelection } from '@database/validation/countySubscriptions.validation';

// The component is controlled: it renders the tracked county universe (COUNTY_TO_MSA) grouped
// by MSA and reports every edit as a full replace-list via onSelectionsChange. Fixtures lean on
// the small Port St. Lucie group (St. Lucie + Martin) so all/some/none states stay readable.

const stLucie: CountySubscriptionSelection = { county: 'St. Lucie', state: 'FL' };
const martin: CountySubscriptionSelection = { county: 'Martin', state: 'FL' };
const denver: CountySubscriptionSelection = { county: 'Denver', state: 'CO' };

const PSL_MSA = 'Port St. Lucie, FL';

function headerCheckbox(msaName: string) {
    return screen.getByRole('checkbox', { name: `Select all ${msaName} counties` });
}

async function openGroup(user: ReturnType<typeof userEvent.setup>, msaName: string) {
    await user.click(screen.getByRole('button', { name: new RegExp(msaName.split(',')[0]) }));
}

describe('CountySubscriptionAccordion', () => {
    it('CountySubscriptionAccordion — renders counties grouped under their MSA', async () => {
        const user = userEvent.setup();
        render(<CountySubscriptionAccordion selections={[]} onSelectionsChange={vi.fn()} />);

        expect(screen.getByText(PSL_MSA)).toBeInTheDocument();
        await openGroup(user, PSL_MSA);
        expect(screen.getByRole('checkbox', { name: 'St. Lucie' })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Martin' })).toBeInTheDocument();
    });

    it('CountySubscriptionAccordion — no counties selected — group header is unchecked', () => {
        render(<CountySubscriptionAccordion selections={[]} onSelectionsChange={vi.fn()} />);
        expect(headerCheckbox(PSL_MSA)).toHaveAttribute('aria-checked', 'false');
    });

    it('CountySubscriptionAccordion — some counties selected — group header is indeterminate', () => {
        render(<CountySubscriptionAccordion selections={[stLucie]} onSelectionsChange={vi.fn()} />);
        expect(headerCheckbox(PSL_MSA)).toHaveAttribute('aria-checked', 'mixed');
    });

    it('CountySubscriptionAccordion — all counties selected — group header is checked', () => {
        render(
            <CountySubscriptionAccordion
                selections={[stLucie, martin]}
                onSelectionsChange={vi.fn()}
            />,
        );
        expect(headerCheckbox(PSL_MSA)).toHaveAttribute('aria-checked', 'true');
    });

    it('CountySubscriptionAccordion — clicking an unchecked header selects the whole group', async () => {
        const user = userEvent.setup();
        const onSelectionsChange = vi.fn();
        render(
            <CountySubscriptionAccordion
                selections={[denver]}
                onSelectionsChange={onSelectionsChange}
            />,
        );

        await user.click(headerCheckbox(PSL_MSA));

        const next = onSelectionsChange.mock.calls[0][0] as CountySubscriptionSelection[];
        expect(next).toHaveLength(3);
        expect(next).toEqual(expect.arrayContaining([denver, stLucie, martin]));
    });

    it('CountySubscriptionAccordion — clicking an indeterminate header selects the remaining counties', async () => {
        const user = userEvent.setup();
        const onSelectionsChange = vi.fn();
        render(
            <CountySubscriptionAccordion
                selections={[stLucie]}
                onSelectionsChange={onSelectionsChange}
            />,
        );

        await user.click(headerCheckbox(PSL_MSA));

        const next = onSelectionsChange.mock.calls[0][0] as CountySubscriptionSelection[];
        expect(next).toHaveLength(2);
        expect(next).toEqual(expect.arrayContaining([stLucie, martin]));
    });

    it('CountySubscriptionAccordion — clicking a checked header deselects the whole group', async () => {
        const user = userEvent.setup();
        const onSelectionsChange = vi.fn();
        render(
            <CountySubscriptionAccordion
                selections={[stLucie, martin, denver]}
                onSelectionsChange={onSelectionsChange}
            />,
        );

        await user.click(headerCheckbox(PSL_MSA));

        expect(onSelectionsChange).toHaveBeenCalledWith([denver]);
    });

    it('CountySubscriptionAccordion — toggling a county on adds it to the selection', async () => {
        const user = userEvent.setup();
        const onSelectionsChange = vi.fn();
        render(
            <CountySubscriptionAccordion
                selections={[stLucie]}
                onSelectionsChange={onSelectionsChange}
            />,
        );

        await user.click(screen.getByRole('checkbox', { name: 'Martin' }));

        const next = onSelectionsChange.mock.calls[0][0] as CountySubscriptionSelection[];
        expect(next).toHaveLength(2);
        expect(next).toEqual(expect.arrayContaining([stLucie, martin]));
    });

    it('CountySubscriptionAccordion — toggling a county off removes it', async () => {
        const user = userEvent.setup();
        const onSelectionsChange = vi.fn();
        render(
            <CountySubscriptionAccordion
                selections={[stLucie, martin]}
                onSelectionsChange={onSelectionsChange}
            />,
        );

        await user.click(screen.getByRole('checkbox', { name: 'Martin' }));

        expect(onSelectionsChange).toHaveBeenCalledWith([stLucie]);
    });

    it('CountySubscriptionAccordion — groups containing selected counties start expanded', () => {
        render(<CountySubscriptionAccordion selections={[stLucie]} onSelectionsChange={vi.fn()} />);
        // No click: the county checkbox is only reachable because its group rendered open.
        expect(screen.getByRole('checkbox', { name: 'St. Lucie' })).toBeInTheDocument();
        expect(screen.queryByRole('checkbox', { name: 'Denver' })).not.toBeInTheDocument();
    });

    it('CountySubscriptionAccordion — disabled — header and county checkboxes are disabled', () => {
        render(
            <CountySubscriptionAccordion
                selections={[stLucie]}
                onSelectionsChange={vi.fn()}
                disabled
            />,
        );
        expect(headerCheckbox(PSL_MSA)).toBeDisabled();
        expect(screen.getByRole('checkbox', { name: 'St. Lucie' })).toBeDisabled();
    });
});
