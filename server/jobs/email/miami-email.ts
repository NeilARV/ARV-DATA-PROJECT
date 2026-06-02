import { sendEmailUpdatesForMsa } from 'server/jobs/email/processes/emailUpdates';

const MSA = 'Miami-Fort Lauderdale-West Palm Beach, FL';
const CITY = 'Miami';
const STATE = 'FL';

export async function sendMiamiEmail() {
    await sendEmailUpdatesForMsa(MSA, CITY, STATE);
}
