import { Switch, Route } from 'wouter';
import { queryClient } from './lib/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import Home from '@/pages/Home';
import Data from '@/pages/Data';
import Admin from '@/pages/Admin';
import Profile from '@/pages/Profile';
import Analytics from '@/pages/Analytics';
import Vendors from '@/pages/Vendors';
import Deals from '@/pages/Deals';
import Mastermind from '@/pages/Mastermind';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import Contact from '@/pages/Contact';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import VerifyEmail from '@/pages/VerifyEmail';
import NotFound from '@/pages/not-found';
import { lazy, Suspense, useEffect } from 'react';
import { useLocation } from 'wouter';

// Standalone mock preview of the redesigned Deals experience (no auth/backend). Shipped to
// production intentionally so the redesign can be reviewed at /deals-preview before it's wired
// into the real /deals page. Lazy-loaded so it stays out of the main bundle.
const DealsPreview = lazy(() => import('@/pages/DealsPreview'));
import { ViewProvider } from '@/hooks/useView';
import { DialogsProvider, useDialogs } from '@/hooks/useDialogs';
import { useAuth } from '@/hooks/use-auth';
import { MastermindSocketProvider } from '@/hooks/use-mastermind-socket';
import { AuthGateDialog } from '@/components/auth/AuthGateDialog';

function GlobalDialogs() {
    const { dialog, closeDialog } = useDialogs();

    return (
        <AuthGateDialog
            open={dialog?.type === 'authGate'}
            onClose={closeDialog}
            redirect={dialog?.type === 'authGate' ? dialog.redirect : undefined}
        />
    );
}

// Keeps the address bar on /reset-password while a forced reset is pending, so links
// and the back button stay consistent. The hard block lives in Router below.
function ForcedResetRedirect() {
    const [location, setLocation] = useLocation();
    const { isLoading, isAuthenticated, user } = useAuth();

    useEffect(() => {
        if (isLoading) return;
        if (isAuthenticated && user?.mustResetPassword && location !== '/reset-password') {
            setLocation('/reset-password');
        }
    }, [isLoading, isAuthenticated, user?.mustResetPassword, location, setLocation]);

    return null;
}

function Router() {
    const { isLoading, isAuthenticated, user } = useAuth();

    // Hard gate: a user logged in with a temporary password may not render any page
    // other than the forced reset screen, regardless of route. This blocks browsing
    // entirely until they set a new password and the flag clears.
    if (!isLoading && isAuthenticated && user?.mustResetPassword) {
        return <ResetPassword />;
    }

    return (
        <Switch>
            <Route path="/" component={Home} />
            <Route path="/data" component={Data} />
            <Route path="/login" component={Login} />
            <Route path="/signup" component={Signup} />
            <Route path="/contact" component={Contact} />
            <Route path="/forgot-password" component={ForgotPassword} />
            <Route path="/reset-password" component={ResetPassword} />
            <Route path="/verify-email" component={VerifyEmail} />
            <Route path="/admin" component={Admin} />
            <Route path="/profile" component={Profile} />
            <Route path="/analytics" component={Analytics} />
            <Route path="/vendors" component={Vendors} />
            <Route path="/deals" component={Deals} />
            <Route path="/deals-preview">
                <Suspense fallback={null}>
                    <DealsPreview />
                </Suspense>
            </Route>
            <Route path="/mastermind" component={Mastermind} />
            <Route path="/mastermind/dm/:userId" component={Mastermind} />
            <Route path="/mastermind/:channelName" component={Mastermind} />
            <Route component={NotFound} />
        </Switch>
    );
}

function App() {
    useEffect(() => {
        const savedTheme = localStorage.getItem('theme');
        // Default to dark mode unless user explicitly chose light
        if (savedTheme !== 'light') {
            document.documentElement.classList.add('dark');
        }
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <MastermindSocketProvider>
                <TooltipProvider>
                    <Toaster />
                    <ViewProvider>
                        <DialogsProvider>
                            <ForcedResetRedirect />
                            <GlobalDialogs />
                            <Router />
                        </DialogsProvider>
                    </ViewProvider>
                </TooltipProvider>
            </MastermindSocketProvider>
        </QueryClientProvider>
    );
}

export default App;
