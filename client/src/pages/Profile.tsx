import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { updateUserProfileSchema } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2, User, Edit, Save, X } from "lucide-react";
import { format } from "date-fns";
import { formatPhoneNumber } from "@/utils/formatPhoneNumber";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    notifications: true,
  });

  // Initialize form data when user loads or changes
  useEffect(() => {
    if (user) {
      // Format phone number if it exists and isn't already formatted
      const phone = user.phone 
        ? (user.phone.includes('(') ? user.phone : formatPhoneNumber(user.phone))
        : "";
      
      setFormData({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: phone,
        notifications: user.notifications ?? true,
      });
    }
  }, [user]);

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
            <CardDescription>You must be logged in to view your profile</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <User className="w-16 h-16 text-muted-foreground" />
              <p className="text-muted-foreground">Please log in to view your profile</p>
              <Button onClick={() => setLocation("/")}>
                Go to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Properties
        </Button>
        <h1 className="text-3xl font-bold mb-2">Profile Settings</h1>
        <p className="text-muted-foreground">
          View and manage your account information
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>
              Your personal account details
            </CardDescription>
          </div>
          {!isEditing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  First Name
                </label>
                <Input
                  type="text"
                  value={isEditing ? formData.firstName : user.firstName}
                  onChange={(e) => {
                    setFormData({ ...formData, firstName: e.target.value });
                    if (fieldErrors.firstName) {
                      setFieldErrors((prev: Record<string, string>) => {
                        const next = { ...prev };
                        delete next.firstName;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditing}
                  className={`mt-1 ${fieldErrors.firstName ? "border-destructive" : ""}`}
                  aria-invalid={!!fieldErrors.firstName}
                />
                {fieldErrors.firstName && (
                  <p className="text-sm text-destructive mt-1" role="alert">
                    {fieldErrors.firstName}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Last Name
                </label>
                <Input
                  type="text"
                  value={isEditing ? formData.lastName : user.lastName}
                  onChange={(e) => {
                    setFormData({ ...formData, lastName: e.target.value });
                    if (fieldErrors.lastName) {
                      setFieldErrors((prev: Record<string, string>) => {
                        const next = { ...prev };
                        delete next.lastName;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditing}
                  className={`mt-1 ${fieldErrors.lastName ? "border-destructive" : ""}`}
                  aria-invalid={!!fieldErrors.lastName}
                />
                {fieldErrors.lastName && (
                  <p className="text-sm text-destructive mt-1" role="alert">
                    {fieldErrors.lastName}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Email
                </label>
                <Input
                  type="email"
                  value={isEditing ? formData.email : user.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (fieldErrors.email) {
                      setFieldErrors((prev: Record<string, string>) => {
                        const next = { ...prev };
                        delete next.email;
                        return next;
                      });
                    }
                  }}
                  disabled={!isEditing}
                  className={`mt-1 ${fieldErrors.email ? "border-destructive" : ""}`}
                  aria-invalid={!!fieldErrors.email}
                />
                {fieldErrors.email && (
                  <p className="text-sm text-destructive mt-1" role="alert">
                    {fieldErrors.email}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Phone
                </label>
                <Input
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={
                    isEditing
                      ? formData.phone
                      : user.phone?.includes("(")
                        ? user.phone
                        : formatPhoneNumber(user.phone || "")
                  }
                  onChange={(e) => {
                    if (isEditing) {
                      const formatted = formatPhoneNumber(e.target.value);
                      setFormData({ ...formData, phone: formatted });
                      if (fieldErrors.phone) {
                        setFieldErrors((prev: Record<string, string>) => {
                          const next = { ...prev };
                          delete next.phone;
                          return next;
                        });
                      }
                    }
                  }}
                  disabled={!isEditing}
                  className={`mt-1 ${fieldErrors.phone ? "border-destructive" : ""}`}
                  aria-invalid={!!fieldErrors.phone}
                  maxLength={14}
                />
                {fieldErrors.phone && (
                  <p className="text-sm text-destructive mt-1" role="alert">
                    {fieldErrors.phone}
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Account Type
                </label>
                <p className="text-base font-medium mt-1">
                  {user.isAdmin ? "Administrator" : "Standard User"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Email Notifications
                </label>
                <div className="flex items-center gap-2 mt-1">
                  <Checkbox
                    checked={isEditing ? formData.notifications : (user.notifications ?? true)}
                    disabled={!isEditing}
                    onCheckedChange={(checked) => {
                      if (isEditing) {
                        setFormData({ ...formData, notifications: checked === true });
                      }
                    }}
                  />
                  <span className="text-base font-medium">
                    {(isEditing ? formData.notifications : (user.notifications ?? true))
                      ? "Enabled"
                      : "Disabled"}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Member Since
                </label>
                <p className="text-base font-medium mt-1">
                  {format(new Date(user.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            </div>
            {isEditing && (
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFieldErrors({});
                    const phone = user.phone
                      ? user.phone.includes("(")
                        ? user.phone
                        : formatPhoneNumber(user.phone)
                      : "";

                    setFormData({
                      firstName: user.firstName,
                      lastName: user.lastName,
                      email: user.email,
                      phone,
                      notifications: user.notifications ?? true,
                    });
                    setIsEditing(false);
                  }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    setFieldErrors({});
                    const updateData = {
                      firstName: formData.firstName.trim(),
                      lastName: formData.lastName.trim(),
                      email: formData.email.trim(),
                      phone: formData.phone,
                      notifications: formData.notifications,
                    };

                    const validation = updateUserProfileSchema.safeParse(updateData);
                    if (!validation.success) {
                      const flattened = validation.error.flatten();
                      const errors: Record<string, string> = {};
                      for (const [k, v] of Object.entries(flattened.fieldErrors)) {
                        if (Array.isArray(v) && v[0]) errors[k] = v[0];
                      }
                      setFieldErrors(errors);
                      toast({
                        title: "Invalid profile data",
                        description: "Please fix the errors below and try again.",
                        variant: "destructive",
                      });
                      return;
                    }

                    try {
                      const response = await apiRequest(
                        "PATCH",
                        "/api/auth/me",
                        validation.data
                      );
                      const result = await response.json();

                      if (result.success && result.user) {
                        queryClient.setQueryData(["/api/auth/me"], {
                          user: result.user,
                        });
                        toast({
                          title: "Profile Updated",
                          description: "Your profile has been updated successfully.",
                        });
                        setIsEditing(false);
                      } else {
                        throw new Error("Failed to update profile");
                      }
                    } catch (error: any) {
                      console.error("Error updating profile:", error);
                      toast({
                        title: "Error",
                        description:
                          error?.message || "Failed to update profile. Please try again.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

