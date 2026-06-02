import { sendEmailUpdatesForMsa } from 'server/jobs/email/processes/emailUpdates';

const MSA = 'San Diego-Chula Vista-Carlsbad, CA';
const CITY = 'San Diego';
const STATE = 'CA';

export async function sendSanDiegoEmail() {
    await sendEmailUpdatesForMsa(MSA, CITY, STATE);
}
