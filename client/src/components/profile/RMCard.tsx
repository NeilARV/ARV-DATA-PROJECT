import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhoneNumber } from "@shared/utils/formatPhoneNumber";

type RMCardProps = {
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string | null;
}

export function RMCard(rm: RMCardProps ) {

    const { firstName, lastName, email, phone } = rm;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Your Relationship Manager</CardTitle>
                <CardDescription>
                    Contact your relationship manager for support or questions.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-lg border bg-muted/30 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <span className="profile-rm-label">First Name</span>
                        <p className="profile-rm-value">{firstName}</p>
                    </div>
                    <div>
                        <span className="profile-rm-label">Last Name</span>
                        <p className="profile-rm-value">{lastName}</p>
                    </div>
                    <div>
                        <span className="profile-rm-label">Email</span>
                        <p className="profile-rm-value">
                            {email}
                        </p>
                    </div>
                    <div>
                        <span className="profile-rm-label">Phone</span>
                        <p className="profile-rm-value">
                            {phone
                            ? (phone.includes("(")
                                ? phone
                                : formatPhoneNumber(phone))
                            : "—"}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}