import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MsaCountyPicker } from '@/components/data/MsaCountyPicker';
import { getCountiesForMsa } from '@shared/constants/countyToMsa';
import type { MsaCountySelection } from '@/types/filters';

// The picker is controlled: State → MSA → multi-select counties, one MSA at a time. County
// options come only from the selected MSA and switching MSA/state resets the selection to all
// of the new MSA's counties — cross-MSA mixing is structurally impossible.

const DENVER_MSA = 'Denver-Aurora-Centennial, CO';
const SD_MSA = 'San Diego-Chula Vista-Carlsbad, CA';
const PSL_MSA = 'Port St. Lucie, FL';
const DENVER_COUNTIES = getCountiesForMsa(DENVER_MSA);

// Radix Select/DropdownMenu use pointer APIs jsdom doesn't implement.
beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
});

function renderPicker(selection: MsaCountySelection, onSelectionChange = vi.fn()) {
    render(<MsaCountyPicker selection={selection} onSelectionChange={onSelectionChange} />);
    return onSelectionChange;
}

async function openCountyMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByTestId('button-county-trigger'));
}

describe('MsaCountyPicker', () => {
    it('offers only the selected MSA’s counties — no county from another MSA', async () => {
        const user = userEvent.setup();
        renderPicker({ msa: DENVER_MSA, counties: ['Denver'] });

        await openCountyMenu(user);
        for (const county of DENVER_COUNTIES) {
            expect(screen.getByRole('menuitemcheckbox', { name: county })).toBeInTheDocument();
        }
        expect(screen.queryByRole('menuitemcheckbox', { name: 'San Diego' })).toBeNull();
        expect(screen.queryByRole('menuitemcheckbox', { name: 'Orange' })).toBeNull();
    });

    it('toggling an unselected county adds it to the selection', async () => {
        const user = userEvent.setup();
        const onSelectionChange = renderPicker({ msa: DENVER_MSA, counties: ['Denver'] });

        await openCountyMenu(user);
        await user.click(screen.getByRole('menuitemcheckbox', { name: 'Adams' }));

        expect(onSelectionChange).toHaveBeenCalledWith({
            msa: DENVER_MSA,
            counties: ['Denver', 'Adams'],
        });
    });

    it('toggling a selected county removes it — down to none selected', async () => {
        const user = userEvent.setup();
        const onSelectionChange = renderPicker({ msa: DENVER_MSA, counties: ['Denver'] });

        await openCountyMenu(user);
        await user.click(screen.getByRole('menuitemcheckbox', { name: 'Denver' }));

        expect(onSelectionChange).toHaveBeenCalledWith({ msa: DENVER_MSA, counties: [] });
    });

    it('“All Counties” selects every county of the MSA when some are missing', async () => {
        const user = userEvent.setup();
        const onSelectionChange = renderPicker({ msa: DENVER_MSA, counties: ['Denver'] });

        await openCountyMenu(user);
        await user.click(screen.getByRole('menuitemcheckbox', { name: 'All Counties' }));

        expect(onSelectionChange).toHaveBeenCalledWith({
            msa: DENVER_MSA,
            counties: DENVER_COUNTIES,
        });
    });

    it('“All Counties” clears the selection when everything is already selected', async () => {
        const user = userEvent.setup();
        const onSelectionChange = renderPicker({ msa: DENVER_MSA, counties: DENVER_COUNTIES });

        await openCountyMenu(user);
        await user.click(screen.getByRole('menuitemcheckbox', { name: 'All Counties' }));

        expect(onSelectionChange).toHaveBeenCalledWith({ msa: DENVER_MSA, counties: [] });
    });

    it.each([
        [[], 'No Counties'],
        [['Denver'], 'Denver County'],
        [['Denver', 'Adams'], '2 Counties'],
        [DENVER_COUNTIES, 'All Counties'],
    ])('county trigger label for %j is %s', (counties, label) => {
        renderPicker({ msa: DENVER_MSA, counties: counties as string[] });
        expect(screen.getByTestId('button-county-trigger')).toHaveTextContent(label);
    });

    it('selecting another MSA resets the selection to all of that MSA’s counties', async () => {
        const user = userEvent.setup();
        const onSelectionChange = renderPicker({ msa: SD_MSA, counties: ['San Diego'] });

        await user.click(screen.getByTestId('button-msa-select'));
        await user.click(screen.getByTestId('option-msa-Los Angeles-Long Beach-Anaheim, CA'));

        expect(onSelectionChange).toHaveBeenCalledWith({
            msa: 'Los Angeles-Long Beach-Anaheim, CA',
            counties: getCountiesForMsa('Los Angeles-Long Beach-Anaheim, CA'),
        });
    });

    it('the MSA dropdown offers only MSAs of the selected state', async () => {
        const user = userEvent.setup();
        renderPicker({ msa: DENVER_MSA, counties: ['Denver'] });

        await user.click(screen.getByTestId('button-msa-select'));
        expect(screen.getByTestId(`option-msa-${DENVER_MSA}`)).toBeInTheDocument();
        expect(screen.queryByTestId(`option-msa-${SD_MSA}`)).toBeNull();
        expect(screen.queryByTestId(`option-msa-${PSL_MSA}`)).toBeNull();
    });

    it('changing state moves to that state’s first MSA with all counties selected', async () => {
        const user = userEvent.setup();
        const onSelectionChange = renderPicker({ msa: DENVER_MSA, counties: ['Denver'] });

        await user.click(screen.getByTestId('button-state-select'));
        await user.click(screen.getByTestId('option-state-FL'));

        expect(onSelectionChange).toHaveBeenCalledTimes(1);
        const next = onSelectionChange.mock.calls[0][0] as MsaCountySelection;
        expect(next.msa).toBe('Miami-Fort Lauderdale-West Palm Beach, FL');
        expect(next.counties).toEqual(getCountiesForMsa(next.msa));
    });
});
