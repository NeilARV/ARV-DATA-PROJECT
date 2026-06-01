import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { formatPhoneNumber } from "@shared/utils/formatPhoneNumber";
import { insertUserBySignUpSchema } from "@database/inserts";
import { SignupFormData } from "@database/types";
import ContactContent from "@/components/modals/Contact";
import { COUNTIES } from "@/constants/filters.constants";
import { STATE_DEFAULT_COUNTY } from "@shared/constants/stateDefaults";

const UNIQUE_STATES = Array.from(new Set(COUNTIES.map((c) => c.state))).sort();

interface SignupContentProps {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export default function SignupContent({ onSuccess, onSwitchToLogin }: SignupContentProps) {
  const { toast } = useToast();
  const [showContact, setShowContact] = useState(false);

  const form = useForm<SignupFormData>({
    resolver: zodResolver(insertUserBySignUpSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      password: "",
      confirmPassword: "",
      state: "CA",
      county: "San Diego",
    },
  });

  const watchedState = form.watch("state");
  const watchedCounty = form.watch("county");
  const availableCounties = watchedState
    ? COUNTIES.filter((c) => c.state === watchedState)
    : COUNTIES;

  useEffect(() => {
    const defaultCounty = STATE_DEFAULT_COUNTY[watchedState ?? ""];
    if (defaultCounty) {
      form.setValue("county", defaultCounty, { shouldDirty: true });
    }
  }, [watchedState]);

  const signupMutation = useMutation({
    mutationFn: async (data: SignupFormData) => {
      const county = data.county || null;
      const state = data.state || null;
      const response = await apiRequest("POST", "/api/auth/signup", {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email.trim(),
        password: data.password,
        county,
        state,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/admin/status"], null);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/status"] });
      toast({ title: "Account created!", description: "Welcome to ARV DATA. You're now signed in." });
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      let errorMessage = "An error occurred during signup. Please try again.";
      let statusCode: number | null = null;

      if (error.message) {
        const match = error.message.match(/^(\d+):\s*(.+)$/);
        if (match) {
          statusCode = parseInt(match[1], 10);
          try {
            const parsed = JSON.parse(match[2]);
            errorMessage = parsed.message || errorMessage;
          } catch {
            errorMessage = match[2] || errorMessage;
          }
        } else {
          errorMessage = error.message;
        }
      }

      if (statusCode === 403) {
        toast({
          title: "Beta Access Required",
          description: "This app is currently in beta. Contact us to request access.",
          variant: "destructive",
          action: (
            <ToastAction altText="Contact us" onClick={() => setShowContact(true)}>
              Contact Us
            </ToastAction>
          ),
        });
      } else if (statusCode === 409) {
        toast({ title: "Account Already Exists", description: errorMessage, variant: "destructive" });
      } else if (statusCode === 400) {
        toast({ title: "Invalid Data", description: errorMessage, variant: "destructive" });
      } else {
        toast({ title: "Signup Failed", description: errorMessage, variant: "destructive" });
      }
    },
  });

  // Swap dialog content: show Contact form in place of Signup form
  if (showContact) {
    return (
      <ContactContent
        onClose={() => setShowContact(false)}
        onSuccess={() => {
          toast({ title: "Request Received", description: "We will get back to you shortly." });
        }}
        defaultSubject="Request Access"
        defaultFirstName={form.getValues("firstName")}
        defaultLastName={form.getValues("lastName")}
        defaultEmail={form.getValues("email")}
        defaultMessage="I would like to request access to ARV DATA."
      />
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle data-testid="heading-signup">Create Your Account</DialogTitle>
        <DialogDescription>Sign up to access all property listings and save your searches.</DialogDescription>
      </DialogHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((d) => signupMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John" {...field} data-testid="input-signup-firstname" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Doe" {...field} data-testid="input-signup-lastname" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone Number</FormLabel>
                <FormControl>
                  <Input
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={field.value || ""}
                    data-testid="input-signup-phone"
                    onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
                    maxLength={14}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="john@example.com" {...field} data-testid="input-signup-email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="At least 6 characters" {...field} data-testid="input-signup-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Confirm your password" {...field} data-testid="input-signup-confirm" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium leading-none">Preferred Market</p>
              <p className="text-sm text-muted-foreground mt-1">Which area would you like to see property data for?</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="county"
              render={({ field }) => (
                  <FormItem>
                    <FormLabel>County</FormLabel>
                    <Select
                      value={watchedCounty ?? ""}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-signup-county">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="z-[10000]">
                        {availableCounties.map((c) => (
                          <SelectItem key={c.county} value={c.county}>
                            {c.county}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
            )}
            />
            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State</FormLabel>
                  <Select
                    value={field.value ?? "CA"}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-signup-state">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="z-[10000]">
                      {UNIQUE_STATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={signupMutation.isPending} data-testid="button-signup-submit">
            {signupMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating Account...
              </>
            ) : (
              "Create Account"
            )}
          </Button>
        </form>
      </Form>

      <div className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <button
          type="button"
          className="text-primary hover:underline font-medium"
          onClick={onSwitchToLogin}
          data-testid="button-switch-to-login"
        >
          Sign in
        </button>
      </div>
    </>
  );
}
