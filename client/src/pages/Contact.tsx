import { useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { CheckCircle2 } from 'lucide-react';

import { MarketingHeader } from '@/components/MarketingHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import ContactForm from '@/components/contact/ContactForm';

import { useAuth } from '@/hooks/use-auth';

import {
    CONTACT_SUBJECTS,
    type ContactSubject,
} from '@database/validation/contactMessages.validation';

/** Reads `?subject=` and ignores values not in the allowlist (so a bad link can't preselect junk). */
function parseSubjectParam(params: URLSearchParams): ContactSubject | undefined {
    const raw = params.get('subject');
    return raw && (CONTACT_SUBJECTS as readonly string[]).includes(raw)
        ? (raw as ContactSubject)
        : undefined;
}

/**
 * The centralized contact page (`/contact`). Other parts of the app link here with a prefilled
 * `?subject=`/`?message=` instead of opening a modal. Autofills the user's details when logged in.
 */
export default function Contact() {
    const search = useSearch();
    const [, setLocation] = useLocation();
    const { user } = useAuth();
    const [sent, setSent] = useState(false);

    const params = new URLSearchParams(search);
    const subject = parseSubjectParam(params);
    const message = params.get('message') ?? undefined;

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <MarketingHeader />
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
                <Card className="w-full max-w-lg">
                    <CardHeader>
                        <CardTitle className="text-lg">Contact Us</CardTitle>
                        <CardDescription>
                            Fill out the form below and we'll get back to you.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {sent ? (
                            <div className="flex flex-col items-center gap-4 py-8 text-center">
                                <CheckCircle2 className="h-12 w-12 text-primary" />
                                <div className="space-y-1">
                                    <p className="text-base font-semibold text-foreground">
                                        Message sent
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        We'll get back to you shortly.
                                    </p>
                                </div>
                                <Button onClick={() => setLocation('/')}>Back to Home</Button>
                            </div>
                        ) : (
                            <ContactForm
                                defaultSubject={subject}
                                defaultMessage={message}
                                defaultFirstName={user?.firstName}
                                defaultLastName={user?.lastName}
                                defaultEmail={user?.email}
                                defaultPhone={user?.phone ?? undefined}
                                onSuccess={() => setSent(true)}
                            />
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
