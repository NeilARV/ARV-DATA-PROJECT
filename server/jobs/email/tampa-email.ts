import { sendEmailUpdatesForMsa } from 'server/jobs/email/processes/emailUpdates';

const MSA = 'Tampa-St. Petersburg-Clearwater, FL';
const CITY = 'Tampa';
const STATE = 'FL';

export async function sendTampaEmail() {
    await sendEmailUpdatesForMsa(MSA, CITY, STATE);
}
