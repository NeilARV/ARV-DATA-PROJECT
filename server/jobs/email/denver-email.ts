import { sendEmailUpdatesForMsa } from "server/utils/emailUpdates";

const DENVER_MSA = "Denver-Aurora-Centennial, CO";
const CITY = "Denver";
const STATE = "CO";

export async function sendDenverEmail() {
  await sendEmailUpdatesForMsa(DENVER_MSA, CITY, STATE);
}
