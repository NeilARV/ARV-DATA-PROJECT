import type { Request, Response } from 'express';
import { ContactServices } from 'server/services/contact';
import { contactMessageSchema } from '@database/validation/contactMessages.validation';

/**
 * POST /api/contact — validate a contact-form submission and email it to the
 * submitter's relationship manager (or the default contact address).
 * @param req contact-form fields in the body; optional session user id
 * @param res 204 on success, 400 on validation failure, 500 on send error
 */
export async function submitContactMessage(req: Request, res: Response): Promise<void> {
    try {
        const validation = contactMessageSchema.safeParse(req.body);
        if (!validation.success) {
            res.status(400).json({
                message: 'Invalid form data',
                errors: validation.error.errors,
            });
            return;
        }

        const userId = req.session.userId ?? null;
        await ContactServices.sendContactMessage(validation.data, userId);

        res.status(204).send();
        return;
    } catch (error) {
        console.error('[POST /api/contact] Error:', error);
        res.status(500).json({ message: 'Error sending contact message' });
    }
}
