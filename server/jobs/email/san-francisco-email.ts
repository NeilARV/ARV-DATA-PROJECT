import { sendEmailUpdatesForMsa } from "server/utils/emailUpdates";

const SAN_FRANCISCO_MSA = "San Francisco-Oakland-Fremont, CA";
const CITY = "San Francisco";
const STATE = "CA";

export async function sendSanFranciscoEmail() {
  await sendEmailUpdatesForMsa(SAN_FRANCISCO_MSA, CITY, STATE);
}
