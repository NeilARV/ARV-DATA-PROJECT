import { sendEmailUpdatesForMsa } from 'server/jobs/email/processes/emailUpdates';

const MSA = 'San Francisco-Oakland-Fremont, CA';
const CITY = 'San Francisco';
const STATE = 'CA';

export async function sendSanFranciscoEmail() {
    await sendEmailUpdatesForMsa(MSA, CITY, STATE);
}
