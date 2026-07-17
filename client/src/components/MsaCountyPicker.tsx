import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { msaShortName } from '@/lib/county';
import {
    getCountiesForMsa,
    getStateFromMsaName,
    getTrackedMsas,
} from '@shared/constants/countyToMsa';
import type { MsaCountySelection } from '@/types/filters';

type MsaCountyPickerProps = {
    selection: MsaCountySelection;
    onSelectionChange: (selection: MsaCountySelection) => void;
};

/**
 * State → MSA → multi-select county picker for the Data and Deals filter bars; operates on one
 * MSA at a time — switching state or MSA resets the selection to all counties of the new MSA,
 * so a selection can never mix counties across MSAs or states.
 */
export function MsaCountyPicker({ selection, onSelectionChange }: MsaCountyPickerProps) {
    const trackedMsas = useMemo(() => getTrackedMsas(), []);
    const selectedState = getStateFromMsaName(selection.msa) ?? 'CA';
    const states = useMemo(
        () => Array.from(new Set(trackedMsas.map((m) => m.state))).sort(),
        [trackedMsas],
    );
    const msasForState = trackedMsas.filter((m) => m.state === selectedState);
    const countyOptions = getCountiesForMsa(selection.msa);
    const allSelected = selection.counties.length === countyOptions.length;

    const countyLabel =
        selection.counties.length === 0
            ? 'No Counties'
            : allSelected
              ? 'All Counties'
              : selection.counties.length === 1
                ? `${selection.counties[0]} County`
                : `${selection.counties.length} Counties`;

    const selectMsa = (msa: string) => {
        onSelectionChange({ msa, counties: getCountiesForMsa(msa) });
    };

    const handleStateChange = (state: string) => {
        if (state === selectedState) return;
        const first = trackedMsas.find((m) => m.state === state);
        if (first) selectMsa(first.msaName);
    };

    const toggleCounty = (county: string) => {
        const next = selection.counties.includes(county)
            ? selection.counties.filter((c) => c !== county)
            : countyOptions.filter((c) => selection.counties.includes(c) || c === county);
        onSelectionChange({ msa: selection.msa, counties: next });
    };

    const toggleAllCounties = () => {
        onSelectionChange({ msa: selection.msa, counties: allSelected ? [] : countyOptions });
    };

    return (
        <div className="flex items-center gap-x-3">
            <Select value={selectedState} onValueChange={handleStateChange}>
                <SelectTrigger
                    className="h-8 w-[68px] text-xs flex-shrink-0 px-2"
                    data-testid="button-state-select"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                    {states.map((state) => (
                        <SelectItem key={state} value={state} data-testid={`option-state-${state}`}>
                            {state}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={selection.msa} onValueChange={selectMsa}>
                <SelectTrigger
                    className="h-8 w-32 text-xs flex-shrink-0 px-2"
                    data-testid="button-msa-select"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[10000]">
                    {msasForState.map(({ msaName }) => (
                        <SelectItem
                            key={msaName}
                            value={msaName}
                            data-testid={`option-msa-${msaName}`}
                        >
                            {msaShortName(msaName)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 w-40 justify-between text-xs flex-shrink-0 px-2"
                        data-testid="button-county-trigger"
                    >
                        <span className="truncate">{countyLabel}</span>
                        <ChevronDown className="w-3 h-3 ml-1 flex-shrink-0 opacity-50" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52 z-[10000]">
                    <DropdownMenuCheckboxItem
                        checked={
                            allSelected
                                ? true
                                : selection.counties.length > 0
                                  ? 'indeterminate'
                                  : false
                        }
                        onSelect={(e) => e.preventDefault()}
                        onCheckedChange={toggleAllCounties}
                        data-testid="checkbox-county-all"
                    >
                        All Counties
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <div className="max-h-60 overflow-y-auto">
                        {countyOptions.map((county) => (
                            <DropdownMenuCheckboxItem
                                key={county}
                                checked={selection.counties.includes(county)}
                                onSelect={(e) => e.preventDefault()}
                                onCheckedChange={() => toggleCounty(county)}
                                data-testid={`checkbox-county-${county}`}
                            >
                                {county}
                            </DropdownMenuCheckboxItem>
                        ))}
                    </div>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
