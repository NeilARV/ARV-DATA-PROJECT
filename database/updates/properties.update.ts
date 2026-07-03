import { z } from 'zod';

const PROPERTY_STATUSES = ['in-renovation', 'on-market', 'sold', 'wholesale'] as const;

// An assignment always names its assignor: isAssignment=true requires a non-empty
// assignorName; clearing (isAssignment=false) leaves assignorName null/absent. This makes
// the "marked but nameless" state unrepresentable at the API boundary.
const assignmentUpdateSchema = z
    .object({
        transactionId: z.number().int().positive(),
        isAssignment: z.boolean(),
        assignorName: z.string().nullable().optional(),
    })
    .refine((data) => !data.isAssignment || (data.assignorName?.trim().length ?? 0) > 0, {
        message: 'assignorName is required when isAssignment is true',
        path: ['assignorName'],
    });

export type AssignmentUpdateInput = z.infer<typeof assignmentUpdateSchema>;

export const patchPropertySchema = z
    .object({
        isArvFunded: z.boolean().optional(),
        statuses: z.array(z.enum(PROPERTY_STATUSES)).min(1).optional(),
        deletedTransactionIds: z.array(z.number().int().positive()).optional(),
        assignments: z.array(assignmentUpdateSchema).optional(),
    })
    .strict()
    .refine(
        (data) =>
            data.isArvFunded !== undefined ||
            data.statuses !== undefined ||
            data.deletedTransactionIds !== undefined ||
            data.assignments !== undefined,
        { message: 'At least one field must be provided' },
    );

export const updatePropertySchema = z
    .object({
        sfrPropertyId: z.coerce.number().int().optional(),
        propertyClassDescription: z.string().nullable().optional(),
        propertyType: z.string().nullable().optional(),
        vacant: z.boolean().nullable().optional(),
        hoa: z.string().nullable().optional(),
        ownerType: z.string().nullable().optional(),
        purchaseMethod: z.string().nullable().optional(),
        listingStatus: z.string().nullable().optional(),
        status: z.string().nullable().optional(),
        monthsOwned: z.coerce.number().int().nullable().optional(),
        msa: z.string().nullable().optional(),
        county: z.string().nullable().optional(),
    })
    .strict();

export const updateAddressSchema = z
    .object({
        formattedStreetAddress: z.string().nullable().optional(),
        streetNumber: z.string().nullable().optional(),
        streetSuffix: z.string().nullable().optional(),
        streetPreDirection: z.string().nullable().optional(),
        streetName: z.string().nullable().optional(),
        streetPostDirection: z.string().nullable().optional(),
        unitType: z.string().nullable().optional(),
        unitNumber: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        zipCode: z.string().nullable().optional(),
        zipPlusFourCode: z.string().nullable().optional(),
        carrierCode: z.string().nullable().optional(),
        latitude: z.coerce.number().nullable().optional(),
        longitude: z.coerce.number().nullable().optional(),
        geocodingAccuracy: z.string().nullable().optional(),
        censusTract: z.string().nullable().optional(),
        censusBlock: z.string().nullable().optional(),
    })
    .strict();

export const updateStructureSchema = z
    .object({
        totalAreaSqFt: z.coerce.number().int().nullable().optional(),
        yearBuilt: z.coerce.number().int().nullable().optional(),
        effectiveYearBuilt: z.coerce.number().int().nullable().optional(),
        bedsCount: z.coerce.number().int().nullable().optional(),
        roomsCount: z.coerce.number().int().nullable().optional(),
        baths: z.coerce.number().nullable().optional(),
        basementType: z.string().nullable().optional(),
        condition: z.string().nullable().optional(),
        constructionType: z.string().nullable().optional(),
        exteriorWallType: z.string().nullable().optional(),
        fireplaces: z.coerce.number().int().nullable().optional(),
        heatingType: z.string().nullable().optional(),
        heatingFuelType: z.string().nullable().optional(),
        parkingSpacesCount: z.coerce.number().int().nullable().optional(),
        poolType: z.string().nullable().optional(),
        quality: z.string().nullable().optional(),
        roofMaterialType: z.string().nullable().optional(),
        roofStyleType: z.string().nullable().optional(),
        sewerType: z.string().nullable().optional(),
        stories: z.string().nullable().optional(),
        unitsCount: z.coerce.number().int().nullable().optional(),
        waterType: z.string().nullable().optional(),
        livingAreaSqft: z.coerce.number().int().nullable().optional(),
        acDescription: z.string().nullable().optional(),
        garageDescription: z.string().nullable().optional(),
        buildingClassDescription: z.string().nullable().optional(),
        sqftDescription: z.string().nullable().optional(),
    })
    .strict();
