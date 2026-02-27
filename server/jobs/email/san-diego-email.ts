import { sendEmailUpdatesForMsa } from "server/jobs/email/processes/emailUpdates";

const SAN_DIEGO_MSA = "San Diego-Chula Vista-Carlsbad, CA";
const CITY = "San Diego";
const STATE = "CA";

export async function sendSanDiegoEmail() {
  await sendEmailUpdatesForMsa(SAN_DIEGO_MSA, CITY, STATE);
}
