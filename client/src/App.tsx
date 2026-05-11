import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import Admin from "@/pages/Admin";
import Profile from "@/pages/Profile";
import Analytics from "@/pages/Analytics";
import Vendors from "@/pages/Vendors";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";
import { ViewProvider } from "@/hooks/useView";
import { DialogsProvider, useDialogs } from "@/hooks/useDialogs";
import AppDialog from "@/components/modals/Dialog";
import LoginContent from "@/components/modals/Login";
import SignupContent from "@/components/modals/Signup";

function GlobalDialogs() {
  const { dialog, openDialog, closeDialog, isForced } = useDialogs();
  const isAuthDialog = dialog?.type === "login" || dialog?.type === "signup";

  return (
    <AppDialog
      open={isAuthDialog}
      onClose={closeDialog}
      forced={isForced}
      className="sm:max-w-md"
    >
      {dialog?.type === "login" && (
        <LoginContent
          onSuccess={closeDialog}
          onSwitchToSignup={() => openDialog({ type: "signup", forced: isForced })}
        />
      )}
      {dialog?.type === "signup" && (
        <SignupContent
          onSuccess={closeDialog}
          onSwitchToLogin={() => openDialog({ type: "login", forced: isForced })}
        />
      )}
    </AppDialog>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin" component={Admin} />
      <Route path="/profile" component={Profile} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/vendors" component={Vendors} />
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
      <TooltipProvider>
        <Toaster />
        <ViewProvider>
          <DialogsProvider>
            <GlobalDialogs />
            <Router />
          </DialogsProvider>
        </ViewProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
