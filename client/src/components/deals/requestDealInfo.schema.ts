import { z } from "zod";

export const requestInfoSchema = z.object({
    firstName: z.string().min(1, "First name is required"),
    lastName:  z.string().min(1, "Last name is required"),
    email:     z.string().email("Invalid email address"),
    phone:     z.string().optional(),
    message:   z.string().optional(),
});

export type RequestInfoFormValues = z.infer<typeof requestInfoSchema>;
