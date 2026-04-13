import { sendEmailUpdatesForMsa } from "server/jobs/email/processes/emailUpdates";

const MSA = "Los Angeles-Long Beach-Anaheim, CA";
const CITY = "Los Angeles";
const STATE = "CA";

export async function sendLosAngelesEmail() {
  await sendEmailUpdatesForMsa(MSA, CITY, STATE);
}
