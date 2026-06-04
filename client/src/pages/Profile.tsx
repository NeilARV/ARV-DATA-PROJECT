import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, User, UserCircle, Building2, Mail } from 'lucide-react';
import AccountInfoTab from '@/components/profile/AccountInfoTab';
import MyCompaniesTab from '@/components/profile/MyCompaniesTab';
import EmailPreferencesTab from '@/components/profile/EmailPreferencesTab';

export default function Profile() {
    const [, setLocation] = useLocation();
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="container mx-auto py-8 px-4 max-w-4xl">
                <Card>
                    <CardHeader>
                        <CardTitle>Profile</CardTitle>
                        <CardDescription>
                            You must be logged in to view your profile
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex flex-col items-center justify-center py-12 gap-4">
                            <User className="w-16 h-16 text-muted-foreground" />
                            <p className="text-muted-foreground">
                                Please log in to view your profile
                            </p>
                            <Button onClick={() => setLocation('/')}>Go to Home</Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 px-4 max-w-4xl">
            <div className="mb-8">
                <Button variant="ghost" onClick={() => setLocation('/')} className="mb-4">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Properties
                </Button>
                <h1 className="text-3xl font-bold mb-2">Profile Settings</h1>
                <p className="text-muted-foreground">View and manage your account information</p>
            </div>

            <Tabs defaultValue="account" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-8">
                    <TabsTrigger value="account">
                        <UserCircle className="w-4 h-4 mr-2" />
                        Account Info
                    </TabsTrigger>
                    <TabsTrigger value="companies">
                        <Building2 className="w-4 h-4 mr-2" />
                        My Companies
                    </TabsTrigger>
                    <TabsTrigger value="email">
                        <Mail className="w-4 h-4 mr-2" />
                        Email Preferences
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="account">
                    <AccountInfoTab />
                </TabsContent>

                <TabsContent value="companies">
                    <MyCompaniesTab />
                </TabsContent>

                <TabsContent value="email">
                    <EmailPreferencesTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
