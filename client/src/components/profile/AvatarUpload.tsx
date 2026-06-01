import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { User, Camera, Trash2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useToast } from "@/hooks/use-toast";

import { apiRequest, queryClient } from "@/lib/queryClient";

type AvatarUploadProps = {
    profileImageUrl?: string | null;
};

export function AvatarUpload({ profileImageUrl }: AvatarUploadProps) {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const uploadMutation = useMutation({
        mutationFn: async (file: File) => {
            const formData = new FormData();
            formData.append("image", file);
            const response = await apiRequest("POST", "/api/auth/me/avatar", formData);
            return response.json() as Promise<{ profileImageUrl: string }>;
        },
        onSuccess: (data) => {
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
        <div className="flex items-center gap-5">
            <div className="relative flex-shrink-0">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-muted flex items-center justify-center border border-border">
                    {displayUrl ? (
                        <img
                            src={displayUrl}
                            alt="Profile"
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <User className="w-8 h-8 text-muted-foreground" />
                    )}
                </div>
                {isPending && (
                    <div className="absolute inset-0 rounded-full bg-background/70 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={handleFileChange}
                />
                <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Camera className="w-4 h-4 mr-2" />
                    {displayUrl ? "Replace Photo" : "Upload Photo"}
                </Button>
                {displayUrl && (
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => removeMutation.mutate()}
                        className="text-destructive hover:text-destructive"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove Photo
                    </Button>
                )}
            </div>
        </div>
    );
}
