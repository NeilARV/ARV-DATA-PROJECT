// MSA lookup based on zip codes
// Maps zip codes to their corresponding Metropolitan Statistical Area
// Uses constants from client/src/constants/filters.constants.ts

import { 
    SAN_DIEGO_MSA_ZIP_CODES, 
    LOS_ANGELES_MSA_ZIP_CODES,
    DENVER_MSA_ZIP_CODES
} from "../../client/src/constants/filters.constants";

export function getMSAFromZipCode(zipCode: string | null | undefined): string | null {
    if (!zipCode || typeof zipCode !== 'string') {
        return null;
    }

    const normalizedZip = zipCode.trim();

    // Flatten all zip codes from San Diego MSA (all counties)
    const sanDiegoZips = Object.values(SAN_DIEGO_MSA_ZIP_CODES)
        .flat()
        .map(z => z.zip);

    // Flatten all zip codes from Los Angeles MSA (Los Angeles and Orange counties)
    const losAngelesZips = Object.values(LOS_ANGELES_MSA_ZIP_CODES)
        .flat()
        .map(z => z.zip);

    // Flatten all zip codes from Denver MSA (all counties)
    const denverZips = Object.values(DENVER_MSA_ZIP_CODES)
        .flat()
        .map(z => z.zip);

    // Check Orange County first (handles 92672 overlap - San Clemente is in Orange County)
    // Orange is part of Los Angeles MSA
    const orangeZips = LOS_ANGELES_MSA_ZIP_CODES.orange?.map(z => z.zip) || [];
    if (orangeZips.includes(normalizedZip)) {
        return "Los Angeles-Long Beach-Anaheim, CA";
    }
    
    // Check San Diego MSA
    if (sanDiegoZips.includes(normalizedZip)) {
        return "San Diego-Chula Vista-Carlsbad, CA";
    }
    
    // Check Los Angeles MSA
    if (losAngelesZips.includes(normalizedZip)) {
        return "Los Angeles-Long Beach-Anaheim, CA";
    }

    // Check Denver MSA
    if (denverZips.includes(normalizedZip)) {
        return "Denver-Aurora-Centennial, CO";
    }

    return null;
}
