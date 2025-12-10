import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/10 p-4">
              <Lock className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Admin Access Required</CardTitle>
          <CardDescription>
            {!isAuthenticated
              ? "Please log in to access the admin panel"
              : "You do not have admin privileges to access this page"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {!isAuthenticated ? (
              <>
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-md">
                  <AlertCircle className="w-4 h-4" />
                  <span>You must be logged in to access the admin panel.</span>
                </div>
                <Button
                  className="w-full"
                  onClick={() => setLocation("/")}
                  data-testid="button-go-home"
                >
                  Go to Home Page
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  <AlertCircle className="w-4 h-4" />
                  <span>
                    {user?.firstName} {user?.lastName} does not have admin privileges.
                  </span>
                </div>
                <Button
                  className="w-full"
                  onClick={() => setLocation("/")}
                  data-testid="button-go-home"
                >
                  Go to Home Page
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
