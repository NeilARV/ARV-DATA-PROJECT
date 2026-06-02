import { useEffect } from 'react';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { insertCompanyContactSchema } from '@database/inserts/companyContacts.insert';
import type { InsertCompanyContact } from '@database/types';
import type { CompanyContact } from '@/types/companies';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { formatPhoneNumber } from '@shared/utils/formatPhoneNumber';

interface AddContactContentProps {
    companyId: string;
    /** When provided, the modal operates in edit mode */
    contact?: CompanyContact | null;
    onClose: () => void;
    onSuccess: (contact: CompanyContact, mode: 'add' | 'edit') => void;
}

export function AddContactDialog({
    companyId,
    contact,
    onClose,
    onSuccess,
}: AddContactContentProps) {
    const { toast } = useToast();
    const isEditing = !!contact;

    const form = useForm<InsertCompanyContact>({
        resolver: zodResolver(insertCompanyContactSchema),
        defaultValues: {
            firstName: '',
            lastName: '',
            email: '',
            phoneNumber: '',
            title: '',
        },
    });

    const {
        formState: { isSubmitting },
    } = form;

    useEffect(() => {
        if (contact) {
            form.reset({
                firstName: contact.firstName ?? '',
                lastName: contact.lastName ?? '',
                email: contact.email ?? '',
                phoneNumber: contact.phoneNumber
                    ? contact.phoneNumber.includes('(')
                        ? contact.phoneNumber
                        : formatPhoneNumber(contact.phoneNumber)
                    : '',
                title: contact.title ?? '',
            });
        } else {
            form.reset({ firstName: '', lastName: '', email: '', phoneNumber: '', title: '' });
        }
    }, [contact]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSubmit = async (data: InsertCompanyContact) => {
        try {
            const payload = {
                firstName: data.firstName.trim(),
                lastName: data.lastName?.trim() || null,
                email: data.email?.trim() || null,
                phoneNumber: data.phoneNumber?.trim() || null,
                title: data.title?.trim() || null,
            };

            let savedContact: CompanyContact;
            if (isEditing && contact) {
                const res = await apiRequest(
                    'PATCH',
                    `/api/companies/${companyId}/contacts/${contact.id}`,
                    payload,
                );
                savedContact = await res.json();
                toast({
                    title: 'Contact Updated',
                    description: 'Contact has been successfully updated.',
                });
            } else {
                const res = await apiRequest(
                    'POST',
                    `/api/companies/${companyId}/contacts`,
                    payload,
                );
                savedContact = await res.json();
                toast({
                    title: 'Contact Added',
                    description: 'Contact has been successfully added.',
                });
            }

            onSuccess(savedContact, isEditing ? 'edit' : 'add');
            onClose();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || `Failed to ${isEditing ? 'update' : 'add'} contact`,
                variant: 'destructive',
            });
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>{isEditing ? 'Edit Contact' : 'Add Contact'}</DialogTitle>
            </DialogHeader>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="firstName"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>First Name *</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            placeholder="Jane"
                                            data-testid="input-contact-firstname"
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
                                            {...field}
                                            value={field.value ?? ''}
                                            placeholder="Doe"
                                            data-testid="input-contact-lastname"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Title</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        value={field.value ?? ''}
                                        placeholder="Acquisitions Manager"
                                        data-testid="input-contact-title"
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
                                        {...field}
                                        value={field.value ?? ''}
                                        type="email"
                                        placeholder="jane@example.com"
                                        data-testid="input-contact-email"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="phoneNumber"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Phone Number</FormLabel>
                                <FormControl>
                                    <Input
                                        {...field}
                                        value={field.value ?? ''}
                                        type="tel"
                                        placeholder="(555) 123-4567"
                                        data-testid="input-contact-phone"
                                        onChange={(e) =>
                                            field.onChange(formatPhoneNumber(e.target.value))
                                        }
                                        maxLength={14}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="flex gap-2 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="flex-1"
                            disabled={isSubmitting}
                            data-testid="button-cancel-contact"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1"
                            disabled={isSubmitting}
                            data-testid="button-save-contact"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    {isEditing ? 'Saving...' : 'Adding...'}
                                </>
                            ) : isEditing ? (
                                'Save Changes'
                            ) : (
                                'Add Contact'
                            )}
                        </Button>
                    </div>
                </form>
            </Form>
        </>
    );
}
