import { z } from "zod";

export const CONTACT_SUBJECTS = [
  "Request Access",
  "Request Contact Information",
  "Upgrade Account",
  "Contact ARV",
  "Troubleshooting",
  "Other",
] as const;

export type ContactSubject = (typeof CONTACT_SUBJECTS)[number];

export const contactMessageSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Invalid email address").max(255),
  subject: z.enum(CONTACT_SUBJECTS, { message: "Please select a subject" }),
  message: z.string().min(1, "Message is required").max(5000),
});

export type ContactMessageFormData = z.infer<typeof contactMessageSchema>;
