import { z } from 'zod';
import { claimStatusEnum } from '../schemas/companies.schema';

// Optional ?status= filter for the admin claims list; an unrecognized value is a 400, never "all claims".
export const claimStatusFilterSchema = z.enum(claimStatusEnum.enumValues).optional();
