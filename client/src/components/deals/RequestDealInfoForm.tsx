import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { AuthUser } from "@/hooks/use-auth";
import { requestDealInfoSchema, type RequestDealInfoFormValues } from "@database/validation/deals.validation";

type RequestDealInfoFormProps = {
    address: string;
    user: AuthUser | null;
    isLoading: boolean;
    onClose: () => void;
    onSubmit: (data: RequestDealInfoFormValues) => void;
};

export default function RequestDealInfoForm({
    address,
    user,
    isLoading,
    onClose,
    onSubmit,
}: RequestDealInfoFormProps) {
    const form = useForm<RequestDealInfoFormValues>({
        resolver: zodResolver(requestDealInfoSchema),
        defaultValues: {
            firstName: user?.firstName ?? "",
            lastName:  user?.lastName  ?? "",
            email:     user?.email     ?? "",
            phone:     user?.phone     ?? "",
            message:   "",
        },
    });

    useEffect(() => {
        if (user) {
            form.reset({
                firstName: user.firstName ?? "",
                lastName:  user.lastName  ?? "",
                email:     user.email     ?? "",
                phone:     user.phone     ?? "",
                message:   "",
            });
        }
    }, [user]);

    return (
        <>
            <DialogHeader>
                <DialogTitle>Request More Info</DialogTitle>
                <DialogDescription>
                    Request more information about {address}. Confirm your contact details below.
                </DialogDescription>
            </DialogHeader>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                        <FormField
                            control={form.control}
                            name="firstName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>First Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="First name" {...field} />
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
                                        <Input placeholder="Last name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input type="email" placeholder="Email address" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="phone"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Phone <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                                    <FormControl>
                                        <Input type="tel" placeholder="Phone number" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="message"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Message <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder="Any specific questions or details you'd like to know..."
                                        className="resize-none"
                                        rows={3}
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="flex gap-2 pt-1">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="flex-1"
                            disabled={isLoading}
                            size="lg"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1"
                            disabled={isLoading}
                            size="lg"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                "Send Request"
                            )}
                        </Button>
                    </div>
                </form>
            </Form>
        </>
    );
}
