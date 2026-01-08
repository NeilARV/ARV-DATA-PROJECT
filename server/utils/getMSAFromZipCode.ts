// MSA lookup based on zip codes
// Maps zip codes to their corresponding Metropolitan Statistical Area
// Uses constants from client/src/constants/filters.constants.ts

import { 
    SAN_DIEGO_ZIP_CODES, 
    ORANGE_ZIP_CODES, 
    LOS_ANGELES_ZIP_CODES 
} from "../../client/src/constants/filters.constants";

export function getMSAFromZipCode(zipCode: string | null | undefined): string | null {
    if (!zipCode || typeof zipCode !== 'string') {
        return null;
    }

    const normalizedZip = zipCode.trim();

    // Extract zip codes from the objects (each object has { zip: string, city: string })
    const sanDiegoZips = SAN_DIEGO_ZIP_CODES.map(z => z.zip);
    const orangeZips = ORANGE_ZIP_CODES.map(z => z.zip);
    const laZips = LOS_ANGELES_ZIP_CODES.map(z => z.zip);

    // Check Orange County first (handles 92672 overlap - San Clemente is in Orange County)
    if (orangeZips.includes(normalizedZip)) {
        return "Los Angeles-Long Beach-Anaheim, CA";
    }
    
    // Check San Diego County
    if (sanDiegoZips.includes(normalizedZip)) {
        return "San Diego-Chula Vista-Carlsbad, CA";
    }
    
    // Check Los Angeles County
    if (laZips.includes(normalizedZip)) {
        return "Los Angeles-Long Beach-Anaheim, CA";
    }

    return null;
}
