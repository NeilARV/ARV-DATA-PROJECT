import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { User, Camera, Trash2, Plus, Loader2 } from "lucide-react";

import AppDialog from "@/components/modals/Dialog";
import ConfirmationContent from "@/components/modals/Confirmation";

import { useToast } from "@/hooks/use-toast";

import { apiRequest, queryClient } from "@/lib/queryClient";

type AvatarUploadProps = {
    profileImageUrl?: string | null;
};

export function AvatarUpload({ profileImageUrl }: AvatarUploadProps) {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const uploadMutation = useMutation({
        mutationFn: async (file: File) => {
            const formData = new FormData();
            formData.append("image", file);
            const response = await fetch("/api/auth/me/avatar", {
                method: "POST",
                body: formData,
                credentials: "include",
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || response.statusText);
            }
            return response.json() as Promise<{ profileImageUrl: string }>;
        },
        onSuccess: (data) => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            queryClient.setQueryData(
                ["/api/auth/me"],
                (old: { user: Record<string, unknown> } | undefined) => ({
                    user: { ...(old?.user ?? {}), profileImageUrl: data.profileImageUrl },
                }),
            );
            setPreviewUrl(null);
            toast({ title: "Photo updated" });
        },
        onError: () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
            toast({ title: "Error", description: "Failed to upload photo.", variant: "destructive" });
        },
    });

    const removeMutation = useMutation({
        mutationFn: async () => {
            const response = await apiRequest("DELETE", "/api/auth/me/avatar");
            return response.json();
        },
        onSuccess: () => {
            queryClient.setQueryData(
                ["/api/auth/me"],
                (old: { user: Record<string, unknown> } | undefined) => ({
                    user: { ...(old?.user ?? {}), profileImageUrl: null },
                }),
            );
            toast({ title: "Photo removed" });
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to remove photo.", variant: "destructive" });
        },
    });

    const displayUrl = previewUrl ?? profileImageUrl ?? null;
    const isPending = uploadMutation.isPending || removeMutation.isPending;

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setPreviewUrl(URL.createObjectURL(file));
        uploadMutation.mutate(file);
        e.target.value = "";
    }

    return (
        <div className="flex items-center">
            <div className="group relative w-28 h-28 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center cursor-pointer flex-shrink-0">
                {/* Image or placeholder */}
                {displayUrl ? (
                    <img src={displayUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                    <User className="w-12 h-12 text-muted-foreground" />
                )}

                {/* Loading overlay */}
                {isPending && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-white" />
                    </div>
                )}

                {/* Hover overlay — hidden while loading */}
                {!isPending && (
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                        {displayUrl ? (
                            <>
                                <button
                                    type="button"
                                    title="Replace photo"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2 rounded-full bg-white/20 hover:bg-white/35 text-white transition-colors"
                                >
                                    <Camera className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    title="Remove photo"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="p-2 rounded-full bg-white/20 hover:bg-white/35 text-white transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                title="Upload photo"
                                onClick={() => fileInputRef.current?.click()}
                                className="p-2 rounded-full bg-white/20 hover:bg-white/35 text-white transition-colors"
                            >
                                <Plus className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                )}
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={handleFileChange}
            />

            <AppDialog open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
                <ConfirmationContent
                    title="Remove Profile Photo"
                    description="Are you sure you want to remove your profile photo?"
                    confirmText="Remove"
                    cancelText="Cancel"
                    variant="destructive"
                    isLoading={removeMutation.isPending}
                    onClose={() => setShowDeleteConfirm(false)}
                    onConfirm={() => {
                        removeMutation.mutate();
                        setShowDeleteConfirm(false);
                    }}
                />
            </AppDialog>
        </div>
    );
}
