import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const signupSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(10, "Please enter a valid phone number"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignupFormData = z.infer<typeof signupSchema>;

interface SignupDialogProps {
  open: boolean;
  forced?: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export default function SignupDialog({ open, forced = false, onClose, onSuccess, onSwitchToLogin }: SignupDialogProps) {
  const { toast } = useToast();
  
  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: SignupFormData) => {
      const response = await apiRequest("POST", "/api/auth/signup", {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email,
        password: data.password,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Account created!",
        description: "Welcome to ARV DATA. You're now signed in.",
      });
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      console.error("Signup error:", error);
      
      // Parse error message from apiRequest format: "STATUS_CODE: JSON_STRING"
      // Example: "403: {"message":"You are not authorized to sign up for this service."}"
      let errorMessage = "An error occurred during signup. Please try again.";
      let statusCode: number | null = null;
      
      if (error.message) {
        // Extract status code and message from the error string
        const match = error.message.match(/^(\d+):\s*(.+)$/);
        if (match) {
          statusCode = parseInt(match[1], 10);
          const responseText = match[2];
          
          // Try to parse as JSON
          try {
            const parsed = JSON.parse(responseText);
            errorMessage = parsed.message || errorMessage;
          } catch (e) {
            // If not JSON, use the text as-is
            errorMessage = responseText || errorMessage;
          }
        } else {
          // If no status code pattern, use the message directly
          errorMessage = error.message;
        }
      }
      
      // Show appropriate toast based on status code
      if (statusCode === 403) {
        toast({
          title: "Access Denied",
          description: errorMessage,
          variant: "destructive",
        });
      } else if (statusCode === 409) {
        toast({
          title: "Account Already Exists",
          description: errorMessage,
          variant: "destructive",
        });
      } else if (statusCode === 400) {
        toast({
          title: "Invalid Data",
          description: errorMessage,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Signup Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  const onSubmit = (data: SignupFormData) => {
    signupMutation.mutate(data);
  };

  return (
    <Dialog 
      open={open} 
      onOpenChange={(isOpen) => {
        // Prevent closing if forced
        if (!isOpen && !forced) {
          onClose();
        }
      }}
    >
      <DialogContent 
        className={forced ? "sm:max-w-md [&>button]:hidden" : "sm:max-w-md"}
        onPointerDownOutside={(e) => {
          // Prevent closing on outside click if forced
          if (forced) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          // Prevent closing on escape if forced
          if (forced) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle data-testid="heading-signup">Create Your Account</DialogTitle>
          <DialogDescription>
            Sign up to access all property listings and save your searches.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="John" 
                        {...field} 
                        data-testid="input-signup-firstname"
                      />
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
                      <Input 
                        placeholder="Doe" 
                        {...field} 
                        data-testid="input-signup-lastname"
                      />
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
                      {...field} 
                      data-testid="input-signup-phone"
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
                    <Input 
                      type="email"
                      placeholder="john@example.com" 
                      {...field} 
                      data-testid="input-signup-email"
                    />
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
                    <Input 
                      type="password"
                      placeholder="At least 6 characters" 
                      {...field} 
                      data-testid="input-signup-password"
                    />
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
                    <Input 
                      type="password"
                      placeholder="Confirm your password" 
                      {...field} 
                      data-testid="input-signup-confirm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button 
              type="submit" 
              className="w-full"
              disabled={signupMutation.isPending}
              data-testid="button-signup-submit"
            >
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
      </DialogContent>
    </Dialog>
  );
}