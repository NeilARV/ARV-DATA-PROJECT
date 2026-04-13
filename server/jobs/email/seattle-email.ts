import { sendEmailUpdatesForMsa } from "server/jobs/email/processes/emailUpdates";

const MSA = "Seattle-Tacoma-Bellevue, WA";
const CITY = "Seattle";
const STATE = "WA";

export async function sendSanDiegoEmail() {
  await sendEmailUpdatesForMsa(MSA, CITY, STATE);
}
