import { sendEmailUpdatesForMsa } from "server/jobs/email/processes/emailUpdates";

const MSA = "Port St. Lucie, FL";
const CITY = "Miami";
const STATE = "FL";

export async function sendPortStLucieEmail() {
  await sendEmailUpdatesForMsa(MSA, CITY, STATE);
}
