import { Router } from 'express';
import { ContactController } from 'server/controllers/contact';

const router = Router();

// POST /api/contact — Submit a contact message. Emails the user's RM (or default contact).
router.post('/', ContactController.submitContactMessage);

export default router;
