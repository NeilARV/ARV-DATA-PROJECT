import { useState } from 'react';

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';

import { getTrackedCounties } from '@shared/constants/countyToMsa';
import type { CountySubscriptionSelection } from '@database/validation/countySubscriptions.validation';

type MsaGroup = {
    msaName: string;
    state: string;
    counties: CountySubscriptionSelection[];
};

const MSA_GROUPS: MsaGroup[] = (() => {
    const groups = new Map<string, MsaGroup>();
    for (const { county, state, msaName } of getTrackedCounties()) {
        const group = groups.get(msaName) ?? { msaName, state, counties: [] };
        group.counties.push({ county, state });
        groups.set(msaName, group);
    }
    return Array.from(groups.values()).sort(
        (a, b) => a.state.localeCompare(b.state) || a.msaName.localeCompare(b.msaName),
    );
})();

function selectionKey({ county, state }: CountySubscriptionSelection): string {
    return `${state}:${county}`;
}

function countyCheckboxId({ county, state }: CountySubscriptionSelection): string {
    return `county-${state}-${county.replace(/\s+/g, '-')}`;
}

type CountySubscriptionAccordionProps = {
    selections: CountySubscriptionSelection[];
    onSelectionsChange: (selections: CountySubscriptionSelection[]) => void;
    disabled?: boolean;
};

/** Tracked counties grouped under their MSA, with a tri-state select-all header per group;
 *  every edit is reported as a full replace-list (the PATCH /api/auth/me contract). */
export function CountySubscriptionAccordion({
    selections,
    onSelectionsChange,
    disabled = false,
}: CountySubscriptionAccordionProps) {
    // Groups the user is already subscribed in start open; read once at mount by design.
    const [defaultOpenGroups] = useState(() => {
        const initialKeys = new Set(selections.map(selectionKey));
        return MSA_GROUPS.filter((g) =>
            g.counties.some((c) => initialKeys.has(selectionKey(c))),
        ).map((g) => g.msaName);
    });

    const selectedKeys = new Set(selections.map(selectionKey));

    // Rebuilding from MSA_GROUPS keeps the replace-list in one canonical order and deduped.
    const buildReplaceList = (nextKeys: Set<string>): CountySubscriptionSelection[] =>
        MSA_GROUPS.flatMap((group) => group.counties.filter((c) => nextKeys.has(selectionKey(c))));

    const handleCountyToggle = (county: CountySubscriptionSelection) => {
        const nextKeys = new Set(selectedKeys);
        const key = selectionKey(county);
        if (nextKeys.has(key)) {
            nextKeys.delete(key);
        } else {
            nextKeys.add(key);
        }
        onSelectionsChange(buildReplaceList(nextKeys));
    };

    const handleGroupToggle = (group: MsaGroup) => {
        const isAllSelected = group.counties.every((c) => selectedKeys.has(selectionKey(c)));
        const nextKeys = new Set(selectedKeys);
        for (const county of group.counties) {
            if (isAllSelected) {
                nextKeys.delete(selectionKey(county));
            } else {
                nextKeys.add(selectionKey(county));
            }
        }
        onSelectionsChange(buildReplaceList(nextKeys));
    };

    return (
        <Accordion type="multiple" defaultValue={defaultOpenGroups}>
            {MSA_GROUPS.map((group) => {
                const selectedCount = group.counties.filter((c) =>
                    selectedKeys.has(selectionKey(c)),
                ).length;
                const groupChecked =
                    selectedCount === group.counties.length
                        ? true
                        : selectedCount > 0
                          ? 'indeterminate'
                          : false;

                return (
                    <AccordionItem key={group.msaName} value={group.msaName}>
                        <div className="flex items-center gap-3">
                            <Checkbox
                                checked={groupChecked}
                                disabled={disabled}
                                onCheckedChange={() => handleGroupToggle(group)}
                                aria-label={`Select all ${group.msaName} counties`}
                            />
                            <AccordionTrigger className="py-3 gap-3">
                                <span className="flex-1 text-left">{group.msaName}</span>
                                <span className="text-xs text-muted-foreground font-normal">
                                    {selectedCount} of {group.counties.length} counties
                                </span>
                            </AccordionTrigger>
                        </div>
                        <AccordionContent>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 pl-7">
                                {group.counties.map((county) => (
                                    <div
                                        key={selectionKey(county)}
                                        className="flex items-center gap-2"
                                    >
                                        <Checkbox
                                            id={countyCheckboxId(county)}
                                            checked={selectedKeys.has(selectionKey(county))}
                                            disabled={disabled}
                                            onCheckedChange={() => handleCountyToggle(county)}
                                        />
                                        <label
                                            htmlFor={countyCheckboxId(county)}
                                            className={`text-sm text-foreground ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
                                        >
                                            {county.county}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                );
            })}
        </Accordion>
    );
}
