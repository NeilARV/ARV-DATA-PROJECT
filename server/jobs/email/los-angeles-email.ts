import { sendEmailUpdatesForMsa } from "server/utils/emailUpdates";

const LOS_ANGELES_MSA = "Los Angeles-Long Beach-Anaheim, CA";
const CITY = "Los Angeles";
const STATE = "CA";

export async function sendLosAngelesEmail() {
  await sendEmailUpdatesForMsa(LOS_ANGELES_MSA, CITY, STATE);
}
